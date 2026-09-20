// Project Category (V1) — project-level business logic. Additive module:
// does not import from or touch serviceRequestService.js in any way.
import { supabase } from '../config/supabaseClient.js';

// List projects for the Admin Projects screen. `tab` optionally scopes the
// two views the spec calls for (§8): 'active' = Planning + Active,
// 'completed' = Completed. Omitted (or any other value) returns every
// project regardless of status — the frontend's global poll fetches
// everything once and filters tabs client-side, exactly like it already
// does for tickets. `search` matches name/customer/location/id.
export const listProjects = async ({ tab, search = '' } = {}) => {
  try {
    let query = supabase
      .from('projects')
      .select('*, admin(id, full_name, email)')
      .order('created_at', { ascending: false });

    if (tab === 'completed') query = query.eq('status', 'Completed');
    else if (tab === 'active') query = query.in('status', ['Planning', 'Active']);

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      query = query.or(`name.ilike.${term},customer.ilike.${term},location.ilike.${term},id.ilike.${term}`);
    }

    const { data: projects, error } = await query;
    if (error) throw error;
    if (!projects?.length) return [];

    // The query builder has no GROUP BY support, so the "current daily
    // assignments" summary (§8) is a second targeted query, grouped in JS —
    // same technique used everywhere else in this codebase for anything the
    // fluent builder can't express directly.
    const projectIds = projects.map((p) => p.id);
    const { data: activeActivities, error: activityError } = await supabase
      .from('project_activities')
      .select('*, technician(id, full_name)')
      .in('project_id', projectIds)
      .in('status', ['Assigned', 'Accepted'])
      .order('scheduled_date', { ascending: true });
    if (activityError) throw activityError;

    const byProject = new Map();
    for (const activity of activeActivities || []) {
      if (!byProject.has(activity.project_id)) byProject.set(activity.project_id, []);
      byProject.get(activity.project_id).push({
        id: activity.id,
        technician_id: activity.technician_id,
        technician_name: activity.technician?.full_name || null,
        scheduled_date: activity.scheduled_date,
        scheduled_time: activity.scheduled_time,
        status: activity.status
      });
    }

    return projects.map((project) => ({
      ...project,
      active_activities: byProject.get(project.id) || []
    }));
  } catch (error) {
    throw new Error(`Failed to list projects: ${error.message}`);
  }
};

export const getProjectById = async (id) => {
  try {
    const { data, error } = await supabase
      .from('projects')
      .select('*, admin(id, full_name, email)')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  } catch (error) {
    throw new Error(`Failed to fetch project: ${error.message}`);
  }
};

export const createProject = async (payload) => {
  try {
    const insertPayload = Object.fromEntries(
      Object.entries({
        name: payload.name?.trim(),
        customer: payload.customer?.trim(),
        location: payload.location?.trim(),
        start_date: payload.start_date || null,
        end_date: payload.end_date || null,
        description: payload.description?.trim() || null,
        responsible_admin_id: payload.responsible_admin_id || null,
        status: 'Planning'
      }).filter(([, value]) => value !== undefined)
    );

    // No `id` key here — the column DEFAULT (nextval on project_id_seq) fires.
    const { data, error } = await supabase
      .from('projects')
      .insert([insertPayload])
      .select('*, admin(id, full_name, email)')
      .single();
    if (error) throw error;
    return data;
  } catch (error) {
    throw new Error(`Failed to create project: ${error.message}`);
  }
};

export const updateProject = async (id, payload) => {
  try {
    const allowed = ['name', 'customer', 'location', 'start_date', 'end_date', 'description', 'responsible_admin_id'];
    const updateData = {};
    for (const key of allowed) {
      if (key in payload) {
        updateData[key] = typeof payload[key] === 'string' ? payload[key].trim() || null : (payload[key] ?? null);
      }
    }
    if (Object.keys(updateData).length === 0) throw new Error('No updatable fields provided');

    const { data, error } = await supabase
      .from('projects')
      .update(updateData)
      .eq('id', id)
      .select('*, admin(id, full_name, email)')
      .single();
    if (error) throw error;
    return data;
  } catch (error) {
    throw new Error(`Failed to update project: ${error.message}`);
  }
};

// Admin explicitly closes the project. Blocked while any daily activity is
// still Assigned/Accepted (spec §9) — completing a daily activity never
// auto-completes the project.
export const markProjectComplete = async (id) => {
  const { data: unresolved, error: unresolvedError } = await supabase
    .from('project_activities')
    .select('id')
    .eq('project_id', id)
    .in('status', ['Assigned', 'Accepted']);
  if (unresolvedError) throw new Error(`Failed to check activities: ${unresolvedError.message}`);

  if (unresolved && unresolved.length > 0) {
    const err = new Error(`Cannot mark project complete: ${unresolved.length} activity(ies) still active`);
    err.code = 'UNRESOLVED_ACTIVITIES';
    err.count = unresolved.length;
    throw err;
  }

  const { data, error } = await supabase
    .from('projects')
    .update({ status: 'Completed' })
    .eq('id', id)
    .select('*, admin(id, full_name, email)')
    .single();
  if (error) throw new Error(`Failed to mark project complete: ${error.message}`);
  return data;
};

// FK is ON DELETE RESTRICT, so this fails cleanly (23503) once any activity
// exists — never a silent history loss.
export const deleteProject = async (id) => {
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) {
    if (error.code === '23503') {
      const err = new Error('Cannot delete a project that has activity history');
      err.code = 'HAS_ACTIVITIES';
      throw err;
    }
    throw new Error(`Failed to delete project: ${error.message}`);
  }
};

// Responsible-Admin dropdown source.
export const listResponsibleAdmins = async () => {
  const { data, error } = await supabase
    .from('admins')
    .select('id, full_name, email')
    .eq('is_active', true)
    .order('full_name', { ascending: true });
  if (error) throw new Error(`Failed to list admins: ${error.message}`);
  return data || [];
};
