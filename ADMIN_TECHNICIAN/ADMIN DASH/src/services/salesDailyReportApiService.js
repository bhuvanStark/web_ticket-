// Sales Daily Report HTTP calls (/api/sales-daily-reports). Same helpers and
// error handling as leadsApiService.js; nothing outside the Sales module
// imports this file.
import { authFetch, readApiData, authHeaders, API_BASE_URL } from './adminApiService';

async function handle(res, fallbackMessage) {
  const payload = await res.json().catch(() => null);
  if (!res.ok || payload?.success === false) {
    const error = new Error(payload?.error || payload?.message || fallbackMessage);
    error.status = res.status;
    throw error;
  }
  return payload.data;
}

// ---- Sales employee ----

export async function fetchMyReports() {
  const res = await authFetch(`${API_BASE_URL}/sales-daily-reports/mine`, { headers: authHeaders() });
  return readApiData(res, 'fetch daily reports');
}

// items: [{ lead_id, comment } | { is_potential: true, company, comment }]
export async function createTodayReport(items) {
  const res = await authFetch(`${API_BASE_URL}/sales-daily-reports/mine`, {
    method: 'POST', headers: authHeaders(true), body: JSON.stringify({ items })
  });
  return handle(res, 'Failed to save report');
}

export async function updateMyReport(id, items) {
  const res = await authFetch(`${API_BASE_URL}/sales-daily-reports/mine/${id}`, {
    method: 'PUT', headers: authHeaders(true), body: JSON.stringify({ items })
  });
  return handle(res, 'Failed to update report');
}

// ---- Super Admin "View as" (read-only) ----

export async function fetchViewAsReports(salesId) {
  const res = await authFetch(`${API_BASE_URL}/sales-daily-reports/view-as/${salesId}`, { headers: authHeaders() });
  return readApiData(res, 'fetch daily reports');
}

// ---- Admin ----

export async function fetchAllReports({ salesId, from, to } = {}) {
  const params = new URLSearchParams();
  if (salesId) params.set('sales_id', salesId);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const res = await authFetch(`${API_BASE_URL}/sales-daily-reports?${params.toString()}`, { headers: authHeaders() });
  return readApiData(res, 'fetch daily reports');
}

// Who has / hasn't submitted for a day: { date, submitted: [...], missing: [...] }.
export async function fetchReportSubmissionStatus(date) {
  const res = await authFetch(`${API_BASE_URL}/sales-daily-reports/status${date ? `?date=${date}` : ''}`, { headers: authHeaders() });
  return readApiData(res, 'fetch report status');
}
