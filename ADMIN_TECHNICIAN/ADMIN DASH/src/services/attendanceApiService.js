// Attendance Category (V1) — all Attendance HTTP calls. Additive module:
// reuses adminApiService's authFetch/readApiData/authHeaders/API_BASE_URL
// (the exact same 401-retry + response-shape handling every other admin
// call uses) rather than duplicating them, same pattern as
// projectApiService.js. Does not import from or modify anything
// ticket/project-related.
import { authFetch, readApiData, authHeaders, API_BASE_URL } from './adminApiService';

// -- Technician self-service ---------------------------------------------

// The authenticated technician's own attendance for the current India day,
// or null if they haven't checked in.
export async function fetchMyAttendanceTodayInApi() {
  const res = await authFetch(`${API_BASE_URL}/attendance/today`, { headers: authHeaders() });
  return readApiData(res, "fetch today's attendance");
}

// `location` is one of the four captured outcomes (see the Geolocation call
// site) — { status, lat, lng, accuracy } — or omitted entirely when the
// browser has no Geolocation API at all (device_unsupported).
export async function checkInInApi(location = {}) {
  const res = await authFetch(`${API_BASE_URL}/attendance/check-in`, {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify({
      location_status: location.status,
      location_lat: location.lat,
      location_lng: location.lng,
      location_accuracy_m: location.accuracy
    })
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    const err = new Error(payload?.error || 'Failed to check in');
    err.code = res.status === 409 ? 'ALREADY_CHECKED_IN' : null;
    err.existing = payload?.data || null;
    throw err;
  }
  return readApiData(res, 'check in');
}

export async function checkOutInApi(recordId) {
  const res = await authFetch(`${API_BASE_URL}/attendance/${recordId}/check-out`, {
    method: 'POST',
    headers: authHeaders(true)
  });
  return readApiData(res, 'check out');
}

// -- Admin ------------------------------------------------------------------

// `card` is one of 'present' | 'not_yet_checked_out' | 'absent', or omitted
// for the full unfiltered daily roster.
export async function fetchAdminAttendanceInApi({ date, technicianId, card, search } = {}) {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  if (technicianId) params.set('technician_id', technicianId);
  if (card) params.set('card', card);
  if (search) params.set('search', search);
  const qs = params.toString();
  const res = await authFetch(`${API_BASE_URL}/admin/attendance${qs ? `?${qs}` : ''}`, { headers: authHeaders() });
  return readApiData(res, 'fetch attendance');
}

export async function fetchAttendanceHistoryInApi(technicianId) {
  const res = await authFetch(`${API_BASE_URL}/admin/attendance/${technicianId}/history`, { headers: authHeaders() });
  return readApiData(res, 'fetch attendance history');
}

export async function markAbsentInApi(technicianId, date) {
  const res = await authFetch(`${API_BASE_URL}/admin/attendance/${technicianId}/mark-absent`, {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify({ date })
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    const err = new Error(payload?.error || 'Failed to mark absent');
    err.code = res.status === 409 ? 'ALREADY_HAS_ATTENDANCE' : null;
    throw err;
  }
  return readApiData(res, 'mark absent');
}

export async function markAllAbsentInApi(date) {
  const res = await authFetch(`${API_BASE_URL}/admin/attendance/mark-all-absent`, {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify({ date })
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    const err = new Error(payload?.error || 'Failed to mark all absent');
    err.code = res.status === 409 ? 'CONFLICT' : null;
    throw err;
  }
  return readApiData(res, 'mark all absent');
}

export async function adminCheckOutInApi(recordId) {
  const res = await authFetch(`${API_BASE_URL}/admin/attendance/${recordId}/check-out`, {
    method: 'POST',
    headers: authHeaders(true)
  });
  return readApiData(res, 'check out');
}

export async function bulkCheckOutInApi(date) {
  const res = await authFetch(`${API_BASE_URL}/admin/attendance/bulk-check-out`, {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify({ date })
  });
  return readApiData(res, 'check out all');
}
