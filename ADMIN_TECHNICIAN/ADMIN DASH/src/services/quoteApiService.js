// Quotation module — every /api/quotes call. Same authFetch/readApiData
// contract as the other per-module services.
import { authFetch, readApiData, authHeaders, API_BASE_URL } from './adminApiService';

const BASE = `${API_BASE_URL}/quotes`;

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

export const fetchQuoteAccess = () => call('/access', { operation: 'check quotation access' });

// Quote Manager tag (Super Admin, Back-Office roster)
export const fetchQuoteManagerIds = () => call('/managers', { operation: 'load Quote Managers' });
export const setQuoteManager = (backOfficeId, enabled) =>
  call(`/managers/${backOfficeId}`, { method: 'PUT', body: { enabled }, operation: 'update Quote Manager' });

// Catalog
export const fetchQuoteCategories = () => call('/categories', { operation: 'load categories' });
export const createQuoteCategory = (name) => call('/categories', { method: 'POST', body: { name }, operation: 'create category' });
export const renameQuoteCategory = (id, name) => call(`/categories/${id}`, { method: 'PATCH', body: { name }, operation: 'rename category' });
export const deleteQuoteCategory = (id) => call(`/categories/${id}`, { method: 'DELETE', operation: 'delete category' });

export const fetchQuoteItems = (params) => call(`/items${qs(params)}`, { operation: 'load items' });
export const createQuoteItem = (item) => call('/items', { method: 'POST', body: item, operation: 'create item' });
export const updateQuoteItem = (id, item) => call(`/items/${id}`, { method: 'PATCH', body: item, operation: 'update item' });
export const deleteQuoteItems = (ids) => call('/items/delete', { method: 'POST', body: { ids }, operation: 'delete items' });
export const importQuoteItems = (rows) => call('/items/import', { method: 'POST', body: { rows }, operation: 'import items' });

// Quote leads
export const fetchQuoteLeads = (params) => call(`/leads${qs(params)}`, { operation: 'load leads' });
export const createQuoteLead = (lead) => call('/leads', { method: 'POST', body: lead, operation: 'create lead' });
export const updateQuoteLead = (id, lead) => call(`/leads/${id}`, { method: 'PATCH', body: lead, operation: 'update lead' });
export const deleteQuoteLead = (id) => call(`/leads/${id}`, { method: 'DELETE', operation: 'delete lead' });

// Quotations
export const fetchQuotes = (params) => call(`/${qs(params)}`, { operation: 'load quotations' });
export const createQuote = (leadId) => call('/', { method: 'POST', body: { lead_id: leadId }, operation: 'create quotation' });
export const fetchQuote = (id) => call(`/${id}`, { operation: 'load quotation' });
export const deleteQuote = (id) => call(`/${id}`, { method: 'DELETE', operation: 'delete quotation' });
export const setQuoteStatus = (id, body) => call(`/${id}/status`, { method: 'PATCH', body, operation: 'update status' });
export const createQuoteVersion = (id) => call(`/${id}/versions`, { method: 'POST', operation: 'create version' });
export const fetchQuoteVersion = (id, versionId) => call(`/${id}/versions/${versionId}`, { operation: 'load version' });
export const saveQuoteVersion = (id, versionId, body) =>
  call(`/${id}/versions/${versionId}`, { method: 'PUT', body, operation: 'save quotation' });
