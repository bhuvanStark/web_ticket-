// Project Category (V1) — all Project/Activity HTTP calls. Additive module:
// reuses adminApiService's authFetch/readApiData/authHeaders/API_BASE_URL
// (the exact same 401-retry + response-shape handling every other admin call
// uses) rather than duplicating them. Does not import from or modify
// anything ticket-related.
import { authFetch, readApiData, authHeaders, API_BASE_URL } from './adminApiService';
import unifiedClient from '../api/unifiedClient';

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

// A project with activity history is refused with err.code 'HAS_ACTIVITIES'
// (and err.activityCount) unless `withHistory` is passed, which archives it
// for 3 days instead (restorable from the Archived tab).
export async function deleteProjectInApi(id, { withHistory = false } = {}) {
  const res = await authFetch(`${API_BASE_URL}/projects/${id}${withHistory ? '?withHistory=true' : ''}`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(payload?.error || 'Failed to delete project');
    err.code = payload?.code === 'HAS_ACTIVITIES' ? 'HAS_ACTIVITIES' : null;
    err.activityCount = payload?.activityCount || 0;
    throw err;
  }
  return payload?.data || { archived: false };
}

export async function fetchArchivedProjects() {
  const res = await authFetch(`${API_BASE_URL}/projects/archived`, { headers: authHeaders() });
  return readApiData(res, 'fetch archived projects');
}

export async function restoreProjectInApi(id) {
  const res = await authFetch(`${API_BASE_URL}/projects/${id}/restore`, {
    method: 'POST',
    headers: authHeaders()
  });
  return readApiData(res, 'restore project');
}

// -- Project Activities --------------------------------------------------

export async function updateActivityStatusInApi(activityId, status) {
  const res = await authFetch(`${API_BASE_URL}/project-activities/${activityId}/status`, {
    method: 'PATCH',
    headers: authHeaders(true),
    body: JSON.stringify({ status })
  });
  return readApiData(res, 'update activity status');
}

// -- Technician-side (own activities) ------------------------------------

export async function fetchMyProjectActivitiesInApi() {
  const res = await authFetch(`${API_BASE_URL}/technician/project-activities`, { headers: authHeaders() });
  return readApiData(res, 'fetch my project activities');
}

// Same data, read through an admin token. Used only while an admin is
// impersonating a technician (the Sidebar "view as technician" switch),
// which never holds a technician-role JWT — mirrors how ticket polling
// always uses the admin-scoped endpoint during impersonation instead of a
// technician-only one.
export async function fetchTechnicianProjectActivitiesInApi(technicianId) {
  const res = await authFetch(`${API_BASE_URL}/admin/technicians/${technicianId}/project-activities`, { headers: authHeaders() });
  return readApiData(res, 'fetch technician project activities');
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

// -- Projects workspace (managers, team, files, approval) ----------------

// Managers/Team picker source: active technicians.
export async function fetchProjectTechnicians() {
  const res = await authFetch(`${API_BASE_URL}/projects/technicians`, { headers: authHeaders() });
  return readApiData(res, 'fetch technicians');
}

// Projects a technician can open. An admin in "view as technician" passes
// that technician's id.
export async function fetchMyProjects(technicianId) {
  const qs = technicianId ? `?technician_id=${encodeURIComponent(technicianId)}` : '';
  const res = await authFetch(`${API_BASE_URL}/project-workspace${qs}`, { headers: authHeaders() });
  return readApiData(res, 'fetch projects');
}

export async function fetchProjectWorkspace(id) {
  const res = await authFetch(`${API_BASE_URL}/project-workspace/${id}`, { headers: authHeaders() });
  return readApiData(res, 'load project');
}

const workspaceCall = async (path, method, body, operation) => {
  const res = await authFetch(`${API_BASE_URL}/project-workspace/${path}`, {
    method,
    headers: authHeaders(body !== undefined),
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  return readApiData(res, operation);
};

export const assignProjectWork = (id, { date, time, technicianIds }) =>
  workspaceCall(`${id}/activities`, 'POST', { scheduled_date: date, scheduled_time: time, technician_ids: technicianIds }, 'assign work');

export const reassignProjectWork = (id, activityId, technicianId) =>
  workspaceCall(`${id}/activities/${activityId}/reassign`, 'PATCH', { technician_id: technicianId }, 'reassign work');

export const cancelProjectWork = (id, activityId) =>
  workspaceCall(`${id}/activities/${activityId}/cancel`, 'PATCH', undefined, 'cancel work');

export const deleteProjectFile = (id, fileId) => workspaceCall(`${id}/files/${fileId}`, 'DELETE', undefined, 'delete file');

export const submitProjectCompletion = (id, fileId) =>
  workspaceCall(`${id}/submit`, 'POST', { file_id: fileId }, 'submit for approval');

export const reviewProjectCompletion = (id, decision, reason) =>
  workspaceCall(`${id}/review`, 'POST', { decision, reason }, 'review completion');

// Raw upload (body = optional JPEG thumbnail + the file) through XHR so the
// UI can show progress. Retries once after refreshing an expired token, like
// authFetch.
export function uploadProjectFile(id, { category, displayName, file, fileName, thumbnail }, onProgress) {
  const send = (token) => new Promise((resolve, reject) => {
    const qs = new URLSearchParams({
      category, display_name: displayName, file_name: fileName || file.name, thumb_bytes: String(thumbnail?.size || 0)
    });
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE_URL}/project-workspace/${id}/files?${qs}`);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      let payload = null;
      try { payload = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
      if (xhr.status >= 200 && xhr.status < 300 && payload?.success !== false) resolve(payload?.data);
      else reject(Object.assign(new Error(payload?.error || payload?.message || 'Upload failed'), { status: xhr.status }));
    };
    xhr.onerror = () => reject(new Error('Upload failed — check your connection'));
    xhr.send(thumbnail ? new Blob([thumbnail, file]) : file);
  });
  return send(localStorage.getItem('admin_access_token')).catch(async (error) => {
    if (error.status !== 401) throw error;
    return send(await unifiedClient.refreshAccessToken());
  });
}

// Files are immutable, so the browser's HTTP cache serves repeat views.
export async function fetchProjectFileBlob(id, fileId, { thumbnail = false } = {}) {
  const res = await authFetch(`${API_BASE_URL}/project-workspace/${id}/files/${fileId}${thumbnail ? '?thumb=1' : ''}`, { headers: authHeaders() });
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new Error(payload?.error || 'Could not open the file');
  }
  return res.blob();
}
