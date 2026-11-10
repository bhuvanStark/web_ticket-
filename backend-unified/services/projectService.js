// Project Category (V1) — project-level business logic. Additive module:
// does not import from or touch serviceRequestService.js in any way.
import { supabase } from '../config/supabaseClient.js';
import { withTransaction } from '../config/database.js';
import { listMembers, setTeam, logProjectEvent, expireUnacceptedAssignments } from './projectWorkspaceService.js';

// A project deleted together with its history stays archived (hidden,
// restorable) for this long before it is purged for good.
export const ARCHIVE_RETENTION_DAYS = 3;

// List projects for the Admin Projects screen. `tab` optionally scopes the
// two views the spec calls for (§8): 'active' = Planning + Active,
// 'completed' = Completed. Omitted (or any other value) returns every
// project regardless of status — the frontend's global poll fetches
// everything once and filters tabs client-side, exactly like it already
// does for tickets. `search` matches name/customer/location/id.
export const listProjects = async ({ tab, search = '' } = {}) => {
  try {
    await purgeExpiredArchivedProjects();
    await expireUnacceptedAssignments();

    let query = supabase
      .from('projects')
      .select('*, admin(id, full_name, email)')
      .is('archived_at', null)
      .order('created_at', { ascending: false });

    if (tab === 'completed') query = query.eq('status', 'Completed');
    else if (tab === 'active') query = query.in('status', ['Planning', 'Active']);
    else if (tab === 'pending') query = query.eq('status', 'Pending Approval');

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      query = query.or(`name.ilike.${term},customer.ilike.${term},location.ilike.${term},id.ilike.${term}`);
    }

    const { data: projects, error } = await query;
    if (error) throw error;
    return await enrichProjects(projects || []);
  } catch (error) {
    throw new Error(`Failed to list projects: ${error.message}`);
  }
};

