import { stationDirection, stationName } from './stations.js';

const timeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

/** Combine independently decoded MTA feeds into a stable API response. */
export function buildArrivals({ updates, stationIds, nowSeconds, maxTrains = 6 }) {
  const stations = Object.fromEntries(stationIds.map((id) => [id, {
    name: stationName(id),
    direction: stationDirection(id),
    trains: [],
  }]));
  const seen = new Set();

  for (const update of updates) {
    const station = stations[update.stopId];
    if (!station || !update.routeId || !Number.isSafeInteger(update.timestamp)) continue;
    const secondsAway = Math.floor(update.timestamp - nowSeconds);
    if (secondsAway < 0 || secondsAway > 90 * 60) continue;

    const key = `${update.routeId}|${update.tripId || update.timestamp}|${update.stopId}|${update.timestamp}`;
    if (seen.has(key)) continue;
    seen.add(key);

    station.trains.push({
      trainId: update.routeId,
      tripId: update.tripId || null,
      arrivesAt: new Date(update.timestamp * 1000).toISOString(),
      secondsAway,
      // Retain the original JSON field names for existing API consumers.
      eta: timeFormatter.format(new Date(update.timestamp * 1000)).toLowerCase(),
      minAway: `${Math.floor(secondsAway / 60)}m, ${secondsAway % 60}s`,
      rawEta: secondsAway,
    });
  }

  for (const station of Object.values(stations)) {
    station.trains.sort((a, b) => a.secondsAway - b.secondsAway || a.trainId.localeCompare(b.trainId));
    station.trains.length = Math.min(station.trains.length, maxTrains);
  }
  return stations;
}
