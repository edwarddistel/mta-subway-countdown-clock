import { readFileSync } from 'node:fs';

// Preserved stop metadata from the original project. GTFS platform IDs end in N or S.
export const STATIONS = Object.freeze(JSON.parse(readFileSync(new URL('../data/stations.json', import.meta.url), 'utf8')));

export function stationName(stopId) {
  return STATIONS[stopId]?.stop_name ?? stopId;
}

export function stationDirection(stopId) {
  const suffix = stopId.at(-1);
  return suffix === 'N' ? 'Uptown / northbound' : suffix === 'S' ? 'Downtown / southbound' : '';
}
