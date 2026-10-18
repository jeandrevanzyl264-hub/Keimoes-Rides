'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const d = require('../functions/domain.cjs');
const pickup = { lat: -28.712, lng: 20.966, label: 'Test pickup' };
const payload = { pickup, destinationId: 'central', passengers: 2, rideType: 'shared', note: '' };

test('server fares apply the confirmed cash tariff per passenger', () => {
  assert.equal(d.booking(payload).fare, 50);
  assert.equal(d.booking({ ...payload, destinationId: 'upper', passengers: 3 }).fare, 105);
  assert.equal(d.booking({ ...payload, rideType: 'express', passengers: 4, fare: 1, paymentMethod: 'card' }).fare, 150);
  assert.equal(d.booking(payload).paymentMethod, 'cash');
});
test('custom shared fares use the configured distance rate and minimum', () => {
  const near = { lat: -28.714, lng: 20.968, label: 'Custom drop-off' };
  assert.equal(d.booking({ ...payload, destinationId: 'custom', dropoff: near }).fare, 50);
  const far = { lat: -28.65, lng: 20.98, label: 'Custom drop-off' };
  const expected = Math.max(25, Math.ceil(d.distance(pickup, far) * 10 / 5) * 5) * 2;
  assert.equal(d.booking({ ...payload, destinationId: 'custom', dropoff: far }).fare, expected);
});
test('GPS and booking validation reject outside locations, NaN and invented destinations', () => {
  for (const data of [
    { ...payload, pickup: { ...pickup, lat: 0 } },
    { ...payload, pickup: { ...pickup, lat: NaN } },
    { ...payload, pickup: { ...pickup, lng: '20.9' } },
    { ...payload, passengers: 0 },
    { ...payload, passengers: 2.5 },
    { ...payload, passengers: 5 },
    { ...payload, destinationId: 'cape-town' },
    { ...payload, rideType: 'free' },
    { ...payload, destinationId: 'custom' },
    { ...payload, destinationId: 'custom', dropoff: pickup },
  ]) assert.throws(() => d.booking(data));
  assert.throws(() => d.point({ ...pickup, accuracy: 1501 }, 'GPS', true));
  assert.throws(() => d.point({ ...pickup }, 'GPS', true));
});
test('South African phone normalization and safe document identifiers', () => {
  assert.equal(d.phone('082 123 4567'), '+27821234567');
  assert.equal(d.phone('+27 (82) 123-4567'), '+27821234567');
  for (const value of ['+1555123456', '082', '<script>', '0000000000']) assert.throws(() => d.phone(value));
  for (const value of ['../ride', 'ride/one', '', 'x'.repeat(257), null]) assert.throws(() => d.id(value));
  assert.equal(d.id('abc_123-456'), 'abc_123-456');
});
test('private precision is removed from public locations', () => {
  assert.deepEqual(d.approximate({ lat: -28.7078123, lng: 20.9705123, accuracy: 4 }), { lat: -28.708, lng: 20.971, accuracy: 120 });
});
test('manual verification file checks reject MIME spoofing and recognize supported image signatures', () => {
  assert.equal(d.imageType(Buffer.from([255, 216, 255, 0])), 'image/jpeg');
  assert.equal(d.imageType(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'image/png');
  assert.equal(d.imageType(Buffer.from('RIFF0000WEBP')), 'image/webp');
  assert.equal(d.imageType(Buffer.from('<script>malicious</script>')), null);
});
