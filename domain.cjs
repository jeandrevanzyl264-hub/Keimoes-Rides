'use strict';

const config = require('./config.json');
const { HttpsError } = require('firebase-functions/v2/https');

function fail(code, message) { throw new HttpsError(code, message); }
function text(value, field, min = 1, max = 100) {
  if (typeof value !== 'string') fail('invalid-argument', `${field} is required.`);
  const clean = value.trim().replace(/\s+/g, ' ');
  if (clean.length < min || clean.length > max || /[\u0000-\u001f\u007f]/.test(clean)) {
    fail('invalid-argument', `${field} must contain ${min}–${max} characters.`);
  }
  return clean;
}
function optionalText(value, field, max) { return value == null || value === '' ? '' : text(value, field, 1, max); }
function id(value, field = 'ID', max = 256) {
  if (typeof value !== 'string' || value.length > max || !/^[A-Za-z0-9_-]+$/.test(value)) fail('invalid-argument', `Invalid ${field}.`);
  return value;
}
function phone(value) {
  const compact = text(value, 'Phone number', 9, 25).replace(/[\s()-]/g, '');
  const normalized = compact.startsWith('0') ? `+27${compact.slice(1)}` : compact;
  if (!/^\+27[1-9]\d{8}$/.test(normalized)) fail('invalid-argument', 'Enter a South African number, for example 082 123 4567.');
  return normalized;
}
function number(value, field, min, max, integer = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    fail('invalid-argument', `${field} must be ${integer ? 'a whole number ' : ''}between ${min} and ${max}.`);
  }
  return value;
}
function distance(a, b) {
  const radians = Math.PI / 180;
  const dlat = (b.lat - a.lat) * radians;
  const dlng = (b.lng - a.lng) * radians;
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin(dlng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
function point(value, field = 'Location', gps = false) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('invalid-argument', `${field} is required.`);
  const result = { lat: number(value.lat, `${field} latitude`, -90, 90), lng: number(value.lng, `${field} longitude`, -180, 180) };
  if (distance(config.center, result) > config.serviceRadiusKm) fail('out-of-range', `${field} is outside the ${config.serviceRadiusKm} km Keimoes service area.`);
  if (gps) result.accuracy = number(value.accuracy, 'GPS accuracy', 0, 1500);
  else result.label = text(value.label, `${field} label`, 2, 160);
  return result;
}
function approximate(location) {
  return { lat: Math.round(location.lat * 1000) / 1000, lng: Math.round(location.lng * 1000) / 1000, accuracy: Math.max(120, location.accuracy || 120) };
}
function vehicle(value) {
  if (!value || typeof value !== 'object') fail('invalid-argument', 'Vehicle details are required.');
  return {
    model: text(value.model, 'Vehicle model', 2, 60),
    color: text(value.color, 'Vehicle colour', 2, 30),
    plate: text(value.plate, 'Vehicle registration', 3, 20).toUpperCase(),
    seats: number(value.seats, 'Passenger seats', 1, config.maxPassengers, true),
  };
}
function booking(data) {
  const pickup = point(data.pickup, 'Pickup');
  if (!['shared', 'express'].includes(data.rideType)) fail('invalid-argument', 'Choose a shared or express ride.');
  const passengers = number(data.passengers, 'Passengers', 1, config.maxPassengers, true);
  const destinationId = data.destinationId;
  const destination = config.destinations.find((item) => item.id === destinationId);
  if (!destination && destinationId !== 'custom') fail('invalid-argument', 'Choose a valid destination.');
  const dropoff = destination ? { lat: destination.lat, lng: destination.lng, label: destination.name } : point(data.dropoff, 'Drop-off');
  if (distance(pickup, dropoff) < 0.015) fail('invalid-argument', 'Pickup and destination must be different places.');
  const perPerson = destination ? config.fares[destinationId] : Math.max(config.fares.customMinimum, Math.ceil(distance(pickup, dropoff) * config.fares.customPerKm / 5) * 5);
  return {
    pickup, dropoff, destinationId, passengers, rideType: data.rideType,
    fare: data.rideType === 'express' ? config.fares.express : perPerson * passengers,
    paymentMethod: 'cash', note: optionalText(data.note, 'Trip note', 300),
  };
}
function milliseconds(value) { return value && typeof value.toMillis === 'function' ? value.toMillis() : 0; }
function imageType(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}

module.exports = { config, fail, text, optionalText, id, phone, number, distance, point, approximate, vehicle, booking, milliseconds, imageType };
