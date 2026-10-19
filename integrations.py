"""Live integrations. Keys are encrypted locally or read from server environment variables; never returned
to browsers and never written to logs. Lot 4: Google Maps Platform replaces OpenRouteService entirely
(the old `secret/ors` record is kept in the database but no longer read).

- Addresses: Places API (New) Autocomplete + Place Details, server side. A selected result is returned as
  an encrypted, time-limited token: the server only trusts coordinates it produced itself.
- Durations: Routes API computeRouteMatrix, ONE call per tour computation (origin + stops), short cache.
"""
import json
import os
from pathlib import Path
import ssl
import threading
import time
from urllib.parse import quote
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

PLACES_AUTOCOMPLETE = 'https://places.googleapis.com/v1/places:autocomplete'
PLACE_DETAILS = 'https://places.googleapis.com/v1/places/'
ROUTE_MATRIX = 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix'
MATRIX_FIELDS = 'originIndex,destinationIndex,status,condition,duration'
# Portugal mainland bounding rectangle (deliveries in Porto); results outside are refused by Google.
PORTUGAL = {'rectangle': {'low': {'latitude': 36.8, 'longitude': -9.6}, 'high': {'latitude': 42.2, 'longitude': -6.1}}}
ADDRESS_TOKEN_TTL = 3 * 3600          # a selected address must be used within three hours
MATRIX_FRESH = 120000                 # durations reused for two minutes (no call per GPS point)
MATRIX_STALE = 15 * 60000             # older durations only as an explicitly stale fallback
MAX_ELEMENTS = 625                    # computeRouteMatrix: origins x destinations


class ProviderError(ValueError):
    """Provider failure: kind in unconfigured, quota, denied, unavailable, invalid."""
    def __init__(self, message, kind='unavailable'):
        super().__init__(message)
        self.kind = kind


def cipher(runtime):
    """Encryption key of the vault, the Google secrets and the address tokens.
    PK_SECRET_KEY (a Fernet key, kept outside the runtime directory and backed up) is used when set; an existing
    runtime file `integration.key` stays readable alongside it, so data encrypted before the switch still opens.
    Without the variable, the runtime file is created once and used, as before."""
    from cryptography.fernet import Fernet, MultiFernet
    path = Path(runtime) / 'integration.key'
    configured = os.environ.get('PK_SECRET_KEY', '').strip()
    if configured:
        try:
            primary = Fernet(configured.encode())
        except (ValueError, TypeError):
            raise ValueError('PK_SECRET_KEY invalide : clé Fernet attendue (32 octets en base64 URL).') from None
        return MultiFernet([primary, Fernet(path.read_bytes())]) if path.exists() else primary
    if not path.exists():
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'wb') as file:
            file.write(Fernet.generate_key())
    return Fernet(path.read_bytes())


def secret(db, runtime, name, get, put, value=None):
    if value is not None:
        put(db, 'secret/' + name, {'value': cipher(runtime).encrypt(value.encode()).decode()})
        return
    token = get(db, 'secret/' + name).get('value')
    return cipher(runtime).decrypt(token.encode()).decode() if token else None


# Server environment first (deployment), then the encrypted vault filled from the CEO settings.
ENVIRONMENT = {'places': ('PK_GOOGLE_PLACES_KEY', 'PK_GOOGLE_KEY'), 'routes': ('PK_GOOGLE_ROUTES_KEY', 'PK_GOOGLE_KEY')}
VAULT = {'places': ('google',), 'routes': ('google-routes', 'google')}


def google_key(db, runtime, get, put, service):
    for variable in ENVIRONMENT[service]:
        if os.environ.get(variable, '').strip():
            return os.environ[variable].strip()
    for name in VAULT[service]:
        value = secret(db, runtime, name, get, put)
        if value:
            return value
    return None


def key_source(get, db, service):
    """'env', 'vault' or None, without decrypting anything (for the CEO status screen)."""
    if any(os.environ.get(v, '').strip() for v in ENVIRONMENT[service]):
        return 'env'
    return 'vault' if any(get(db, 'secret/' + n).get('value') for n in VAULT[service]) else None


