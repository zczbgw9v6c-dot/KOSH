"""Courier tour planning (lot 4): stops, admissible orders, exact optimisation and navigation links.

Pure functions, no network and no database: the server builds the stops, a duration provider
(Google Routes computeRouteMatrix in production, a simulated provider in tests) fills the matrix.

Objective: the shortest total time to finish EVERY stop of the courier's accepted parts, starting
from his current position. Each stop costs its driving time, the wait for a preparation that is not
finished yet, and HANDLING (5 min) of handling. Constraints: the pickup of a part precedes its
delivery; a part already collected only keeps its delivery; the load never exceeds the capacity.

Method: exhaustive enumeration of the admissible orders up to EXACT_ENUMERATION stops, then an exact
Held-Karp dynamic programme with precedence and capacity masks up to EXACT_DP stops (exact because
finishing time is non-decreasing in arrival time: arriving earlier never finishes later). Beyond, a
documented heuristic (cheapest admissible insertion followed by admissible pair swaps): not proven optimal.
"""
import itertools
from urllib.parse import quote

HANDLING = 300000            # 5 minutes of handling per stop (W13)
EXACT_ENUMERATION = 8        # permutations enumerated exhaustively
EXACT_DP = 12                # Held-Karp beyond enumeration
MOBILE_WAYPOINTS = 3         # Google Maps URLs: three waypoints on mobile browsers (nine elsewhere)
URL_LIMIT = 2048             # Google Maps URLs: 2,048 characters per request


class TourError(ValueError):
    """A requested order violates a physical constraint or no longer matches the courier's stops."""


def signature(stops):
    """Stable identity of the stop set (ids and kinds); a change invalidates estimates and saved durations."""
    return '|'.join(sorted(s['id'] for s in stops))


def default_order(stops):
    """Order used without optimisation: acceptance order, every pickup before its delivery."""
    ordered = sorted(stops, key=lambda s: (s.get('acceptedAt') or 0, s['order'], 0 if s['kind'] == 'pickup' else 1))
    return [s['id'] for s in ordered]


def reconcile(saved, stops):
    """Keep a saved order for the stops still present, append new stops (pickup then delivery)."""
    ids = {s['id'] for s in stops}
    kept = [sid for sid in (saved or []) if sid in ids]
    for sid in default_order(stops):
        if sid not in kept:
            kept.append(sid)
    return kept if admissible(kept, stops) else default_order(stops)


def _index(stops):
    return {s['id']: s for s in stops}


def admissible(order, stops, load=None, capacity=None):
    try:
        check(order, stops, load, capacity)
        return True
    except TourError:
        return False


def check(order, stops, load=None, capacity=None):
    """Raise TourError unless `order` is a permutation of the stops respecting precedence and capacity."""
    by_id = _index(stops)
    if len(order) != len(by_id) or set(order) != set(by_id):
        raise TourError('Les arrêts ont changé : actualisez la tournée avant de la réordonner.')
    seen = set()
    current = initial_load(stops) if load is None else load
    for sid in order:
        stop = by_id[sid]
        if stop['kind'] == 'delivery' and stop.get('pickup') and stop['pickup'] not in seen:
            raise TourError('Collectez les sacs de la commande #%s avant de la livrer.' % stop.get('code', ''))
        current += stop['bags'] if stop['kind'] == 'pickup' else -stop['bags']
        if capacity is not None and current > capacity:
            raise TourError('Capacité dépassée : %d sacs à bord pour %d places.' % (current, capacity))
        seen.add(sid)
    return True


def initial_load(stops):
    """Bags already on board: deliveries whose pickup is no longer a stop (part collected)."""
    return sum(s['bags'] for s in stops if s['kind'] == 'delivery' and not s.get('pickup'))


