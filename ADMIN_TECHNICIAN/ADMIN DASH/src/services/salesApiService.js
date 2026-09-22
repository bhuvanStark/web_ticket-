// Sales & Back-Office Roles V1 — all Sales roster HTTP calls. Additive
// module: reuses adminApiService's authFetch/readApiData/authHeaders/
// API_BASE_URL (the exact same 401-retry + response-shape handling every
// other admin call uses), same pattern as attendanceApiService.js /
// projectApiService.js. Does not import from or modify anything
// ticket/project/technician-related.
import { authFetch, readApiData, authHeaders, API_BASE_URL } from './adminApiService';

export async function fetchSalesInApi() {
  const res = await authFetch(`${API_BASE_URL}/sales`, { headers: authHeaders() });
  return readApiData(res, 'fetch Sales roster');
}

export async function createSalesInApi(payload) {
  const res = await authFetch(`${API_BASE_URL}/sales`, {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || 'Failed to create Sales employee');
  }
  return readApiData(res, 'create Sales employee');
}

export async function updateSalesInApi(id, payload) {
  const res = await authFetch(`${API_BASE_URL}/sales/${id}`, {
    method: 'PATCH',
    headers: authHeaders(true),
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || 'Failed to update Sales employee');
  }
  return readApiData(res, 'update Sales employee');
}

export async function deleteSalesInApi(id) {
  const res = await authFetch(`${API_BASE_URL}/sales/${id}`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const err = new Error(body?.error || 'Failed to delete Sales employee');
    err.code = res.status === 409 ? 'HAS_ATTENDANCE' : null;
    throw err;
  }
  return true;
}
