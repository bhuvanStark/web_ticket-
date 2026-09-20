// Project Category (V1) — Daily Project Activity business logic. Additive
// module: does not import from or touch serviceRequestService.js.
import { supabase } from '../config/supabaseClient.js';
import { withTransaction } from '../config/database.js';
import { PostgresQueryBuilder } from '../config/databaseClient.js';

// scope: 'active' (Assigned/Accepted, shown on the project card),
// 'history' (Completed/Cancelled, the Activity History view), or 'all'.
export const listActivitiesForProject = async (projectId, { scope = 'all' } = {}) => {
  let query = supabase
    .from('project_activities')
    .select('*, technician(id, full_name)')
    .eq('project_id', projectId)
    .order('scheduled_date', { ascending: false });

  if (scope === 'active') query = query.in('status', ['Assigned', 'Accepted']);
  if (scope === 'history') query = query.in('status', ['Completed', 'Cancelled']);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to list activities: ${error.message}`);
  return data || [];
};

// Bulk-create one independent activity per technician for one project/date.
// All-or-nothing: this is a single multi-row INSERT, which Postgres runs as
// one statement — if the partial unique index rejects any row (a technician
// already has an active activity that day), the whole statement fails and
// zero rows are created.
export const createActivitiesBulk = async ({ project_id, scheduled_date, scheduled_time, technician_ids }) => {
  const rows = technician_ids.map((technician_id) => ({
    project_id,
    technician_id,
    scheduled_date,
    scheduled_time,
    status: 'Assigned'
  }));

  const { data, error } = await supabase
    .from('project_activities')
    .insert(rows)
    .select('*, technician(id, full_name)');

  if (error) {
    if (error.code === '23505') {
      const err = new Error('One or more selected technicians already have an activity for that date on this project');
      err.code = 'DUPLICATE_ACTIVITY';
      throw err;
    }
    throw new Error(`Failed to assign technicians: ${error.message}`);
  }
  return data;
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

// Light completion: notes + completed_at, no service-report shape (per spec
// §5 — scheduled time and actual completion time are stored separately).
// Requires the activity to already be Accepted — the spec's flow is
// explicitly Assigned -> Accepted -> Completed.
export const completeActivity = async (id, { actorUserId, completion_notes } = {}) => {
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
  if (existing.technician_id !== actorUserId) {
    const err = new Error('This activity is not assigned to you');
    err.code = 'FORBIDDEN';
    throw err;
  }
  if (existing.status !== 'Accepted') {
    const err = new Error(`Activity must be Accepted before it can be completed (currently ${existing.status})`);
    err.code = 'INVALID_TRANSITION';
    throw err;
  }

  const { data, error } = await supabase
    .from('project_activities')
    .update({
      status: 'Completed',
      completion_notes: completion_notes?.trim() || null,
      completed_at: new Date().toISOString()
    })
    .eq('id', id)
    .select('*, technician(id, full_name)')
    .single();
  if (error) throw new Error(`Failed to complete activity: ${error.message}`);
  return data;
};

// Admin reassigns a daily activity to a different technician. History-safe:
// the original row is never deleted, only marked Cancelled; a brand-new row
// is created for the replacement technician. The two writes are wrapped in
// withTransaction (already present in config/database.js, previously
// unused) so they succeed or fail together.
export const reassignActivity = async (id, newTechnicianId) => {
  return withTransaction(async (client) => {
    const existingResult = await new PostgresQueryBuilder('project_activities', client)
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (existingResult.error) throw new Error(existingResult.error.message);
    if (!existingResult.data) {
      const err = new Error('Activity not found');
      err.code = 'NOT_FOUND';
      throw err;
    }
    const original = existingResult.data;

    const cancelResult = await new PostgresQueryBuilder('project_activities', client)
      .update({ status: 'Cancelled' })
      .eq('id', id)
      .select('*')
      .single();
    if (cancelResult.error) throw new Error(cancelResult.error.message);

    const createResult = await new PostgresQueryBuilder('project_activities', client)
      .insert([{
        project_id: original.project_id,
        technician_id: newTechnicianId,
        scheduled_date: original.scheduled_date,
        scheduled_time: original.scheduled_time,
        status: 'Assigned'
      }])
      .select('*')
      .single();
    if (createResult.error) {
      if (createResult.error.code === '23505') {
        const err = new Error('The replacement technician already has an activity for that date on this project');
        err.code = 'DUPLICATE_ACTIVITY';
        throw err;
      }
      throw new Error(createResult.error.message);
    }

    return { cancelled: cancelResult.data, created: createResult.data };
  });
};
