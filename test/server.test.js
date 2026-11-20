import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/server.js';

async function withServer(fn) {
  const service = { getArrivals: async () => ({ status: 'ok', stations: { '725N': { name: 'Times Sq - 42 St', trains: [] } } }) };
  const server = createApp({ service });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try { await fn(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test('serves board, assets, health and arrivals on one origin', async () => {
  await withServer(async (base) => {
    const board = await fetch(base);
    assert.equal(board.status, 200);
    assert.match(board.headers.get('content-security-policy'), /default-src 'none'/);
    assert.match(await board.text(), /Subway arrivals/);
    assert.match(await (await fetch(`${base}/app.css`)).text(), /station-grid/);
    assert.match(await (await fetch(`${base}/app.js`)).text(), /api\/arrivals/);
    assert.deepEqual(await (await fetch(`${base}/healthz`)).json(), { status: 'ok' });
    assert.equal((await (await fetch(`${base}/api/arrivals`)).json()).stations['725N'].trains.length, 0);
    assert.equal((await (await fetch(`${base}/api`)).json()).status, 'ok');
  });
});

test('rejects unrelated paths and disallowed methods', async () => {
  await withServer(async (base) => {
    assert.equal((await fetch(`${base}/unknown`)).status, 404);
    assert.equal((await fetch(`${base}/data/stations.json`)).status, 404);
    assert.equal((await fetch(base, { method: 'POST' })).status, 405);
    const response = await fetch(base, { method: 'HEAD' });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), '');
  });
});

test('exposes a 503 for upstream feed outages', async () => {
  const server = createApp({ service: { getArrivals: async () => ({ status: 'error', stations: {} }) } });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/arrivals`);
    assert.equal(res.status, 503);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
