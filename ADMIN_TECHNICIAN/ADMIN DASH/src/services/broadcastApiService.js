// Broadcasts (backend routes/broadcasts.js + routes/adminBroadcasts.js).
import { authFetch, readApiData, authHeaders, API_BASE_URL } from './adminApiService';

// -- Employee ---------------------------------------------------------------

// My live broadcast I haven't tapped "Got it" on yet, or null.
export async function fetchMyBroadcastInApi() {
  const res = await authFetch(`${API_BASE_URL}/broadcasts/mine`, { headers: authHeaders() });
  return readApiData(res, 'fetch broadcast');
}

export async function markBroadcastSeenInApi(id) {
  const res = await authFetch(`${API_BASE_URL}/broadcasts/${id}/seen`, { method: 'POST', headers: authHeaders(true) });
  return readApiData(res, 'mark broadcast seen');
}

export async function acknowledgeBroadcastInApi(id) {
  const res = await authFetch(`${API_BASE_URL}/broadcasts/${id}/acknowledge`, { method: 'POST', headers: authHeaders(true) });
  return readApiData(res, 'acknowledge broadcast');
}

// -- Admin ------------------------------------------------------------------

export async function fetchBroadcastsInApi() {
  const res = await authFetch(`${API_BASE_URL}/admin/broadcasts`, { headers: authHeaders() });
  return readApiData(res, 'fetch broadcasts');
}

// Every active employee, each with `live_broadcast` set when they're already in one.
export async function fetchBroadcastEmployeesInApi() {
  const res = await authFetch(`${API_BASE_URL}/admin/broadcasts/employees`, { headers: authHeaders() });
  return readApiData(res, 'fetch employees');
}

export async function fetchBroadcastRecipientsInApi(id) {
  const res = await authFetch(`${API_BASE_URL}/admin/broadcasts/${id}/recipients`, { headers: authHeaders() });
  return readApiData(res, 'fetch recipients');
}

export async function createBroadcastInApi(payload) {
  const res = await authFetch(`${API_BASE_URL}/admin/broadcasts`, {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify(payload)
  });
  return readApiData(res, 'send broadcast');
}

export async function endBroadcastInApi(id) {
  const res = await authFetch(`${API_BASE_URL}/admin/broadcasts/${id}/end`, { method: 'POST', headers: authHeaders(true) });
  return readApiData(res, 'end broadcast');
}

export async function deleteBroadcastInApi(id) {
  const res = await authFetch(`${API_BASE_URL}/admin/broadcasts/${id}`, { method: 'DELETE', headers: authHeaders() });
  return readApiData(res, 'delete broadcast');
}

export async function removeBroadcastRecipientInApi(id, employeeType, employeeId) {
  const res = await authFetch(`${API_BASE_URL}/admin/broadcasts/${id}/recipients/${employeeType}/${employeeId}`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  return readApiData(res, 'remove person from broadcast');
}