// Adds the current daily assignments, managers and team to project rows.
const enrichProjects = async (projects) => {
  if (!projects.length) return [];

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

  const members = await listMembers(projectIds);
  return projects.map((project) => withTeam({
    ...project,
    active_activities: byProject.get(project.id) || []
  }, members.get(project.id)));
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

// Managers (technicians who run the project) and the view-only team, plus
// the counts the list shows.
const withTeam = (project, members = []) => ({
  ...project,
  managers: members.filter((m) => m.role === 'manager'),
  team: members.filter((m) => m.role === 'viewer'),
  team_size: members.length
});

const toDateOrNull = (value) => (value ? String(value).slice(0, 10) : null);
const textOrNull = (value) => (typeof value === 'string' ? value.trim() || null : value ?? null);

// One project in the same shape as a listProjects row.
const getProjectSummary = async (id) => {
  const project = await getProjectById(id);
  if (!project) return null;
  const [enriched] = await enrichProjects([project]);
  return enriched;
};

// Create + team in one transaction: a bad team selection never leaves a
// half-created project behind.
export const createProject = async (payload, actor) => {
  const id = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO projects (name, customer, location, start_date, end_date, description, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'Planning') RETURNING id`,
      [payload.name.trim(), payload.customer.trim(), payload.location.trim(),
        toDateOrNull(payload.start_date), toDateOrNull(payload.end_date), textOrNull(payload.description)]
    );
    const projectId = rows[0].id;
    await logProjectEvent(client, projectId, actor, 'created', 'Project created');
    await setTeam(projectId, { manager_ids: payload.manager_ids, viewer_ids: payload.viewer_ids }, actor, client);
    return projectId;
  });
  return getProjectSummary(id);
};

const UPDATABLE = ['name', 'customer', 'location', 'start_date', 'end_date', 'description', 'responsible_admin_id'];

export const updateProject = async (id, payload, actor) => {
  await withTransaction(async (client) => {
    const sets = [];
    const values = [id];
    for (const key of UPDATABLE) {
      if (!(key in payload)) continue;
      const value = key.endsWith('_date') ? toDateOrNull(payload[key]) : textOrNull(payload[key]);
      values.push(value);
      sets.push(`${key} = $${values.length}`);
    }
    const { rows } = await client.query(
      sets.length
        ? `UPDATE projects SET ${sets.join(', ')} WHERE id = $1 RETURNING id`
        : 'SELECT id FROM projects WHERE id = $1 FOR UPDATE',
      values
    );
    if (!rows[0]) throw Object.assign(new Error('Project not found'), { status: 404 });
    if (sets.length) await logProjectEvent(client, id, actor, 'edited', 'Project details updated');
    if ('manager_ids' in payload || 'viewer_ids' in payload) {
      await setTeam(id, { manager_ids: payload.manager_ids, viewer_ids: payload.viewer_ids }, actor, client);
    }
  });
  return getProjectSummary(id);
};

const projectError = (message, code, extra = {}) => Object.assign(new Error(message), { code, ...extra });

// Deleting a project with no activity history removes it immediately, as
// before. With history, the caller must confirm (`withHistory`): the project
// is then archived — hidden everywhere and restorable for
// ARCHIVE_RETENTION_DAYS, after which purgeExpiredArchivedProjects removes it
// and its activities. Without confirmation it is refused with HAS_ACTIVITIES
// (and the count) so the UI can ask.
// Returns { archived: boolean, purge_at? }.
export const deleteProject = async (id, { withHistory = false } = {}) => {
  const project = await getProjectById(id);
  if (!project || project.archived_at) throw projectError('Project not found', 'NOT_FOUND');

  const { data: activities, error: countError } = await supabase
    .from('project_activities')
    .select('id')
    .eq('project_id', id);
  if (countError) throw new Error(`Failed to check activities: ${countError.message}`);
  const activityCount = activities?.length || 0;

  if (activityCount === 0) {
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) {
      // An activity was added between the check and the delete — the FK
      // (ON DELETE RESTRICT) refused it; ask for confirmation like above.
      if (error.code === '23503') throw projectError('This project has activity history', 'HAS_ACTIVITIES', { activityCount: 1 });
      throw new Error(`Failed to delete project: ${error.message}`);
    }
    return { archived: false };
  }

  if (!withHistory) {
    throw projectError('This project has activity history', 'HAS_ACTIVITIES', { activityCount });
  }

  const { data, error } = await supabase
    .from('projects')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
    .is('archived_at', null)
    .select('id, archived_at')
    .maybeSingle();
  if (error) throw new Error(`Failed to archive project: ${error.message}`);
  if (!data) throw projectError('Project not found', 'NOT_FOUND');
  return { archived: true, purge_at: purgeAtFor(data.archived_at) };
};

const purgeAtFor = (archivedAt) =>
  new Date(new Date(archivedAt).getTime() + ARCHIVE_RETENTION_DAYS * 86400000).toISOString();

// Archived projects still inside the retention window, newest first.
export const listArchivedProjects = async () => {
  await purgeExpiredArchivedProjects();
  const { data, error } = await supabase
    .from('projects')
    .select('*, admin(id, full_name, email)')
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false });
  if (error) throw new Error(`Failed to list archived projects: ${error.message}`);
  return (data || []).map((p) => ({ ...p, purge_at: purgeAtFor(p.archived_at) }));
};

export const restoreProject = async (id) => {
  const { data, error } = await supabase
    .from('projects')
    .update({ archived_at: null })
    .eq('id', id)
    .not('archived_at', 'is', null)
    .select('*, admin(id, full_name, email)')
    .maybeSingle();
  if (error) throw new Error(`Failed to restore project: ${error.message}`);
  if (!data) throw projectError('Archived project not found', 'NOT_FOUND');
  return data;
};

// Permanently removes archives older than the retention window: activities
// first (their FK is ON DELETE RESTRICT), then the projects, in one
// transaction. The expired rows are locked first so a concurrent restore
// either wins (and the project is kept) or waits for the purge.
// Runs lazily from the project list reads, at most once per interval per
// server process — no scheduler needed, and an archive is never visible
// past its window because the lists purge before reading.
const PURGE_MIN_INTERVAL_MS = 10 * 60 * 1000;
let lastPurgeAt = 0;

export const purgeExpiredArchivedProjects = async ({ force = false } = {}) => {
  const now = Date.now();
  if (!force && now - lastPurgeAt < PURGE_MIN_INTERVAL_MS) return 0;
  lastPurgeAt = now;

  try {
    return await withTransaction(async (client) => {
      const { rows } = await client.query(
        `SELECT id FROM projects
          WHERE archived_at IS NOT NULL
            AND archived_at < now() - make_interval(days => $1)
          FOR UPDATE`,
        [ARCHIVE_RETENTION_DAYS]
      );
      if (!rows.length) return 0;
      const ids = rows.map((r) => r.id);
      await client.query('DELETE FROM project_activities WHERE project_id = ANY($1::text[])', [ids]);
      await client.query('DELETE FROM projects WHERE id = ANY($1::text[])', [ids]);
      return ids.length;
    });
  } catch (error) {
    // Never block the project list on a failed purge; retry next interval.
    console.error('Failed to purge archived projects:', error.message);
    return 0;
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