def request(url, body=None, headers=None, method=None):
    import certifi
    context = ssl.create_default_context(cafile=certifi.where())
    req = Request(url, json.dumps(body).encode() if body is not None else None,
                  headers={**({'Content-Type': 'application/json'} if body is not None else {}), **(headers or {})}, method=method)
    try:
        with urlopen(req, timeout=20, context=context) as response:
            return json.load(response)
    except HTTPError as error:
        # The URL and the key are never included in messages (they would end up in logs or browsers).
        if error.code == 429:
            raise ProviderError('Quota Google atteint. Les durées ne peuvent pas être actualisées pour le moment.', 'quota') from None
        if error.code in (401, 403):
            raise ProviderError('Google a refusé la clé (API non activée, restriction ou facturation). Vérifiez les réglages.', 'denied') from None
        raise ProviderError(f'Google a refusé la demande ({error.code}).', 'invalid') from None
    except (URLError, TimeoutError, OSError):
        raise ProviderError('Service Google indisponible. Réessayez plus tard.', 'unavailable') from None


# ----- Addresses -----
def _component(components, kind):
    return next((c.get('longText') for c in components or [] if kind in c.get('types', [])), None)


def autocomplete(key, query, session):
    body = {'input': query, 'includedRegionCodes': ['pt'], 'languageCode': 'fr', 'locationRestriction': PORTUGAL}
    if session:
        body['sessionToken'] = session
    response = request(PLACES_AUTOCOMPLETE, body, headers={'X-Goog-Api-Key': key})
    rows = []
    for suggestion in response.get('suggestions', []):
        p = suggestion.get('placePrediction')
        if p and p.get('placeId'):
            rows.append({'placeId': p['placeId'], 'label': (p.get('text') or {}).get('text', '')})
    return rows[:5]


