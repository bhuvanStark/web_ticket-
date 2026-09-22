// Sales & Back-Office Roles V1 — all Back-Office roster HTTP calls.
// Identical shape to salesApiService.js; kept separate rather than
// parameterizing one module over both, matching this codebase's existing
// precedent of per-entity service files. URL path is kebab-case
// (/api/back-office) matching the backend route; the JWT role/DB table stay
// back_office (underscored) — see routes/backOffice.js.
import { authFetch, readApiData, authHeaders, API_BASE_URL } from './adminApiService';

export async function fetchBackOfficeInApi() {
  const res = await authFetch(`${API_BASE_URL}/back-office`, { headers: authHeaders() });
  return readApiData(res, 'fetch Back-Office roster');
}

export async function createBackOfficeInApi(payload) {
  const res = await authFetch(`${API_BASE_URL}/back-office`, {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || 'Failed to create Back-Office employee');
  }
  return readApiData(res, 'create Back-Office employee');
}

export async function updateBackOfficeInApi(id, payload) {
  const res = await authFetch(`${API_BASE_URL}/back-office/${id}`, {
    method: 'PATCH',
    headers: authHeaders(true),
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || 'Failed to update Back-Office employee');
  }
  return readApiData(res, 'update Back-Office employee');
}

export async function deleteBackOfficeInApi(id) {
  const res = await authFetch(`${API_BASE_URL}/back-office/${id}`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const err = new Error(body?.error || 'Failed to delete Back-Office employee');
    err.code = res.status === 409 ? 'HAS_ATTENDANCE' : null;
    throw err;
  }
  return true;
}
