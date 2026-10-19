"""Porto Kitch local API: scoped sessions, transactional orders, GPS and operations.

Run: python3 server.py. Create staff: python3 server.py account --role ceo --login EMAIL
No default professional password. Runtime records and credentials never enter Git.
"""
import argparse
import arcade_engine
import push
import csv
import copy
import datetime as dt
import hashlib
import hmac
import io
import json
import math
import os
from pathlib import Path
import re
import secrets
import sqlite3
import statistics
import threading
import time
from http import cookies
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent
RUNTIME = Path(os.environ.get('PK_RUNTIME', ROOT / '.runtime'))
RUNTIME.mkdir(parents=True, exist_ok=True)
CATALOG = json.loads(re.search(r'const D=(\[.*?\]);\n', (ROOT / 'index.html').read_text()).group(1))
MERCHANTS = {m['id']: m for m in CATALOG}
LOCK = threading.RLock()
LIMITS = {}
ADDRESS_LIMITS = {'user':30,'ip':120,'day':2000}   # I-5: Google Places calls per 10 min (user, IP) and per day (server)
HOUR = 3600000
STAFF_ROLES = ('ceo','restaurant','driver')
MAX_ACTIVE_CEO = 3
RANKED_GAMES = ['spin','stack','sky']   # the leaderboard sums these three verified games
BONUS_GAMES = ['wheel']                 # Wheelie Bradley: one-hour window enforced, kept out of the leaderboard
# Retired historical functions (finance, invoices, AI studio): routes closed, stored data kept untouched.
RETIRED_ROUTES = {'/api/finance','/api/upload','/api/ai'}
def staff_cookie(role, token='', age=0):
    # One independent session cookie per professional portal (restaurant, driver, CEO).
    return f'pk_staff_{role}={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age={age}'+('; Secure' if os.environ.get('PK_SECURE')=='1' else '')
def active_ceo_count(db): return db.execute("SELECT COUNT(*) FROM accounts WHERE role='ceo' AND active=1").fetchone()[0]
def order_view(order, portal, parts=None, viewer=None, names=None, etas=None, positions=None, pickups=None):
    # Customers receive only fresh courier points while their own bags are collected; no identity, tour or stop order.
    # Restaurants get the position and arrivals of the
    # couriers of THEIR order (per part), never the tour. Couriers never receive another courier's position or tour.
    parts=parts or [];names=names or {};etas=etas or {};positions=positions or {}
    if portal=='ceo':value=dict(order)
    else:
        hidden={'route','routePosition','routeAt','location'} if portal in ('restaurant','driver') else {'location','route','routePosition','routeAt'}
        value={key:val for key,val in order.items() if key not in hidden}
    if value.get('etaSource')=='route':
        # Legacy OpenRouteService arrivals stored on the order are no longer valid estimates (W15).
        for key in ['pickupEta','deliveryEta','etaSource']:value.pop(key,None)
    for legacy in ['driver','driverName','driverAccepted','collecting']:value.pop(legacy,None)
    summary=delivery_summary(order,parts) if order.get('mode')=='deliv' else None
    load=[p for p in parts if p['state'] in PART_LOAD]
    if portal=='client':
        value['editLocked']=any(p['state'] in ('accepted','collected','delivered') for p in parts)
        if summary:value['delivery']={k:summary[k] for k in ['bags','delivered','state']}
        # Lot 3: staff identities and internal alerts never reach the customer.
        for key in ['courierAlerts','refundedBy','placeId','typedAddr','prepEta','prepMinutes','prepSeconds','pickupEta','readyAt']:value.pop(key,None)
        if value.get('cancelRequest'):value['cancelRequest']={k:v for k,v in value['cancelRequest'].items() if k in ['state','t','decidedAt','message']}
        if value.get('pickupOffer'):value['pickupOffer']={k:v for k,v in value['pickupOffer'].items() if k in ['state','t','answeredAt']}
        # One delivery estimate (latest arrival of the active parts), only while fresh; no route or tour.
        arrivals=[etas.get(p['driver'],{}).get(order['id'],{}) for p in load]
        if load and all(a.get('delivery') and a.get('fresh') for a in arrivals):value.update(deliveryEta=max(a['delivery'] for a in arrivals),etaSource='route')
        # I-3: the pickup address is no longer in public menus; a customer invited to collect gets it on his own order only.
        if value.get('pickupOffer') and value['pickupOffer'].get('state') in ('pending','accepted') and order['m'] not in PRIVATE_PICKUP and pickups:
            value['pickupAddress']=pickups.get(order['m'])
        # Only fresh positions of couriers currently carrying THIS customer's bags; no tour or identity.
        if order.get('mode')=='deliv' and order.get('st') not in ('done','no'):
            value['courierPositions']=[{k:pos[k] for k in ('latitude','longitude','state','ageMs') if k in pos} for p in load if p['state']=='collected' for pos in [gps_view(positions.get(p['driver']))] if pos.get('state') in ('live','recent') and 'latitude' in pos]
        return value
    if portal in ('restaurant','ceo'):value['courierAlert']=courier_alert(order,parts)
    if summary is None:return value
    value['delivery']=summary
    if portal=='driver':
        mine=[p for p in parts if p['driver']==viewer and p['state'] in PART_MINE]
        value['parts']=[part_public(p,names) for p in mine]
        # m-1: customer details only while the courier's part is active, then a short grace after its delivery.
        stamp=now()
        if mine and not any(p['state'] in PART_LOAD or stamp-(p.get('delivered_at') or 0)<=DETAILS_GRACE for p in mine):
            for key in CUSTOMER_PRIVATE:value.pop(key,None)
            value['detailsExpired']=True
        value.update(driver=viewer,driverAccepted=bool(mine),collecting=any(p.get('heading_at') for p in mine if p['state']=='accepted'))
        return value
    value['parts']=[part_public(p,names) for p in parts]
    for row in value['parts']:
        if row['state'] in PART_LOAD:
            row['position']=gps_view(positions.get(row['driver']))
            arrival=etas.get(row['driver'],{}).get(order['id'])
            if arrival:row['eta']=arrival
    active=[p for p in parts if p['state'] in ('accepted','collected','delivered','proposed')]
    if active:
        value['driver']=next((p['driver'] for p in active if p['state'] in PART_LOAD),active[0]['driver'])
        value['driverName']=', '.join(f"{names.get(p['driver'],'Livreur')} ({p['bags']} sac{'s' if p['bags']>1 else ''})" for p in active)
        value['driverAccepted']=any(p['state']!='proposed' for p in active)
    if load:value['location']=gps_view(positions.get(value['driver']))  # compatibility: the main courier, per-part detail in parts
    return value
def now(): return int(time.time() * 1000)
def sunset(date):
    rad=math.pi/180;ordinal=date.timetuple().tm_yday;longitude=-8.61/15;t=ordinal+(18-longitude)/24;m=.9856*t-3.289
    l=(m+1.916*math.sin(m*rad)+.02*math.sin(2*m*rad)+282.634)%360
    ra=(math.atan(.91764*math.tan(l*rad))/rad)%360;ra=(ra+math.floor(l/90)*90-math.floor(ra/90)*90)/15
    sd=.39782*math.sin(l*rad);cd=math.cos(math.asin(sd));h=math.acos((math.cos(90.833*rad)-sd*math.sin(41.15*rad))/(cd*math.cos(41.15*rad)))/rad/15
    return int((dt.datetime.combine(date,dt.time(),dt.timezone.utc).timestamp()+((h+ra-.06571*t-6.622-longitude)%24)*3600)*1000)
def shabbat_closed(timestamp):
    local=dt.datetime.fromtimestamp(timestamp/1000,ZoneInfo('Europe/Lisbon'));date=local.date();weekday=date.weekday()
    if weekday not in [4,5]:return False
    friday=date if weekday==4 else date-dt.timedelta(days=1)
    return sunset(friday)-18*60000 <= timestamp <= sunset(friday+dt.timedelta(days=1))+42*60000
def porto_timestamp(value):
    return int(dt.datetime.fromisoformat(value).replace(tzinfo=ZoneInfo('Europe/Lisbon')).timestamp()*1000) if value else 0
def connect():
    db = sqlite3.connect(RUNTIME / 'porto.sqlite3', timeout=15)
    db.row_factory = sqlite3.Row
    return db
with connect() as db:
    db.executescript('''
      CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY, login TEXT UNIQUE, role TEXT, merchant TEXT, name TEXT, salt TEXT, hash TEXT, active INTEGER DEFAULT 1);
      CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, account TEXT, expires INTEGER);
      CREATE TABLE IF NOT EXISTS docs(path TEXT PRIMARY KEY, body TEXT);
      CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY, actor TEXT, action TEXT, created INTEGER, detail TEXT);
      CREATE TABLE IF NOT EXISTS files(id TEXT PRIMARY KEY, name TEXT, mime TEXT, body BLOB, merchant TEXT);
      CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY, client TEXT, game TEXT, started INTEGER, deadline INTEGER, score TEXT DEFAULT '0');
      CREATE TABLE IF NOT EXISTS clients(token TEXT PRIMARY KEY, id TEXT);
      CREATE TABLE IF NOT EXISTS migrations(id TEXT PRIMARY KEY, applied INTEGER);
      -- Lot 2 (additive): courier tour service, distinct from the account's active flag, and delivery parts.
      CREATE TABLE IF NOT EXISTS couriers(account TEXT PRIMARY KEY, open INTEGER NOT NULL DEFAULT 0,
        capacity INTEGER NOT NULL DEFAULT 5 CHECK(capacity BETWEEN 1 AND 10), opened_at INTEGER, opened_by TEXT, closed_at INTEGER, closed_by TEXT);
      CREATE TABLE IF NOT EXISTS delivery_parts(id TEXT PRIMARY KEY, order_id TEXT NOT NULL, driver TEXT NOT NULL,
        bags INTEGER NOT NULL CHECK(bags>=1),
        state TEXT NOT NULL CHECK(state IN ('proposed','accepted','collected','delivered','released','cancelled')),
        proposed_by TEXT, created_at INTEGER NOT NULL, accepted_at INTEGER, heading_at INTEGER, collected_at INTEGER,
        delivered_at INTEGER, released_at INTEGER, release_reason TEXT, legacy INTEGER NOT NULL DEFAULT 0);
      CREATE UNIQUE INDEX IF NOT EXISTS delivery_parts_one_open ON delivery_parts(order_id, driver) WHERE state IN ('proposed','accepted','collected');
      CREATE INDEX IF NOT EXISTS delivery_parts_order ON delivery_parts(order_id);
      CREATE INDEX IF NOT EXISTS delivery_parts_driver ON delivery_parts(driver, state);
    ''')
    db.executescript(push.SCHEMA)  # Lot 5b: Web Push subscriptions and durable, deduplicated queue
    client_schema=db.execute("SELECT sql FROM sqlite_master WHERE name='clients'").fetchone()[0]
    if 'id TEXT UNIQUE' in client_schema:
        db.executescript('ALTER TABLE clients RENAME TO clients_old; CREATE TABLE clients(token TEXT PRIMARY KEY,id TEXT); INSERT INTO clients SELECT * FROM clients_old; DROP TABLE clients_old;')
def get(db, path, default=None):
    row = db.execute('SELECT body FROM docs WHERE path=?', (path,)).fetchone()
    return json.loads(row[0]) if row else ({} if default is None else default)
def doc_exists(db, path): return db.execute('SELECT 1 FROM docs WHERE path=?',(path,)).fetchone() is not None
def put(db, path, body):
    if path.startswith('menus/'):
        body['_revision'] = get(db,path).get('_revision',0) + 1
        body.pop('effectiveService',None)
    db.execute('INSERT INTO docs VALUES(?,?) ON CONFLICT(path) DO UPDATE SET body=excluded.body', (path, json.dumps(body, ensure_ascii=False)))

def effective_service(db, menu):
    global_service=get(db,'conf/main');local=menu.get('service',{})
    result={**global_service,**local}
    # Both global and merchant schedules apply; the later opening wins.
    for key in ['preordersAt','opensAt']:
        values=[v for v in [global_service.get(key),local.get(key)] if v]
        result[key]=max(values,key=porto_timestamp) if values else ''
    result['delay']=max(global_service.get('delay',30),local.get('delay',0))
    result['open']=global_service.get('open',True) and local.get('open',True) and not menu.get('closed',False)
    result['glo']=global_service.get('glo',True) and local.get('glo',True)
    result['pickup']=global_service.get('pickup',True) and local.get('pickup',True)
    # Provisional (m-5, reversible): Uber Colis is OFF until a CEO enables it, globally AND for the establishment.
    result['uber']=not result['glo'] and global_service.get('uber',False) is True and local.get('uber',False) is True
    # Lot 5a (R85): pre-orders are open once their start time is reached and before the service opening.
    stamp=now();pre=porto_timestamp(result['preordersAt']);opening=porto_timestamp(result['opensAt'])
    result['preorderOpen']=bool(pre and stamp>=pre and (not opening or stamp<opening) and result['open'])
    return {k:result[k] for k in ['preordersAt','opensAt','delay','open','glo','pickup','uber','preorderOpen']}

def restore_menu(current, snapshot):
    result=copy.deepcopy(current)
    # I-4: the pickup point (address, coordinates, Google verification) changes only through /api/pickup; a restore
    # keeps the current point as a whole, so old unverified coordinates are never marked as verified.
    for key in ['h1','h2','rev','type']:
        if key in snapshot:result[key]=snapshot[key]
        else:result.pop(key,None)
    fields={'n','p','c','d','off','o','ot','components','menuChoices','image','del'}
    current_items=current.get('items',{});old_items=snapshot.get('items',{})
    result['items']={}
    for pid in current_items.keys()|old_items.keys():
        operational={k:v for k,v in current_items.get(pid,{}).items() if k not in fields}
        historical={k:v for k,v in old_items.get(pid,{}).items() if k in fields}
        result['items'][pid]={**operational,**historical}
        if pid not in old_items and pid.startswith('x'):
            result['items'][pid]={**current_items[pid],'off':True}
        elif pid not in current_items and pid.startswith('x'):
            result['items'][pid]['s']=0
    return result

def reserve_product(products, reserved, pid, quantity, parts=None, seen=()):
    product=products.get(pid)
    require(product and not product.get('off') and pid not in seen,'Composition indisponible.',409)
    require(parts is not None or not product.get('menuChoices'),'Ce menu nécessite des choix et ne peut pas être offert automatiquement.',400)
    children=parts if parts is not None else product.get('components')
    if children:
        for child in children:reserve_product(products,reserved,child['id'],quantity*int(child['q']),seen=(*seen,pid))
    else:reserved[pid]=reserved.get(pid,0)+quantity
def collection(db, prefix): return {row['path'][len(prefix)+1:]: json.loads(row['body']) for row in db.execute('SELECT * FROM docs WHERE path LIKE ?', (prefix + '/%',))}
def audit(db, actor, action, detail): db.execute('INSERT INTO audit VALUES(?,?,?,?,?)', (secrets.token_hex(12), actor, action, now(), json.dumps(detail, ensure_ascii=False)))
def save_credential(db, aid, password):
    # Separate from the login hash: recoverable professional credentials, CEO-only.
    from integrations import cipher
    put(db,'credentials/'+aid,{'value':cipher(RUNTIME).encrypt(password.encode()).decode(),'updatedAt':now()})
# ----- Lot 5b: Web Push events (payloads carry no customer data: order code and status only) -----
PORTAL_URL={'restaurant':'/restaurant','driver':'/livreur','ceo':'/ceo'}
def notify(db, event, body, roles, merchant=None, accounts=None):
    # Restaurant devices are limited to the order's establishment; couriers to the given accounts; CEO see everything.
    count=0
    for role in roles:
        payload={'title':'KOSH','body':body,'url':PORTAL_URL[role]}
        count+=push.enqueue(db,event,payload,role,now(),accounts=accounts if role=='driver' else None,merchant=merchant if role=='restaurant' else None)
    return count
def push_kick():push.kick(connect,RUNTIME,LOCK,now)
def order_push(db, order, action, data):
    # Events: payment declared (restaurant + CEO), new paid delivery (couriers with an open service),
    # order ready (couriers holding an accepted part), customer cancellation request (restaurant + CEO).
    oid,code,mid=order['id'],order.get('code',''),order['m']
    if action=='paid':return notify(db,f'order:{oid}:declared',f'Paiement déclaré · commande #{code} à vérifier',['restaurant','ceo'],merchant=mid)
    if action=='cancel-request' and (order.get('cancelRequest') or {}).get('state')=='pending':
        return notify(db,f'order:{oid}:cancel-request',f'Demande d’annulation · commande #{code}',['restaurant','ceo'],merchant=mid)
    if action!='status':return 0
    if data.get('status')=='ok' and order.get('mode')=='deliv':
        couriers=[r[0] for r in db.execute("SELECT couriers.account FROM couriers JOIN accounts ON accounts.id=couriers.account WHERE couriers.open=1 AND accounts.active=1 AND accounts.role='driver'")]
        return notify(db,f'order:{oid}:offer',f'Nouvelle course · {MERCHANTS.get(mid,{}).get("name",mid)}',['driver'],accounts=couriers)
    if data.get('status')=='ready' and order.get('mode')=='deliv':
        holders=sorted({p['driver'] for p in parts_for(db,oid) if p['state']=='accepted'})
        return notify(db,f'order:{oid}:ready',f'Commande prête · #{code} : vos sacs vous attendent',['driver'],accounts=holders)
    return 0
