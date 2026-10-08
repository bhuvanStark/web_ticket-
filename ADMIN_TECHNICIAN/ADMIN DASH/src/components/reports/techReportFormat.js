// Helpers for the Reports page (technician performance). Pure functions —
// dates are India calendar-day keys (YYYY-MM-DD), the same convention the
// backend uses (techReportService.js), computed in UTC so the browser's own
// timezone never shifts a day.

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
export const indiaToday = () => new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);

const parse = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const toKey = (dt) => dt.toISOString().slice(0, 10);
export const addDays = (key, n) => toKey(new Date(parse(key).getTime() + n * 86400000));

export const PERIODS = [
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' },
  { id: 'quarter', label: 'Last 90 Days' },
  { id: 'custom', label: 'Custom' }
];

// Monday-start weeks, like the Attendance and Sales pages.
export function resolvePeriod(id, custom = {}) {
  const today = indiaToday();
  switch (id) {
    case 'week': {
      const dow = parse(today).getUTCDay();
      return { from: addDays(today, -(dow === 0 ? 6 : dow - 1)), to: today };
    }
    case 'last_month': {
      const firstThis = parse(`${today.slice(0, 8)}01`);
      const lastPrev = new Date(firstThis.getTime() - 86400000);
      return { from: `${toKey(lastPrev).slice(0, 8)}01`, to: toKey(lastPrev) };
    }
    case 'quarter': return { from: addDays(today, -89), to: today };
    case 'custom': return { from: custom.from || today, to: custom.to || today };
    case 'month':
    default: return { from: `${today.slice(0, 8)}01`, to: today };
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const fmtDay = (key, withYear = false) => {
  const dt = parse(key);
  return `${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]}${withYear ? ` ${dt.getUTCFullYear()}` : ''}`;
};
export const fmtRange = ({ from, to }) => (from === to ? fmtDay(from, true) : `${fmtDay(from, from.slice(0, 4) !== to.slice(0, 4))} – ${fmtDay(to, true)}`);

// Timestamps shown in India time, matching the rest of the admin app.
export const fmtDateTime = (iso) => (iso
  ? new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  : '—');

export const fmtHours = (h) => {
  if (h == null) return '—';
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${Math.round(h * 10) / 10} h`;
  return `${Math.round((h / 24) * 10) / 10} days`;
};
export const fmtRating = (r) => (r == null ? '—' : r.toFixed(1));
export const fmtPct = (p) => (p == null ? '—' : `${Math.round(p)}%`);

export const totalDone = (t) => t.tickets.owned + t.tickets.assisted + t.projects.completed;

// Tickets carry the backend's raw status vocabulary ('service_in_progress').
export const statusLabel = (s) => (s || '—').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