def simulate(order, stops, matrix, start):
    """Arrival, wait and departure of each stop. matrix[a][b] in seconds; index 0 is the courier's position."""
    by_id = _index(stops)
    position = {s['id']: i + 1 for i, s in enumerate(stops)}
    t, here, result = start, 0, []
    for sid in order:
        stop = by_id[sid]
        seconds = matrix[here][position[sid]]
        if seconds is None:
            raise TourError('Aucun trajet routier trouvé vers un arrêt.')
        arrive = t + round(seconds * 1000)
        ready = stop.get('readyAt') or 0
        begin = max(arrive, ready) if stop['kind'] == 'pickup' else arrive
        depart = begin + HANDLING
        result.append({'id': sid, 'drive': round(seconds * 1000), 'arrive': arrive, 'wait': begin - arrive, 'depart': depart})
        t, here = depart, position[sid]
    return result


def finish(order, stops, matrix, start):
    steps = simulate(order, stops, matrix, start)
    return steps[-1]['depart'] if steps else start


def optimize(stops, matrix, start, capacity=None):
    """Best admissible order for the total finishing time. Returns (order, finish, method)."""
    n = len(stops)
    if n == 0:
        return [], start, 'empty'
    if n <= EXACT_ENUMERATION:
        return _enumerate(stops, matrix, start, capacity) + ('exact-enumeration',)
    if n <= EXACT_DP:
        return _held_karp(stops, matrix, start, capacity) + ('exact-dp',)
    return _heuristic(stops, matrix, start, capacity) + ('heuristic',)


def _enumerate(stops, matrix, start, capacity):
    best, best_order = None, None
    load = initial_load(stops)
    for perm in itertools.permutations([s['id'] for s in stops]):
        if not admissible(list(perm), stops, load, capacity):
            continue
        try:
            value = finish(list(perm), stops, matrix, start)
        except TourError:
            continue
        if best is None or value < best:
            best, best_order = value, list(perm)
    if best_order is None:
        raise TourError('Aucun ordre admissible avec des trajets routiers connus.')
    return best_order, best


def _held_karp(stops, matrix, start, capacity):
    n = len(stops)
    ids = [s['id'] for s in stops]
    need = [0] * n  # mask of stops required before stop i
    for i, s in enumerate(stops):
        if s['kind'] == 'delivery' and s.get('pickup') in ids:
            need[i] = 1 << ids.index(s['pickup'])
    load0 = initial_load(stops)
    delta = [s['bags'] if s['kind'] == 'pickup' else -s['bags'] for s in stops]
    ready = [(s.get('readyAt') or 0) if s['kind'] == 'pickup' else 0 for s in stops]

    def step(t, a, b):
        seconds = matrix[a][b + 1]
        if seconds is None:
            return None
        return max(t + round(seconds * 1000), ready[b]) + HANDLING

    best = {}  # (mask, last) -> (time, previous)
    for b in range(n):
        if need[b]:
            continue
        if capacity is not None and load0 + delta[b] > capacity:
            continue
        t = step(start, 0, b)
        if t is not None:
            best[(1 << b, b)] = (t, None)
    for mask in range(1, 1 << n):
        load = load0 + sum(delta[i] for i in range(n) if mask >> i & 1)
        for last in range(n):
            entry = best.get((mask, last))
            if not entry:
                continue
            for b in range(n):
                if mask >> b & 1 or need[b] & ~mask:
                    continue
                if capacity is not None and load + delta[b] > capacity:
                    continue
                t = step(entry[0], last + 1, b)
                if t is None:
                    continue
                key = (mask | 1 << b, b)
                if key not in best or t < best[key][0]:
                    best[key] = (t, last)
    full = (1 << n) - 1
    ends = [(best[(full, last)][0], last) for last in range(n) if (full, last) in best]
    if not ends:
        raise TourError('Aucun ordre admissible avec des trajets routiers connus.')
    value, last = min(ends)
    order, mask = [], full
    while last is not None:
        order.append(ids[last])
        previous = best[(mask, last)][1]
        mask &= ~(1 << last)
        last = previous
    return order[::-1], value


