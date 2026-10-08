// TaskPro Sales Module V1 (TaskPro_Sales_RBAC_plan.md §3-9) — all Leads HTTP
// calls, for both the Admin Leads tab and the Sales employee's My Leads
// page. Reuses adminApiService's authFetch/readApiData/authHeaders/
// API_BASE_URL, same pattern as salesApiService.js. Talks to
// /api/sales-leads — a separate resource from /api/sales (the Sales
// employee roster) — so this file never touches salesApiService.js.
import { authFetch, readApiData, authHeaders, API_BASE_URL } from './adminApiService';

// Errors carry the backend's `code` (DUPLICATE_LEAD, LEAD_FROZEN) and any
// `duplicates`, so forms can show the duplicate warning.
async function handle(res, fallbackMessage) {
  const payload = await res.json().catch(() => null);
  if (!res.ok || payload?.success === false) {
    const error = new Error(payload?.error || payload?.message || fallbackMessage);
    error.status = res.status;
    error.code = payload?.code;
    error.duplicates = payload?.duplicates;
    throw error;
  }
  return payload;
}

// List endpoints are paged on the server; `total` is the full count of
// matching leads, used for the page controls.
async function readPage(res, fallbackMessage) {
  const payload = await handle(res, fallbackMessage);
  const rows = Array.isArray(payload.data) ? payload.data : [];
  return { rows, total: payload.pagination?.total ?? rows.length };
}

// ---- Admin ----

// One page of the Admin lead list: { rows, total }. Filters and search
// (`q`: company, phone, Ref ID, contact) run on the server over every lead.
export async function fetchLeads({ status, assigned_to, unassigned, overdue, expired, wonRequests, archived, q, limit = 15, offset = 0 } = {}) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (assigned_to) params.set('assigned_to', assigned_to);
  if (unassigned) params.set('unassigned', 'true');
  if (overdue) params.set('overdue', 'true');
  if (expired) params.set('expired', 'true');
  if (wonRequests) params.set('won_requests', 'true');
  if (archived) params.set('archived', 'true');
  if (q) params.set('q', q);
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  const res = await authFetch(`${API_BASE_URL}/sales-leads?${params.toString()}`, { headers: authHeaders() });
  return readPage(res, 'Failed to fetch leads');
}

export async function createLead(payload) {
  const res = await authFetch(`${API_BASE_URL}/sales-leads`, {
    method: 'POST', headers: authHeaders(true), body: JSON.stringify(payload)
  });
  const data = await handle(res, 'Failed to create lead');
  return data.data;
}

export async function updateLead(id, payload) {
  const res = await authFetch(`${API_BASE_URL}/sales-leads/${id}`, {
    method: 'PUT', headers: authHeaders(true), body: JSON.stringify(payload)
  });
  const data = await handle(res, 'Failed to update lead');
  return data.data;
}

export async function assignLead(id, salesId) {
  const res = await authFetch(`${API_BASE_URL}/sales-leads/${id}/assign`, {
    method: 'POST', headers: authHeaders(true), body: JSON.stringify({ sales_id: salesId })
  });
  const data = await handle(res, 'Failed to assign lead');
  return data.data;
}

// Assigns many leads to one salesperson. Returns { assigned, skipped, skippedIds }.
export async function assignLeadsBulk(leadIds, salesId) {
  const res = await authFetch(`${API_BASE_URL}/sales-leads/assign-bulk`, {
    method: 'POST', headers: authHeaders(true), body: JSON.stringify({ lead_ids: leadIds, sales_id: salesId })
  });
  const data = await handle(res, 'Failed to assign leads');
  return data.data;
}

// Admin decision on an expired stage. action: 'ignore' | 'restart' (give
// back to the same salesperson) | 'reassign' (new lead for salesId).
export async function resolveExpiredLead(id, action, salesId) {
  const res = await authFetch(`${API_BASE_URL}/sales-leads/${id}/expiry`, {
    method: 'POST', headers: authHeaders(true), body: JSON.stringify({ action, ...(salesId ? { sales_id: salesId } : {}) })
  });
  const data = await handle(res, 'Failed to update the expired lead');
  return data.data;
}

// Admin decision on a Sales Won request. action: 'approve' | 'reject'
// (reject needs a reason).
export async function resolveWonRequest(id, action, reason) {
  const res = await authFetch(`${API_BASE_URL}/sales-leads/${id}/won-request`, {
    method: 'POST', headers: authHeaders(true), body: JSON.stringify({ action, ...(reason ? { reason } : {}) })
  });
  const data = await handle(res, 'Failed to update the Won request');
  return data.data;
}

