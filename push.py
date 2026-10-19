"""Web Push for the professional portals (restaurant, courier, CEO).

- VAPID keys are generated on first use and kept in the runtime directory (never in Git).
- One subscription per device (push endpoint) and per role; the account owning that role is recorded.
- Durable queue in SQLite: one row per (device endpoint, event) so a repeated event is never sent twice.
- Delivery uses pywebpush when it is installed and PK_VAPID_SUBJECT is set; otherwise the service is declared
  degraded (foreground notifications only) and nothing is queued.
- "sent" only means the push service accepted the message; it is never shown as proof of reception.
"""
import base64
import json
import os
import secrets
import threading
import time
from pathlib import Path

try:  # optional dependency (requirements.txt): without it, push is declared unavailable
    from pywebpush import webpush, WebPushException
except Exception:  # pragma: no cover - depends on the installation
    webpush = None
    WebPushException = Exception

SCHEMA = '''
CREATE TABLE IF NOT EXISTS push_subscriptions(id TEXT PRIMARY KEY, endpoint TEXT NOT NULL, role TEXT NOT NULL,
  account TEXT NOT NULL, merchant TEXT, p256dh TEXT NOT NULL, auth TEXT NOT NULL, device TEXT,
  created INTEGER, updated INTEGER, active INTEGER NOT NULL DEFAULT 1, last_ok INTEGER, last_error TEXT,
  failures INTEGER NOT NULL DEFAULT 0, UNIQUE(endpoint, role));
CREATE TABLE IF NOT EXISTS push_queue(id TEXT PRIMARY KEY, endpoint TEXT NOT NULL, subscription TEXT NOT NULL,
  event TEXT NOT NULL, payload TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('pending','sent','failed','expired')),
  attempts INTEGER NOT NULL DEFAULT 0, created INTEGER, next_at INTEGER, sent_at INTEGER, error TEXT,
  UNIQUE(endpoint, event));
CREATE INDEX IF NOT EXISTS push_queue_pending ON push_queue(state, next_at);
'''
MAX_ATTEMPTS = 5
TTL = 3600
SENDER = None          # tests inject a simulated sender: fn(subscription_info, payload_json) -> None or raise
AUTOFLUSH = True       # handler requests trigger a background flush; tests flush explicitly
STATE = {'lastFlush': None, 'lastError': None}
_FLUSH = threading.Lock()


class Gone(Exception):
    """The push service says this subscription no longer exists (HTTP 404/410)."""


def _b64(raw):
    return base64.urlsafe_b64encode(raw).rstrip(b'=').decode()


def key_path(runtime):
    return Path(runtime) / 'vapid-private.pem'


def vapid_public_key(runtime):
    """Generate the VAPID key pair once (P-256, file mode 600) and return the public key for applicationServerKey."""
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    path = key_path(runtime)
    if not path.exists():
        pem = ec.generate_private_key(ec.SECP256R1()).private_bytes(
            serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
        try:
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, 'wb') as file:
                file.write(pem)
        except FileExistsError:
            pass
    private = serialization.load_pem_private_key(path.read_bytes(), password=None)
    return _b64(private.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint))


def mode():
    """What the server can really do. 'enabled' means messages are handed to the browsers' push services."""
    library = webpush is not None or SENDER is not None
    subject = bool(os.environ.get('PK_VAPID_SUBJECT', '').strip()) or SENDER is not None
    reason = '' if library and subject else ('Bibliothèque pywebpush absente' if not library else 'PK_VAPID_SUBJECT non défini')
    return {'enabled': library and subject, 'library': library, 'subject': subject, 'reason': reason}


