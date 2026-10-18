import config from '../functions/config.json';

export { config };
export function money(value = 0) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(Number(value) || 0);
}
export function timestamp(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  if (typeof value._seconds === 'number') return new Date(value._seconds * 1000);
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}
export function formatDate(value) {
  const date = timestamp(value);
  return date ? new Intl.DateTimeFormat('en-ZA', { timeZone: 'Africa/Johannesburg', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date) : 'Just now';
}
export function relativeTime(value) {
  const date = timestamp(value);
  if (!date) return 'Updating…';
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 10) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  return formatDate(value);
}
export function initials(name = '') { return String(name).trim().split(/\s+/).slice(0, 2).map(s => s[0] || '').join('').toUpperCase() || 'KR'; }
export function haversine(a, b) {
  if (![a?.lat, a?.lng, b?.lat, b?.lng].every(Number.isFinite)) return 0;
  const rad = value => value * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
export function estimateFare({ pickup, dropoff, destinationId = 'central', passengers = 1, rideType = 'shared' } = {}) {
  if (rideType === 'express') return config.fares.express;
  const count = Math.min(config.maxPassengers, Math.max(1, Number(passengers) || 1));
  if (destinationId === 'central' || destinationId === 'upper') return config.fares[destinationId] * count;
  return Math.max(config.fares.customMinimum, Math.ceil(haversine(pickup, dropoff) * config.fares.customPerKm / 5) * 5) * count;
}
export function errorMessage(error) {
  return String(error?.message || error || 'Something went wrong. Please try again.').replace(/^Firebase:\s*/, '').replace(/\s*\([^)]*\)\.?$/, '');
}
