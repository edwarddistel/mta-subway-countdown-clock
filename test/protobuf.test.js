import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeFeed } from '../src/protobuf.js';
import { feed, field, message, stopTime, tripUpdate } from './fixtures.js';

const selected = new Set(['725N', '725S']);

test('decodes relevant stops from real GTFS-RT field numbers', () => {
  const buffer = feed(tripUpdate({ stops: [
    stopTime({ stopId: '725N', arrival: 1_800_000_000, departure: 1_800_000_035 }),
    stopTime({ stopId: '725S', departure: 1_800_000_100 }),
    stopTime({ stopId: '999N', arrival: 1_800_000_200 }),
  ] }));
  assert.deepEqual(decodeFeed(buffer, selected), [
    { stopId: '725N', timestamp: 1_800_000_000, tripId: 'trip-1', routeId: '7' },
    { stopId: '725S', timestamp: 1_800_000_100, tripId: 'trip-1', routeId: '7' },
  ]);
});

test('skips canceled trips, skipped stops and vehicle updates', () => {
  const canceled = tripUpdate({ canceled: true, stops: [stopTime({ arrival: 1_800_000_000 })] });
  const valid = tripUpdate({ stops: [stopTime({ skipped: true, arrival: 1_800_000_000 }), stopTime({ arrival: 1_800_000_090 })] });
  const vehicleOnly = field(2, message(field(1, 'vehicle')));
  const bytes = message(field(2, message(field(3, canceled))), field(2, message(field(3, valid))), field(2, vehicleOnly));
  assert.equal(decodeFeed(bytes, selected).length, 1);
});

test('skips unknown protobuf fields and handles unknown fixed-width fields', () => {
  const bytes = message(field(30, 'future metadata'), feed(tripUpdate({ stops: [stopTime({ departure: 1_800_000_000 })] })));
  assert.equal(decodeFeed(bytes, selected).length, 1);
  // A signed negative integer in an unrecognized extension must not invalidate the feed.
  const unknownSigned = Buffer.from([0x80, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01]);
  assert.equal(decodeFeed(message(unknownSigned, bytes), selected).length, 1);
});

test('rejects empty, truncated, malformed and unsafe wire values', () => {
  assert.throws(() => decodeFeed(Buffer.alloc(0)), /Empty/);
  assert.throws(() => decodeFeed(Buffer.from([0x12, 0x05, 0x00])), /Truncated/);
  assert.throws(() => decodeFeed(Buffer.from([0x12, 0x80])), /Truncated/);
  assert.throws(() => decodeFeed(Buffer.from([0x0b])), /Unsupported/);
  assert.throws(() => decodeFeed(Buffer.from([0x00])), /field number/);
});
