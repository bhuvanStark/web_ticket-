// Staff removal (backend services/staffRemovalService.js) — the same three
// calls for Technicians, Sales and Back-Office.
import { authFetch, readApiData, authHeaders, API_BASE_URL } from './adminApiService';

const PATHS = { technician: 'technicians', sales: 'sales', back_office: 'back-office' };

const url = (role, id, suffix = '') => `${API_BASE_URL}/${PATHS[role]}/${id}${suffix}`;

// What Remove / Delete would do: counts of tickets, leads and attendance,
// plus canDelete (true only when there is no work history).
export async function fetchRemovalPreviewInApi(role, id) {
  const res = await authFetch(url(role, id, '/removal-preview'), { headers: authHeaders() });
  return readApiData(res, 'load removal details');
}

// Locks them out for good, deletes their attendance, hands over open work.
export async function removeStaffInApi(role, id) {
  const res = await authFetch(url(role, id, '/remove'), { method: 'POST', headers: authHeaders(true) });
  return readApiData(res, 'remove employee');
}

// Permanent; refused by the backend when the person has work history.
export async function deleteStaffInApi(role, id) {
  const res = await authFetch(url(role, id), { method: 'DELETE', headers: authHeaders() });
  return readApiData(res, 'delete employee');
}