def valid_subscription(value):
    if not isinstance(value, dict):
        return None
    endpoint = str(value.get('endpoint') or '')
    keys = value.get('keys') if isinstance(value.get('keys'), dict) else {}
    p256dh, auth = str(keys.get('p256dh') or ''), str(keys.get('auth') or '')
    ok = endpoint.startswith('https://') and len(endpoint) <= 1000 and 40 <= len(p256dh) <= 200 and 8 <= len(auth) <= 100
    ok = ok and all(c.isalnum() or c in '-_=' for c in p256dh + auth)
    return {'endpoint': endpoint, 'p256dh': p256dh, 'auth': auth} if ok else None


def subscribe(db, actor, sub, device, now):
    row = db.execute('SELECT id FROM push_subscriptions WHERE endpoint=? AND role=?', (sub['endpoint'], actor['role'])).fetchone()
    sid = row['id'] if row else secrets.token_hex(12)
    db.execute('''INSERT INTO push_subscriptions(id,endpoint,role,account,merchant,p256dh,auth,device,created,updated,active,failures)
                  VALUES(?,?,?,?,?,?,?,?,?,?,1,0)
                  ON CONFLICT(endpoint,role) DO UPDATE SET account=excluded.account, merchant=excluded.merchant,
                  p256dh=excluded.p256dh, auth=excluded.auth, device=excluded.device, updated=excluded.updated,
                  active=1, failures=0, last_error=NULL''',
               (sid, sub['endpoint'], actor['role'], actor['id'], actor.get('merchant') or '', sub['p256dh'], sub['auth'],
                str(device or '')[:120], now, now))
    return sid, not row


def unsubscribe(db, role, endpoint, account):
    # m-7: only the device registered by this account is removed (knowing an endpoint is not enough).
    return db.execute('DELETE FROM push_subscriptions WHERE endpoint=? AND role=? AND account=?', (endpoint, role, account)).rowcount


def revoke_account(db, account):
    """Password change, reset or deactivation: this account's devices stop receiving pushes."""
    db.execute("UPDATE push_subscriptions SET active=0, last_error='Accès révoqué' WHERE account=?", (account,))


def enqueue(db, event, payload, role, now, accounts=None, merchant=None):
    """Queue one message per active device of the role (restricted to accounts / merchant). Idempotent per event."""
    if not mode()['enabled']:
        return 0
    query, args = 'SELECT id,endpoint FROM push_subscriptions WHERE active=1 AND role=?', [role]
    if accounts is not None:
        accounts = list(accounts)
        if not accounts:
            return 0
        query += ' AND account IN (%s)' % ','.join('?' * len(accounts))
        args += accounts
    if merchant is not None:
        query += ' AND merchant=?'
        args.append(merchant)
    count = 0
    body = json.dumps({**payload, 'tag': payload.get('tag') or event}, ensure_ascii=False)
    for row in db.execute(query, args).fetchall():
        count += db.execute('''INSERT OR IGNORE INTO push_queue(id,endpoint,subscription,event,payload,state,created,next_at)
                               VALUES(?,?,?,?,?,'pending',?,?)''',
                            (secrets.token_hex(12), row['endpoint'], row['id'], event, body, now, now)).rowcount
    return count


def _deliver(runtime, sub, payload):
    if SENDER is not None:
        return SENDER({'endpoint': sub['endpoint'], 'keys': {'p256dh': sub['p256dh'], 'auth': sub['auth']}}, payload)
    vapid_public_key(runtime)
    try:
        webpush(subscription_info={'endpoint': sub['endpoint'], 'keys': {'p256dh': sub['p256dh'], 'auth': sub['auth']}},
                data=payload, vapid_private_key=str(key_path(runtime)),
                vapid_claims={'sub': os.environ.get('PK_VAPID_SUBJECT', '').strip()}, ttl=TTL, timeout=10)
    except WebPushException as error:
        status = getattr(getattr(error, 'response', None), 'status_code', None)
        if status in (404, 410):
            raise Gone(str(status))
        raise RuntimeError(f'HTTP {status}' if status else type(error).__name__)


