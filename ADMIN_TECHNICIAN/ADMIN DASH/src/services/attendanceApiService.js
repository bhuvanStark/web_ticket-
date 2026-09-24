// Attendance Category (V1) — all Attendance HTTP calls. Additive module:
// reuses adminApiService's authFetch/readApiData/authHeaders/API_BASE_URL
// (the exact same 401-retry + response-shape handling every other admin
// call uses) rather than duplicating them, same pattern as
// projectApiService.js. Does not import from or modify anything
// ticket/project-related.
import { authFetch, readApiData, authHeaders, API_BASE_URL } from './adminApiService';

// -- Employee self-service (Technician | Sales | Back-Office) -------------
// Sales & Back-Office Roles V1 — these three calls are unchanged from
// before that plan: /api/attendance/* already derives identity from
// whichever employee-role JWT is attached (technician/sales/back_office),
// so no employeeType param is needed or accepted here at all.

// The authenticated employee's own attendance for the current India day,
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

// Technician/Sales/Back-Office Nav Parity fix — the authenticated
// employee's own attendance history (up to ~a year), for the new "My
// Attendance" page. Identity comes from the JWT server-side; no id is
// passed here, unlike fetchAttendanceHistoryInApi (admin, addresses an
// arbitrary employee by type+id).
export async function fetchMyAttendanceHistoryInApi() {
  const res = await authFetch(`${API_BASE_URL}/attendance/history`, { headers: authHeaders() });
  return readApiData(res, 'fetch my attendance history');
}

// -- Admin (unified Technician | Sales | Back-Office) ------------------------
// Sales & Back-Office Roles V1 — the Admin Attendance page is now the
// attendance view for all three employee types (plan §8). `employeeType`
// here is the Employee Type filter ('technician' | 'sales' | 'back_office'
// | undefined for "All"); `employeeId` addresses one specific employee
// row's own id (used together with its own `employee_type` for the
// history/mark-absent calls below, since an id alone is ambiguous once
// there are three identity tables).

// `card` is one of 'present' | 'not_yet_checked_out' | 'absent', or omitted
// for the full unfiltered daily roster.
export async function fetchAdminAttendanceInApi({ date, employeeId, card, branch, employeeType, search } = {}) {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  if (employeeId) params.set('employee_id', employeeId);
  if (card) params.set('card', card);
  if (branch) params.set('branch', branch);
  if (employeeType) params.set('employee_type', employeeType);
  if (search) params.set('search', search);
  const qs = params.toString();
  const res = await authFetch(`${API_BASE_URL}/admin/attendance${qs ? `?${qs}` : ''}`, { headers: authHeaders() });
  return readApiData(res, 'fetch attendance');
}

// Export Range selector's data source — one row per employee per day
// across [startDate, endDate], already filtered server-side by whatever
// card/branch/employee-type/search the Admin Attendance page currently has
// applied, so the Export button always exports exactly what's on screen,
// just spanning more days than the single-day list view.
export async function fetchAdminAttendanceExportInApi({ startDate, endDate, card, branch, employeeType, search } = {}) {
  const params = new URLSearchParams();
  params.set('start_date', startDate);
  params.set('end_date', endDate);
  if (card) params.set('card', card);
  if (branch) params.set('branch', branch);
  if (employeeType) params.set('employee_type', employeeType);
  if (search) params.set('search', search);
  const res = await authFetch(`${API_BASE_URL}/admin/attendance/export?${params.toString()}`, { headers: authHeaders() });
  return readApiData(res, 'export attendance');
}

export async function fetchAttendanceHistoryInApi(employeeType, employeeId) {
  const res = await authFetch(`${API_BASE_URL}/admin/attendance/${employeeType}/${employeeId}/history`, { headers: authHeaders() });
  return readApiData(res, 'fetch attendance history');
}

export async function markAbsentInApi(employeeType, employeeId, date) {
  const res = await authFetch(`${API_BASE_URL}/admin/attendance/${employeeType}/${employeeId}/mark-absent`, {
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

// `branch`/`employeeType`/`search` scope the bulk action to exactly the
// same set the Admin page's currently-filtered rows represent — audit fix:
// previously only `date` was sent, so the button's filtered count didn't
// match what the action actually affected.
export async function markAllAbsentInApi(date, { branch, employeeType, search } = {}) {
  const res = await authFetch(`${API_BASE_URL}/admin/attendance/mark-all-absent`, {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify({ date, branch, employee_type: employeeType, search })
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

// Same scoping as markAllAbsentInApi above.
export async function bulkCheckOutInApi(date, { branch, employeeType, search } = {}) {
  const res = await authFetch(`${API_BASE_URL}/admin/attendance/bulk-check-out`, {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify({ date, branch, employee_type: employeeType, search })
  });
  return readApiData(res, 'check out all');
}
