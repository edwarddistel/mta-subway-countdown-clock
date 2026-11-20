/** Tiny test-only GTFS-RT encoder. Independent of the production decoder. */
function varint(value) {
  let number = BigInt(value);
  const result = [];
  do {
    let byte = Number(number & 127n);
    number >>= 7n;
    if (number !== 0n) byte |= 128;
    result.push(byte);
  } while (number !== 0n);
  return Buffer.from(result);
}

export function field(number, value) {
  if (typeof value === 'number' || typeof value === 'bigint') {
    return Buffer.concat([varint(number * 8), varint(value)]);
  }
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return Buffer.concat([varint(number * 8 + 2), varint(bytes.length), bytes]);
}

export const message = (...parts) => Buffer.concat(parts);
export const timeEvent = (timestamp) => message(field(2, timestamp));

export function stopTime({ stopId = '725N', arrival, departure, skipped = false }) {
  return message(
    field(4, stopId),
    ...(arrival == null ? [] : [field(2, timeEvent(arrival))]),
    ...(departure == null ? [] : [field(3, timeEvent(departure))]),
    ...(skipped ? [field(5, 1)] : []),
  );
}

export function tripUpdate({ tripId = 'trip-1', routeId = '7', stops = [], canceled = false }) {
  const descriptor = message(field(1, tripId), field(5, routeId), ...(canceled ? [field(4, 3)] : []));
  return message(field(1, descriptor), ...stops.map((stop) => field(2, stop)));
}

export function feed(...entities) {
  const header = message(field(1, '2.0'));
  return message(field(1, header), ...entities.map((entity, index) => field(2, message(field(1, String(index)), field(3, entity)))));
}
