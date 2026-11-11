// Quotation module — shared nav entries, access hook, formatting and status
// metadata used by the three pages, the builder and the exports.
import { useEffect, useState } from 'react';
import { Users, FileText, Package } from 'lucide-react';
import { fetchQuoteAccess } from '../../services/quoteApiService';

// Back-Office Quote Managers get these on top of their normal nav.
export const quoteNavItems = [
  { id: 'quote-leads', label: 'Quote Leads', mobileLabel: 'Leads', icon: Users },
  { id: 'quotations', label: 'Quotations', mobileLabel: 'Quotes', icon: FileText },
  { id: 'quote-items', label: 'Items', mobileLabel: 'Items', icon: Package }
];
export const QUOTE_PAGE_IDS = quoteNavItems.map((item) => item.id);

// One /quotes/access check per signed-in token, shared by every caller.
let cached = { token: null, promise: null, value: null };
const NO_ACCESS = { canAccess: false, mode: null };

function loadAccess() {
  const token = localStorage.getItem('admin_access_token');
  if (!token) return Promise.resolve(NO_ACCESS);
  if (cached.token !== token) {
    cached = { token, value: null, promise: fetchQuoteAccess().catch(() => NO_ACCESS) };
    cached.promise.then((value) => { if (cached.token === token) cached.value = value; });
  }
  return cached.promise;
}

// `enabled` false skips the request (e.g. a role that can never have access).
// `recheck` drops the cached answer first, so a grant/revoke made since the
// last check shows up — the module pages use it; the nav reuses the cache.
export function useQuoteAccess(enabled = true, { recheck = false } = {}) {
  const token = localStorage.getItem('admin_access_token');
  const fresh = !recheck && cached.token === token ? cached.value : null;
  const [state, setState] = useState(() => fresh ? { ...fresh, loading: false } : { ...NO_ACCESS, loading: enabled });
  useEffect(() => {
    if (!enabled) { setState({ ...NO_ACCESS, loading: false }); return undefined; }
    if (recheck) cached = { token: null, promise: null, value: null };
    let alive = true;
    loadAccess().then((value) => { if (alive) setState({ ...value, loading: false }); });
    return () => { alive = false; };
  }, [enabled, token, recheck]);
  return state;
}

// Leads → Quotations hand-off ({ quoteId } to open, or { search }). Kept
// outside React because App.jsx remounts the page on every nav change.
let pendingNav = null;
export const queueQuoteNav = (nav) => { pendingNav = nav; };
// Read during render (StrictMode may run it twice); clear from an effect.
export const peekQueuedQuoteNav = () => pendingNav || {};
export const clearQueuedQuoteNav = () => { pendingNav = null; };

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
const inr0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
export const formatINR = (value, { decimals = false } = {}) =>
  `₹${(decimals ? inr : inr0).format(Number(value) || 0)}`;
export const formatNum = (value) => inr.format(Number(value) || 0);

export const formatDate = (value) => {
  if (!value) return '—';
  const s = String(value);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00`) : new Date(s);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const formatDateTime = (value) => {
  const d = value ? new Date(value) : null;
  return !d || Number.isNaN(d.getTime()) ? '—'
    : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const QUOTE_STATUS = {
  draft: { label: 'Draft', cls: 'bg-[#F2F4F7] text-[#344054] border-[#E4E7EC]', dot: 'bg-[#98A2B3]' },
  sent: { label: 'Under Process', cls: 'bg-[#FFFAEB] text-[#B54708] border-[#FEDF89]', dot: 'bg-[#F79009]' },
  won: { label: 'Won', cls: 'bg-[#ECFDF3] text-[#027A48] border-[#A6F4C5]', dot: 'bg-[#12B76A]' },
  lost: { label: 'Lost', cls: 'bg-[#FEF3F2] text-[#B42318] border-[#FECDCA]', dot: 'bg-[#F04438]' }
};

// SM 0.85 ↔ 15% margin on the selling price.
export const smToMarginPct = (sm) => (Number(sm) > 0 ? Math.round((1 - Number(sm)) * 10000) / 100 : 0);

export const marginTone = (pct) =>
  pct < 0 ? 'text-[#B42318]' : pct < 10 ? 'text-[#B54708]' : 'text-[#027A48]';

export const lineTitle = (line) =>
  [line.model_name, line.series && `(${line.series})`].filter(Boolean).join(' ') || line.description || 'Untitled line';
