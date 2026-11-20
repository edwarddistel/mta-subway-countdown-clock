import { decodeFeed } from './protobuf.js';

const MAX_FEED_BYTES = 8 * 1024 * 1024;

/**
 * Fetch independent feeds concurrently. One failing feed must not hide healthy feeds.
 * MTA subway GTFS-RT feeds are public and do not require an API key.
 */
export async function fetchFeeds({ feeds, stationIds, timeoutMs, fetchImpl = fetch }) {
  const selectedStops = new Set(stationIds);
  return Promise.all(feeds.map(async ({ name, url }) => {
    try {
      const response = await fetchImpl(url, {
        headers: { Accept: 'application/x-protobuf, application/octet-stream' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const declaredSize = Number(response.headers.get('content-length'));
      if (declaredSize > MAX_FEED_BYTES) throw new Error('Feed exceeds size limit');
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > MAX_FEED_BYTES) throw new Error('Feed exceeds size limit');
      return { name, updates: decodeFeed(buffer, selectedStops) };
    } catch (error) {
      return { name, error: error instanceof Error ? error.message : 'Unknown fetch error' };
    }
  }));
}
