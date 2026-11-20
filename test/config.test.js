import test from 'node:test';
import assert from 'node:assert/strict';
import { FEED_URLS, loadConfig } from '../src/config.js';

const env = { STATIONS: '725N 725S', FEEDS: '7' };

test('parses supported stops, feed aliases, deduplication and defaults', () => {
  const config = loadConfig({ STATIONS: '725N,725S 725N', FEEDS: '7,ace,7' });
  assert.deepEqual(config.stations, ['725N', '725S']);
  assert.deepEqual(config.feeds.map((f) => f.name), ['7', 'ace']);
  assert.equal(config.feeds[0].url, FEED_URLS['7']);
  assert.equal(config.port, 4000);
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.refreshMs, 20_000);
});

test('defaults to the normal eight MTA subway feeds', () => {
  const feeds = loadConfig({}).feeds;
  assert.equal(feeds.length, 8);
  assert.ok(feeds.every(({ url }) => url.startsWith('https://api-endpoint.mta.info/')));
});

test('rejects unknown stations, feeds, invalid ports and dangerous hosts', () => {
  assert.throws(() => loadConfig({ ...env, STATIONS: 'FAKE' }), /Unknown stop IDs/);
  assert.throws(() => loadConfig({ ...env, STATIONS: '' }), /STATIONS/);
  assert.throws(() => loadConfig({ ...env, FEEDS: 'wrong' }), /FEEDS/);
  assert.throws(() => loadConfig({ ...env, PORT: 'hello' }), /PORT/);
  assert.throws(() => loadConfig({ ...env, HOST: 'example.com' }), /HOST/);
  assert.throws(() => loadConfig({ ...env, REFRESH_SECONDS: '1' }), /REFRESH_SECONDS/);
});
