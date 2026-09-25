// TaskPro Sales Module V1 (TaskPro_Sales_RBAC_plan.md §3-9) — all Leads HTTP
// calls, for both the Admin Leads tab and the Sales employee's My Leads
// page. Reuses adminApiService's authFetch/readApiData/authHeaders/
// API_BASE_URL, same pattern as salesApiService.js. Talks to
// /api/sales-leads — a separate resource from /api/sales (the Sales
// employee roster) — so this file never touches salesApiService.js.
import { authFetch, readApiData, authHeaders, API_BASE_URL } from './adminApiService';

async function handle(res, fallbackMessage) {
  const payload = await res.json().catch(() => null);
  if (!res.ok || payload?.success === false) {
    const error = new Error(payload?.error || payload?.message || fallbackMessage);
    error.status = res.status;
    throw error;
  }
  return payload;
}

// ---- Admin ----

export async function fetchLeads({ status, assigned_to, unassigned } = {}) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (assigned_to) params.set('assigned_to', assigned_to);
  if (unassigned) params.set('unassigned', 'true');
  params.set('limit', '200');
  const res = await authFetch(`${API_BASE_URL}/sales-leads?${params.toString()}`, { headers: authHeaders() });
  return readApiData(res, 'fetch leads');
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

export async function deleteLead(id) {
  const res = await authFetch(`${API_BASE_URL}/sales-leads/${id}`, { method: 'DELETE', headers: authHeaders() });
  return handle(res, 'Failed to delete lead');
}

export async function validateImport(rows) {
  const res = await authFetch(`${API_BASE_URL}/sales-leads/import/validate`, {
    method: 'POST', headers: authHeaders(true), body: JSON.stringify({ rows })
  });
  const data = await handle(res, 'Failed to validate import');
  return data.data;
}

export async function confirmImport(rows) {
  const res = await authFetch(`${API_BASE_URL}/sales-leads/import`, {
    method: 'POST', headers: authHeaders(true), body: JSON.stringify({ rows })
  });
  const data = await handle(res, 'Failed to import leads');
  return data.data;
}

// ---- Sales employee ----

export async function fetchPool() {
  const res = await authFetch(`${API_BASE_URL}/sales-leads/pool?limit=200`, { headers: authHeaders() });
  return readApiData(res, 'fetch lead pool');
}

export async function fetchMine() {
  const res = await authFetch(`${API_BASE_URL}/sales-leads/mine?limit=200`, { headers: authHeaders() });
  return readApiData(res, 'fetch my leads');
}

export async function acceptLead(id) {
  const res = await authFetch(`${API_BASE_URL}/sales-leads/${id}/accept`, { method: 'POST', headers: authHeaders() });
  const data = await handle(res, 'Failed to accept lead');
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

export async function updateLeadStatus(id, status) {
  const res = await authFetch(`${API_BASE_URL}/sales-leads/${id}/status`, {
    method: 'PATCH', headers: authHeaders(true), body: JSON.stringify({ status })
  });
  const data = await handle(res, 'Failed to update status');
  return data.data;
}

export async function addFollowUp(id, note, nextActionDate) {
  const res = await authFetch(`${API_BASE_URL}/sales-leads/${id}/follow-ups`, {
    method: 'POST', headers: authHeaders(true), body: JSON.stringify({ note, next_action_date: nextActionDate || null })
  });
  const data = await handle(res, 'Failed to add follow-up');
  return data.data;
}

// ---- Realtime (Phase 7) ----

// EventSource can't send an Authorization header, so the token travels as a
// query param — see routes/leads.js's /stream route for the matching
// server-side check. Returns the EventSource so the caller owns its
// lifecycle (close it on unmount).
export function subscribeToLeadEvents(onEvent) {
  const token = localStorage.getItem('admin_access_token');
  if (!token || typeof EventSource === 'undefined') return null;
  const source = new EventSource(`${API_BASE_URL}/sales-leads/stream?token=${encodeURIComponent(token)}`);
  source.onmessage = (e) => {
    try { onEvent(JSON.parse(e.data)); } catch { /* ignore malformed frame */ }
  };
  // No onerror handling beyond letting EventSource's own auto-reconnect
  // retry — callers additionally poll on an interval (§5 "API refresh
  // fallback"), so a dropped stream degrades to polling rather than going
  // silent.
  return source;
}