def _heuristic(stops, matrix, start, capacity):
    """Greedy admissible next stop by finishing time, then admissible relocations and swaps while the
    total time decreases. Documented heuristic beyond EXACT_DP stops: no optimality claim."""
    load = initial_load(stops)
    by_id = _index(stops)
    position = {s['id']: i + 1 for i, s in enumerate(stops)}
    order, done, t, here, current = [], set(), start, 0, load
    while len(order) < len(stops):
        options = []
        for s in stops:
            if s['id'] in done or s['kind'] == 'delivery' and s.get('pickup') and s['pickup'] not in done:
                continue
            nxt = current + (s['bags'] if s['kind'] == 'pickup' else -s['bags'])
            if capacity is not None and nxt > capacity or matrix[here][position[s['id']]] is None:
                continue
            arrive = t + round(matrix[here][position[s['id']]] * 1000)
            options.append((max(arrive, s.get('readyAt') or 0) if s['kind'] == 'pickup' else arrive, s['id'], nxt))
        if not options:
            raise TourError('Aucun ordre admissible avec des trajets routiers connus.')
        begin, sid, current = min(options)
        order.append(sid); done.add(sid); t = begin + HANDLING; here = position[sid]
    value = finish(order, stops, matrix, start)
    improved = True
    while improved:
        improved = False
        moves = [('swap', i, j) for i in range(len(order)) for j in range(i + 1, len(order))]
        moves += [('move', i, j) for i in range(len(order)) for j in range(len(order)) if i != j]
        for kind, i, j in moves:
            trial = order[:]
            if kind == 'swap':
                trial[i], trial[j] = trial[j], trial[i]
            else:
                trial.insert(j, trial.pop(i))
            if not admissible(trial, stops, load, capacity):
                continue
            try:
                candidate = finish(trial, stops, matrix, start)
            except TourError:
                continue
            if candidate < value:
                order, value, improved = trial, candidate, True
                break
    return order, value


# ----- Navigation links (Google Maps URLs, Apple Plans, Waze) -----
def _point(stop):
    if stop.get('lat') is not None and stop.get('lon') is not None:
        return '%.6f,%.6f' % (stop['lat'], stop['lon'])
    return stop.get('address') or None


def google_url(origin, points):
    """https://www.google.com/maps/dir/?api=1 with the destination last and the waypoints in order."""
    url = 'https://www.google.com/maps/dir/?api=1&travelmode=driving'
    if origin:
        url += '&origin=' + quote(origin, safe='')
    url += '&destination=' + quote(points[-1], safe='')
    if len(points) > 1:
        url += '&waypoints=' + quote('|'.join(points[:-1]), safe='')
    return url


def google_segments(order, stops, waypoints=MOBILE_WAYPOINTS, limit=URL_LIMIT):
    """One link if the whole tour fits; otherwise consecutive explicit segments, each starting at the
    previous segment's last stop, so that no stop is ever omitted and the retained order is kept."""
    by_id = _index(stops)
    points = [(sid, _point(by_id[sid])) for sid in order]
    missing = [sid for sid, p in points if not p]
    usable = [(sid, p) for sid, p in points if p]
    segments, origin, i = [], None, 0
    while i < len(usable):
        size = min(waypoints + 1, len(usable) - i)
        while True:
            chunk = usable[i:i + size]
            url = google_url(origin, [p for _, p in chunk])
            if len(url) <= limit or size == 1:
                break
            size -= 1
        segments.append({'url': url, 'stops': [sid for sid, _ in chunk], 'from': origin and usable[i - 1][0]})
        origin, i = chunk[-1][1], i + size
    return {'segments': segments, 'missing': missing}


def next_links(stop):
    """Single-destination navigation for the next stop: Google Maps, Apple Plans and Waze."""
    point = _point(stop)
    if not point:
        return None
    links = {'google': google_url(None, [point]), 'apple': 'https://maps.apple.com/?daddr=' + quote(point, safe='') + '&dirflg=d'}
    if stop.get('lat') is not None and stop.get('lon') is not None:
        links['waze'] = 'https://waze.com/ul?ll=%.6f%%2C%.6f&navigate=yes' % (stop['lat'], stop['lon'])
    else:
        links['waze'] = 'https://waze.com/ul?q=' + quote(point, safe='') + '&navigate=yes'
    return links