def revoke_access(db, aid):
    db.execute('DELETE FROM sessions WHERE account=?',(aid,));push.revoke_account(db,aid)
# Retired studio fields stay stored in conf/main (versions, restore) but are never applied to the public pages.
PUBLIC_CONF=('open','glo','pickup','uber')
# ----- Lot 5b: community agenda and CalJ configuration slot -----
EVENT_IMAGES=('','bg','halla','minha','arvit')
def event_value(data):
    # One-off (day = YYYY-MM-DD, Porto calendar) or weekly (dow 0 = Sunday ... 6 = Saturday, as the agenda displays them).
    require(isinstance(data,dict),'Événement invalide.',400)
    title=short(data.get('title'),120).strip();time_=short(data.get('time'),5);place=short(data.get('place'),120).strip();img=short(data.get('img'),20)
    require(title,'Indiquez un titre.',400);require(re.fullmatch(r'([01]?\d|2[0-3]):[0-5]\d',time_),'Heure invalide (HH:MM).',400);require(img in EVENT_IMAGES,'Image invalide.',400)
    value={'title':title,'time':time_.zfill(5),'place':place,'img':img}
    if data.get('day'):
        day=short(data.get('day'),10);require(re.fullmatch(r'\d{4}-\d{2}-\d{2}',day),'Date invalide.',400)
        try:dt.date.fromisoformat(day)
        except ValueError:raise Fault('Date invalide.',400)
        value['day']=day
    else:
        dow=data.get('dow');require(type(dow) is int and 0<=dow<=6,'Jour de la semaine invalide.',400);value['dow']=dow
    return value
CALJ_DEFAULT={'enabled':False,'source':'https://www.calj.net/','city':'Porto','country':'Portugal','updatedAt':None}
def calj_config(db):
    # No CalJ endpoint is called: the documented access (key, Porto selection, zmanim conventions) is still to be obtained.
    value={**CALJ_DEFAULT,**get(db,'conf/calj')};value['keySaved']=bool(get(db,'secret/calj').get('value'));return value
def calj_public(db):
    value=calj_config(db)
    return {'status':'pending' if value['enabled'] else 'unconfigured','city':value['city'],'country':value['country'],
            'label':'Source CalJ configurée · import non activé tant que le contrat d’accès n’est pas vérifié' if value['enabled'] else 'Horaires CalJ : source non configurée'}
# ----- Lot 2: courier service and delivery parts (bags) -----
PART_OPEN=('proposed','accepted','collected')          # one open part per (order, driver)
PART_HELD=('proposed','accepted','collected','delivered')  # bags no longer offered to others
PART_LOAD=('accepted','collected')                      # bags occupying the courier's capacity
PART_MINE=('accepted','collected','delivered')           # parts giving access to the order's private details
DETAILS_GRACE=30*60000                                  # m-1: customer details kept 30 min after the courier's delivery
CUSTOMER_PRIVATE=('name','tel','addr','typedAddr','destLat','destLon','placeId','note','client','destinationAccuracy')
OFFER_STATES=('ok','prep','ready','go')
def parts_for(db, oid):
    return [dict(r) for r in db.execute('SELECT * FROM delivery_parts WHERE order_id=? ORDER BY created_at,id',(oid,))]
def parts_by_order(db):
    result={}
    for r in db.execute('SELECT * FROM delivery_parts ORDER BY created_at,id'):result.setdefault(r['order_id'],[]).append(dict(r))
    return result
def courier(db, aid):
    row=db.execute('SELECT * FROM couriers WHERE account=?',(aid,)).fetchone()
    value=dict(row) if row else {'account':aid,'open':0,'capacity':5}
    load=db.execute("SELECT COALESCE(SUM(bags),0) FROM delivery_parts WHERE driver=? AND state IN ('accepted','collected')",(aid,)).fetchone()[0]
    return {'open':bool(value['open']),'capacity':value['capacity'],'load':load,'available':max(0,value['capacity']-load),'openedAt':value.get('opened_at'),'closedAt':value.get('closed_at')}
def set_courier(db, aid, **fields):
    db.execute('INSERT OR IGNORE INTO couriers(account) VALUES(?)',(aid,))
    for key,value in fields.items():db.execute(f'UPDATE couriers SET {key}=? WHERE account=?',(value,aid))
def delivery_summary(order, parts):
    """Bags declared by the restaurant versus bags held by parts; 'bags' None means unknown load."""
    bags=order.get('bags');held=sum(p['bags'] for p in parts if p['state'] in PART_HELD)
    collected=sum(p['bags'] for p in parts if p['state'] in ('collected','delivered'));delivered=sum(p['bags'] for p in parts if p['state']=='delivered')
    remaining=max(0,bags-held) if bags else 0
    if order.get('st')=='done':state='delivered'
    elif not bags:state='unknown'
    elif delivered and delivered<bags:state='partially_delivered'
    elif remaining==bags:state='unassigned'
    elif remaining:state='partially_assigned'
    else:state='assigned'
    return {'bags':bags,'assigned':held,'remaining':remaining,'collected':collected,'delivered':delivered,'state':state,'unknownLoad':not bags}
def holds(parts, aid, states=PART_MINE):
    return any(p['driver']==aid and p['state'] in states for p in parts)
def accepted_driver(db, order, aid):
    return holds(parts_for(db,order['id']),aid)
def part_public(part, names):
    keys=['id','driver','bags','state','created_at','accepted_at','heading_at','collected_at','delivered_at','released_at','release_reason','legacy']
    return {**{k:part.get(k) for k in keys},'driverName':names.get(part['driver'],'Livreur')}
def offer_for(db, order, parts, aid, state):
    """What a courier may see before acceptance: no customer name, phone, address or coordinates."""
    if not state['open'] or order.get('mode')!='deliv' or not order.get('paid') or order['st'] not in OFFER_STATES:return None
    proposal=next((p for p in parts if p['driver']==aid and p['state']=='proposed'),None)
    if holds(parts,aid,PART_LOAD):return None
    summary=delivery_summary(order,parts)
    if not proposal and not summary['unknownLoad'] and summary['remaining']<1:return None
    offer={k:order.get(k) for k in ['id','m','code','t','total','st','pickupEta','prepEta']}
    offer.update(bags=summary['bags'],remaining=summary['remaining'],unknownLoad=summary['unknownLoad'],capacity=state['capacity'],available=state['available'])
    if proposal:offer.update(proposal={'id':proposal['id'],'bags':proposal['bags']},suggested=min(proposal['bags'],state['available']))
    else:offer['suggested']=min(summary['remaining'],state['available'])
    return offer
def courier_order(order, parts, aid):
    """Routing view of an order for one courier: his part decides pickup (accepted) or delivery (collected)."""
    mine=next((p for p in parts if p['driver']==aid and p['state'] in PART_LOAD),None)
    value=copy.deepcopy(order);value['driver']=aid
    if mine:value['st']='go' if mine['state']=='collected' else ('ready' if order['st']=='go' else order['st'])
    return value
def migrate_parts(db):
    """One-off, additive: a legacy order with a single `driver` becomes one part covering all its bags."""
    if db.execute("SELECT 1 FROM migrations WHERE id='2026-10-lot2-delivery-parts'").fetchone():return 0
    created=0
    for row in db.execute("SELECT path,body FROM docs WHERE path LIKE 'orders/%'").fetchall():
        order=json.loads(row['body'])
        if not order.get('driver') or order.get('mode')!='deliv' or db.execute('SELECT 1 FROM delivery_parts WHERE order_id=?',(order['id'],)).fetchone():continue
        if not order.get('bags'):order['bags']=1;order['bagsLegacy']=True
        accepted=order.get('driverAccepted',True)
        state={'done':'delivered','go':'collected','no':'cancelled'}.get(order['st'],'accepted' if accepted else 'proposed')
        if order['st']=='no' and not accepted:state='released'
        at=order.get('acceptedAt') or order.get('t') or now()
        db.execute('INSERT INTO delivery_parts(id,order_id,driver,bags,state,created_at,accepted_at,collected_at,delivered_at,released_at,release_reason,legacy) VALUES(?,?,?,?,?,?,?,?,?,?,?,1)',
            (secrets.token_hex(12),order['id'],order['driver'],order['bags'],state,at,at if accepted else None,at if state in ('collected','delivered') else None,
             order.get('completedAt') if state=='delivered' else None,order.get('cancelledAt') if state in ('released','cancelled') else None,'Commande annulée' if order['st']=='no' else None))
        db.execute('UPDATE docs SET body=? WHERE path=?',(json.dumps(order,ensure_ascii=False),row['path']));created+=1
    db.execute("INSERT INTO migrations VALUES('2026-10-lot2-delivery-parts',?)",(now(),))
    return created
with connect() as db:migrate_parts(db)
def password_hash(password, salt): return hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()
class Fault(Exception):
    def __init__(self, message, status=400): self.message, self.status = message, status
def require(ok, message='Accès réservé.', status=403):
    if not ok: raise Fault(message, status)
def number(value, low=0, high=1000000):
    require(isinstance(value, (int,float)) and not isinstance(value,bool) and math.isfinite(value) and low <= value <= high, 'Valeur numérique invalide.', 400)
    return value
def short(value, limit=300): return str(value or '').strip()[:limit]
def coordinate(value, limit): return number(value, -limit, limit)
def items(db, mid):
    overrides = get(db, 'menus/' + mid).get('items', {})
    result = {i['id']: {**i, **overrides.get(i['id'], {})} for i in MERCHANTS[mid]['items']}
    result.update({key: {**value, 'id':key} for key,value in overrides.items() if key not in result})
    return {key: value for key,value in result.items() if not value.get('del')}