def place_details(key, place_id, session):
    url = PLACE_DETAILS + quote(place_id, safe='') + '?languageCode=fr' + ('&sessionToken=' + quote(session, safe='') if session else '')
    return request(url, headers={'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'id,formattedAddress,location,addressComponents'})


def verified_address(place, typed=''):
    """Normalised Google result. The street number is kept: from Google when present, otherwise the
    number typed by the person is kept in the address and the point is marked street-level."""
    import re
    components = place.get('addressComponents', [])
    number = _component(components, 'street_number')
    label = place.get('formattedAddress', '')
    typed_number = (re.search(r'\b\d+[A-Za-z]?\b', typed or '') or [None])[0]
    missing = not number and bool(typed_number)
    if missing:
        label = f'{typed_number} {label}' if not label.startswith(typed_number) else label
    return {'label': label, 'latitude': place['location']['latitude'], 'longitude': place['location']['longitude'],
            'placeId': place.get('id'), 'streetNumber': number or typed_number, 'precision': 'street' if missing or not number else 'address'}


def sign_address(runtime, value):
    payload = {k: value[k] for k in ['label', 'latitude', 'longitude', 'placeId', 'streetNumber', 'precision']}
    return cipher(runtime).encrypt(json.dumps(payload).encode()).decode()


def open_address(runtime, token):
    """Coordinates the server produced itself; anything else (forged, edited, expired) is refused."""
    from cryptography.fernet import InvalidToken
    try:
        return json.loads(cipher(runtime).decrypt(str(token).encode(), ttl=ADDRESS_TOKEN_TTL))
    except (InvalidToken, ValueError, TypeError):
        raise ValueError('Adresse vérifiée expirée ou invalide : recherchez-la de nouveau.') from None


def address(db, runtime, data, get, put):
    """POST /api/address: {query, session} -> suggestions; {placeId, session, query} -> verified address + token."""
    key = google_key(db, runtime, get, put, 'places')
    if not key:
        raise ProviderError('Recherche Google indisponible (clé non configurée) : l’adresse saisie sera transmise sans vérification.', 'unconfigured')
    session = str(data.get('session') or '')[:64]
    if data.get('placeId'):
        value = verified_address(place_details(key, str(data['placeId'])[:300], session), str(data.get('query') or ''))
        return {'address': {**value, 'token': sign_address(runtime, value)}}
    query = str(data.get('query') or '').strip()[:200]
    if len(query) < 3:
        raise ValueError('Saisissez au moins trois caractères de l’adresse.')
    return {'results': autocomplete(key, query, session)}


# ----- Durations: Routes API computeRouteMatrix -----
def _seconds(value):
    return float(str(value).rstrip('s')) if value is not None else None


def google_matrix(key, points):
    """ONE computeRouteMatrix call. Origins: all points (index 0 = courier); destinations: points[1:].
    Returns matrix[origin][point] in seconds (None when Google finds no route); column 0 is unused."""
    n = len(points)
    if n * (n - 1) > MAX_ELEMENTS:
        raise ProviderError('Tournée trop longue pour un seul calcul Google.', 'invalid')
    waypoint = lambda p: {'waypoint': {'location': {'latLng': {'latitude': p[0], 'longitude': p[1]}}}}
    body = {'origins': [waypoint(p) for p in points], 'destinations': [waypoint(p) for p in points[1:]],
            'travelMode': 'DRIVE', 'routingPreference': 'TRAFFIC_AWARE'}
    response = request(ROUTE_MATRIX, body, headers={'X-Goog-Api-Key': key, 'X-Goog-FieldMask': MATRIX_FIELDS})
    matrix = [[0.0 if a == b else None for b in range(n)] for a in range(n)]
    for element in response if isinstance(response, list) else []:
        if element.get('status', {}).get('code') or element.get('condition') != 'ROUTE_EXISTS':
            continue
        a, b = element.get('originIndex', 0), element.get('destinationIndex', 0) + 1
        if a != b:
            matrix[a][b] = _seconds(element.get('duration'))
    return matrix


# Tests replace this with a simulated provider; production uses Google.
PROVIDER = google_matrix
_CACHE = {}
_CACHE_LOCK = threading.Lock()


def _cache_key(points):
    # ~100 m for the courier, exact verified points for the stops.
    return (round(points[0][0], 3), round(points[0][1], 3)) + tuple((round(a, 6), round(b, 6)) for a, b in points[1:])


def durations(db, runtime, get, put, points, now):
    """Duration matrix for the points, reused for MATRIX_FRESH; on provider failure an older matrix may be
    used, explicitly flagged stale. Raises ProviderError when nothing reliable is available."""
    key = google_key(db, runtime, get, put, 'routes')
    if not key:
        raise ProviderError('Calcul Google non configuré : ordre manuel, sans heure estimée.', 'unconfigured')
    cache_key = _cache_key(points)
    with _CACHE_LOCK:
        cached = _CACHE.get(cache_key)
    if cached and now() - cached['at'] <= MATRIX_FRESH:
        return {**cached, 'cached': True, 'stale': False}
    try:
        matrix = PROVIDER(key, points)
    except ProviderError as error:
        if cached and now() - cached['at'] <= MATRIX_STALE:
            return {**cached, 'cached': True, 'stale': True, 'warning': str(error)}
        raise
    value = {'matrix': matrix, 'at': now(), 'source': 'google'}
    with _CACHE_LOCK:
        for old in [k for k, v in _CACHE.items() if now() - v['at'] > MATRIX_STALE]:
            _CACHE.pop(old, None)
        _CACHE[cache_key] = value
    return {**value, 'cached': False, 'stale': False}


def clear_cache():
    with _CACHE_LOCK:
        _CACHE.clear()


# ----- CEO settings: /api/routing -----
TEST_POINTS = [(41.1496, -8.6110), (41.1579, -8.6291)]  # Porto, two fixed points for the configuration test


def route(db, runtime, actor, data, get, put, collection, now):
    action = data.get('action')
    if actor['role'] != 'ceo':
        raise PermissionError()
    if action == 'configure':
        raise ProviderError('OpenRouteService a été remplacé par Google Maps Platform. Configurez la clé Google Routes.', 'invalid')
    if action in ('google', 'google-routes'):
        value = str(data.get('key', '')).strip()
        if not value:
            raise ValueError('Clé requise.')
        if action == 'google':
            autocomplete(value, 'Avenida dos Aliados Porto', None)
        else:
            PROVIDER(value, TEST_POINTS)
        secret(db, runtime, action, get, put, value)
        return {'ok': True}
    if action == 'test':
        if not google_key(db, runtime, get, put, 'routes'):
            raise ProviderError('Calcul Google non configuré.', 'unconfigured')
        matrix = PROVIDER(google_key(db, runtime, get, put, 'routes'), TEST_POINTS)
        if matrix[0][1] is None:
            raise ProviderError('Google n’a pas trouvé le trajet de test.', 'invalid')
        put(db, 'conf/google-status', {'routesTestedAt': now(), 'ok': True})
        return {'ok': True, 'message': f'Google Routes disponible : trajet de test {max(1, round(matrix[0][1] / 60))} min.'}
    raise ValueError('Action inconnue.')
