// Reverse geocoding for the Admin Attendance "latest captured location"
// summary (e.g. "Koramangala, Bengaluru"). Read-only helper: turns a stored
// attendance lat/lng into a short area label on demand. Never writes to the
// database and is not used by check-in, so a lookup failure can only ever
// degrade the label — the caller falls back to showing coordinates.
//
// Provider: OpenStreetMap Nominatim (no API key). Its usage policy requires
// at most 1 request/second and an identifying User-Agent, so lookups go
// through a single serial queue and results are cached in memory, keyed by
// coordinates rounded to ~11 m.

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';
const MIN_INTERVAL_MS = 1100;
const REQUEST_TIMEOUT_MS = 5000;
const MAX_CACHE_ENTRIES = 2000;
const MAX_QUEUE_LENGTH = 50;

const cache = new Map(); // key -> label (string) | null
const inFlight = new Map(); // key -> Promise
let queueTail = Promise.resolve();
let queueLength = 0;
let lastRequestAt = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const cacheKey = (lat, lng) => `${lat.toFixed(4)},${lng.toFixed(4)}`;

// Picks "<locality>, <city>" out of a Nominatim address object, skipping
// whichever parts are missing and never repeating the same name twice.
export const formatAreaLabel = (address = {}) => {
  const locality = address.suburb || address.neighbourhood || address.quarter || address.city_district
    || address.hamlet || address.village || address.road || null;
  const city = address.city || address.town || address.municipality || address.county
    || address.state_district || address.state || null;
  const parts = [locality, city].filter(Boolean);
  const unique = parts.filter((p, i) => parts.indexOf(p) === i);
  return unique.length ? unique.join(', ') : null;
};

const remember = (key, label) => {
  if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
  cache.set(key, label);
};

const fetchFromNominatim = async (lat, lng) => {
  const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();

  const params = new URLSearchParams({
    format: 'jsonv2', lat: String(lat), lon: String(lng), zoom: '16', addressdetails: '1', 'accept-language': 'en'
  });
  const res = await fetch(`${NOMINATIM_URL}?${params}`, {
    headers: { 'User-Agent': process.env.GEOCODER_USER_AGENT || 'TaskTel-Admin/1.0 (attendance location summary)' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  if (!res.ok) throw new Error(`Geocoder responded ${res.status}`);
  const body = await res.json();
  return formatAreaLabel(body?.address);
};

// Resolves to a short area label, or null when the provider has no name
// for that point. Throws only for transient failures (network, timeout,
// provider error, queue full) — those are not cached, so a later view retries.
export const reverseGeocode = async (lat, lng) => {
  const key = cacheKey(lat, lng);
  if (cache.has(key)) return cache.get(key);
  if (inFlight.has(key)) return inFlight.get(key);
  if (queueLength >= MAX_QUEUE_LENGTH) {
    const err = new Error('Geocoder busy — try again shortly');
    err.code = 'BUSY';
    throw err;
  }

  queueLength += 1;
  const job = queueTail.then(() => fetchFromNominatim(lat, lng));
  queueTail = job.catch(() => {});
  const tracked = job
    .then((label) => { remember(key, label); return label; })
    .finally(() => { queueLength -= 1; inFlight.delete(key); });
  inFlight.set(key, tracked);
  return tracked;
};
