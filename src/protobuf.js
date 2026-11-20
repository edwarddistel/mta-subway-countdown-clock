/**
 * Small, dependency-free reader for the GTFS-RT fields used by this application.
 * Field numbers come from https://gtfs.org/documentation/realtime/proto/.
 * It skips unknown fields to stay compatible with extensions and new GTFS fields.
 * This is deliberately NOT a general-purpose Protocol Buffers implementation.
 */
class Reader {
  constructor(bytes) {
    this.bytes = bytes;
    this.position = 0;
  }

  varint() {
    let value = 0n;
    for (let shift = 0n; shift < 70n; shift += 7n) {
      if (this.position >= this.bytes.length) throw new Error('Truncated protobuf varint');
      const byte = this.bytes[this.position++];
      value |= BigInt(byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) {
        // GTFS extensions can contain signed int64 values encoded as large varints.
        // Keep them as BigInt rather than rejecting the entire feed.
        return value > BigInt(Number.MAX_SAFE_INTEGER) ? value : Number(value);
      }
    }
    throw new Error('Protobuf varint exceeds 10 bytes');
  }

  field() {
    const tag = this.varint();
    if (typeof tag !== 'number') throw new Error('Invalid protobuf field tag');
    const number = Math.floor(tag / 8);
    const wire = tag % 8;
    if (number === 0) throw new Error('Invalid protobuf field number');
    if (wire === 0) return { number, wire, value: this.varint() };
    if (wire === 1 || wire === 5) {
      const width = wire === 1 ? 8 : 4;
      if (this.position + width > this.bytes.length) throw new Error('Truncated protobuf fixed field');
      this.position += width;
      return { number, wire, value: null };
    }
    if (wire === 2) {
      const length = this.varint();
      if (typeof length !== 'number' || length > this.bytes.length - this.position) throw new Error('Truncated protobuf length-delimited field');
      const data = this.bytes.subarray(this.position, this.position + length);
      this.position += length;
      return { number, wire, value: data };
    }
    throw new Error(`Unsupported protobuf wire type: ${wire}`);
  }

  *fields() {
    while (this.position < this.bytes.length) yield this.field();
  }
}

function fields(bytes) {
  return new Reader(bytes).fields();
}

function string(bytes) {
  return new TextDecoder().decode(bytes);
}

function eventTime(bytes) {
  for (const field of fields(bytes)) {
    // StopTimeEvent.time = 2 (Unix epoch seconds).
    if (field.number === 2 && field.wire === 0) return field.value;
  }
  return null;
}

function parseStop(bytes, selectedStops) {
  let stopId = null;
  let arrival = null;
  let departure = null;
  let skipped = false;
  for (const field of fields(bytes)) {
    if (field.number === 4 && field.wire === 2) stopId = string(field.value);
    if (field.number === 2 && field.wire === 2) arrival = eventTime(field.value);
    if (field.number === 3 && field.wire === 2) departure = eventTime(field.value);
    if (field.number === 5 && field.wire === 0) skipped = field.value === 1 || field.value === 2;
  }
  if (!stopId || !selectedStops.has(stopId) || skipped) return null;
  // An arrival prediction best represents time to platform; fall back to departure.
  const timestamp = arrival ?? departure;
  return Number.isSafeInteger(timestamp) ? { stopId, timestamp } : null;
}

function parseTripDescriptor(bytes) {
  let tripId = '';
  let routeId = '';
  let canceled = false;
  for (const field of fields(bytes)) {
    if (field.number === 1 && field.wire === 2) tripId = string(field.value);
    if (field.number === 5 && field.wire === 2) routeId = string(field.value);
    // TripDescriptor.schedule_relationship = 4; CANCELED = 3, DELETED = 7.
    if (field.number === 4 && field.wire === 0) canceled = field.value === 3 || field.value === 7;
  }
  return { tripId, routeId, canceled };
}

function parseTripUpdate(bytes, selectedStops) {
  let trip = { tripId: '', routeId: '', canceled: false };
  const stops = [];
  for (const field of fields(bytes)) {
    if (field.number === 1 && field.wire === 2) trip = parseTripDescriptor(field.value);
    if (field.number === 2 && field.wire === 2) {
      const stop = parseStop(field.value, selectedStops);
      if (stop) stops.push(stop);
    }
  }
  if (!trip.routeId || trip.canceled) return [];
  return stops.map((stop) => ({ ...stop, tripId: trip.tripId, routeId: trip.routeId }));
}

function parseEntity(bytes, selectedStops) {
  let deleted = false;
  const updates = [];
  for (const field of fields(bytes)) {
    if (field.number === 2 && field.wire === 0) deleted = Boolean(field.value);
    if (field.number === 3 && field.wire === 2) updates.push(...parseTripUpdate(field.value, selectedStops));
  }
  return deleted ? [] : updates;
}

/** Decode only the trip, route, stop and ETA fields needed for the clock. */
export function decodeFeed(buffer, selectedStops) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (bytes.length === 0) throw new Error('Empty GTFS-RT feed');
  const updates = [];
  for (const field of fields(bytes)) {
    // FeedMessage.entity = 2; ignore headers, vehicle updates, alerts, extensions.
    if (field.number === 2 && field.wire === 2) updates.push(...parseEntity(field.value, selectedStops));
  }
  return updates;
}
