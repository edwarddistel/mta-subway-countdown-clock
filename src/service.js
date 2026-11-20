import { buildArrivals } from './arrivals.js';
import { fetchFeeds } from './feeds.js';

/**
 * Simple in-memory TTL cache with in-flight request coalescing.
 * Every browser receives the same snapshot and never triggers a fan-out itself.
 */
export function createArrivalService(config, { fetchImpl = fetch, clock = Date.now } = {}) {
  let cache = null;
  let expiresAt = 0;
  let inflight = null;

  async function refresh() {
    const results = await fetchFeeds({
      feeds: config.feeds,
      stationIds: config.stations,
      timeoutMs: config.timeoutMs,
      fetchImpl,
    });
    const now = clock();
    const successful = results.filter((entry) => !entry.error);
    const failed = results.filter((entry) => entry.error).map((entry) => ({
      feed: entry.name,
      reason: entry.error,
    }));
    const updates = successful.flatMap((entry) => entry.updates);
    const status = successful.length === 0 ? 'error' : failed.length ? 'partial' : 'ok';
    const body = {
      status,
      fetchedAt: new Date(now).toISOString(),
      refreshSeconds: config.refreshMs / 1000,
      stations: buildArrivals({
        updates,
        stationIds: config.stations,
        nowSeconds: Math.floor(now / 1000),
        maxTrains: config.maxTrains,
      }),
      feeds: { requested: results.length, succeeded: successful.length, failed },
    };
    if (status === 'error') body.message = 'All selected MTA feeds are unavailable. Try again shortly.';
    else if (status === 'partial') body.message = 'Some feeds are unavailable; arrivals may be incomplete.';
    cache = body;
    expiresAt = clock() + config.refreshMs;
    return body;
  }

  async function getArrivals() {
    if (cache && clock() < expiresAt) return cache;
    if (!inflight) inflight = refresh().finally(() => { inflight = null; });
    return inflight;
  }

  return { getArrivals };
}
