"""Lot 4: tour optimisation and navigation links, with a simulated duration matrix (no network)."""
import itertools
import random
import sys
from pathlib import Path
from urllib.parse import urlparse, parse_qs
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import tour

H = tour.HANDLING


def delivery(sid, bags=1, pickup=None, **extra):
    return {'id': sid, 'kind': 'delivery', 'order': sid, 'code': sid.upper(), 'bags': bags, 'pickup': pickup, 'lat': 41.1, 'lon': -8.6, 'verified': True, **extra}


def pickup(sid, order, bags=1, ready=0, **extra):
    return {'id': sid, 'kind': 'pickup', 'order': order, 'code': order.upper(), 'bags': bags, 'readyAt': ready, 'lat': 41.2, 'lon': -8.6, 'verified': True, **extra}


def matrix_from(names, table):
    """table[(a, b)] seconds with 'O' the courier position; returns the matrix indexed like tour.simulate."""
    points = ['O'] + names
    return [[0 if a == b else table.get((a, b)) for b in points] for a in points]


class ThreeDeliveries(unittest.TestCase):
    # Nearest first (A, 60 s) is NOT the fastest way to finish all three deliveries.
    TABLE = {('O', 'A'): 60, ('O', 'B'): 90, ('O', 'C'): 600,
             ('A', 'B'): 300, ('A', 'C'): 300, ('B', 'A'): 30, ('B', 'C'): 400, ('C', 'A'): 300, ('C', 'B'): 300}
    EXPECTED = {'ABC': 760, 'ACB': 660, 'BAC': 420, 'BCA': 790, 'CAB': 1200, 'CBA': 930}  # driving seconds, by hand

    def setUp(self):
        self.stops = [delivery('A'), delivery('B'), delivery('C')]
        self.matrix = matrix_from(['A', 'B', 'C'], self.TABLE)
        self.start = 1_000_000

    def test_six_orders_have_the_exact_hand_computed_sums(self):
        for perm in itertools.permutations('ABC'):
            name = ''.join(perm)
            self.assertEqual(tour.finish(list(perm), self.stops, self.matrix, self.start), self.start + self.EXPECTED[name] * 1000 + 3 * H, name)

    def test_best_of_the_six_orders_is_chosen_not_the_nearest_first(self):
        order, finish, method = tour.optimize(self.stops, self.matrix, self.start)
        self.assertEqual(order, ['B', 'A', 'C'])
        self.assertEqual(finish, self.start + 420_000 + 3 * H)
        self.assertEqual(method, 'exact-enumeration')
        nearest_first = ['A', 'C', 'B']  # best possible continuation after the nearest stop
        self.assertGreater(tour.finish(nearest_first, self.stops, self.matrix, self.start), finish)

    def test_each_stop_has_arrival_wait_and_five_minutes_of_handling(self):
        steps = tour.simulate(['B', 'A', 'C'], self.stops, self.matrix, self.start)
        self.assertEqual([s['arrive'] for s in steps], [self.start + 90_000, self.start + 120_000 + H, self.start + 420_000 + 2 * H])
        self.assertTrue(all(s['depart'] - s['arrive'] == H and s['wait'] == 0 for s in steps))