def menu_stock(db, mid, item):
    products = items(db, mid)
    components = item.get('components', [])
    if not components: return item.get('s')
    limits = [int(products.get(c['id'], {}).get('s', 0)) // int(c['q']) for c in components if products.get(c['id'], {}).get('s') is not None]
    return min(limits) if limits else None
def availability(products):
    """Lot 5a: sellable quantity per product (None = unlimited), menus included: a fixed menu is limited by its
    components, a menu au choix by each category; an inactive or missing component makes the menu unavailable."""
    result={}
    def simple(pid):
        p=products.get(pid)
        if not p or p.get('off'):return 0
        return None if p.get('s') is None else max(0,int(p['s']))
    for pid,p in products.items():
        if p.get('off'):result[pid]=0;continue
        limits=[]
        for c in p.get('components') or []:
            stock=simple(c['id'])
            if products.get(c['id'],{}).get('components') or products.get(c['id'],{}).get('menuChoices'):stock=0
            if stock is not None:limits.append(stock//max(1,int(c['q'])))
        for group in p.get('menuChoices') or []:
            eligible=[k for k,v in products.items() if v.get('c')==group.get('category') and not v.get('off') and not v.get('components') and not v.get('menuChoices')]
            stocks=[simple(k) for k in eligible]
            if not eligible:limits.append(0)
            elif all(x is not None for x in stocks):limits.append(sum(stocks)//max(1,int(group.get('q',1))))
        own=None if p.get('components') or p.get('menuChoices') else simple(pid)
        if own is not None:limits.append(own)
        result[pid]=min(limits) if limits else None
    return result
PRIVATE_PICKUP=('chabad-porto',)  # pickup address never sent to any courier (DEPLOIEMENT.md)
def effective_menu(db, mid, private=False, pickup=False):
    """private: restaurateur of this establishment or CEO. pickup: courier holding an accepted part here (address only)."""
    value = get(db, 'menus/' + mid)
    value['effectiveService']=effective_service(db,value)
    if private: return value
    # I-3/m-8: no pickup address/coordinates and no raw service settings in public menus.
    keep=['coverImage','items','closed','h1','h2','rev','type','_revision','effectiveService']
    if pickup and mid not in PRIVATE_PICKUP:keep+=['address','lat','lon','driverAccessNote']
    value = {key: value[key] for key in keep if key in value}
    # Lot 5a: customers see availability only; the internal stock quantity (s) is never sent to them.
    available=availability(items(db,mid));public={}
    for key,item in value.get('items',{}).items():
        public[key]={k:v for k,v in item.items() if k not in ['cost','supplier','s']}
    for key,count in available.items():
        if count==0:public.setdefault(key,{})['s']=0
    value['items']=public
    return value
def game_expiry(db, client):
    return max([0] + [o['t'] + HOUR for o in collection(db,'orders').values() if o.get('client') == client and o.get('st') != 'no'])
def record_stock(db, mid, reservations, restore=False):
    doc = get(db, 'menus/' + mid); overrides = doc.setdefault('items', {})
    for product_id, qty in reservations.items():
        current = items(db,mid).get(product_id, {})
        if current.get('s') is not None:
            stock = int(current['s']); require(restore or stock >= qty, 'Stock insuffisant.', 409)
            overrides.setdefault(product_id,{})['s'] = stock + qty if restore else stock - qty
    doc['_revision']=doc.get('_revision',0)+1;put(db,'menus/' + mid,doc)
def cancel_order(db, order, reason):
    if order['st'] == 'no': return
    require(order['st'] != 'done', 'Une livraison terminée ne peut pas être annulée.', 409)
    parts=parts_for(db,order['id'])
    if any(p['state'] in ('collected','delivered') for p in parts):
        # Undecided business rule (cancellation after partial collection/delivery): refuse instead of inventing one.
        # Provisional (m-4, reversible): also refused when every bag is already collected or delivered.
        require(False,'Annulation impossible : une partie des sacs est déjà récupérée ou livrée. La règle d’annulation partielle n’est pas encore décidée ; contactez les CEO.',409)
    stamp=now()
    # Lot 3: a cancelled sale closes its open parts (cancelled); 'released' stays reserved for a courier freeing bags of a live sale.
    db.execute("UPDATE delivery_parts SET state='cancelled',released_at=?,release_reason='Commande annulée' WHERE order_id=? AND state IN ('proposed','accepted','collected')",(stamp,order['id']))
    order.update(st='no', why=short(reason,200), refund=bool(order.get('paidAmount',order['total'] if order.get('paid') else 0)), refundAmount=order.get('paidAmount',order['total'] if order.get('paid') else 0), additionalDue=0, editRefundDue=0, cancelledAt=now())
    record_stock(db,order['m'],order.get('reserved',{}),True)
    if order.get('promo'):
        menu=get(db,'menus/'+order['m']); promo=menu.get('promos',{}).get(order['promo'])
        if promo: promo['used']=max(0,promo.get('used',0)-1); put(db,'menus/'+order['m'],menu)
    put(db,'orders/'+order['id'],order)
# ----- Lot 3: preparation time, cancellation requests, couriers missing, pickup proposal -----
PREP_DEFAULT=15                       # minutes (R34)
PREP_SAMPLES=20                       # first valid preparations measured (R35)
PREP_VALID=(60000,180*60000)          # implementation bound: a duration outside 1-180 min is not a reliable observation
CANCEL_REFUSED='Le restaurant a malheureusement décliné votre annulation. Vous pouvez adresser une réclamation.'
CONVERSION_NOTE='Ajustement financier à traiter manuellement'
ALERT_STEPS=(5,15)                    # minutes after payment without courier (R41, R42, W16)
def prep_settings(db, mid):
    value=get(db,'prep/'+mid);value.setdefault('minutes',PREP_DEFAULT);value.setdefault('proposal',None);return value
def prep_samples(db, mid):
    """First valid measured preparations: start and ready stamps present, not cancelled, plausible duration."""
    rows=[]
    for o in collection(db,'orders').values():
        start,ready=o.get('prepStartedAt'),o.get('readyAt')
        if o.get('m')!=mid or o.get('st')=='no' or type(start) is not int or type(ready) is not int:continue
        if PREP_VALID[0]<=ready-start<=PREP_VALID[1]:rows.append({'id':o['id'],'code':o.get('code'),'start':start,'ready':ready,'seconds':(ready-start)//1000})
    return sorted(rows,key=lambda r:(r['ready'],r['id']))
def maybe_propose_prep(db, mid):
    """Once, after the first 20 valid preparations: store their median as a proposal; never applied without acceptance."""
    settings=prep_settings(db,mid)
    if settings['proposal']:return None
    samples=prep_samples(db,mid)
    if len(samples)<PREP_SAMPLES:return None
    first=samples[:PREP_SAMPLES];median=statistics.median(r['seconds'] for r in first)
    settings['proposal']={'state':'pending','createdAt':now(),'count':PREP_SAMPLES,'medianSeconds':median,'minutes':max(1,min(180,int(median/60+.5))),
        'currentMinutes':settings['minutes'],'minSeconds':min(r['seconds'] for r in first),'maxSeconds':max(r['seconds'] for r in first),
        'from':first[0]['ready'],'to':first[-1]['ready'],'samples':[{'code':r['code'],'seconds':r['seconds']} for r in first]}
    put(db,'prep/'+mid,settings);return settings['proposal']
def without_courier(order, parts):
    """Bags of a paid delivery that no courier has accepted (a CEO proposal is not an acceptance)."""
    if order.get('mode')!='deliv' or not order.get('paid') or order.get('st') not in OFFER_STATES:return 0
    taken=sum(p['bags'] for p in parts if p['state'] in PART_MINE)
    if not order.get('bags'):return None if not taken else 0   # None: load unknown and nobody accepted
    return max(0,order['bags']-taken)
def courier_alert(order, parts, at=None):
    missing=without_courier(order,parts)
    if missing==0:return None
    since=order.get('paidAt') or order.get('t') or 0;minutes=((at or now())-since)//60000
    level=max([step for step in ALERT_STEPS if minutes>=step],default=0)
    if not level:return None
    return {'level':level,'minutes':minutes,'since':since,'bags':missing,'unknownLoad':missing is None,
            'partial':bool(missing) and bool(order.get('bags')) and missing<order['bags'],'pickupProposable':level>=15}
def scan_courier_alerts(db):
    """Server-side detection (W16), independent of open browsers: stamps each threshold once on the order."""
    stamped=0;all_parts=parts_by_order(db)
    for o in collection(db,'orders').values():
        alert=courier_alert(o,all_parts.get(o['id'],[]))
        if not alert:continue
        marks=o.setdefault('courierAlerts',{})
        for step in ALERT_STEPS:
            if alert['level']>=step and str(step) not in marks:
                marks[str(step)]=now();stamped+=1;audit(db,'system','order.courier-alert',{'id':o['id'],'minutes':step,'bags':alert['bags']})
                notify(db,f"order:{o['id']}:alert{step}",f"{'Alerte renforcée' if step>=15 else 'Alerte'} · commande #{o.get('code','')} payée sans livreur depuis {step} min",['restaurant','ceo'],merchant=o['m'])
                put(db,'orders/'+o['id'],o)
    return stamped
def alert_loop(interval=30):
    while True:
        try:
            with LOCK,connect() as db:db.execute('BEGIN IMMEDIATE');scan_courier_alerts(db);db.commit()
            push.flush(connect,RUNTIME,LOCK,now)  # due pushes and retries, outside the database lock while sending
        except Exception:pass
        time.sleep(interval)
def order_requests(db, order, who, action, data):
    """Customer cancellation request (R44, R45, W19), pickup proposal (R43, W18) and declared refund (R49)."""
    stamp=now()
    if action=='cancel-request':
        require(who['role']=='client');require(order.get('paid') and order['st'] not in ('done','no'),'Demande possible uniquement sur une commande payée et non livrée.',409)
        require(not order.get('cancelRequest'),'Une demande d’annulation a déjà été envoyée pour cette commande.',409)
        order['cancelRequest']={'state':'pending','t':stamp};return True
    if action=='cancel-decision':
        require(who['role'] in ('ceo','restaurant'),'Seuls le restaurant et les CEO décident d’une annulation.');request=order.get('cancelRequest');require(request,'Aucune demande d’annulation.',404)
        decision=data.get('decision');require(decision in ('accept','refuse'),'Décision invalide.',400)
        wanted='accepted' if decision=='accept' else 'refused'
        if request['state']==wanted:return False  # repeated click: nothing new, stock never restored twice
        require(request['state']=='pending','Demande déjà traitée.',409)
        if decision=='accept':cancel_order(db,order,'Annulation acceptée à votre demande.')
        request.update(state=wanted,decidedAt=stamp,by=who['id'],message=CANCEL_REFUSED if decision=='refuse' else '');return True
    if action=='pickup-offer':
        require(who['role'] in ('ceo','restaurant'),'Seuls le restaurant et les CEO proposent le retrait.')
        require(order.get('mode')=='deliv' and order.get('paid') and order['st'] in OFFER_STATES,'Proposition de retrait impossible pour cette commande.',409)
        parts=parts_for(db,order['id'])
        require(not any(p['state'] in ('collected','delivered') for p in parts),'Des sacs sont déjà récupérés : la conversion partielle en retrait n’est pas encore décidée.',409)
        alert=courier_alert(order,parts);require(alert and alert['level']>=15,'Proposition possible après quinze minutes sans livreur.',409)
        offer=order.get('pickupOffer') or {};require(offer.get('state')!='pending','Une proposition attend déjà la réponse du client.',409)
        order['pickupOffer']={'state':'pending','t':stamp,'by':who['id'],'previous':offer.get('state')};return True
    if action=='pickup-answer':
        require(who['role']=='client');offer=order.get('pickupOffer');require(offer,'Aucune proposition de retrait.',404)
        wanted='accepted' if data.get('accept') is True else 'refused' if data.get('accept') is False else None;require(wanted,'Réponse invalide.',400)
        if offer['state']==wanted:return False
        require(offer['state']=='pending' and order.get('mode')=='deliv' and order['st'] not in ('done','no'),'Cette proposition n’est plus valable.',409)
        if wanted=='accepted':
            require(not any(p['state'] in ('collected','delivered') for p in parts_for(db,order['id'])),'Des sacs sont déjà récupérés : la conversion partielle en retrait n’est pas encore décidée.',409)
            db.execute("UPDATE delivery_parts SET state='cancelled',released_at=?,release_reason='Commande convertie en retrait' WHERE order_id=? AND state IN ('proposed','accepted')",(stamp,order['id']))
            # Fees are not recalculated: the financial treatment of a converted delivery is not decided.
            order.update(mode='pick',conversion={'from':'deliv','at':stamp,'fee':order.get('fee'),'note':CONVERSION_NOTE})
            if order.get('location'):order['location']={**order['location'],'tracking':False}
        offer.update(state=wanted,answeredAt=stamp);return True
    if action=='refunded':
        require(who['role'] in ('ceo','restaurant'),'Seuls le restaurant et les CEO déclarent un remboursement.');require(order.get('refund'),'Aucun remboursement à déclarer.',409)
        if order.get('refundedAt'):return False
        order.update(refundedAt=stamp,refundedBy=who['id']);return True
    raise Fault('Action inconnue.',400)
def included(products, item):
    return [f"{int(c['q'])} × {products.get(c['id'],{}).get('n','Produit')}" for c in item.get('components') or []]
# ----- Lot 5a: one function for promotions and gifts -----
PROMO_CODE=re.compile(r'[A-Z0-9]{3,16}')
def promo_entry(promo):
    """Unified shape: kind percent|gift, quota, server-side counter, activation. Legacy fields are kept."""
    value=dict(promo)
    value.setdefault('kind','gift' if value.get('giftId') else 'percent')
    value.setdefault('active',True)
    try:value['used']=max(0,int(value.get('used') or 0))
    except (TypeError,ValueError):value['used']=0
    return value
def migrate_promos(db):
    """One-off, additive: existing percentage codes and gift codes join the single promotion function.
    Codes, quotas and usage counters are preserved; nothing is deleted or reset."""
    if db.execute("SELECT 1 FROM migrations WHERE id='2026-10-lot5a-promos'").fetchone():return 0
    changed=0
    for row in db.execute("SELECT path,body FROM docs WHERE path LIKE 'menus/%'").fetchall():
        menu=json.loads(row['body']);promos=menu.get('promos')
        if not isinstance(promos,dict) or not promos:continue
        unified={code:promo_entry(p) for code,p in promos.items() if isinstance(p,dict)}
        unified.update({code:p for code,p in promos.items() if not isinstance(p,dict)})
        if unified!=promos:menu['promos']=unified;db.execute('UPDATE docs SET body=? WHERE path=?',(json.dumps(menu,ensure_ascii=False),row['path']));changed+=1
    db.execute("INSERT INTO migrations VALUES('2026-10-lot5a-promos',?)",(now(),))
    return changed
with connect() as db:migrate_promos(db)
def promo_api(db, actor, data):
    mid=data.get('merchant') or actor.get('merchant');require(mid in MERCHANTS,'Établissement inconnu.',400)
    menu=get(db,'menus/'+mid);promos=menu.setdefault('promos',{});action=data.get('action')
    code=short(data.get('code'),16).upper()
    if action=='create':
        require(PROMO_CODE.fullmatch(code),'Code : 3 à 16 lettres ou chiffres.',400)
        require(code not in promos,'Ce code existe déjà. Pour changer l’offre, créez un nouveau code : les utilisations de l’ancien restent comptées.',409)
        kind=data.get('kind');require(kind in ('percent','gift'),'Type de code invalide.',400)
        quota=number(data.get('max'),1,10000);require(int(quota)==quota,'Nombre d’utilisations : entier de 1 à 10000.',400)
        entry={'kind':kind,'max':int(quota),'used':0,'active':True,'createdAt':now(),'createdBy':actor['id']}
        if kind=='percent':
            pct=number(data.get('pct'),1,100);require(int(pct)==pct,'Réduction : pourcentage entier de 1 à 100.',400);entry['pct']=int(pct)
        else:
            products=items(db,mid);gift=products.get(data.get('giftId'))
            require(gift and not gift.get('menuChoices'),'Produit offert invalide (un menu au choix ne peut pas être offert).',400)
            qty=number(data.get('giftQ',1),1,50);require(int(qty)==qty,'Quantité offerte : entier de 1 à 50.',400)
            entry.update(giftId=data['giftId'],giftQ=int(qty))
        promos[code]=entry  # creating a code reserves no stock (R77)
    elif action=='active':
        require(code in promos,'Code introuvable.',404);require(type(data.get('active')) is bool,'Activation invalide.',400)
        promos[code]=promo_entry(promos[code]);promos[code]['active']=data['active']
    else:raise Fault('Action inconnue.',400)
    put(db,'menus/'+mid,menu);audit(db,actor['id'],'promo.'+action,{'merchant':mid,'code':code})
    return {code:promo_entry(p) for code,p in menu['promos'].items() if isinstance(p,dict)}
def create_order(db, client, data, persist=True):
    mid=data.get('m'); require(mid in MERCHANTS, 'Établissement inconnu.',400)
    menu=get(db,'menus/'+mid); service=menu.get('service',{}); global_service=get(db,'conf/main')
    require(not menu.get('closed') and service.get('open',True) and global_service.get('open',True),'Service fermé.',409)
    require(not shabbat_closed(now()),'Les commandes sont fermées pendant Chabbat.',409)
    schedule=effective_service(db,menu)
    preorder=porto_timestamp(schedule.get('preordersAt'));opening=porto_timestamp(schedule.get('opensAt'))
    require(not preorder or now()>=preorder,'Les précommandes ne sont pas encore ouvertes.',409)
    scheduled=max(now()+45*60000,opening+int(schedule.get('delay',30))*60000 if opening else 0)
    mode=data.get('mode'); require(mode in ['deliv','pick','uber'],'Mode de réception invalide.',400)
    require(schedule[{'deliv':'glo','pick':'pickup','uber':'uber'}[mode]],'Ce mode de réception est désactivé. Uber Colis est indisponible lorsque la livraison Porto Kitch est active.',409)
    name,tel,addr=short(data.get('name'),80),short(data.get('tel'),30),short(data.get('addr'),200)
    require(name and re.fullmatch(r'\+?[\d\s().-]{6,20}',tel) and len(re.sub(r'\D','',tel))>=6 and (mode!='deliv' or addr),'Coordonnées incomplètes.',400)
    source=data.get('lines',[]);require(isinstance(source,list) and 0<len(source)<=100,'Panier invalide.',400)
    products=items(db,mid); lines=[];reserved={};subtotal=0
    for row in source:
        item=products.get(row.get('id'));require(item and not item.get('off'),'Article indisponible.',409)
        q=number(row.get('q'),1,50);require(int(q)==q,'Quantité invalide.',400);q=int(q)
        selection=row.get('o',[]);require(isinstance(selection,list),'Options invalides.',400)
        choice_parts=[]
        if item.get('menuChoices'):
            choice=row.get('choices',{});require(isinstance(choice,dict),'Choix du menu requis.',400)
            for group in item['menuChoices']:
                selected=[(pid,int(number(qty,1,10))) for pid,qty in choice.items() if products.get(pid,{}).get('c')==group['category']]
                require(sum(qty for _,qty in selected)==group['q'],'Composition du menu incomplète.',400)
                for pid,qty in selected:require(not products[pid].get('off') and not products[pid].get('menuChoices') and not products[pid].get('components'),'Produit du menu indisponible.',409);choice_parts.append({'id':pid,'q':qty})
            require(set(choice)=={part['id'] for part in choice_parts},'Choix du menu invalide.',400)
            selection=[]
        groups=item.get('o',[])
        if 'o' not in item and item.get('ot'):
            for text in item['ot'].split('\n'):
                title,choices=text.split(':',1);opts=[]
                for choice in choices.split(','):
                    match=re.fullmatch(r'(.*?)(?:\s*\+\s*(\d+(?:[.,]\d+)?))?',choice.strip())
                    opts.append({'n':match[1].strip(),'p':float((match[2] or '0').replace(',','.'))})
                groups.append({'t':title.strip().rstrip('*'),'one':title.strip().endswith('*'),'ch':opts})
        extra=0; allowed=[]
        for group in groups:
            matches=[c for c in group['ch'] if c['n'] in selection]
            require(not group.get('one') or len(matches)==1,'Choisissez une option obligatoire.',400)
            extra+=sum(float(c.get('p',0)) for c in matches);allowed.extend(c['n'] for c in matches)
        require(sorted(allowed)==sorted(selection),'Option inconnue.',400)
        price=round(number(float(item['p']))+extra,2);subtotal+=round(price*q*100)
        line={'id':item['id'],'n':item['n'],'p':price,'q':q,'o':selection if not choice_parts else [f"{part['q']} × {products[part['id']]['n']}" for part in choice_parts],'choices':row.get('choices',{}),'note':short(row.get('note'),200)}
        if item.get('components'):line['inc']=included(products,item)  # Lot 5a (R13): products of a fixed menu, per menu
        lines.append(line)
        reserve_product(products,reserved,item['id'],q,choice_parts if item.get('menuChoices') else None)
    code=short(data.get('promo'),16).upper();promo=menu.get('promos',{}).get(code);discount=0;gift=''
    if code:
        require(promo and promo.get('active',True) and promo.get('used',0)<promo.get('max',0),'Code promo invalide ou épuisé.',409)
        if promo.get('kind','percent')=='percent':discount=round(subtotal*min(100,promo['pct'])/100)
        else:
            gift_id=promo.get('giftId');gift_item=products.get(gift_id);require(gift_item and not gift_item.get('off'),'Cadeau indisponible.',409)
            gift_qty=int(promo.get('giftQ',1));gift=f"{gift_qty} × {gift_item['n']}";reserve_product(products,reserved,gift_id,gift_qty)
            gift_line={'id':gift_id,'n':gift_item['n'],'q':gift_qty}
            if gift_item.get('components'):gift_line['inc']=included(products,gift_item)
    record_stock(db,mid,reserved)
    if promo:
        menu=get(db,'menus/'+mid);menu['promos'][code]['used']=promo.get('used',0)+1;put(db,'menus/'+mid,menu)
    fee=350 if mode=='deliv' else 50 if mode=='pick' else 0;total=subtotal-discount+fee;oid=secrets.token_hex(12)
    requested=short(data.get('when'),30)
    if re.fullmatch(r'\d{2}:\d{2}',requested):
        day=dt.datetime.fromtimestamp(scheduled/1000,ZoneInfo('Europe/Lisbon')).date();requested_at=porto_timestamp(day.isoformat()+'T'+requested)
        require(requested_at>=scheduled,'Ce créneau est trop proche. Prévoyez au moins 45 minutes.',409);scheduled=requested_at
    order={'id':oid,'client':client,'m':mid,'code':oid[-6:].upper(),'lines':lines,'sub':subtotal/100,'fee':fee/100,'disc':discount/100,'total':total/100,'promo':code,'gift':gift,**({'giftLine':gift_line} if gift else {}),'reserved':reserved,'mode':mode,'when':requested,'scheduledAt':scheduled,'name':name,'tel':tel,'addr':addr,'note':short(data.get('note')),'st':'pay' if total else 'ok','paid':total==0,'t':now(),'session':service.get('session','initial'),'claims':[]}
    if mode=='deliv':
        # Lot 4 (W05/W06): only coordinates produced by the server from a selected Google result are trusted.
        # Raw coordinates sent by a browser are ignored; free text stays allowed but is marked unverified.
        if data.get('addressToken'):
            import integrations
            try:verified=integrations.open_address(RUNTIME,data['addressToken'])
            except ValueError as error:raise Fault(str(error),400)
            order.update(addr=short(verified['label'],200) or addr,destLat=coordinate(verified['latitude'],90),destLon=coordinate(verified['longitude'],180),
                addressVerified=True,destinationAccuracy=verified.get('precision','address'),placeId=short(verified.get('placeId'),300),typedAddr=addr)
        else:order['addressVerified']=False
    if order['paid']:order['paidAt']=now()
    if persist:put(db,'orders/'+oid,order);audit(db,client,'order.create',{'id':oid,'merchant':mid})
    return order

def amend_order(db, client, data):
    order=get(db,'orders/'+str(data.get('id')))
    require(order and order.get('client')==client,'Commande introuvable.',404)
    require(0<=now()-order['t']<5*60000,'Le délai de modification de 5 minutes est terminé.',409)
    require(order['st'] in ('pay','decl','ok','prep') and not any(p['state'] in ('accepted','collected','delivered') for p in parts_for(db,order['id'])),'La commande est déjà prête ou prise en charge. Contactez le restaurant.',409)
    require(data.get('revision',0)==order.get('editRevision',0),'La commande a changé. Rouvrez la modification.',409)
    record_stock(db,order['m'],order.get('reserved',{}),True)
    code=order.get('promo')
    if code:
        menu=get(db,'menus/'+order['m']);promo=menu.get('promos',{}).get(code)
        if promo:promo['used']=max(0,promo.get('used',0)-1);put(db,'menus/'+order['m'],menu)
    priced=create_order(db,client,{**order,'lines':data.get('lines'),'when':'asap'},persist=False)
    old_total=order['total'];paid_amount=order.get('paidAmount',old_total if order.get('paid') else 0)
    for key in ('lines','sub','disc','total','gift','reserved'):
        order[key]=priced[key]
    if 'giftLine' in priced:order['giftLine']=priced['giftLine']
    else:order.pop('giftLine',None)
    # Keep original order time, delivery, identity and preparation history.
    order['paidAmount']=paid_amount;order['additionalDue']=round(max(0,order['total']-paid_amount),2)
    order['editRefundDue']=round(max(0,paid_amount-order['total']),2)
    if order['additionalDue']>0:
        if order.get('paid') and order['st'] in ('ok','prep'):order['resumeAfterEdit']=order['st']
        order['paid']=False;order['st']='pay'
    else:
        order['paid']=True
        if order.get('resumeAfterEdit'):order['st']=order.pop('resumeAfterEdit')
    order['editedAt']=now();order['editRevision']=order.get('editRevision',0)+1
    order.setdefault('edits',[]).append({'at':now(),'before':old_total,'after':order['total']})
    put(db,'orders/'+order['id'],order);audit(db,client,'order.amend',{'id':order['id'],'before':old_total,'after':order['total']})
    return order

def finish_if_delivered(db, order):
    summary=delivery_summary(order,parts_for(db,order['id']))
    if summary['bags'] and summary['delivered']>=summary['bags'] and order['st']!='done':
        order['st']='done';order['completedAt']=now()
def part_collect(db, order, part):
    if part['state'] in ('collected','delivered'):return False  # idempotent confirmation
    require(part['state']=='accepted','Cette part n’est pas acceptée.',409)
    require(order.get('mode')=='deliv' and order['st'] in ('ready','go'),'La commande n’est pas encore prête : attendez « commande prête ».',409)
    stamp=now();db.execute("UPDATE delivery_parts SET state='collected',collected_at=? WHERE id=? AND state='accepted'",(stamp,part['id']))
    if order['st']=='ready':order['st']='go';order['departedAt']=stamp
    return True
def part_deliver(db, order, part):
    if part['state']=='delivered':return False  # idempotent confirmation
    require(part['state']=='collected','Récupérez vos sacs avant de confirmer la livraison.',409)
    db.execute("UPDATE delivery_parts SET state='delivered',delivered_at=? WHERE id=? AND state='collected'",(now(),part['id']))
    finish_if_delivered(db,order);return True
def part_release(db, part, reason):
    if part['state']=='released':return False
    require(part['state'] in ('proposed','accepted'),'Une part déjà récupérée ne peut pas être libérée.',409)
    reason=short(reason,200);require(len(reason)>=3,'Indiquez le motif de libération.',400)
    db.execute("UPDATE delivery_parts SET state='released',released_at=?,release_reason=? WHERE id=? AND state IN ('proposed','accepted')",(now(),reason,part['id']));return True
def bag_count(value, low, high):
    require(type(value) is int and low<=value<=high,'Nombre de sacs invalide.',400);return value
def accept_part(db, actor, order, bags=None):
    """Atomic (caller holds LOCK + BEGIN IMMEDIATE): service, capacity, order state and free bags are rechecked here."""
    require(order,'Course introuvable.',404)
    parts=parts_for(db,order['id'])
    mine=next((p for p in parts if p['driver']==actor['id'] and p['state'] in PART_LOAD),None)
    if mine:return mine,False  # double click or repeated request: same part, nothing new
    state=courier(db,actor['id'])
    require(state['open'],'Votre service n’est pas ouvert : un CEO doit ouvrir votre tournée avant toute nouvelle course.',409)
    require(order.get('mode')=='deliv' and order.get('paid') and order['st'] in OFFER_STATES,'Cette course n’est plus disponible.',409)
    require(order.get('bags'),'Charge inconnue : le restaurant n’a pas encore indiqué le nombre de sacs.',409)
    proposal=next((p for p in parts if p['driver']==actor['id'] and p['state']=='proposed'),None)
    limit=proposal['bags'] if proposal else delivery_summary(order,parts)['remaining']
    require(limit>=1,'Cette course n’est plus disponible.',409)
    require(state['available']>=1,f"Capacité pleine : {state['load']} sac(s) engagé(s) sur {state['capacity']}.",409)
    if bags is None:bags=min(limit,state['available'])
    else:
        bags=bag_count(bags,1,100000)
        require(bags<=limit,'Ces sacs ne sont plus disponibles. Actualisez les courses.',409)
        require(bags<=state['available'],f"Capacité insuffisante : {state['available']} place(s) libre(s).",409)
    stamp=now()
    if proposal:
        db.execute("UPDATE delivery_parts SET state='accepted',bags=?,accepted_at=? WHERE id=? AND state='proposed'",(bags,stamp,proposal['id']));pid=proposal['id']
    else:
        pid=secrets.token_hex(12)
        db.execute("INSERT INTO delivery_parts(id,order_id,driver,bags,state,created_at,accepted_at) VALUES(?,?,?,?,'accepted',?,?)",(pid,order['id'],actor['id'],bags,stamp,stamp))
    summary=delivery_summary(order,parts_for(db,order['id']))
    require(summary['assigned']<=summary['bags'],'Ces sacs ne sont plus disponibles.',409)  # invariant guard
    return dict(db.execute('SELECT * FROM delivery_parts WHERE id=?',(pid,)).fetchone()),True

# ----- Lot 4: Google tour, manual order and positions stored per courier -----
import tour as tourlib
GPS_LIVE=20000          # point younger than 20 s: live
GPS_STALE=120000        # older than 2 min: stale, never shown as current (L44)
ETA_TTL=10*60000        # a computed arrival older than 10 min is shown as "to refresh", not as current (W15)
def gps_view(pos, t=None):
    """Position of ONE courier with its server-side age; 'state' in none, live, recent, stale, interrupted."""
    if pos and pos.get('busy'):return {'state':'busy'}  # R37: courier currently serving another establishment
    if not pos or pos.get('latitude') is None:
        return {'state':'none','tracking':bool(pos and pos.get('tracking')),'updatedAt':(pos or {}).get('updatedAt')}
    t=t or now();fix=pos.get('fixAt') or pos.get('updatedAt') or 0;age=max(0,t-fix)
    state='interrupted' if not pos.get('tracking') else 'live' if age<=GPS_LIVE else 'recent' if age<=GPS_STALE else 'stale'
    return {**{k:pos[k] for k in ['latitude','longitude','accuracy','updatedAt','fixAt','tracking','stoppedAt'] if k in pos},'ageMs':age,'state':state}
def ready_at(db, order, t):
    """When the bags of an order can be picked up: now if ready, preparation end (lot 3) if cooking, else a full preparation from now."""
    if order['st'] in ('ready','go'):return 0
    if order['st']=='prep' and order.get('prepEta'):return max(t,order['prepEta'])
    return t+prep_settings(db,order['m'])['minutes']*60000
def tour_stops(db, aid, t=None):
    """Stops of the courier's accepted parts: pickup (part accepted) then delivery; a collected part keeps only its delivery."""
    t=t or now();stops=[]
    for part in db.execute("SELECT * FROM delivery_parts WHERE driver=? AND state IN ('accepted','collected') ORDER BY accepted_at,id",(aid,)).fetchall():
        order=get(db,'orders/'+part['order_id'])
        if not order or order['st'] in ('no','done'):continue
        common={'order':order['id'],'part':part['id'],'merchant':order['m'],'code':order.get('code'),'bags':part['bags'],'acceptedAt':part['accepted_at'] or part['created_at']}
        verified=order.get('addressVerified') is True and order.get('destLat') is not None
        delivery={'id':'delivery:'+order['id'],'kind':'delivery',**common,'name':order.get('name'),'address':order.get('addr'),
            'lat':order.get('destLat'),'lon':order.get('destLon'),'verified':verified}
        if part['state']=='accepted':
            menu=get(db,'menus/'+order['m']);private=order['m']=='chabad-porto'  # this address is never shown, even to couriers
            pickup={'id':'pickup:'+order['id'],'kind':'pickup',**common,'merchant':order['m'],'name':MERCHANTS.get(order['m'],{}).get('name',order['m']),
                'address':None if private else menu.get('address'),'lat':menu.get('lat'),'lon':menu.get('lon'),'private':private,
                'verified':menu.get('pickupVerified') is True and menu.get('lat') is not None,'readyAt':ready_at(db,order,t)}
            delivery['pickup']=pickup['id'];stops.append(pickup)
        stops.append(delivery)
    return stops
def tour_context(db, aid, t=None):
    stops=tour_stops(db,aid,t);saved=get(db,'tours/'+aid);state=courier(db,aid)
    return {'aid':aid,'stops':stops,'order':tourlib.reconcile(saved.get('order'),stops),'manual':bool(stops) and bool(saved.get('manual')),
        'saved':saved,'signature':tourlib.signature(stops),'capacity':state['capacity'],'position':get(db,'drivers/'+aid)}
def gps_merchant(ctx):
    """R37: establishment allowed to see this courier's position now, or None. The next stop of the tour decides,
    and nobody sees it while the courier carries collected bags of another establishment (he may be at that customer)."""
    if not ctx['order']:return None
    stops={s['id']:s for s in ctx['stops']};merchant=stops[ctx['order'][0]]['merchant']
    if any(s['kind']=='delivery' and not s.get('pickup') and s['merchant']!=merchant for s in ctx['stops']):return None
    return merchant
def tour_estimates(ctx, t=None):
    """Computed arrivals, only while they still describe the current stops and order; 'fresh' bounds their age."""
    t=t or now();computed=ctx['saved'].get('computed')
    if not computed or computed.get('signature')!=ctx['signature'] or computed.get('order')!=ctx['order']:return None
    return {**computed,'fresh':t-computed['at']<=ETA_TTL and not computed.get('stale')}
def driver_etas(db, aid, t=None):
    """Per (order) arrival of this courier: pickup and delivery, for the restaurant, the CEO and the customer."""
    ctx=tour_context(db,aid,t);estimates=tour_estimates(ctx,t);result={}
    if not estimates:return result
    for stop in ctx['stops']:
        step=estimates['steps'].get(stop['id'])
        if step:result.setdefault(stop['order'],{'at':estimates['at'],'fresh':estimates['fresh']})[stop['kind']]=step['arrive']
    return result
def tour_view(db, aid, t=None):
    """The courier's own tour: ordered stops, estimates if valid, navigation links. Never another courier's data."""
    import integrations
    t=t or now();ctx=tour_context(db,aid,t);estimates=tour_estimates(ctx,t);by_id={s['id']:s for s in ctx['stops']}
    stops=[]
    for index,sid in enumerate(ctx['order']):
        s=by_id[sid];row={k:s.get(k) for k in ['id','kind','order','part','code','bags','name','address','verified','private']}
        if estimates and sid in estimates['steps']:row['eta']=estimates['steps'][sid]
        if s['kind']=='pickup':row['readyAt']=s.get('readyAt')
        stops.append(row)
    link_stops=[{**s,'lat':None if s.get('private') else s.get('lat'),'lon':None if s.get('private') else s.get('lon'),'address':s.get('address')} for s in ctx['stops']]
    links=tourlib.google_segments(ctx['order'],link_stops)
    first=next((s for s in link_stops if ctx['order'] and s['id']==ctx['order'][0]),None)
    missing=list(dict.fromkeys(s['code'] for s in ctx['stops'] if not s.get('verified')))
    degraded=ctx['saved'].get('degraded') if not estimates else None
    return {'stops':stops,'manual':ctx['manual'],'signature':ctx['signature'],'links':links,'next':tourlib.next_links(first) if first else None,
        'estimates':{k:estimates[k] for k in ['at','finish','method','fresh','stale','matrixAt']} if estimates else None,
        'outdated':bool(stops) and not estimates,'unverified':missing,'degraded':degraded,
        'routes':bool(integrations.key_source(get,db,'routes')),'capacity':ctx['capacity'],'load':tourlib.initial_load(ctx['stops'])}
def move_stop(order, sid, where):
    require(sid in order,'Arrêt introuvable : actualisez la tournée.',409)
    result=[x for x in order if x!=sid];index=order.index(sid)
    target={'up':index-1,'down':index+1,'first':0}.get(where)
    require(target is not None,'Déplacement inconnu.',400)
    result.insert(max(0,min(len(result),target)),sid);return result

def minyan_date(value):
    day=dt.date.fromisoformat(value)
    today=dt.datetime.now(ZoneInfo('Europe/Lisbon')).date()
    require(0 <= (day-today).days <= 40,'Date hors plage.',400)
    return value

def minyan_state(db,date,client):
    result={}
    for office in ('chaharit','minha','arvit'):
        members=get(db,'minyan/'+date+'/'+office).get('members',[])
        result[office]={'count':len(members),'joined':bool(client and client in members),'confirmed':len(members)>=10}
    return result

class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kw): super().__init__(*args,directory=str(ROOT),**kw)
    def log_message(self,*args): pass
    def send_json(self,value,status=200,extra=None):
        raw=json.dumps(value,ensure_ascii=False).encode();self.send_response(status)
        self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff')
        for key,val in (extra or {}).items():self.send_header(key,val)
        self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
    def jar(self):
        jar=cookies.SimpleCookie()
        try:jar.load(self.headers.get('Cookie',''))
        except cookies.CookieError:pass
        return jar
    def client(self):
        jar=self.jar();value=jar.get('pk_client')
        if not value or not re.fullmatch(r'[a-f0-9]{48}',value.value):return None
        with connect() as db:
            row=db.execute("SELECT clients.id FROM clients LEFT JOIN accounts ON accounts.id=clients.id WHERE clients.token=? AND (accounts.id IS NULL OR (accounts.active=1 AND accounts.role='client'))",(hashlib.sha256(value.value.encode()).hexdigest(),)).fetchone()
        return row[0] if row else None
    def portal(self):
        return parse_qs(urlparse(self.path).query).get('portal',[''])[0] or self.headers.get('X-PK-Portal','')
    def actor(self,db,roles=STAFF_ROLES):
        portal=self.portal();jar=self.jar()
        candidates=[portal] if portal in STAFF_ROLES else [] if portal=='client' else list(STAFF_ROLES)
        for role in candidates:
            cookie=jar.get('pk_staff_'+role)
            if role not in roles or not cookie:continue
            row=db.execute('SELECT accounts.* FROM sessions JOIN accounts ON accounts.id=sessions.account WHERE sessions.token=? AND sessions.expires>? AND accounts.active=1 AND accounts.role=?',(hashlib.sha256(cookie.value.encode()).hexdigest(),now(),role)).fetchone()
            if row:return dict(row)
        return None
    def staff(self,db,roles=STAFF_ROLES):
        actor=self.actor(db,roles);require(actor and actor['role'] in roles,'Connectez-vous à votre espace professionnel.',401);return actor
    def set_capacity(self,db,aid,value):
        state=courier(db,aid);require(type(value) is int and 1<=value<=10,'Capacité : de 1 à 10 sacs.',400)
        require(value>=state['load'],f"Capacité inférieure aux {state['load']} sac(s) déjà engagé(s).",409);set_courier(db,aid,capacity=value)
    def scope(self,actor,mid):require(actor['role']=='ceo' or actor['role']=='restaurant' and actor['merchant']==mid)
    def owner(self,db,order,driver=False):
        actor=None if self.headers.get('X-PK-Portal')=='client' else self.actor(db)
        if actor and actor['role'] in ['restaurant','ceo']:self.scope(actor,order['m']);return actor
        if driver and actor and actor['role']=='driver':require(accepted_driver(db,order,actor['id']),'Acceptez la course avant de la gérer.');return actor
        require(order.get('client')==self.client());return {'id':self.client(),'role':'client'}
    def do_GET(self):
        if urlparse(self.path).path == '/api/minyan':
            try:
                date=minyan_date(parse_qs(urlparse(self.path).query).get('date',[''])[0])
                with connect() as db: result=minyan_state(db,date,self.client())
                self.send_json(result)
            except (ValueError,Fault): self.send_json({'error':'Date invalide.'},400)
            return
        if urlparse(self.path).path == '/api/study-sync':
            import religious
            with religious.SYNC_LOCK: status = dict(religious.SYNC_STATUS)
            self.send_json({'intervalSeconds':60,'sources':status})
            return
        if urlparse(self.path).path == '/api/daf-resources':
            try:
                import religious
                query = parse_qs(urlparse(self.path).query)
                self.send_json(religious.daf_resources(query.get('tractate',[''])[0], query.get('folio',[''])[0]))
            except Exception:self.send_json({'error':'Les ressources du Daf sont momentanément indisponibles.'},502)
            return
        if urlparse(self.path).path == '/api/halakha':
            try:
                import religious
                self.send_json(religious.halakha())
            except Exception:self.send_json({'error':'Lecteur indisponible pour le moment.'},502)
            return
        if urlparse(self.path).path == '/api/religious':
            try:
                import religious
                date = parse_qs(urlparse(self.path).query).get('date', [''])[0]
                self.send_json(religious.agenda(date, RUNTIME))
            except ValueError:self.send_json({'error':'Date ou données horaires invalides.'},400)
            except Exception:self.send_json({'error':'Horaires Hebcal indisponibles. Réessayez plus tard.'},502)
            return
        if self.path.startswith('/api/'):
            try:
                with LOCK,connect() as db:self.get_api(db)
            except Fault as e:self.send_json({'error':e.message},e.status)
            except Exception:self.send_json({'error':'Erreur serveur.'},500)
            return
        path=urlparse(self.path).path
        if path.startswith('/page/'):
            # H14-H18: studio pages stay stored in conf/main (and versions) but are no longer published.
            self.send_error(404);return
        if path=='/sw.js':
            raw=(ROOT/'sw.js').read_bytes();self.send_response(200);self.send_header('Content-Type','text/javascript; charset=utf-8')
            self.send_header('Cache-Control','no-cache');self.send_header('X-Content-Type-Options','nosniff');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw);return
        if path.startswith('/media/'):
            fid=path.split('/')[-1]
            with connect() as db:
                row=db.execute('SELECT * FROM files WHERE id=?',(fid,)).fetchone()
                published=any(get(db,'menus/'+mid).get('coverImage')==path or any(item.get('image')==path for item in items(db,mid).values()) for mid in MERCHANTS)
            if not row or not row['mime'].startswith('image/') or not published:self.send_error(404);return
            self.send_response(200);self.send_header('Content-Type',row['mime']);self.send_header('X-Content-Type-Options','nosniff');self.send_header('Cache-Control','public, max-age=3600');self.send_header('Content-Length',str(len(row['body'])));self.end_headers();self.wfile.write(row['body']);return
        if path.startswith('/manifest/') and path.endswith('.webmanifest'):
            role=path.split('/')[2].split('.')[0];routes={'restaurant':('/restaurant','Restaurateur'),'driver':('/livreur','Livreur'),'ceo':('/ceo','CEO')}
            if role not in routes:self.send_error(404);return
            start,title=routes[role]
            self.send_json({'id':start,'name':'KOSH · '+title,'short_name':'KOSH '+title,'start_url':start,'scope':'/','display':'standalone','background_color':'#fbf6ee','theme_color':'#131c36','icons':[{'src':'/img/icon-192.png','sizes':'192x192','type':'image/png'},{'src':'/img/icon-512.png','sizes':'512x512','type':'image/png'}]});return
        if path in ['/restaurant','/livreur','/ceo']:
            self.path='/index.html'
            path='/index.html'
        allowed = path in ('/','/index.html') or path in ['/manifest.webmanifest','/sw.js','/professional.css'] or path.startswith('/js/') and path.endswith('.js') or path.startswith('/img/') and path.endswith(('.jpg','.png','.webp','.svg')) or path.startswith('/vendor/leaflet/') and path.endswith(('.js','.css','.png'))
        if not allowed or '..' in path or '%2e' in path.lower():self.send_error(404);return
        super().do_GET()
    def get_api(self,db):
        path=urlparse(self.path).path;q=parse_qs(urlparse(self.path).query);actor=self.actor(db);client=self.client()
        if path=='/api/bootstrap':
            headers={}
            if not client:
                token=secrets.token_hex(24);client=secrets.token_hex(12)
                db.execute('INSERT INTO clients VALUES(?,?)',(hashlib.sha256(token.encode()).hexdigest(),client));db.commit()
                headers['Set-Cookie']=f'pk_client={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000'+('; Secure' if os.environ.get('PK_SECURE')=='1' else '')
            portal=q.get('portal',['client'])[0]
            if portal!='client':require(actor and actor['role']==portal,'Connexion requise.',401)
            orders=collection(db,'orders');visible={};all_parts=parts_by_order(db);names={a['id']:a['name'] for a in db.execute("SELECT id,name FROM accounts WHERE role='driver'")}
            viewer=actor['id'] if actor and portal!='client' else None
            stamp=now();etas={};positions={}
            pickups={o['m']:get(db,'menus/'+o['m']).get('address') for o in orders.values() if portal=='client' and o['client']==client and o.get('pickupOffer')}
            def courier_data(aid):
                # Lot 4: positions are stored per courier (drivers/<id>), arrivals come from that courier's own tour.
                if aid not in positions:
                    positions[aid]=get(db,'drivers/'+aid);etas[aid]=driver_etas(db,aid,stamp)
                    # R37: a restaurant sees the position only while the courier heads to ITS pickup or delivers ITS bags.
                    if portal=='restaurant':
                        mid=actor['merchant'];fix=positions[aid].get('fixAt') or positions[aid].get('updatedAt') or 0
                        # A point taken before the courier's last delivery for another establishment may be at that customer.
                        since=max([p.get('delivered_at') or 0 for k,o in orders.items() if o['m']!=mid for p in all_parts.get(k,[]) if p['driver']==aid and p['state']=='delivered'],default=0)
                        if gps_merchant(tour_context(db,aid,stamp))!=mid or since and fix<=since:positions[aid]={'busy':True}
            for key,o in orders.items():
                parts=all_parts.get(key,[])
                if portal=='client' and o['client']==client or actor and portal!='client' and (actor['role']=='ceo' or actor['role']=='restaurant' and o['m']==actor['merchant'] or actor['role']=='driver' and holds(parts,actor['id'])):
                    if portal!='driver' and o['st'] not in ('done','no'):
                        for p in parts:
                            if p['state'] in PART_LOAD:courier_data(p['driver'])
                    visible[key]=order_view(o,portal,parts,viewer,names,etas,positions,pickups)
                    access=get(db,'menus/'+o['m'])
                    if portal=='client' and o.get('mode')=='pick':
                        visible[key]['pickupAccessNote']=access.get('pickupAccessNote','')
                        if o['m'] not in PRIVATE_PICKUP:visible[key]['pickupAddress']=access.get('address','')
                    if portal in ('driver','restaurant','ceo'):visible[key]['driverAccessNote']=access.get('driverAccessNote','')
            mid_private=actor['merchant'] if actor and portal=='restaurant' else None
            # I-3: pickup addresses only for couriers holding an accepted part at that establishment (never chabad-porto).
            pickup_mids={o['m'] for key,o in orders.items() if o['st'] not in ('done','no') and holds(all_parts.get(key,[]),actor['id'],PART_LOAD)} if actor and portal=='driver' else set()
            result={'client':client,'time':now(),'gameExpires':game_expiry(db,client),'orders':visible,'menus':{mid:effective_menu(db,mid,bool(actor and portal=='ceo' or mid==mid_private),mid in pickup_mids) for mid in MERCHANTS},'events':{k:{f:v for f,v in e.items() if f!='updatedBy'} if portal!='ceo' else e for k,e in collection(db,'events').items()},'scores':collection(db,'verified-scores'),'conf':{key:val for key,val in get(db,'conf/main').items() if key in PUBLIC_CONF},'calj':calj_public(db),'me':{key:actor[key] for key in ['id','role','merchant','name','login']} if actor and portal!='client' else None}
            if actor and portal=='driver':
                state=courier(db,actor['id']);result['courier']=state;result['offers']={}
                for key,o in orders.items():
                    offer=offer_for(db,o,all_parts.get(key,[]),actor['id'],state)
                    if offer:result['offers'][key]=offer
            client_account=db.execute("SELECT name,login FROM accounts WHERE id=? AND role='client' AND active=1",(client,)).fetchone()
            result['clientAccount']=dict(client_account) if client_account else None
            import integrations
            # Lot 4: Google only (OpenRouteService retired; its stored secret is kept untouched and unused).
            result['integrations']={'places':integrations.key_source(get,db,'places'),'routes':integrations.key_source(get,db,'routes')} if actor and portal=='ceo' else {'places':bool(integrations.key_source(get,db,'places')),'routes':bool(integrations.key_source(get,db,'routes'))}
            if actor and portal=='driver':result['tour']=tour_view(db,actor['id'],stamp)
            if actor and portal in STAFF_ROLES:result['push']=push.mode()|{'publicKey':push.vapid_public_key(RUNTIME)}
            if actor and portal in ['restaurant','ceo']:
                assigned={p['driver'] for key,o in visible.items() if o['st'] not in ['done','no'] for p in all_parts.get(key,[]) if p['state'] in PART_LOAD}
                result['drivers']=[{'id':a['id'],'name':a['name'],'active':bool(a['active']),**(gps_view(get(db,'drivers/'+a['id']) if portal=='ceo' else positions.get(a['id']),stamp) if portal=='ceo' or a['id'] in assigned else {}),**({'service':courier(db,a['id'])} if portal=='ceo' else {})} for a in db.execute("SELECT * FROM accounts WHERE role='driver'")]
            if actor and portal in ['restaurant','ceo']:
                result['prep']={mid:prep_settings(db,mid) for mid in MERCHANTS if portal=='ceo' or mid==actor['merchant']}
            if actor and portal=='ceo':
                result['accounts']=[{key:a[key] for key in ['id','login','role','merchant','name','active']} | {'credentialSaved':bool(get(db,'credentials/'+a['id']).get('value'))} for a in db.execute('SELECT * FROM accounts')]
                result['audit']=[dict(a) for a in db.execute('SELECT id,actor,action,created,detail FROM audit ORDER BY created DESC LIMIT 100')]
                result['history']=collection(db,'versions');result['config']=get(db,'conf/main');result['reports']=collection(db,'reports')
                result['push']|=push.status(db,now,RUNTIME);result['caljConfig']=calj_config(db)
                names_all={a['id']:a['name'] for a in db.execute('SELECT id,name FROM accounts')}
                result['audit']=[a|{'actorName':names_all.get(a['actor'],'Système' if a['actor']=='system' else 'Compte supprimé')} for a in result['audit']]
            self.send_json(result,extra=headers);return
        if path=='/api/file':
            actor=self.staff(db,('ceo',));row=db.execute('SELECT * FROM files WHERE id=?',(q.get('id',[''])[0],)).fetchone();require(row,'Document introuvable.',404)
            self.send_response(200);self.send_header('Content-Type',row['mime']);self.send_header('Content-Disposition',"attachment; filename*=UTF-8''document");self.send_header('X-Content-Type-Options','nosniff');self.send_header('Content-Length',str(len(row['body'])));self.end_headers();self.wfile.write(row['body']);return
        if path=='/api/report':
            actor=self.staff(db,('ceo','restaurant'));mid=q.get('merchant',[actor['merchant']])[0]
            if mid:self.scope(actor,mid)
            output=io.StringIO();writer=csv.writer(output);writer.writerow(['Commande','Date Porto','Restaurant','Statut','Payé','Produits','Livraison','Réduction','Total','Remboursement'])
            report=get(db,'reports/'+q.get('id',[''])[0]) if q.get('id') else None
            if report and report.get('merchant'):self.scope(actor,report['merchant'])
            for o in report.get('snapshot',[]) if report else collection(db,'orders').values():
                if mid and o['m']!=mid:continue
                date=dt.datetime.fromtimestamp(o['t']/1000,ZoneInfo('Europe/Lisbon')).isoformat();writer.writerow([o['code'],date,o['m'],o['st'],bool(o.get('paid')),o['sub'],o['fee'],o['disc'],o['total'],bool(o.get('refund'))])
            raw=('\ufeff'+output.getvalue()).encode();self.send_response(200);self.send_header('Content-Type','text/csv; charset=utf-8');self.send_header('Content-Disposition','attachment; filename="porto-kitch-commandes.csv"');self.end_headers();self.wfile.write(raw);return
        raise Fault('Route inconnue.',404)
    def do_POST(self):
        try:
            origin=self.headers.get('Origin');require(not origin or urlparse(origin).netloc==self.headers.get('Host'),'Origine refusée.')
            require(self.headers.get('Content-Type','').split(';')[0]=='application/json','JSON requis.',415)
            size=int(self.headers.get('Content-Length','0'));require(0<size<=12000000,'Requête trop volumineuse.',413)
            data=json.loads(self.rfile.read(size));require(isinstance(data,dict),'Requête invalide.',400)
            require(urlparse(self.path).path not in RETIRED_ROUTES,'Fonction retirée.',410)
            if urlparse(self.path).path in ['/api/routing','/api/address']:
                self.external_api(data)
            elif urlparse(self.path).path=='/api/tour':
                self.tour_api(data)
            else:
                with LOCK,connect() as db:
                    db.execute('BEGIN IMMEDIATE');self.post_api(db,data)
        except Fault as e:self.send_json({'error':e.message},e.status)
        except (ValueError,KeyError,TypeError):self.send_json({'error':'Données invalides.'},400)
        except Exception:self.send_json({'error':'Erreur serveur.'},500)
    def address_guard(self, db, data, client, actor):
        """I-5: Google Places is billed per call. Legitimate uses only (customer with a cart, connected restaurant/CEO),
        a Google session token, and limits per user, per IP and per day for the whole server."""
        require(isinstance(data.get('session'),str) and re.fullmatch(r'[A-Za-z0-9_-]{1,64}',data['session']),'Session de recherche Google requise.',400)
        if not actor:
            cart=data.get('cart') if isinstance(data.get('cart'),dict) else {};mid=cart.get('m')
            lines=cart.get('lines') if isinstance(cart.get('lines'),list) else []
            products=items(db,mid) if mid in MERCHANTS else {}
            require(any(isinstance(l,dict) and l.get('id') in products and not products[l['id']].get('off') for l in lines),'Recherche d’adresse réservée à une commande en cours.',403)
        stamp=now();day=dt.datetime.now(ZoneInfo('Europe/Lisbon')).date().isoformat()
        daily=int(os.environ.get('PK_ADDRESS_DAILY_LIMIT') or ADDRESS_LIMITS['day'])
        checks=[(('address','who',actor['id'] if actor else client),ADDRESS_LIMITS['user'],600000),
                (('address','ip',self.client_address[0]),ADDRESS_LIMITS['ip'],600000),(('address','day',day),daily,86400000)]
        recent={key:[t for t in LIMITS.get(key,[]) if stamp-t<window] for key,limit,window in checks}
        for key,limit,window in checks:
            require(len(recent[key])<limit,'Trop de recherches d’adresse. Réessayez dans quelques minutes.' if key[1]!='day' else 'Recherche d’adresse momentanément indisponible (plafond journalier atteint). Saisissez l’adresse à la main.',429)
        for key,limit,window in checks:LIMITS[key]=recent[key]+[stamp]
    def external_api(self, data):
        """Snapshot briefly, call the provider without API/DB locks, then revalidate."""
        import integrations
        path=urlparse(self.path).path
        try:
            with LOCK,connect() as db:
                client=self.client();actor=None
                if path=='/api/address':
                    # Customers (delivery) and restaurant/CEO (pickup address) search through the server key.
                    actor=self.actor(db,('ceo','restaurant')) if self.portal() in ('ceo','restaurant') else None
                    require(client or actor,'Session requise.',401)
                    self.address_guard(db,data,client,actor)
                else:actor=self.staff(db,('ceo',))
                snapshot={key:get(db,key) for key in ['secret/google','secret/google-routes','conf/main']}
                if path=='/api/routing':
                    require(data.get('action')!='route','Le calcul de tournée passe désormais par la tournée du livreur.',410)
                    integrations.cipher(RUNTIME)
            pending={}
            def read(_db,key,default=None):return copy.deepcopy(pending.get(key,snapshot.get(key,{} if default is None else default)))
            def write(_db,key,value):pending[key]=copy.deepcopy(value)
            def rows(_db,prefix):return {k[len(prefix)+1:]:copy.deepcopy(v) for k,v in snapshot.items() if k.startswith(prefix+'/')}
            # This connection has no transaction during HTTP; providers only read cached secrets through it.
            with connect() as external_db:
                if path=='/api/address':value=integrations.address(external_db,RUNTIME,data,read,write)
                elif path=='/api/routing':value=integrations.route(external_db,RUNTIME,actor,data,read,write,rows,now)
            with LOCK,connect() as db:
                db.execute('BEGIN IMMEDIATE')
                if actor:
                    current=self.staff(db,(actor['role'],));require(current['id']==actor['id'],'La session a changé.',409)
                else:require(self.client()==client,'Session expirée.',401)
                for key,proposed in pending.items():
                    require(actor and actor['role']=='ceo' and key in ['secret/google','secret/google-routes','conf/google-status'])
                    put(db,key,proposed)
                db.commit()
            self.send_json(value)
        except PermissionError:raise Fault('Accès réservé.',403)
        except integrations.ProviderError as error:self.send_json({'error':str(error),'degraded':error.kind},503 if error.kind in ('unconfigured','unavailable','quota') else 400)
        except ValueError as error:raise Fault(str(error),400)
        except ImportError:raise Fault('Installez les dépendances du serveur pour activer les intégrations.',503)
    def tour_api(self, data):
        """POST /api/tour, courier only. move/order: manual order checked here and saved at once, never overwritten by
        polling; optimize: explicit best order; refresh: new times for the kept order. Google is called outside the
        locks with ONE matrix (or a short-lived cache); the result is written only if stops and order are unchanged."""
        import integrations
        action=data.get('action')
        with LOCK,connect() as db:
            db.execute('BEGIN IMMEDIATE')
            actor=self.staff(db,('driver',));aid=actor['id'];ctx=tour_context(db,aid)
            require(action in ('move','order','optimize','refresh'),'Action inconnue.',400)
            if action in ('move','order'):
                require(ctx['stops'],'Aucune course active.',409)
                if data.get('signature') is not None:require(data['signature']==ctx['signature'],'Les courses ont changé : actualisez la tournée.',409)
                wanted=move_stop(ctx['order'],data.get('stop'),data.get('to')) if action=='move' else [str(x) for x in data.get('stops') or []]
                try:tourlib.check(wanted,ctx['stops'],None,ctx['capacity'])
                except tourlib.TourError as error:raise Fault(str(error),409)
                saved=ctx['saved'];saved.update(order=wanted,manual=True,savedAt=now())
                put(db,'tours/'+aid,saved);audit(db,aid,'tour.'+action,{'stops':len(wanted)});db.commit()
                ctx['order'],ctx['manual']=wanted,True
            snapshot={key:get(db,key) for key in ['secret/google','secret/google-routes']}
            saved_at=ctx['saved'].get('savedAt')
        result={'ok':True};plan=None;degraded=None;t0=now()
        def read(_db,key,default=None):return copy.deepcopy(snapshot.get(key,{} if default is None else default))
        stops=ctx['stops'];pos=ctx['position']
        if stops:
            try:
                unverified=[s for s in stops if not s.get('verified') or s.get('lat') is None]
                if unverified:raise integrations.ProviderError('Adresse non vérifiée par Google (commande #%s) : ordre manuel conservé, sans heure estimée.'%unverified[0]['code'],'unverified')
                fix=pos.get('fixAt') or pos.get('updatedAt') or 0
                if not pos.get('tracking') or pos.get('latitude') is None or t0-fix>GPS_STALE:raise integrations.ProviderError('Position GPS récente nécessaire pour estimer les heures : ordre conservé.','position')
                points=[(pos['latitude'],pos['longitude'])]+[(s['lat'],s['lon']) for s in stops]
                with connect() as external_db:found=integrations.durations(external_db,RUNTIME,read,lambda *a:None,points,now)
                matrix=found['matrix']
                if action=='optimize':order,finish,method=tourlib.optimize(stops,matrix,t0,ctx['capacity'])
                else:order,method=ctx['order'],'manual' if ctx['manual'] else (ctx['saved'].get('computed') or {}).get('method','auto')
                steps=tourlib.simulate(order,stops,matrix,t0)
                plan={'order':order,'signature':ctx['signature'],'at':t0,'steps':{x['id']:x for x in steps},'finish':steps[-1]['depart'],'method':method,
                    'matrixAt':found['at'],'stale':found['stale'],'source':'google'}
                if found.get('warning'):result['warning']=found['warning']
            except integrations.ProviderError as error:degraded={'kind':error.kind,'message':str(error),'at':t0}
            except tourlib.TourError as error:degraded={'kind':'route','message':str(error),'at':t0}
        with LOCK,connect() as db:
            db.execute('BEGIN IMMEDIATE')
            current=self.staff(db,('driver',));require(current['id']==aid,'La session a changé.',409)
            now_ctx=tour_context(db,aid)
            require(now_ctx['signature']==ctx['signature'],'Les courses ont changé pendant le calcul. Recalculez la tournée.',409)
            saved=now_ctx['saved']
            if action=='optimize' and plan:
                require(saved.get('savedAt')==saved_at,'Votre ordre a été modifié pendant le calcul : il est conservé.',409)
                saved.update(order=plan['order'],manual=False,savedAt=now())
            elif plan:require(now_ctx['order']==plan['order'],'L’ordre a changé pendant le calcul : actualisez.',409)
            if stops:
                saved['computed']=plan;saved['degraded']=degraded
                put(db,'tours/'+aid,saved)
                if action=='optimize':audit(db,aid,'tour.optimize',{'stops':len(stops),'method':plan and plan['method'],'degraded':degraded and degraded['kind']})
            db.commit()
            result['tour']=tour_view(db,aid)
        if degraded:result['degraded']=degraded
        self.send_json(result)
    def post_api(self,db,data):
        path=urlparse(self.path).path;actor=self.actor(db)
        if path=='/api/minyan':
            client=self.client();require(client,'Connectez-vous pour vous inscrire au minyan.',401)
            date=minyan_date(data.get('date',''));office=data.get('office');require(office in ('chaharit','minha','arvit'),'Office invalide.',400)
            require(isinstance(data.get('join'),bool),'Inscription invalide.',400)
            path='minyan/'+date+'/'+office;members=get(db,path).get('members',[])
            if data['join'] and client not in members: members.append(client)
            if not data['join']: members=[m for m in members if m!=client]
            put(db,path,{'members':members});db.commit();self.send_json(minyan_state(db,date,client));return
        if path=='/api/promo/check':
            require(self.client(),'Session requise.',401);mid=data.get('merchant');require(mid in MERCHANTS,'Établissement inconnu.',400);code=short(data.get('code'),16).upper();promo=get(db,'menus/'+mid).get('promos',{}).get(code)
            require(promo and promo.get('active',True) and promo.get('used',0)<promo.get('max',0),'Code invalide ou épuisé.',409)
            gift=items(db,mid).get(promo.get('giftId'),{}) if promo.get('kind')=='gift' else {}
            self.send_json({'c':code,'pct':promo.get('pct',0) if promo.get('kind','percent')=='percent' else 0,'gift':promo.get('kind')=='gift',**({'giftLabel':f"{int(promo.get('giftQ',1))} × {gift.get('n','')}"} if gift else {})});return
        if path=='/api/client/account':
            action=data.get('action');old=self.client();require(old,'Session requise.',401)
            if action=='logout':
                cookie=self.jar().get('pk_client');db.execute('DELETE FROM clients WHERE token=?',(hashlib.sha256(cookie.value.encode()).hexdigest(),));db.commit();self.send_json({'ok':True},extra={'Set-Cookie':'pk_client=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});return
            login=short(data.get('email'),200).lower();password=short(data.get('password'),200)
            require(re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',login),'Adresse e-mail invalide.',400)
            if action=='register':
                require(len(password)>=12,'Choisissez au moins 12 caractères.',400);require(not db.execute('SELECT id FROM accounts WHERE login=?',(login,)).fetchone(),'Cette adresse est déjà utilisée.',409)
                salt=secrets.token_hex(16);db.execute('INSERT INTO accounts(id,login,role,merchant,name,salt,hash) VALUES(?,?,?,?,?,?,?)',(old,login,'client','',short(data.get('name'),60) or 'Joueur',salt,password_hash(password,salt)));cid=old
            elif action=='login':
                key=('client',self.client_address[0],login);attempts=[t for t in LIMITS.get(key,[]) if now()-t<900000];require(len(attempts)<10,'Trop de tentatives.',429)
                row=db.execute("SELECT * FROM accounts WHERE login=? AND role='client' AND active=1",(login,)).fetchone()
                if not row or not hmac.compare_digest(row['hash'],password_hash(password,row['salt'])):LIMITS[key]=attempts+[now()];raise Fault('Identifiants incorrects.',401)
                cid=row['id']
                if old!=cid and not db.execute('SELECT id FROM accounts WHERE id=?',(old,)).fetchone():
                    for order in collection(db,'orders').values():
                        if order['client']==old:order['client']=cid;put(db,'orders/'+order['id'],order)
                    guest_score=get(db,'verified-scores/'+old);score=get(db,'verified-scores/'+cid,{'n':row['name'],'best':{}})
                    for game,value in guest_score.get('best',{}).items():score['best'][game]=str(max(int(value),int(score['best'].get(game,0))))
                    if score['best']:score['p']=str(sum(int(v) for v in score['best'].values()));put(db,'verified-scores/'+cid,score)
                    db.execute('DELETE FROM docs WHERE path=?',('verified-scores/'+old,))
            else:raise Fault('Action inconnue.',400)
            token=secrets.token_hex(24);db.execute('INSERT INTO clients VALUES(?,?)',(hashlib.sha256(token.encode()).hexdigest(),cid));db.commit();self.send_json({'ok':True},extra={'Set-Cookie':f'pk_client={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000'+('; Secure' if os.environ.get('PK_SECURE')=='1' else '')});return
        if path=='/api/login':
            key=(self.client_address[0],short(data.get('login')).lower());attempts=LIMITS.get(key,[]);attempts=[t for t in attempts if now()-t<900000];require(len(attempts)<10,'Trop de tentatives. Réessayez dans 15 minutes.',429)
            row=db.execute('SELECT * FROM accounts WHERE lower(login)=? AND active=1',(short(data.get('login')).lower(),)).fetchone();password=short(data.get('password'),200)
            ok=row and data.get('role') in STAFF_ROLES and hmac.compare_digest(row['hash'],password_hash(password,row['salt'])) and row['role']==data.get('role')
            if not ok:LIMITS[key]=attempts+[now()];raise Fault('Identifiants incorrects.',401)
            token=secrets.token_hex(32);ttl=30*86400000 if data.get('remember') else 12*3600000
            db.execute('INSERT INTO sessions VALUES(?,?,?)',(hashlib.sha256(token.encode()).hexdigest(),row['id'],now()+ttl));db.commit()
            self.send_json({'ok':True},extra={'Set-Cookie':staff_cookie(row['role'],token,ttl//1000)});return
        if path=='/api/password':
            actor=self.staff(db)
            key=('password',actor['id']);attempts=[t for t in LIMITS.get(key,[]) if now()-t<900000]
            require(len(attempts)<10,'Trop de tentatives. Réessayez dans 15 minutes.',429)
            if not hmac.compare_digest(actor['hash'],password_hash(short(data.get('current'),200),actor['salt'])):
                LIMITS[key]=attempts+[now()];raise Fault('Mot de passe actuel incorrect.',401)
            password=short(data.get('password'),200);require(len(password)>=12,'Choisissez au moins 12 caractères.',400)
            require(type(data.get('confirm')) is str and hmac.compare_digest(data['confirm'],password),'La confirmation ne correspond pas au nouveau mot de passe.',400)
            require(not hmac.compare_digest(actor['hash'],password_hash(password,actor['salt'])),'Choisissez un mot de passe différent de l’actuel.',400)
            salt=secrets.token_hex(16);save_credential(db,actor['id'],password)
            db.execute('UPDATE accounts SET salt=?,hash=? WHERE id=?',(salt,password_hash(password,salt),actor['id']))
            revoke_access(db,actor['id']);LIMITS.pop(key,None)
            audit(db,actor['id'],'account.password',{'account':actor['id']});db.commit()
            self.send_json({'ok':True},extra={'Set-Cookie':staff_cookie(actor['role'])});return
        if path in ['/api/orders/accept','/api/parts']:
            action='accept' if path=='/api/orders/accept' else data.get('action')
            actor=self.staff(db,('driver',) if action in ['accept','heading'] or path=='/api/orders/accept' else STAFF_ROLES)
            order=get(db,'orders/'+str(data.get('order') or data.get('id')))
            if action=='accept':
                part,created=accept_part(db,actor,order,data.get('bags'))
                if created:audit(db,actor['id'],'part.accept',{'order':order['id'],'part':part['id'],'bags':part['bags']})
                db.commit();self.send_json({'ok':True,'part':{k:part[k] for k in ['id','bags','state']},'created':created});return
            require(order,'Commande introuvable.',404);parts=parts_for(db,order['id'])
            if actor['role']=='driver':
                part=next((p for p in parts if p['driver']==actor['id'] and p['id']==data.get('part')),None) if data.get('part') else next((p for p in parts if p['driver']==actor['id'] and p['state'] in PART_OPEN),None) or next((p for p in reversed(parts) if p['driver']==actor['id']),None)
                require(part,'Aucune part à votre nom sur cette commande.',403)
                require(part['state']!='proposed' or action=='release','Acceptez la proposition avant de la gérer.',403)
            else:
                self.scope(actor,order['m']);part=next((p for p in parts if p['id']==data.get('part')),None);require(part,'Part introuvable.',404)
                require(action in ['collect','deliver'] or action=='release' and actor['role']=='ceo' and part['state']=='proposed','Seul le livreur peut libérer sa part.')
            if action=='heading':
                require(part['state']=='accepted' and order['st'] in OFFER_STATES,'Part déjà récupérée.',409)
                db.execute('UPDATE delivery_parts SET heading_at=COALESCE(heading_at,?) WHERE id=?',(now(),part['id']));changed=True
            elif action=='collect':changed=part_collect(db,order,part)
            elif action=='deliver':changed=part_deliver(db,order,part)
            elif action=='release':changed=part_release(db,part,data.get('reason') or ('Proposition retirée par un CEO' if actor['role']=='ceo' else ''))
            else:raise Fault('Action inconnue.',400)
            if changed:put(db,'orders/'+order['id'],order);audit(db,actor['id'],'part.'+action,{'order':order['id'],'part':part['id']})
            db.commit();self.send_json({'ok':True,'changed':changed,'st':order['st']});return
        if path=='/api/courier':
            actor=self.staff(db,('driver',));require(data.get('action')=='capacity','Action inconnue.',400)
            self.set_capacity(db,actor['id'],data.get('capacity'));audit(db,actor['id'],'courier.capacity',{'capacity':data.get('capacity')});db.commit();self.send_json({'ok':True,'courier':courier(db,actor['id'])});return
        if path=='/api/logout':
            # Sign out of one portal only; other professional sessions and the customer cookie stay intact.
            portal=data.get('portal') or self.portal();require(portal in STAFF_ROLES,'Espace professionnel inconnu.',400)
            cookie=self.jar().get('pk_staff_'+portal)
            if cookie:db.execute('DELETE FROM sessions WHERE token=?',(hashlib.sha256(cookie.value.encode()).hexdigest(),))
            db.commit();self.send_json({'ok':True},extra={'Set-Cookie':staff_cookie(portal)});return
        if path=='/api/orders/amend':
            client=self.client();require(client,'Connexion client requise.',401)
            order=amend_order(db,client,data);db.commit();self.send_json({'ok':True,'order':order_view(order,'client',parts_for(db,order['id']))});return
        if path=='/api/orders':
            client=self.client();require(client,'Rechargez la page avant de commander.',401);order=create_order(db,client,data);db.commit();self.send_json({'order':order,'gameExpires':game_expiry(db,client),'time':now()});return
        if path=='/api/games/start':
            client=self.client();deadline=game_expiry(db,client);require(deadline>now(),'Votre heure de jeu est terminée.');game=data.get('game');require(game in RANKED_GAMES+BONUS_GAMES,'Jeu inconnu.',400)
            run=secrets.token_hex(16);seed=secrets.randbelow(4294967295)+1;started=now();db.execute('INSERT INTO runs(id,client,game,started,deadline) VALUES(?,?,?,?,?)',(run,client,game,started,deadline))
            # Wheelie Bradley (bonus): same server window and deadline, but no server replay and no leaderboard entry.
            if game in RANKED_GAMES:put(db,'arcade/'+run,arcade_engine.create(game,seed))
            db.commit();self.send_json({'run':run,'seed':seed,'expires':deadline,'time':started});return
        if path=='/api/games/score':
            run=db.execute('SELECT * FROM runs WHERE id=? AND client=?',(data.get('run'),self.client())).fetchone();require(run and game_expiry(db,self.client())>now() and run['deadline']>=now(),'Session arcade expirée.')
            require(run['game'] in RANKED_GAMES,'Wheelie Bradley est un jeu bonus hors classement.',400)
            state=get(db,'arcade/'+run['id']);require(state and 'score' not in data,'Journal de partie requis.',400)
            start=data.get('from');target=data.get('tick');taps=data.get('taps')
            require(type(start) is int and type(target) is int and 0<=start<target<=start+600,'Durée de partie invalide.',400)
            require(isinstance(taps,list) and len(taps)<=600 and all(type(t) is int and start<t<=target for t in taps) and taps==sorted(set(taps)),'Actions invalides.',400)
            packet=hashlib.sha256(json.dumps([start,target,taps]).encode()).hexdigest()
            if state.get('lastPacket')==packet:
                self.send_json({'ok':True,'tick':state['tick'],'row':get(db,'verified-scores/'+self.client())});return
            require(start==state['tick'],'Actualisation de partie requise.',409)
            require(target<=max(0,(now()-run['started'])*60//1000)+3,'La partie avance trop vite.',400)
            arcade_engine.advance(state,target,taps);state['lastPacket']=packet
            score=state['best'];put(db,'arcade/'+run['id'],state)
            db.execute('UPDATE runs SET score=? WHERE id=?',(score,run['id']))
            row=get(db,'verified-scores/'+self.client(),{'n':'Joueur','best':{}})
            row['n']=short(data.get('name'),24) or row['n'];row['best'][run['game']]=str(max(int(score),int(row['best'].get(run['game'],'0'))))
            row['p']=str(sum(int(s) for s in row['best'].values()));put(db,'verified-scores/'+self.client(),row)
            db.commit();self.send_json({'ok':True,'tick':state['tick'],'row':row});return
        if path=='/api/orders/action':
            order=get(db,'orders/'+str(data.get('id')));require(order,'Commande introuvable.',404);action=data.get('action');who=self.owner(db,order,True)
            if action in ['paid','received','rate','claim']:
                require(who['role']=='client')
                if action=='paid':require(order['st']=='pay','Paiement déjà déclaré.',409);order['st']='decl'
                if action=='received':require(order['st']=='done','Livraison non terminée.',409);order['recv']=True
                if action=='rate':require(order['st']=='done','Livraison non terminée.',409);order['rate']=int(number(data.get('rate'),1,5))
                if action=='claim':
                    text=short(data.get('text'),2000);require(len(text)>=10,'Décrivez le problème en 10 caractères au moins.',400);claims=order.setdefault('claims',[]);require(len(claims)<3 and not any(not c.get('rep') for c in claims),'Une réclamation attend déjà une réponse.',409);claims.append({'k':short(data.get('kind'),20),'txt':text,'t':now()})
            elif action=='amend-refund':
                require(who['role'] in ('ceo','restaurant'),'Action réservée au restaurant et aux CEO.')
                amount=order.get('editRefundDue',0);require(amount>0,'Aucun remboursement de modification à déclarer.',409)
                order['paidAmount']=round(max(0,order.get('paidAmount',0)-amount),2)
                order['editRefundDue']=0;order['editRefundAt']=now()
                audit(db,who['id'],'order.amend-refund',{'id':order['id'],'amount':amount})
            elif action=='status':
                require(who['role']!='client');target=data.get('status')
                if target=='no':
                    require(who['role'] in ['ceo','restaurant'],'Seuls le restaurant et les CEO peuvent annuler une vente.')
                    # Cancellation initiated by the restaurant or a CEO always carries its reason for the customer (R46).
                    if order['st']!='no':require(len(short(data.get('reason'),200))>=3,'Indiquez le motif d’annulation transmis au client.',400)
                    cancel_order(db,order,data.get('reason'))
                    if (order.get('cancelRequest') or {}).get('state')=='pending':order['cancelRequest'].update(state='accepted',decidedAt=now(),by=who['id'],message='')
                elif order['mode']=='deliv' and target in ['go','done']:
                    # Delivery handover and completion happen per part; the order is done only when every bag is delivered.
                    parts=parts_for(db,order['id'])
                    if who['role']=='driver':
                        mine=next((p for p in parts if p['driver']==who['id'] and p['state'] in PART_LOAD),None) or next((p for p in parts if p['driver']==who['id'] and p['state']=='delivered' and target=='done'),None);require(mine,'Acceptez la course avant de la gérer.')
                        part_collect(db,order,mine) if target=='go' else part_deliver(db,order,mine)
                    elif target=='go':
                        require(order['st']=='ready','Transition de commande invalide.',409);ready=[p for p in parts if p['state']=='accepted']
                        require(ready,'Un livreur doit accepter la course avant la remise.',409)
                        for part in ready:part_collect(db,order,part)
                    else:
                        require(order['st']=='go','Transition de commande invalide.',409);summary=delivery_summary(order,parts)
                        require(summary['remaining']==0 and not any(p['state'] in ('proposed','accepted') for p in parts),'Des sacs ne sont pas encore récupérés : confirmez la livraison part par part.',409)
                        for part in parts:
                            if part['state']=='collected':part_deliver(db,order,part)
                else:
                    require(who['role']!='driver')
                    valid={'pay':['ok'],'decl':['ok'],'ok':['prep'],'prep':['ready'],'ready':['go' if order['mode']=='deliv' else 'done'],'go':['done']}
                    require(target in valid.get(order['st'],[]),'Transition de commande invalide.',409)
                    if target=='ok':require(who['role'] in ['ceo','restaurant']);order['paid']=True;order['paidAt']=now();order['paidAmount']=order['total'];order['additionalDue']=0
                    order['st']=target
                    if target=='ok' and order.get('resumeAfterEdit'):order['st']=order.pop('resumeAfterEdit')
                    if target=='prep':
                        # R33/R34: estimated end from the restaurant's current preparation time.
                        minutes=prep_settings(db,order['m'])['minutes'];order.update(prepStartedAt=now(),prepMinutes=minutes,prepEta=now()+minutes*60000)
                    if target=='ready':
                        order['readyAt']=now()
                        if order.get('prepStartedAt'):order['prepSeconds']=(order['readyAt']-order['prepStartedAt'])//1000
                    if target=='done':
                        order['completedAt']=now()
            elif action=='reply':
                require(who['role'] in ['ceo','restaurant']);index=int(data.get('index'));text=short(data.get('text'),2000);require(text and 0<=index<len(order.get('claims',[])),'Réponse invalide.',400);order['claims'][index]['rep']=text
            elif action=='message':require(who['role'] in ['ceo','restaurant']);order['message']=short(data.get('text'),800)
            elif action=='eta':
                require(who['role'] in ['ceo','restaurant']);minutes=number(data.get('minutes'),1,2880);order['pickupEta' if order['st']!='go' else 'deliveryEta']=now()+int(minutes*60000);order['etaSource']='manual'
            elif action=='collect':
                require(who['role']=='driver' and order['st'] in OFFER_STATES);mine=next((p for p in parts_for(db,order['id']) if p['driver']==who['id'] and p['state']=='accepted'),None);require(mine,'Aucune part à récupérer.',409)
                db.execute('UPDATE delivery_parts SET heading_at=COALESCE(heading_at,?) WHERE id=?',(now(),mine['id']))
            elif action=='bags':
                # The restaurant (or a CEO) declares bags, never derived from products; already held bags are never silently removed.
                require(who['role'] in ['ceo','restaurant'],'Seuls le restaurant et les CEO déclarent les sacs.');require(order['mode']=='deliv' and order['st'] not in ['done','no'],'Sacs modifiables uniquement sur une livraison en cours.',409)
                count=bag_count(data.get('bags'),1,100000);parts=parts_for(db,order['id'])
                require(not any(p['state'] in ('collected','delivered') for p in parts),'Des sacs sont déjà récupérés : la modification d’une commande partiellement collectée n’est pas encore décidée.',409)
                held=delivery_summary(order,parts)['assigned'];require(count>=held,f'{held} sac(s) sont déjà attribués : libération du livreur requise avant de descendre plus bas.',409)
                order['bags']=count;order.pop('bagsLegacy',None);order['bagsAt']=now()
            elif action in ['cancel-request','cancel-decision','pickup-offer','pickup-answer','refunded']:
                if not order_requests(db,order,who,action,data):db.commit();self.send_json({'ok':True,'changed':False});return
            elif action=='destination':
                require(who['role'] in ['ceo','restaurant']);order['destLat']=coordinate(data.get('latitude'),90);order['destLon']=coordinate(data.get('longitude'),180)
                order.update(addressVerified=False,destinationAccuracy='manual')  # a hand-placed point is not a Google verification
            else:raise Fault('Action inconnue.',400)
            put(db,'orders/'+order['id'],order)
            if action=='status' and data.get('status')=='ready':maybe_propose_prep(db,order['m'])
            queued=order_push(db,order,action,data)
            audit(db,who['id'],'order.'+str(action),{'id':order['id']});db.commit()
            if queued:push_kick()
            self.send_json({'ok':True});return
        if path=='/api/dispatch':
            # Manual assignment (CEO only) is a proposal: the courier must accept it; service and capacity are checked at acceptance.
            actor=self.staff(db,('ceo',));order=get(db,'orders/'+str(data.get('id')));require(order,'Commande introuvable.',404);require(order['mode']=='deliv' and order['st'] not in ['no','done'],'Course non affectable.',409)
            driver=db.execute("SELECT * FROM accounts WHERE id=? AND role='driver' AND active=1",(data.get('driver'),)).fetchone();require(driver,'Livreur inconnu.',400)
            require(order.get('bags'),'Indiquez d’abord le nombre de sacs de la commande.',409);parts=parts_for(db,order['id'])
            require(not holds(parts,driver['id'],PART_OPEN),'Ce livreur a déjà une part sur cette commande.',409)
            remaining=delivery_summary(order,parts)['remaining'];require(remaining>=1,'Tous les sacs sont déjà attribués.',409)
            # m-2: a proposal never exceeds the courier's available capacity (it would hold bags others could take).
            available=courier(db,driver['id'])['available'];require(available>=1,'Ce livreur n’a plus de capacité disponible.',409)
            bags=bag_count(data['bags'],1,remaining) if data.get('bags') is not None else min(remaining,available);pid=secrets.token_hex(12)
            require(bags<=available,f'Capacité disponible du livreur : {available} sac{"s" if available>1 else ""}. Proposez au plus ce nombre.',409)
            db.execute("INSERT INTO delivery_parts(id,order_id,driver,bags,state,proposed_by,created_at) VALUES(?,?,?,?,'proposed',?,?)",(pid,order['id'],driver['id'],bags,actor['id'],now()))
            order['pickupEta']=now()+int(number(data.get('minutes',15),1,2880))*60000;order['etaSource']='manual'
            put(db,'orders/'+order['id'],order);audit(db,actor['id'],'dispatch',{'id':order['id'],'driver':driver['id'],'bags':bags,'part':pid});db.commit();self.send_json({'ok':True,'part':pid});return
        if path=='/api/location':
            # Lot 4: one position per courier (drivers/<id>), never copied into orders. Accepted only while the courier
            # holds an active part; the browser asks for permission at login but sends nothing without a course.
            actor=self.staff(db,('driver',));all_parts=parts_by_order(db);active=[o for o in collection(db,'orders').values() if holds(all_parts.get(o['id'],[]),actor['id'],PART_LOAD) and o['st'] not in ['no','done']]
            require(active or data.get('stop'),'Aucune course active.')
            previous=get(db,'drivers/'+actor['id'])
            if data.get('stop'):
                # Interruption: the last real point is kept with its own time, never presented as current.
                location={**previous,'tracking':False,'stoppedAt':now()};location.setdefault('updatedAt',now())
            else:
                stamp=now();age=int(number(data.get('age',0),0,3600000))  # age of the fix reported by the browser
                location={'tracking':True,'latitude':coordinate(data.get('latitude'),90),'longitude':coordinate(data.get('longitude'),180),'accuracy':number(data.get('accuracy',0),0,100000),'updatedAt':stamp,'fixAt':stamp-age}
                if previous.get('fixAt') and location['fixAt']<previous['fixAt']:location['fixAt']=previous['fixAt']
            put(db,'drivers/'+actor['id'],location)
            db.commit();self.send_json({'ok':True,'gps':gps_view(location)});return
        if path=='/api/prep':
            # R34/R35/C34: preparation time per restaurant; the median proposal is applied only on the restaurateur's acceptance.
            actor=self.staff(db,('ceo','restaurant'));mid=data.get('merchant') or actor['merchant'];require(mid in MERCHANTS,'Établissement inconnu.',400);self.scope(actor,mid)
            settings=prep_settings(db,mid);action=data.get('action');proposal=settings['proposal']
            if action=='set':
                minutes=number(data.get('minutes'),1,180);require(int(minutes)==minutes,'Temps de préparation : minutes entières de 1 à 180.',400)
                settings.update(minutes=int(minutes),updatedAt=now(),updatedBy=actor['id'])
            elif action in ['accept','refuse']:
                require(actor['role']=='restaurant','La proposition est validée par le restaurateur.');require(proposal,'Aucune proposition en attente.',404)
                wanted='accepted' if action=='accept' else 'refused'
                if proposal['state']==wanted:db.commit();self.send_json({'ok':True,'changed':False,'prep':settings});return
                require(proposal['state']=='pending','Proposition déjà traitée.',409)
                proposal.update(state=wanted,decidedAt=now(),decidedBy=actor['id'],previousMinutes=settings['minutes'])
                if action=='accept':settings.update(minutes=proposal['minutes'],updatedAt=now(),updatedBy=actor['id'])
            else:raise Fault('Action inconnue.',400)
            put(db,'prep/'+mid,settings);audit(db,actor['id'],'prep.'+action,{'merchant':mid,'minutes':settings['minutes']});db.commit();self.send_json({'ok':True,'changed':True,'prep':settings});return
        if path=='/api/pickup':
            # Lot 4 (C35/C36): pickup address from a selected Google result (server-signed token), or free text marked unverified.
            actor=self.staff(db,('ceo','restaurant'));mid=data.get('merchant') or actor['merchant'];require(mid in MERCHANTS,'Établissement inconnu.',400);self.scope(actor,mid)
            menu=get(db,'menus/'+mid)
            if data.get('token'):
                import integrations
                try:verified=integrations.open_address(RUNTIME,data['token'])
                except ValueError as error:raise Fault(str(error),400)
                menu.update(address=short(verified['label'],200),lat=coordinate(verified['latitude'],90),lon=coordinate(verified['longitude'],180),pickupVerified=True,placeId=short(verified.get('placeId'),300),pickupPrecision=verified.get('precision'))
            else:
                text=short(data.get('address'),200);require(len(text)>=5,'Adresse de collecte trop courte.',400)
                menu.update(address=text,lat=None,lon=None,pickupVerified=False,placeId=None,pickupPrecision=None)
            version=secrets.token_hex(12);put(db,'versions/'+version,{'id':version,'kind':'menu','merchant':mid,'t':now(),'config':get(db,'menus/'+mid),'note':'Adresse de collecte · '+MERCHANTS[mid]['name']})
            put(db,'menus/'+mid,menu);audit(db,actor['id'],'pickup.address',{'merchant':mid,'verified':menu['pickupVerified']});db.commit()
            self.send_json({'ok':True,'address':menu['address'],'verified':menu['pickupVerified']});return
        if path=='/api/promo':
            actor=self.staff(db,('ceo','restaurant'));mid=data.get('merchant') or actor['merchant'];require(mid in MERCHANTS,'Établissement inconnu.',400);self.scope(actor,mid)
            promos=promo_api(db,actor,{**data,'merchant':mid});db.commit();self.send_json({'ok':True,'promos':promos});return
        if path=='/api/restaurant-photo':
            actor=self.staff(db,('ceo','restaurant'));mid=data.get('merchant') or actor['merchant'];require(mid in MERCHANTS,'Établissement inconnu.',400);self.scope(actor,mid)
            image=data.get('image','');require(isinstance(image,str) and (not image or re.fullmatch(r'/media/[a-f0-9]{24}',image)),'Photo invalide.',400)
            if image:
                photo=db.execute('SELECT * FROM files WHERE id=?',(image.rsplit('/',1)[-1],)).fetchone()
                require(photo and photo['merchant']==mid and photo['mime'] in ('image/jpeg','image/png','image/webp'),'Choisissez une photo importée pour votre restaurant.',400)
            menu=get(db,'menus/'+mid);menu['coverImage']=image;menu['_revision']=menu.get('_revision',0)+1
            put(db,'menus/'+mid,menu);audit(db,actor['id'],'restaurant.photo',{'merchant':mid});db.commit();self.send_json({'ok':True});return
        if path=='/api/access-notes':
            actor=self.staff(db,('ceo','restaurant'));mid=data.get('merchant') or actor['merchant'];require(mid in MERCHANTS,'Établissement inconnu.',400);self.scope(actor,mid)
            menu=get(db,'menus/'+mid)
            for key in ('driverAccessNote','pickupAccessNote'):
                require(isinstance(data.get(key,''),str) and len(data.get(key,''))<=1000,'Note trop longue (1000 caractères maximum).',400)
                menu[key]=data.get(key,'').strip()
            menu['_revision']=menu.get('_revision',0)+1
            put(db,'menus/'+mid,menu);audit(db,actor['id'],'access.notes',{'merchant':mid});db.commit();self.send_json({'ok':True});return
        if path=='/api/menu':
            actor=self.staff(db,('ceo','restaurant'));mid=data.get('merchant');require(mid in MERCHANTS,'Établissement inconnu.',400);self.scope(actor,mid);value=data.get('menu');require(isinstance(value,dict),'Carte invalide.',400)
            current=get(db,'menus/'+mid)
            require(value.get('_revision',0)==current.get('_revision',0),'La carte ou le stock ont changé pendant votre modification. Actualisez avant de réessayer.',409)
            value['_revision']=current.get('_revision',0)+1
            value.pop('pin',None)
            # Lot 4: the pickup point changes only through /api/pickup (verified Google result or unverified text).
            for key in ['coverImage','address','lat','lon','pickupVerified','placeId','pickupPrecision','driverAccessNote','pickupAccessNote']:
                if key in current:value[key]=current[key]
                else:value.pop(key,None)
            for product in value.get('items',{}).values():
                if 'p' in product:number(product['p'],0,100000)
                if product.get('s') is not None:number(product['s'],0,1000000)
                for c in product.get('components',[]):require(c['id'] in items(db,mid) and 1<=int(c['q'])<=50,'Composition invalide.',400)
                for group in product.get('menuChoices',[]):require(isinstance(group.get('category'),str) and 1<=int(group.get('q',0))<=10,'Catégorie de menu invalide.',400)
                if product.get('image'):require(re.fullmatch(r'/media/[a-f0-9]{24}',product['image']),'Photo invalide.',400)
            # Lot 5a (R76): promotions and gifts are managed only by /api/promo. A menu save keeps the stored codes and
            # counters as they are on the server: no reset, no deletion, no counter coming from the browser.
            if 'promos' in current:value['promos']=current['promos']
            else:value.pop('promos',None)
            # I-2 (H20/C40): service settings (Uber Colis, sessions, schedules) and closure change only through /api/service;
            # outside the CEO, whatever the browser sends for them is ignored and the stored values are kept.
            if actor['role']!='ceo':
                for key in ['service','closed']:
                    if key in current:value[key]=copy.deepcopy(current[key])
                    else:value.pop(key,None)
            # Lot 5a (R78-R80): hours, Revolut link and kitchen type are checked when they change (stored values untouched).
            edited=lambda key:value.get(key) and value.get(key)!=current.get(key)
            for key in ['h1','h2']:
                if edited(key):require(isinstance(value[key],str) and re.fullmatch(r'([01]\d|2[0-3]):[0-5]\d',value[key]),'Horaire invalide (HH:MM).',400)
            if edited('rev'):require(isinstance(value['rev'],str) and len(value['rev'])<=300 and re.fullmatch(r'https://(revolut\.me|checkout\.revolut\.com|pay\.revolut\.com)/[^\s"\'<>]+',value['rev']),'Lien Revolut invalide (https://revolut.me/…).',400)
            if edited('type'):require(value['type'] in ('meat','dairy','parve'),'Type de cuisine invalide.',400)
            version=secrets.token_hex(12);put(db,'versions/'+version,{'id':version,'kind':'menu','merchant':mid,'t':now(),'config':get(db,'menus/'+mid),'note':'Carte · '+MERCHANTS[mid]['name']})
            put(db,'menus/'+mid,value);audit(db,actor['id'],'menu.update',{'merchant':mid});db.commit();self.send_json({'ok':True});return
        if path=='/api/service':
            actor=self.staff(db,('ceo','restaurant'));mid=data.get('merchant') or actor['merchant'];action=data.get('action')
            if mid:self.scope(actor,mid);menu=get(db,'menus/'+mid);service=menu.setdefault('service',{})
            else:require(actor['role']=='ceo');service=get(db,'conf/main');menu=None
            if action in ['glo','pickup','uber']:
                require(type(data.get('enabled')) is bool,'Activation invalide.',400);require(action!='uber' or actor['role']=='ceo','Uber Colis est réglé par les CEO.')
                service[action]=data['enabled']
            elif action=='open':service['open']=True;service['session']=secrets.token_hex(8);service['openedAt']=now()
            elif action=='close':
                # Closing only blocks new orders; received or paid orders stay active until handled.
                service['open']=False;ids=[o['id'] for o in collection(db,'orders').values() if (not mid or o['m']==mid) and o['st'] not in ['done','no']]
                report={'id':secrets.token_hex(12),'closedAt':now(),'merchant':mid,'orders':ids,'snapshot':[o for o in collection(db,'orders').values() if not mid or o['m']==mid]};put(db,'reports/'+report['id'],report)
                if mid:menu=get(db,'menus/'+mid);menu['service']=service
            elif action=='schedule':
                for key in ['preordersAt','opensAt']:
                    service[key]=short(data.get(key),40);porto_timestamp(service[key])
                service['delay']=number(data.get('delay',30),0,180)
            else:raise Fault('Action inconnue.',400)
            put(db,'menus/'+mid,menu) if mid else put(db,'conf/main',service);audit(db,actor['id'],'service.'+str(action),{'merchant':mid});db.commit();self.send_json({'ok':True});return
        if path=='/api/ceo':
            actor=self.staff(db,('ceo',));action=data.get('action')
            if action=='account':
                role=data.get('role');require(role in ['ceo','restaurant','driver'],'Rôle invalide.',400);mid=(data.get('merchant') or '') if role=='restaurant' else '';require(role!='restaurant' or mid in MERCHANTS,'Établissement requis.',400);login=short(data.get('login'),200).lower();require(login and '@' in login,'Adresse e-mail requise.',400);require(role!='ceo' or active_ceo_count(db)<MAX_ACTIVE_CEO,'Trois comptes CEO actifs maximum.',409)
                require(not db.execute('SELECT id FROM accounts WHERE login=?',(login,)).fetchone(),'Ce compte existe déjà.',409);aid=secrets.token_hex(12);password=secrets.token_urlsafe(18);salt=secrets.token_hex(16);db.execute('INSERT INTO accounts(id,login,role,merchant,name,salt,hash) VALUES(?,?,?,?,?,?,?)',(aid,login,role,mid,short(data.get('name'),80) or login,salt,password_hash(password,salt)));save_credential(db,aid,password);audit(db,actor['id'],'account.create',{'account':aid,'role':role});db.commit();self.send_json({'ok':True,'id':aid,'password':password});return
            if action=='credential':
                aid=short(data.get('id'),100);account=db.execute('SELECT role,active FROM accounts WHERE id=?',(aid,)).fetchone()
                require(account and account['role'] in ['ceo','restaurant','driver'] and account['active'],'Accès professionnel actif requis.',404)
                value=get(db,'credentials/'+aid);require(value.get('value'),'Aucun mot de passe conservé pour cet ancien compte. Réinitialisez-le pour en créer un.',404)
                from integrations import cipher
                password=cipher(RUNTIME).decrypt(value['value'].encode()).decode()
                audit(db,actor['id'],'credential.view',{'account':aid});db.commit();self.send_json({'password':password});return
            if action=='enable':
                aid=short(data.get('id'),100);account=db.execute('SELECT role,active FROM accounts WHERE id=?',(aid,)).fetchone();require(account,'Compte introuvable.',404)
                require(account['active'] or account['role']!='ceo' or active_ceo_count(db)<MAX_ACTIVE_CEO,'Trois comptes CEO actifs maximum.',409)
                db.execute('UPDATE accounts SET active=1 WHERE id=?',(aid,));audit(db,actor['id'],'account.enable',{'account':aid});db.commit()
                self.send_json({'ok':True,'credentialSaved':bool(get(db,'credentials/'+aid).get('value'))});return
            if action in ['disable','reset']:
                aid=data.get('id');require(aid!=actor['id'],'Vous ne pouvez pas modifier votre propre accès ici.',409);require(db.execute('SELECT id FROM accounts WHERE id=?',(aid,)).fetchone(),'Compte introuvable.',404)
                password=None
                if action=='disable':db.execute('UPDATE accounts SET active=0 WHERE id=?',(aid,))
                else:password=secrets.token_urlsafe(18);salt=secrets.token_hex(16);db.execute('UPDATE accounts SET salt=?,hash=? WHERE id=?',(salt,password_hash(password,salt),aid))
                if password and db.execute('SELECT role FROM accounts WHERE id=?',(aid,)).fetchone()['role'] in ['ceo','restaurant','driver']:save_credential(db,aid,password)
                revoke_access(db,aid);db.execute('DELETE FROM clients WHERE id=?',(aid,));audit(db,actor['id'],'account.'+action,{'account':aid});db.commit();self.send_json({'ok':True,'password':password,'credentialSaved':bool(get(db,'credentials/'+aid).get('value'))});return
            if action=='driver-service':
                # Tour service, distinct from the account: closing blocks new acceptances, accepted parts stay finishable, no logout.
                aid=short(data.get('id'),100);account=db.execute("SELECT active FROM accounts WHERE id=? AND role='driver'",(aid,)).fetchone();require(account,'Livreur inconnu.',404)
                require(type(data.get('open')) is bool,'Ouverture invalide.',400);require(account['active'] or not data['open'],'Compte livreur désactivé.',409)
                if data['open']:set_courier(db,aid,open=1,opened_at=now(),opened_by=actor['id'])
                else:set_courier(db,aid,open=0,closed_at=now(),closed_by=actor['id'])
                audit(db,actor['id'],'courier.'+('open' if data['open'] else 'close'),{'account':aid});db.commit();self.send_json({'ok':True,'courier':courier(db,aid)});return
            if action=='capacity':
                aid=short(data.get('id'),100);require(db.execute("SELECT 1 FROM accounts WHERE id=? AND role='driver'",(aid,)).fetchone(),'Livreur inconnu.',404)
                self.set_capacity(db,aid,data.get('capacity'));audit(db,actor['id'],'courier.capacity',{'account':aid,'capacity':data.get('capacity')});db.commit();self.send_json({'ok':True,'courier':courier(db,aid)});return
            if action=='calj':
                # Configuration slot only (disabled by default): no CalJ request is made and no time is invented.
                value={**CALJ_DEFAULT,**get(db,'conf/calj')};require(type(data.get('enabled')) is bool,'Activation invalide.',400)
                value.update(enabled=data['enabled'],city=short(data.get('city'),60).strip() or 'Porto',country=short(data.get('country'),60).strip() or 'Portugal',updatedAt=now(),updatedBy=actor['id'])
                put(db,'conf/calj',value)
                import integrations
                if data.get('removeKey'):db.execute("DELETE FROM docs WHERE path='secret/calj'")
                elif short(data.get('key'),300).strip():integrations.secret(db,RUNTIME,'calj',get,put,short(data.get('key'),300).strip())
                audit(db,actor['id'],'calj.config',{'enabled':value['enabled'],'city':value['city'],'key':'removed' if data.get('removeKey') else 'set' if short(data.get('key'),300).strip() else 'unchanged'})
                db.commit();self.send_json({'ok':True,'calj':calj_config(db)});return
            if action=='config':
                raise Fault('Fonction retirée : le studio de personnalisation n’est plus disponible.',410)
            if action=='restore':
                version=get(db,'versions/'+str(data.get('id')));require(version,'Version introuvable.',404);vid=secrets.token_hex(12)
                destination='menus/'+version['merchant'] if version.get('kind')=='menu' else 'conf/main'
                put(db,'versions/'+vid,{'id':vid,'kind':version.get('kind','config'),'merchant':version.get('merchant'),'t':now(),'config':get(db,destination),'note':'Avant restauration'});put(db,destination,restore_menu(get(db,destination),version['config']) if version.get('kind')=='menu' else {**{k:v for k,v in get(db,destination).items() if k not in ['brand','headline','accent','background','whatsapp','intro','pages','screenBlocks','siteCss']},**{k:v for k,v in version['config'].items() if k in ['brand','headline','accent','background','whatsapp','intro','pages','screenBlocks','siteCss']}})
            else:raise Fault('Action inconnue.',400)
            audit(db,actor['id'],'ceo.'+str(action),{});db.commit();self.send_json({'ok':True});return
        if path=='/api/photo':
            import base64
            actor=self.staff(db,('ceo','restaurant'));mid=data.get('merchant');require(mid in MERCHANTS,'Établissement inconnu.',400);self.scope(actor,mid);mime=data.get('mime');require(mime in ['image/jpeg','image/png','image/webp'],'Photo PNG, JPEG ou WebP requise.',400);raw=base64.b64decode(data.get('body',''),validate=True);require(len(raw)<=8*1024*1024,'Maximum 8 Mo.',413);fid=secrets.token_hex(12);db.execute('INSERT INTO files VALUES(?,?,?,?,?)',(fid,short(data.get('name'),200),mime,raw,mid));db.commit();self.send_json({'image':'/media/'+fid});return
        if path=='/api/events':
            # C70-C73: CEO only; one-off and weekly events, validated, editable and removable, every change audited.
            actor=self.staff(db,('ceo',));eid=short(data.get('id'),40)
            require(not eid or re.fullmatch(r'[A-Za-z0-9_-]+',eid),'Identifiant invalide.',400)
            if data.get('remove'):
                require(eid and doc_exists(db,'events/'+eid),'Événement introuvable.',404)
                db.execute('DELETE FROM docs WHERE path=?',('events/'+eid,));audit(db,actor['id'],'event.remove',{'id':eid})
            else:
                value=event_value(data.get('event'));existing=doc_exists(db,'events/'+eid) if eid else False
                require(not eid or existing,'Événement introuvable.',404);eid=eid or secrets.token_hex(12)
                put(db,'events/'+eid,value|{'updatedAt':now(),'updatedBy':actor['id']});audit(db,actor['id'],'event.'+('update' if existing else 'create'),{'id':eid,'title':value['title']})
            db.commit();self.send_json({'ok':True,'id':eid});return
        if path=='/api/push':
            # Web Push per device and per role. Subscribing needs a server able to send; the test only proves the hand-off.
            actor=self.staff(db,(self.portal(),) if self.portal() in STAFF_ROLES else STAFF_ROLES);action=data.get('action');info=push.mode()
            endpoint=short(data.get('endpoint'),1000)
            if action=='status':
                row=db.execute('SELECT active,last_ok,last_error,failures FROM push_subscriptions WHERE endpoint=? AND role=? AND account=?',(endpoint,actor['role'],actor['id'])).fetchone() if endpoint else None
                db.commit();self.send_json(info|{'publicKey':push.vapid_public_key(RUNTIME),'subscribed':bool(row and row['active']),'device':dict(row) if row else None});return
            if action=='subscribe':
                require(info['enabled'],'Notifications push indisponibles sur ce serveur : '+info['reason']+'.',409)
                sub=push.valid_subscription(data.get('subscription'));require(sub,'Abonnement invalide.',400)
                sid,created=push.subscribe(db,actor,sub,data.get('device'),now());audit(db,actor['id'],'push.subscribe',{'role':actor['role'],'created':created})
                db.commit();self.send_json({'ok':True,'created':created});return
            if action=='unsubscribe':
                removed=push.unsubscribe(db,actor['role'],endpoint,actor['id']);audit(db,actor['id'],'push.unsubscribe',{'role':actor['role']});db.commit();self.send_json({'ok':True,'removed':removed});return
            if action=='test':
                require(info['enabled'],'Notifications push indisponibles sur ce serveur : '+info['reason']+'.',409)
                row=db.execute('SELECT id FROM push_subscriptions WHERE endpoint=? AND role=? AND account=? AND active=1',(endpoint,actor['role'],actor['id'])).fetchone()
                require(row,'Cet appareil n’est pas abonné pour cet espace.',404)
                event='test:'+secrets.token_hex(6);body=json.dumps({'title':'KOSH','body':'Notification de test : si elle s’affiche, cet appareil est prêt.','url':PORTAL_URL[actor['role']],'tag':event},ensure_ascii=False)
                db.execute("INSERT INTO push_queue(id,endpoint,subscription,event,payload,state,created,next_at) VALUES(?,?,?,?,?,'pending',?,?)",(secrets.token_hex(12),endpoint,row['id'],event,body,now(),now()))
                db.commit();push_kick();self.send_json({'ok':True,'queued':True,'message':'Test transmis au service de notifications. Seul l’affichage sur l’appareil prouve la réception.'});return
            raise Fault('Action inconnue.',400)
        raise Fault('Route inconnue.',404)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('command',nargs='?',default='serve',choices=['serve','account']);parser.add_argument('--role',choices=['ceo','restaurant','driver']);parser.add_argument('--login');parser.add_argument('--merchant',default='');parser.add_argument('--name',default='');parser.add_argument('--port',type=int,default=8766);args=parser.parse_args()
    if args.command=='account':
        require(args.role and args.login and (args.role!='restaurant' or args.merchant in MERCHANTS),'Rôle, login et établissement requis.',400)
        import getpass
        password=getpass.getpass('Mot de passe initial (12 caractères minimum) : ');require(len(password)>=12,'Mot de passe trop court.',400)
        with connect() as db:
            require(args.role!='ceo' or active_ceo_count(db)<MAX_ACTIVE_CEO,'Trois comptes CEO actifs maximum.',409)
            salt=secrets.token_hex(16);db.execute('INSERT INTO accounts(id,login,role,merchant,name,salt,hash) VALUES(?,?,?,?,?,?,?)',(secrets.token_hex(12),args.login.lower(),args.role,args.merchant,args.name or args.login,salt,password_hash(password,salt)))
        print('Compte créé.');return
    bootstrap_accounts()
    host=os.environ.get('PK_HOST','127.0.0.1');port=int(os.environ.get('PORT',args.port))
    import religious
    threading.Thread(target=religious.study_sync_loop,args=(RUNTIME,),daemon=True).start()
    threading.Thread(target=alert_loop,daemon=True).start()  # W16: detection even with no browser open
    server=ThreadingHTTPServer((host,port),Handler);print(f'KOSH : http://{host}:{port}',flush=True);server.serve_forever()
def bootstrap_accounts():
    """Hébergement : crée les comptes CEO listés dans PK_BOOTSTRAP_CEO (e-mails séparés par des virgules)
    avec le mot de passe PK_BOOTSTRAP_PASSWORD, seulement s'ils n'existent pas encore. Rien n'est écrit dans le code."""
    logins=[x.strip().lower() for x in os.environ.get('PK_BOOTSTRAP_CEO','').split(',') if x.strip()]
    password=os.environ.get('PK_BOOTSTRAP_PASSWORD','')
    if not logins:return
    if len(password)<12:print('PK_BOOTSTRAP_PASSWORD : 12 caractères minimum, comptes non créés.',flush=True);return
    with connect() as db:
        for login in logins:
            if db.execute('SELECT id FROM accounts WHERE login=?',(login,)).fetchone():continue
            if active_ceo_count(db)>=MAX_ACTIVE_CEO:print('Trois comptes CEO actifs maximum : '+login+' non créé.',flush=True);continue
            salt=secrets.token_hex(16);db.execute('INSERT INTO accounts(id,login,role,merchant,name,salt,hash) VALUES(?,?,?,?,?,?,?)',(secrets.token_hex(12),login,'ceo','',login,salt,password_hash(password,salt)));print('Compte CEO créé : '+login,flush=True)
if __name__=='__main__':main()
