// Attendance Category (V1) — the only place that computes an India calendar
// day. Additive: no existing module imports or is affected by this file.
//
// The trick: shift the UTC instant by the fixed IST offset (+5:30, India has
// no DST) and then read the UTC calendar date off the shifted instant — that
// UTC date *is* the IST wall-clock date, regardless of the server's own
// timezone.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function indiaDateKey(date = new Date()) {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  return shifted.toISOString().slice(0, 10); // YYYY-MM-DD
}

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Shape-valid is not enough — `Date.parse('2026-02-30')` doesn't return NaN,
// it silently rolls over to March 2, so a regex-only check let calendar-
// invalid dates (e.g. Feb 30) through to Postgres, which threw a raw
// "date/time field value out of range" error. Constructing via Date.UTC and
// reading the components back with UTC getters is TZ-independent (no
// dependency on the process's local timezone either way) and rejects any
// value that doesn't round-trip to the exact year/month/day it was given.
export function isValidDateKey(value) {
  if (typeof value !== 'string' || !DATE_KEY_REGEX.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const asDate = new Date(Date.UTC(year, month - 1, day));
  return (
    asDate.getUTCFullYear() === year &&
    asDate.getUTCMonth() === month - 1 &&
    asDate.getUTCDate() === day
  );
}

// node-postgres has no custom type parser configured anywhere in this app
// (checked: none of the existing DATE columns — project_activities.
// scheduled_date, projects.start_date/end_date — get one either), so its
// default DATE (OID 1082) parser runs, which builds the value with the
// plain *local-time* Date constructor — `new Date(year, month - 1, day)` —
// using whatever timezone the Node process itself is running under. Left as
// a Date object, JSON.stringify serializes it through toISOString() (always
// UTC), so on a process whose local TZ isn't UTC this prints a shifted
// instant — e.g. IST local midnight on the 21st becomes
// "...T18:30:00.000Z", which reads as the 20th to any UTC-getter or to a
// browser in a different timezone. Reusing the global pg type parser would
// change every existing DATE column's wire format app-wide, well outside
// this module's scope — so attendanceService normalizes only its own
// `attendance_date` field through this before it ever reaches a response.
// The fix is *local* getters, not UTC ones: since pg built the Date from
// (year, month, day) via the local constructor, local getters are the exact
// inverse and round-trip correctly no matter what timezone the process is
// actually in — unlike an IST-shift, this needs no assumption about which
// timezone that is.
// Adds `days` (may be negative) to a YYYY-MM-DD key and returns the result,
// also as a plain key. Pure calendar-date arithmetic via Date.UTC — never
// touches the process's local timezone, so it can't drift by a day the way
// reusing formatDateOnly's *local*-getter approach would for this purpose.
export function addDaysToDateKey(dateKey, days) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
}

export function formatDateOnly(value) {
  if (value == null) return value;
  if (typeof value === 'string') return value.slice(0, 10);
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