class Constraints(unittest.TestCase):
    def test_pickup_always_precedes_its_delivery_even_when_delivering_first_is_shorter(self):
        stops = [pickup('pickup:x', 'x'), delivery('delivery:x', pickup='pickup:x')]
        # Driving to the customer first would be shorter; it is physically impossible.
        m = matrix_from(['pickup:x', 'delivery:x'], {('O', 'pickup:x'): 600, ('O', 'delivery:x'): 10, ('pickup:x', 'delivery:x'): 600, ('delivery:x', 'pickup:x'): 600})
        order, finish, _ = tour.optimize(stops, m, 0)
        self.assertEqual(order, ['pickup:x', 'delivery:x'])
        self.assertEqual(finish, 1_200_000 + 2 * H)
        with self.assertRaises(tour.TourError):
            tour.check(['delivery:x', 'pickup:x'], stops)

    def test_remaining_preparation_is_waited_for_at_the_pickup(self):
        stops = [pickup('pickup:x', 'x', ready=900_000), delivery('delivery:x', pickup='pickup:x')]
        m = matrix_from(['pickup:x', 'delivery:x'], {('O', 'pickup:x'): 60, ('O', 'delivery:x'): 60, ('pickup:x', 'delivery:x'): 120, ('delivery:x', 'pickup:x'): 120})
        steps = tour.simulate(['pickup:x', 'delivery:x'], stops, m, 0)
        self.assertEqual(steps[0]['arrive'], 60_000)
        self.assertEqual(steps[0]['wait'], 840_000)
        self.assertEqual(steps[0]['depart'], 900_000 + H)
        self.assertEqual(steps[1]['depart'], 900_000 + H + 120_000 + H)

    def test_capacity_is_respected(self):
        # One collected delivery (2 bags on board) + two pickups of 2 bags each, capacity 4.
        stops = [delivery('delivery:a', bags=2), pickup('pickup:b', 'b', bags=2), delivery('delivery:b', bags=2, pickup='pickup:b'),
                 pickup('pickup:c', 'c', bags=2), delivery('delivery:c', bags=2, pickup='pickup:c')]
        self.assertEqual(tour.initial_load(stops), 2)
        with self.assertRaises(tour.TourError):
            tour.check(['pickup:b', 'pickup:c', 'delivery:a', 'delivery:b', 'delivery:c'], stops, capacity=4)
        tour.check(['pickup:b', 'delivery:a', 'pickup:c', 'delivery:b', 'delivery:c'], stops, capacity=4)
        names = [s['id'] for s in stops]
        m = [[0 if a == b else 60 for b in range(6)] for a in range(6)]
        order, _, _ = tour.optimize(stops, m, 0, capacity=4)
        tour.check(order, stops, capacity=4)

    def test_reconcile_keeps_saved_order_and_appends_new_stops(self):
        stops = [delivery('delivery:a', acceptedAt=1), pickup('pickup:b', 'b', acceptedAt=2), delivery('delivery:b', pickup='pickup:b', acceptedAt=2)]
        self.assertEqual(tour.reconcile(['delivery:b', 'gone', 'pickup:b'], stops)[:1], ['delivery:a'])  # inadmissible saved order dropped
        self.assertEqual(tour.reconcile(['pickup:b', 'delivery:a'], stops), ['pickup:b', 'delivery:a', 'delivery:b'])


class ExactMethods(unittest.TestCase):
    def random_instance(self, rng, parts, collected):
        stops = []
        for i in range(collected):
            stops.append(delivery('d%d' % i, bags=1, acceptedAt=i))
        for i in range(parts):
            stops.append(pickup('p%d' % i, 'o%d' % i, ready=rng.choice([0, 0, 400_000, 900_000]), acceptedAt=10 + i))
            stops.append(delivery('q%d' % i, pickup='p%d' % i, acceptedAt=10 + i))
        n = len(stops) + 1
        m = [[0 if a == b else rng.randint(30, 900) for b in range(n)] for a in range(n)]
        return stops, m

    def brute(self, stops, m, capacity=None):
        best = None
        for perm in itertools.permutations([s['id'] for s in stops]):
            if tour.admissible(list(perm), stops, capacity=capacity):
                value = tour.finish(list(perm), stops, m, 0)
                best = value if best is None else min(best, value)
        return best

    def test_held_karp_matches_exhaustive_enumeration(self):
        rng = random.Random(4)
        for _ in range(12):
            stops, m = self.random_instance(rng, rng.randint(1, 3), rng.randint(0, 2))
            order, value = tour._held_karp(stops, m, 0, 3)
            tour.check(order, stops, capacity=3)
            self.assertEqual(value, self.brute(stops, m, 3))
            self.assertEqual(value, tour.finish(order, stops, m, 0))

    def test_method_depends_on_tour_size_and_heuristic_stays_admissible(self):
        rng = random.Random(9)
        stops, m = self.random_instance(rng, 5, 0)  # 10 stops: exact DP
        order, value, method = tour.optimize(stops, m, 0, 10)
        self.assertEqual(method, 'exact-dp')
        tour.check(order, stops, capacity=10)
        stops, m = self.random_instance(rng, 7, 1)  # 15 stops: documented heuristic
        order, value, method = tour.optimize(stops, m, 0, 10)
        self.assertEqual(method, 'heuristic')
        tour.check(order, stops, capacity=10)
        self.assertLessEqual(value, tour.finish(tour.default_order(stops), stops, m, 0))


