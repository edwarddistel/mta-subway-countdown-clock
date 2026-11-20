import test from 'node:test';
import assert from 'node:assert/strict';
import { buildArrivals } from '../src/arrivals.js';

const now = 1_800_000_000;
const stationIds = ['725N', '725S'];
const build = (updates, maxTrains = 6) => buildArrivals({ updates, stationIds, nowSeconds: now, maxTrains });

test('sorts ascending, deduplicates, filters stale/far updates, and limits trains', () => {
  const train = (tripId, secondsAway, stopId = '725N') => ({ tripId, routeId: '7', stopId, timestamp: now + secondsAway });
  const result = build([
    train('later', 600), train('early', 70), train('early', 70),
    train('past', -2), train('far', 5500), train('other', 120, '725S'),
  ], 2);
  assert.deepEqual(result['725N'].trains.map((t) => t.tripId), ['early', 'later']);
  assert.equal(result['725N'].trains[0].rawEta, 70);
  assert.equal(result['725N'].trains[0].minAway, '1m, 10s');
  assert.equal(result['725S'].trains[0].tripId, 'other');
  assert.equal(result['725N'].name, 'Times Sq - 42 St');
  assert.match(result['725S'].direction, /southbound/);
});

test('returns empty arrays for selected platforms without predictions', () => {
  const response = build([]);
  assert.deepEqual(response['725N'].trains, []);
  assert.deepEqual(response['725S'].trains, []);
});

test('formats predicted times in New York regardless of host timezone', () => {
  const epoch = Date.parse('2026-07-01T16:05:00Z') / 1000; // 12:05 PM EDT
  const stations = buildArrivals({
    updates: [{ stopId: '725N', routeId: '7', tripId: 'nyc', timestamp: epoch }],
    stationIds: ['725N'], nowSeconds: epoch - 60,
  });
  assert.equal(stations['725N'].trains[0].eta, '12:05 pm');
});
