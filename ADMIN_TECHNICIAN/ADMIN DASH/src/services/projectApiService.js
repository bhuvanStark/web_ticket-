// Project Category (V1) — all Project/Activity HTTP calls. Additive module:
// reuses adminApiService's authFetch/readApiData/authHeaders/API_BASE_URL
// (the exact same 401-retry + response-shape handling every other admin call
// uses) rather than duplicating them. Does not import from or modify
// anything ticket-related.
import { authFetch, readApiData, authHeaders, API_BASE_URL } from './adminApiService';

// -- Projects ----------------------------------------------------------

// No `tab` by default: returns every project regardless of status. The
// global poll in AppContext fetches everything once; ProjectsPage filters
// the Active/Planning vs Completed tabs client-side, same pattern the app
// already uses for tickets. Pass `tab` explicitly only for a scoped fetch.
export async function fetchProjects({ tab, search = '' } = {}) {
  const params = new URLSearchParams();
  if (tab) params.set('tab', tab);
  if (search) params.set('search', search);
  const qs = params.toString();
  const res = await authFetch(`${API_BASE_URL}/projects${qs ? `?${qs}` : ''}`, { headers: authHeaders() });
  return readApiData(res, 'fetch projects');
}

export async function fetchResponsibleAdmins() {
  const res = await authFetch(`${API_BASE_URL}/projects/admins`, { headers: authHeaders() });
  return readApiData(res, 'fetch admins');
}

export async function fetchProjectDetail(id) {
  const res = await authFetch(`${API_BASE_URL}/projects/${id}`, { headers: authHeaders() });
  return readApiData(res, 'fetch project');
}

export async function createProjectInApi(payload) {
  const res = await authFetch(`${API_BASE_URL}/projects`, {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify(payload)
  });
  return readApiData(res, 'create project');
}

export async function updateProjectInApi(id, payload) {
  const res = await authFetch(`${API_BASE_URL}/projects/${id}`, {
    method: 'PATCH',
    headers: authHeaders(true),
    body: JSON.stringify(payload)
  });
  return readApiData(res, 'update project');
}

export async function markProjectCompleteInApi(id) {
  const res = await authFetch(`${API_BASE_URL}/projects/${id}/complete`, {
    method: 'PATCH',
    headers: authHeaders(true)
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    const err = new Error(payload?.error || 'Failed to mark project complete');
    err.code = res.status === 409 ? 'UNRESOLVED_ACTIVITIES' : null;
    throw err;
  }
  return readApiData(res, 'mark project complete');
}

export async function deleteProjectInApi(id) {
  const res = await authFetch(`${API_BASE_URL}/projects/${id}`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    const err = new Error(payload?.error || 'Failed to delete project');
    err.code = res.status === 409 ? 'HAS_ACTIVITIES' : null;
    throw err;
  }
  return true;
}

// -- Project Activities --------------------------------------------------

export async function fetchProjectActivities(projectId, scope = 'all') {
  const res = await authFetch(`${API_BASE_URL}/projects/${projectId}/activities?scope=${scope}`, { headers: authHeaders() });
  return readApiData(res, 'fetch project activities');
}

// Bulk-assign one activity per selected technician. All-or-nothing: a 409
// means at least one technician already had an active activity that date.
export async function assignProjectActivitiesInApi(projectId, { scheduledDate, scheduledTime, technicianIds }) {
  const res = await authFetch(`${API_BASE_URL}/projects/${projectId}/activities`, {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify({
      scheduled_date: scheduledDate,
      scheduled_time: scheduledTime,
      technician_ids: technicianIds
    })
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    const err = new Error(payload?.error || 'Failed to assign technicians');
    err.code = res.status === 409 ? 'DUPLICATE_ACTIVITY' : null;
    throw err;
  }
  return readApiData(res, 'assign project activities');
}

export async function updateActivityStatusInApi(activityId, status) {
  const res = await authFetch(`${API_BASE_URL}/project-activities/${activityId}/status`, {
    method: 'PATCH',
    headers: authHeaders(true),
    body: JSON.stringify({ status })
  });
  return readApiData(res, 'update activity status');
}

export async function reassignActivityInApi(activityId, newTechnicianId) {
  const res = await authFetch(`${API_BASE_URL}/project-activities/${activityId}/reassign`, {
    method: 'PATCH',
    headers: authHeaders(true),
    body: JSON.stringify({ technician_id: newTechnicianId })
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    const err = new Error(payload?.error || 'Failed to reassign activity');
    err.code = res.status === 409 ? 'DUPLICATE_ACTIVITY' : null;
    throw err;
  }
  return readApiData(res, 'reassign activity');
}

// -- Technician-side (own activities) ------------------------------------

export async function fetchMyProjectActivitiesInApi() {
  const res = await authFetch(`${API_BASE_URL}/technician/project-activities`, { headers: authHeaders() });
  return readApiData(res, 'fetch my project activities');
}

export async function completeActivityInApi(activityId, completionNotes) {
  const res = await authFetch(`${API_BASE_URL}/technician/project-activities/${activityId}/complete`, {
    method: 'PATCH',
    headers: authHeaders(true),
    body: JSON.stringify({ completion_notes: completionNotes })
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    const err = new Error(payload?.error || 'Failed to complete activity');
    err.code = res.status === 409 ? 'INVALID_TRANSITION' : null;
    throw err;
  }
  return readApiData(res, 'complete activity');
}