class Links(unittest.TestCase):
    def stops(self, count, address=None):
        return [{'id': 's%d' % i, 'kind': 'delivery', 'bags': 1, 'lat': 41.1 + i / 1000, 'lon': -8.6 - i / 1000, 'address': address} for i in range(count)]

    def coordinates(self, url):
        q = parse_qs(urlparse(url).query)
        return q.get('origin', [None])[0], (q['waypoints'][0].split('|') if 'waypoints' in q else []) + [q['destination'][0]]

    def test_one_link_with_every_stop_in_order(self):
        stops = self.stops(4)
        result = tour.google_segments(['s2', 's0', 's3', 's1'], stops)
        self.assertEqual(len(result['segments']), 1)
        url = result['segments'][0]['url']
        self.assertTrue(url.startswith('https://www.google.com/maps/dir/?api=1&travelmode=driving'))
        _, points = self.coordinates(url)
        self.assertEqual(points, ['%.6f,%.6f' % (s['lat'], s['lon']) for s in (stops[2], stops[0], stops[3], stops[1])])

    def test_long_tour_is_split_into_consecutive_segments_without_omission(self):
        stops = self.stops(9)
        order = ['s%d' % i for i in (8, 1, 7, 2, 6, 3, 5, 4, 0)]
        result = tour.google_segments(order, stops)
        self.assertEqual([sid for seg in result['segments'] for sid in seg['stops']], order)
        self.assertEqual(result['missing'], [])
        by_id = {s['id']: '%.6f,%.6f' % (s['lat'], s['lon']) for s in stops}
        previous_last = None
        for seg in result['segments']:
            origin, points = self.coordinates(seg['url'])
            self.assertLessEqual(len(points) - 1, tour.MOBILE_WAYPOINTS)
            self.assertEqual(points, [by_id[s] for s in seg['stops']])
            self.assertEqual(origin, previous_last)  # each segment starts explicitly where the previous one ended
            previous_last = points[-1]
            self.assertLessEqual(len(seg['url']), tour.URL_LIMIT)

    def test_url_limit_shortens_segments_but_keeps_all_stops(self):
        stops = [{'id': 's%d' % i, 'kind': 'delivery', 'bags': 1, 'lat': None, 'lon': None, 'address': ('Rua muito comprida %d ' % i) * 25} for i in range(5)]
        result = tour.google_segments([s['id'] for s in stops], stops)
        self.assertGreater(len(result['segments']), 2)
        self.assertEqual([sid for seg in result['segments'] for sid in seg['stops']], [s['id'] for s in stops])
        self.assertTrue(all(len(seg['url']) <= tour.URL_LIMIT for seg in result['segments']))

    def test_stop_without_address_is_reported_not_silently_dropped(self):
        stops = self.stops(2) + [{'id': 'private', 'kind': 'pickup', 'bags': 1, 'lat': None, 'lon': None, 'address': None}]
        result = tour.google_segments(['private', 's0', 's1'], stops)
        self.assertEqual(result['missing'], ['private'])

    def test_waze_apple_and_google_for_the_next_stop(self):
        links = tour.next_links({'lat': 41.149612, 'lon': -8.611024})
        self.assertEqual(links['waze'], 'https://waze.com/ul?ll=41.149612%2C-8.611024&navigate=yes')
        self.assertTrue(links['apple'].startswith('https://maps.apple.com/?daddr=41.149612%2C-8.611024'))
        self.assertIn('destination=41.149612%2C-8.611024', links['google'])
        self.assertEqual(tour.next_links({'address': 'Rua de Santa Catarina 10, Porto'})['waze'], 'https://waze.com/ul?q=Rua%20de%20Santa%20Catarina%2010%2C%20Porto&navigate=yes')


if __name__ == '__main__':
    unittest.main()
