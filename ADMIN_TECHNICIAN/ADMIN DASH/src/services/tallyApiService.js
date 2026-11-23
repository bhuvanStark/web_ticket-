// Tally Desk — every /api/tally call. Same authFetch/readApiData contract as
// quoteApiService.js.
import { authFetch, readApiData, authHeaders, API_BASE_URL } from './adminApiService';

const BASE = `${API_BASE_URL}/tally`;

async function call(path, { method = 'GET', body, operation } = {}) {
  const res = await authFetch(`${BASE}${path}`, {
    method,
    headers: authHeaders(Boolean(body)),
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    const error = new Error(payload?.message || payload?.error || `Failed to ${operation}`);
    error.details = payload?.details;
    error.status = res.status;
    throw error;
  }
  return readApiData(res, operation);
}

const qs = (params) => {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) if (v !== '' && v != null) search.set(k, v);
  const s = search.toString();
  return s ? `?${s}` : '';
};

export const fetchTallyAccess = () => call('/access', { operation: 'check Tally Desk access' });

// Tally Maker tag (Super Admin, Back-Office roster)
export const fetchTallyMakerIds = () => call('/makers', { operation: 'load Tally Makers' });
export const setTallyMaker = (backOfficeId, enabled) =>
  call(`/makers/${backOfficeId}`, { method: 'PUT', body: { enabled }, operation: 'update Tally Maker' });

export const fetchTallySettings = () => call('/settings', { operation: 'load Tally settings' });
export const saveTallySettings = (body) => call('/settings', { method: 'PUT', body, operation: 'save Tally settings' });

export const fetchWonQuotes = (params) => call(`/quotes${qs(params)}`, { operation: 'load won quotations' });
export const fetchWonQuote = (id) => call(`/quotes/${id}`, { operation: 'load quotation' });

export const fetchVouchers = (params) => call(`/vouchers${qs(params)}`, { operation: 'load vouchers' });
export const fetchVoucher = (id) => call(`/vouchers/${id}`, { operation: 'load voucher' });
export const createVoucher = (body) => call('/vouchers', { method: 'POST', body, operation: 'save voucher' });
export const updateVoucher = (id, body) => call(`/vouchers/${id}`, { method: 'PUT', body, operation: 'save voucher' });
export const deleteVoucher = (id) => call(`/vouchers/${id}`, { method: 'DELETE', operation: 'delete voucher' });
export const downloadVoucherXml = (id) => call(`/vouchers/${id}/download`, { method: 'POST', body: {}, operation: 'download voucher' });
export const setVoucherImported = (id, imported, tallyVoucherNo) =>
  call(`/vouchers/${id}/imported`, { method: 'PATCH', body: { imported, tally_voucher_no: tallyVoucherNo }, operation: 'update voucher' });

export const fetchTallyItems = (params) => call(`/items${qs(params)}`, { operation: 'load item names' });
export const setTallyItemName = (id, stockItemName, unitName) =>
  call(`/items/${id}`, { method: 'PUT', body: { stock_item_name: stockItemName, unit_name: unitName }, operation: 'save item name' });