export async function deleteLead(id) {
  const res = await authFetch(`${API_BASE_URL}/sales-leads/${id}`, { method: 'DELETE', headers: authHeaders() });
  return handle(res, 'Failed to delete lead');
}

// Bulk delete: per lead, hard delete if it has no history, otherwise archive.
// Returns { deleted, archived, skipped, skippedIds }.
export async function deleteLeadsBulk(leadIds) {
  const res = await authFetch(`${API_BASE_URL}/sales-leads/delete-bulk`, {
    method: 'POST', headers: authHeaders(true), body: JSON.stringify({ lead_ids: leadIds })
  });
  const data = await handle(res, 'Failed to delete leads');
  return data.data;
}

export async function validateImport(rows) {
  const res = await authFetch(`${API_BASE_URL}/sales-leads/import/validate`, {
    method: 'POST', headers: authHeaders(true), body: JSON.stringify({ rows })
  });
  const data = await handle(res, 'Failed to validate import');
  return data.data;
}

export async function confirmImport(rows, includeDuplicates = false) {
  const res = await authFetch(`${API_BASE_URL}/sales-leads/import`, {
    method: 'POST', headers: authHeaders(true), body: JSON.stringify({ rows, include_duplicates: includeDuplicates })
  });
  const data = await handle(res, 'Failed to import leads');
  return data.data;
}

// Summary cards above the Admin lead table: { unassigned, taken, won }, each
// { count, value, missingValue }.
export async function fetchLeadsSummary() {
  const res = await authFetch(`${API_BASE_URL}/sales-leads/summary`, { headers: authHeaders() });
  return readApiData(res, 'fetch lead summary');
}

// Analytics tab. period: 'all' | 'month' | 'week'.
export async function fetchLeadsAnalytics(period = 'all') {
  const res = await authFetch(`${API_BASE_URL}/sales-leads/analytics?period=${encodeURIComponent(period)}`, { headers: authHeaders() });
  return readApiData(res, 'fetch lead analytics');
}

// ---- Super Admin "View as Sales employee" (read-only) ----

export async function fetchViewAsSummary(salesId) {
  const res = await authFetch(`${API_BASE_URL}/sales-leads/view-as/${salesId}/summary`, { headers: authHeaders() });
  return readApiData(res, 'fetch lead summary');
}

const mineQuery = ({ scope = 'active', status, q, limit = 15, offset = 0 } = {}) => {
  const params = new URLSearchParams({ scope, limit: String(limit), offset: String(offset) });
  if (status) params.set('status', status);
  if (q) params.set('q', q);
  return params.toString();
};

// One page of a salesperson's leads: { rows, total }. scope: 'active' |
// 'closed' | 'due' | 'all'; `status` narrows to one stage; `q` searches.
export async function fetchViewAsMine(salesId, options) {
  const res = await authFetch(`${API_BASE_URL}/sales-leads/view-as/${salesId}/mine?${mineQuery(options)}`, { headers: authHeaders() });
  return readPage(res, 'Failed to fetch leads');
}

// ---- Sales employee ----

// Dashboard cards + My Leads strip: { taken, won, dueSoon, overdue, lost,
// dueToday, stages: { new: { count, overdue }, ... } } over all own leads.
export async function fetchMySummary() {
  const res = await authFetch(`${API_BASE_URL}/sales-leads/mine/summary`, { headers: authHeaders() });
  return readApiData(res, 'fetch lead summary');
}

// Same options and shape as fetchViewAsMine, for the signed-in salesperson.
export async function fetchMine(options) {
  const res = await authFetch(`${API_BASE_URL}/sales-leads/mine?${mineQuery(options)}`, { headers: authHeaders() });
  return readPage(res, 'Failed to fetch my leads');
}

// Creates a lead owned by the signed-in Sales employee.
export async function createMyLead(payload) {
  const res = await authFetch(`${API_BASE_URL}/sales-leads/mine`, {
    method: 'POST', headers: authHeaders(true), body: JSON.stringify(payload)
  });
  const data = await handle(res, 'Failed to create lead');
  return data.data;
}

// Edits the fields of a lead the signed-in Sales employee owns (open leads only).
export async function updateMyLead(id, payload) {
  const res = await authFetch(`${API_BASE_URL}/sales-leads/${id}/details`, {
    method: 'PUT', headers: authHeaders(true), body: JSON.stringify(payload)
  });
  const data = await handle(res, 'Failed to update lead');
  return data.data;
}

