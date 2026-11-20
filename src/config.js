import { STATIONS } from './stations.js';

/** Official MTA subway GTFS-Realtime feed endpoints. */
export const FEED_URLS = Object.freeze({
  '123456': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct/gtfs',
  '7': 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct/gtfs-7',
  ace: 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct/gtfs-ace',
  bdfm: 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct/gtfs-bdfm',
  g: 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct/gtfs-g',
  jz: 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct/gtfs-jz',
  l: 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct/gtfs-l',
  nqrw: 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct/gtfs-nqrw',
  si: 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct/gtfs-si',
});

function integerInRange(value, name, fallback, min, max) {
  if (value === undefined || value === '') return fallback;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}`);
  }
  return number;
}

/** Validate all user-facing configuration once at startup, rather than per request. */
export function loadConfig(env = process.env) {
  const stations = [...new Set((env.STATIONS ?? '725N 725S').trim().split(/[\s,]+/).filter(Boolean))];
  if (stations.length === 0 || stations.length > 20) {
    throw new Error('STATIONS must contain between 1 and 20 stop IDs');
  }
  const invalid = stations.filter((id) => !Object.hasOwn(STATIONS, id));
  if (invalid.length) {
    throw new Error(`Unknown stop IDs in STATIONS: ${invalid.join(', ')}. Check data/stations.json`);
  }

  const feedKeys = [...new Set((env.FEEDS ?? Object.keys(FEED_URLS).filter((name) => name !== 'si').join(','))
    .trim().toLowerCase().split(/[\s,]+/).filter(Boolean))];
  if (!feedKeys.length || feedKeys.some((key) => !Object.hasOwn(FEED_URLS, key))) {
    throw new Error(`FEEDS must be a nonempty list of: ${Object.keys(FEED_URLS).join(', ')}`);
  }
  const host = env.HOST || '127.0.0.1';
  if (!/^(127\.0\.0\.1|0\.0\.0\.0|localhost|::1)$/.test(host)) {
    throw new Error('HOST must be localhost, 127.0.0.1, ::1, or 0.0.0.0');
  }

  return Object.freeze({
    stations,
    feeds: feedKeys.map((name) => ({ name, url: FEED_URLS[name] })),
    port: integerInRange(env.PORT, 'PORT', 4000, 1, 65535),
    host,
    refreshMs: integerInRange(env.REFRESH_SECONDS, 'REFRESH_SECONDS', 20, 10, 300) * 1000,
    maxTrains: integerInRange(env.MAX_TRAINS, 'MAX_TRAINS', 6, 1, 20),
    timeoutMs: integerInRange(env.FETCH_TIMEOUT_MS, 'FETCH_TIMEOUT_MS', 8000, 1000, 30000),
  });
}