def flush(connect, runtime, lock, now, limit=50):
    """Send due messages outside the database lock, then record each result. Returns {sent, failed, expired, retry}."""
    result = {'sent': 0, 'failed': 0, 'expired': 0, 'retry': 0}
    if not mode()['enabled'] or not _FLUSH.acquire(blocking=False):
        return result
    try:
        with lock, connect() as db:
            rows = [dict(r) for r in db.execute('''SELECT q.id,q.payload,q.attempts,s.endpoint,s.p256dh,s.auth,s.active,s.id AS sid
                FROM push_queue q LEFT JOIN push_subscriptions s ON s.id=q.subscription
                WHERE q.state='pending' AND q.next_at<=? ORDER BY q.created LIMIT ?''', (now(), limit))]
        for row in rows:
            outcome, error = 'sent', None
            if not row['active'] or row['sid'] is None:
                outcome, error = 'expired', 'Abonnement retiré'
            else:
                try:
                    _deliver(runtime, row, row['payload'])
                except Gone as gone:
                    outcome, error = 'expired', 'Abonnement expiré (' + str(gone) + ')'
                except Exception as failure:  # network, push service error: retried with backoff
                    outcome, error = 'retry', str(failure)[:200] or type(failure).__name__
            with lock, connect() as db:
                stamp = now()
                if outcome == 'sent':
                    db.execute("UPDATE push_queue SET state='sent',attempts=attempts+1,sent_at=?,error=NULL WHERE id=?", (stamp, row['id']))
                    db.execute('UPDATE push_subscriptions SET last_ok=?,failures=0,last_error=NULL WHERE id=?', (stamp, row['sid']))
                elif outcome == 'expired':
                    db.execute("UPDATE push_queue SET state='expired',attempts=attempts+1,error=? WHERE id=?", (error, row['id']))
                    if row['sid']:
                        db.execute('UPDATE push_subscriptions SET active=0,last_error=? WHERE id=?', (error, row['sid']))
                else:
                    attempts = row['attempts'] + 1
                    final = attempts >= MAX_ATTEMPTS
                    db.execute('UPDATE push_queue SET state=?,attempts=?,next_at=?,error=? WHERE id=?',
                               ('failed' if final else 'pending', attempts, stamp + 30000 * 2 ** attempts, error, row['id']))
                    db.execute('UPDATE push_subscriptions SET failures=failures+1,last_error=? WHERE id=?', (error, row['sid']))
                    STATE['lastError'] = {'at': stamp, 'message': error}
                    outcome = 'failed' if final else 'retry'
            result[outcome] += 1
        STATE['lastFlush'] = now()
        return result
    finally:
        _FLUSH.release()


def kick(connect, runtime, lock, now):
    if AUTOFLUSH and mode()['enabled']:
        threading.Thread(target=flush, args=(connect, runtime, lock, now), daemon=True).start()


def status(db, now, runtime):
    """CEO screen: service state, queue counts, late messages, last check and last errors (no endpoints, no keys)."""
    counts = {row['state']: row['n'] for row in db.execute('SELECT state, COUNT(*) AS n FROM push_queue GROUP BY state')}
    late = db.execute("SELECT COUNT(*) FROM push_queue WHERE state='pending' AND created<?", (now() - 120000,)).fetchone()[0]
    devices = {f"{row['role']}": row['n'] for row in db.execute('SELECT role, COUNT(*) AS n FROM push_subscriptions WHERE active=1 GROUP BY role')}
    errors = [dict(row) for row in db.execute("SELECT event,state,attempts,error,created FROM push_queue WHERE error IS NOT NULL ORDER BY created DESC LIMIT 5")]
    info = mode()
    if info['enabled']:
        vapid_public_key(runtime)
    return {**info, 'counts': {k: counts.get(k, 0) for k in ['pending', 'sent', 'failed', 'expired']}, 'late': late,
            'devices': devices, 'lastFlush': STATE['lastFlush'], 'lastError': STATE['lastError'], 'errors': errors}
