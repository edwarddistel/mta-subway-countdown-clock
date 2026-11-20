import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';
import { createArrivalService } from '../src/service.js';
import { feed, stopTime, tripUpdate } from './fixtures.js';

const config = loadConfig({ STATIONS: '725N', FEEDS: '7,ace', REFRESH_SECONDS: '20' });

test('fetches separate feeds, reports partial errors and preserves good predictions', async () => {
  const now = 1_800_000_000_000;
  const data = feed(tripUpdate({ stops: [stopTime({ arrival: now / 1000 + 120 })] }));
  const calls = [];
  const service = createArrivalService(config, {
    clock: () => now,
    fetchImpl: async (url) => {
      calls.push(url);
      return url.includes('gtfs-ace') ? new Response('busy', { status: 503 }) : new Response(data, { status: 200 });
    },
  });
  const response = await service.getArrivals();
  assert.equal(calls.length, 2);
  assert.equal(response.status, 'partial');
  assert.equal(response.feeds.failed[0].feed, 'ace');
  assert.equal(response.stations['725N'].trains[0].secondsAway, 120);
});

test('coalesces parallel fetches and respects the TTL', async () => {
  let now = 1_800_000_000_000;
  let count = 0;
  const service = createArrivalService(loadConfig({ STATIONS: '725N', FEEDS: '7' }), {
    clock: () => now,
    fetchImpl: async () => { count++; await Promise.resolve(); return new Response(feed(), { status: 200 }); },
  });
  const [first, second] = await Promise.all([service.getArrivals(), service.getArrivals()]);
  assert.strictEqual(first, second);
  assert.equal(count, 1);
  assert.strictEqual(await service.getArrivals(), first);
  now += 20_001;
  assert.notStrictEqual(await service.getArrivals(), first);
  assert.equal(count, 2);
});

test('returns an error status when all selected feeds fail', async () => {
  const service = createArrivalService(loadConfig({ STATIONS: '725N', FEEDS: '7' }), {
    fetchImpl: async () => { throw new Error('offline'); },
  });
  const body = await service.getArrivals();
  assert.equal(body.status, 'error');
  assert.equal(body.feeds.succeeded, 0);
  assert.equal(body.feeds.failed[0].reason, 'offline');
});

test('flags corrupted protobuf responses as a feed failure', async () => {
  const service = createArrivalService(loadConfig({ STATIONS: '725N', FEEDS: '7' }), {
    fetchImpl: async () => new Response(Buffer.from([0x12, 0x08, 0x01]), { status: 200 }),
  });
  assert.match((await service.getArrivals()).feeds.failed[0].reason, /Truncated/);
});
