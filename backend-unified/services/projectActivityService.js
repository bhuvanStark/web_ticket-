// Project Category (V1) — Daily Project Activity business logic. Additive
// module: does not import from or touch serviceRequestService.js.
import { supabase } from '../config/supabaseClient.js';
import { expireUnacceptedAssignments } from './projectWorkspaceService.js';

// A technician's own activities, every status — identical shape to
// GET /api/technician/project-activities. Exists so an admin token can read
// a specific technician's activities (e.g. while using "switch into a
// technician's view", which never holds a technician-role JWT — see
// routes/adminRoutes.js `/technicians/:id/project-activities`) without ever
// granting a technician-role-gated route to an admin caller.
export const listActivitiesForTechnician = async (technicianId) => {
  await expireUnacceptedAssignments();
  const { data, error } = await supabase
    .from('project_activities')
    .select('*, project(id, name, customer, location, archived_at)')
    .eq('technician_id', technicianId)
    .order('scheduled_date', { ascending: false });
  if (error) throw new Error(`Failed to list activities: ${error.message}`);
  // Work on a project an admin has archived (deleted with history) is
  // hidden from the technician too.
  return (data || []).filter((a) => !a.project?.archived_at);
};

// scope: 'active' (Assigned/Accepted, shown on the project card),
// 'history' (Completed/Cancelled, the Activity History view), or 'all'.
export const listActivitiesForProject = async (projectId, { scope = 'all' } = {}) => {
  let query = supabase
    .from('project_activities')
    .select('*, technician(id, full_name)')
    .eq('project_id', projectId)
    // Newest first; same-day entries by scheduled time (then insert order)
    // so their order is stable instead of whatever Postgres returns.
    .order('scheduled_date', { ascending: false })
    .order('scheduled_time', { ascending: false })
    .order('created_at', { ascending: false });

  if (scope === 'active') query = query.in('status', ['Assigned', 'Accepted']);
  if (scope === 'history') query = query.in('status', ['Completed', 'Cancelled']);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to list activities: ${error.message}`);
  return data || [];
};

export const getActivityProjectId = async (id) => {
  const { data, error } = await supabase.from('project_activities').select('project_id').eq('id', id).maybeSingle();
  if (error) throw new Error(`Failed to fetch activity: ${error.message}`);
  return data?.project_id || null;
};

// Assigned -> Accepted (or Cancelled). Mirrors the ticket system's generic
// status-PATCH precedent: no dedicated "accept" endpoint exists there
// either. Admin callers are unrestricted; a technician caller may only touch
// their own row.
export const updateActivityStatus = async (id, status, { actorRole, actorUserId } = {}) => {
  const { data: existing, error: fetchError } = await supabase
    .from('project_activities')
    .select('id, technician_id, status')
    .eq('id', id)
    .maybeSingle();
  if (fetchError) throw new Error(`Failed to fetch activity: ${fetchError.message}`);
  if (!existing) {
    const err = new Error('Activity not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  // Allow-list: only an admin, or the technician who owns this specific
  // activity, may change its status. Any other role (customer, team member,
  // or a technician touching someone else's activity) is forbidden.
  const isOwningTechnician = actorRole === 'technician' && existing.technician_id === actorUserId;
  if (actorRole !== 'admin' && !isOwningTechnician) {
    const err = new Error('You are not allowed to update this activity');
    err.code = 'FORBIDDEN';
    throw err;
  }

  // Cancelled is terminal — no further transitions out of it via this
  // generic endpoint (reassignActivity is the only sanctioned way to
  // replace a cancelled activity, and it always creates a new row).
  if (existing.status === 'Cancelled') {
    const err = new Error('This activity is cancelled and cannot be changed');
    err.code = 'INVALID_TRANSITION';
    throw err;
  }

  const { data, error } = await supabase
    .from('project_activities')
    .update({ status })
    .eq('id', id)
    .select('*, technician(id, full_name)')
    .single();
  if (error) throw new Error(`Failed to update activity status: ${error.message}`);
  return data;
};

// Light completion: comment + completed_at, no service-report shape (per spec
// §5 — scheduled time and actual completion time are stored separately).
// Requires the activity to already be Accepted — the spec's flow is
// explicitly Assigned -> Accepted -> Completed. Admin is unrestricted (same
// allow-list as updateActivityStatus above) so "switch into a technician's
// view" — which calls this same route under an admin JWT, never a
// technician one — can complete on the impersonated technician's behalf.
export const completeActivity = async (id, { actorUserId, actorRole, completion_notes } = {}) => {
  const { data: existing, error: fetchError } = await supabase
    .from('project_activities')
    .select('id, technician_id, status')
    .eq('id', id)
    .maybeSingle();
  if (fetchError) throw new Error(`Failed to fetch activity: ${fetchError.message}`);
  if (!existing) {
    const err = new Error('Activity not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  const isOwningTechnician = actorRole === 'technician' && existing.technician_id === actorUserId;
  if (actorRole !== 'admin' && !isOwningTechnician) {
    const err = new Error('This activity is not assigned to you');
    err.code = 'FORBIDDEN';
    throw err;
  }
  if (existing.status !== 'Accepted') {
    const err = new Error(`Activity must be Accepted before it can be completed (currently ${existing.status})`);
    err.code = 'INVALID_TRANSITION';
    throw err;
  }
  // The day's comment (work done / still pending) is mandatory — it is the
  // project's work history the next technician reads before going to site.
  if (!completion_notes?.trim()) {
    const err = new Error('Add a comment: what was done today and what is still pending');
    err.code = 'VALIDATION';
    throw err;
  }

  const { data, error } = await supabase
    .from('project_activities')
    .update({
      status: 'Completed',
      completion_notes: completion_notes.trim(),
      completed_at: new Date().toISOString()
    })
    .eq('id', id)
    .select('*, technician(id, full_name)')
    .single();
  if (error) throw new Error(`Failed to complete activity: ${error.message}`);
  return data;
};