export async function releaseLead(id, reason) {
  const res = await authFetch(`${API_BASE_URL}/sales-leads/${id}/release`, {
    method: 'POST', headers: authHeaders(true), body: JSON.stringify({ reason })
  });
  const data = await handle(res, 'Failed to release lead');
  return data.data;
}

// ---- Shared (admin + owning Sales employee) ----

export async function fetchLead(id) {
  const res = await authFetch(`${API_BASE_URL}/sales-leads/${id}`, { headers: authHeaders() });
  const data = await handle(res, 'Failed to fetch lead');
  return data.data;
}

export async function fetchLeadHistory(id) {
  const res = await authFetch(`${API_BASE_URL}/sales-leads/${id}/history`, { headers: authHeaders() });
  const data = await handle(res, 'Failed to fetch lead history');
  return data.data;
}

// `fields` may carry { value_estimate, ref_id } for a move to Proposal/
// Follow-up/Hold, { lost_reason, lost_note } for Lost/Dead, and
// { confirm_duplicate } for an Admin Won on an already-Won customer — all
// saved atomically with the status. A Sales Won on a lead with duplicates
// comes back with won_request_pending: true (waiting for Admin).
export async function updateLeadStatus(id, status, fields = {}) {
  const res = await authFetch(`${API_BASE_URL}/sales-leads/${id}/status`, {
    method: 'PATCH', headers: authHeaders(true), body: JSON.stringify({ status, ...fields })
  });
  const data = await handle(res, 'Failed to update status');
  return data.data;
}

export async function updateLeadRemarks(id, remarks) {
  const res = await authFetch(`${API_BASE_URL}/sales-leads/${id}/remarks`, {
    method: 'PATCH', headers: authHeaders(true), body: JSON.stringify({ remarks })
  });
  const data = await handle(res, 'Failed to save remarks');
  return data.data;
}

// nextActionDate: 'YYYY-MM-DD' sets the next follow-up, null/'' clears it,
// undefined leaves it unchanged.
export async function addFollowUp(id, note, nextActionDate) {
  const res = await authFetch(`${API_BASE_URL}/sales-leads/${id}/follow-ups`, {
    method: 'POST', headers: authHeaders(true),
    body: JSON.stringify({ note: note || null, ...(nextActionDate !== undefined ? { next_action_date: nextActionDate || null } : {}) })
  });
  const data = await handle(res, 'Failed to add follow-up');
  return data.data;
}

// ---- Realtime (Phase 7) ----

const STREAM_RETRY_MS = 5000;
const EVENT_DEBOUNCE_MS = 1000;

// Subscribes to lead events. The long-lived access token never goes in the
// URL: each connection first trades it (header auth) for a single-use,
// 60-second ticket — see routes/leads.js /stream-ticket. Bursts of events
// (e.g. a bulk assign) are coalesced into one onEvent call. A dropped or
// refused stream reconnects with a fresh ticket; callers also poll, so a
// stream that stays down degrades to polling rather than going silent.
// Returns { close } — call it on unmount.
export function subscribeToLeadEvents(onEvent) {
  if (typeof EventSource === 'undefined' || !localStorage.getItem('admin_access_token')) return null;
  let closed = false;
  let source = null;
  let retryTimer = null;
  let debounceTimer = null;
  let lastEvent = null;

  const fire = (event) => {
    lastEvent = event;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { if (!closed) onEvent(lastEvent); }, EVENT_DEBOUNCE_MS);
  };

  const retry = () => {
    if (closed) return;
    clearTimeout(retryTimer);
    retryTimer = setTimeout(connect, STREAM_RETRY_MS);
  };

  async function connect() {
    if (closed) return;
    try {
      const res = await authFetch(`${API_BASE_URL}/sales-leads/stream-ticket`, { method: 'POST', headers: authHeaders() });
      const payload = await handle(res, 'Failed to open live updates');
      if (closed) return;
      source = new EventSource(`${API_BASE_URL}/sales-leads/stream?ticket=${encodeURIComponent(payload.data.ticket)}`);
      source.onmessage = (e) => {
        try { fire(JSON.parse(e.data)); } catch { /* ignore malformed frame */ }
      };
      // The ticket is single-use, so EventSource's own reconnect can't work:
      // close it and reconnect with a new ticket.
      source.onerror = () => {
        source?.close();
        source = null;
        retry();
      };
    } catch {
      // Signed out / no Sales access: stop quietly unless it may recover.
      if (localStorage.getItem('admin_access_token')) retry();
    }
  }

  connect();
  return {
    close() {
      closed = true;
      clearTimeout(retryTimer);
      clearTimeout(debounceTimer);
      source?.close();
    }
  };
}
