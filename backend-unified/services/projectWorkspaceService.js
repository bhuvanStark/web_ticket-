// Projects workspace (projects-plan.md, migration 046). Who can do what on a
// project:
//   * Admin with the 'projects' module — everything except approving.
//   * Super Admin — everything, plus approve/reject a completion.
//   * Manager (technician, per project) — assign/reassign/cancel daily work
//     (to the project team, themselves included), upload files, submit the
//     project for completion approval.
//   * Team member (technician, per project) — view-only: the whole timeline,
//     daily comments and files. Their own activities are still accepted and
//     completed through the existing technician endpoints.
// A technician with activities on the project from before teams existed can
// view it too.
import { query, withTransaction } from '../config/database.js';
import {
  inspectFile, checkThumbnail, packFile, unpackFile, safeFileName,
  MAX_PROJECT_STORED_BYTES, MAX_FILES_PER_PROJECT
} from './projectFileStore.js';

const fail = (status, message, code) => Object.assign(new Error(message), { status, code });
const OPEN_STATUSES = ['Planning', 'Active'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// req.user -> { role: 'admin'|'technician', id, isSuperAdmin, name }
export async function loadActor(user) {
  const role = user.role === 'admin' ? 'admin' : 'technician';
  const table = role === 'admin' ? 'admins' : 'technicians';
  const { rows } = await query(`SELECT full_name FROM ${table} WHERE id = $1`, [user.userId]);
  return { role, id: user.userId, isSuperAdmin: role === 'admin' && user.isSuperAdmin === true, name: rows[0]?.full_name || null };
}

// Returns { project, canManage, isAdmin, canApprove, memberRole } or throws
// 404 (also for archived projects and technicians with no link to it, so a
// project's existence isn't revealed).
// `lock` takes the project row lock first, so a status check made from the
// returned project can't race another write in the same transaction.
export async function resolveAccess(projectId, actor, executor = { query }, { lock = false } = {}) {
  const { rows } = await executor.query(
    `SELECT *, start_date::text AS start_day, end_date::text AS end_day FROM projects WHERE id = $1${lock ? ' FOR UPDATE' : ''}`,
    [projectId]
  );
  const project = rows[0];
  if (!project || project.archived_at) throw fail(404, 'Project not found', 'NOT_FOUND');
  if (actor.role === 'admin') {
    return { project, isAdmin: true, canManage: true, canApprove: actor.isSuperAdmin, memberRole: null };
  }
  const { rows: link } = await executor.query(
    `SELECT (SELECT role FROM project_members WHERE project_id = $1 AND technician_id = $2) AS role,
            EXISTS (SELECT 1 FROM project_activities WHERE project_id = $1 AND technician_id = $2) AS worked`,
    [projectId, actor.id]
  );
  const memberRole = link[0]?.role || (link[0]?.worked ? 'viewer' : null);
  if (!memberRole) throw fail(404, 'Project not found', 'NOT_FOUND');
  return { project, isAdmin: false, canManage: memberRole === 'manager', canApprove: false, memberRole };
}

const requireManage = (access) => {
  if (!access.canManage) throw fail(403, 'Only this project\'s managers or an admin can do that', 'FORBIDDEN');
};

const logEvent = (executor, projectId, actor, eventType, message) =>
  executor.query(
    `INSERT INTO project_events (project_id, event_type, actor_role, actor_id, actor_name, message)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [projectId, eventType, actor?.role || null, actor?.id || null, actor?.name || null, message]
  );

const fmtDay = (date) => new Date(`${String(date).slice(0, 10)}T00:00:00Z`)
  .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });

// -- Team -------------------------------------------------------------------

// projectIds -> Map(projectId -> [{ id, name, role, ... }]), managers first.
export async function listMembers(projectIds, executor = { query }) {
  if (!projectIds.length) return new Map();
  const { rows } = await executor.query(
    `SELECT m.project_id, m.technician_id AS id, m.role, m.added_at, t.full_name AS name, t.role_title,
            t.avatar_url, (t.is_active AND t.removed_at IS NULL) AS is_active
       FROM project_members m JOIN technicians t ON t.id = m.technician_id
      WHERE m.project_id = ANY($1::text[])
      ORDER BY m.role, lower(t.full_name)`,
    [projectIds]
  );
  const byProject = new Map();
  for (const { project_id: projectId, ...member } of rows) {
    if (!byProject.has(projectId)) byProject.set(projectId, []);
    byProject.get(projectId).push(member);
  }
  return byProject;
}

const cleanIds = (ids, label) => {
  if (ids == null) return [];
  if (!Array.isArray(ids) || ids.length > 200) throw fail(400, `${label} must be a list`, 'VALIDATION');
  const out = [...new Set(ids.map(String))];
  if (out.some((id) => !UUID_RE.test(id))) throw fail(400, `${label} contains an invalid technician`, 'VALIDATION');
  return out;
};

// Replaces the project's team. A technician in both lists is a manager.
// Admin-only (routes enforce it). Removed/inactive technicians are refused
// unless they are already on the team (so editing an old project never
// fails because someone left).
// A list left undefined keeps that part of the team as it is.
export async function setTeam(projectId, { manager_ids, viewer_ids }, actor, executor) {
  const { rows: current } = await executor.query(
    'SELECT technician_id, role FROM project_members WHERE project_id = $1', [projectId]
  );
  const currentOf = (role) => current.filter((r) => r.role === role).map((r) => r.technician_id);
  const managers = manager_ids === undefined ? currentOf('manager') : cleanIds(manager_ids, 'Managers');
  const viewers = (viewer_ids === undefined ? currentOf('viewer') : cleanIds(viewer_ids, 'Team'))
    .filter((id) => !managers.includes(id));
  const all = [...managers, ...viewers];

  const currentIds = new Set(current.map((r) => r.technician_id));
  const newcomers = all.filter((id) => !currentIds.has(id));
  if (newcomers.length) {
    const { rows } = await executor.query(
      'SELECT id FROM technicians WHERE id = ANY($1::uuid[]) AND is_active = true AND removed_at IS NULL', [newcomers]
    );
    if (rows.length !== newcomers.length) throw fail(400, 'One or more selected technicians are inactive or no longer exist', 'VALIDATION');
  }

  const before = new Map(current.map((r) => [r.technician_id, r.role]));
  const after = new Map([...managers.map((id) => [id, 'manager']), ...viewers.map((id) => [id, 'viewer'])]);
  const changed = before.size !== after.size || [...after].some(([id, role]) => before.get(id) !== role);
  if (!changed) return false;

  await executor.query('DELETE FROM project_members WHERE project_id = $1', [projectId]);
  if (all.length) {
    await executor.query(
      `INSERT INTO project_members (project_id, technician_id, role)
       SELECT $1, x.id, x.role FROM unnest($2::uuid[], $3::text[]) AS x(id, role)`,
      [projectId, all, all.map((id) => after.get(id))]
    );
  }
  await logEvent(executor, projectId, actor, 'team',
    `Team updated — ${managers.length} manager${managers.length === 1 ? '' : 's'}, ${viewers.length} team member${viewers.length === 1 ? '' : 's'}`);
  return true;
}

// Active technicians, for the Managers/Team pickers. Served from the
// projects module so an admin with only Projects access can still build a team.
export async function listAssignableTechnicians() {
  const { rows } = await query(
    `SELECT id, full_name AS name, role_title, avatar_url, location
       FROM technicians WHERE is_active = true AND removed_at IS NULL
      ORDER BY lower(full_name)`
  );
  return rows;
}

// -- Lists ------------------------------------------------------------------

// Projects a technician can open (team member, manager, or has worked on it).
export async function listProjectsForTechnician(technicianId) {
  await expireUnacceptedAssignments();
  const { rows } = await query(
    `SELECT p.id, p.name, p.customer, p.location, p.status, p.start_date, p.end_date,
            p.last_activity_at, p.rejection_reason,
            COALESCE(m.role, 'viewer') AS my_role,
            (SELECT count(*)::int FROM project_activities a
              WHERE a.project_id = p.id AND a.status IN ('Assigned', 'Accepted')) AS open_activities,
            (SELECT count(*)::int FROM project_activities a
              WHERE a.project_id = p.id AND a.technician_id = $1 AND a.status IN ('Assigned', 'Accepted')) AS my_open_activities
       FROM projects p
       LEFT JOIN project_members m ON m.project_id = p.id AND m.technician_id = $1
      WHERE p.archived_at IS NULL
        AND (m.technician_id IS NOT NULL
             OR EXISTS (SELECT 1 FROM project_activities a WHERE a.project_id = p.id AND a.technician_id = $1))
      ORDER BY (p.status = 'Completed'), p.last_activity_at DESC`,
    [technicianId]
  );
  const members = await listMembers(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, managers: (members.get(r.id) || []).filter((m) => m.role === 'manager') }));
}

// -- Workspace --------------------------------------------------------------

const FILE_META = `id, category, display_name, file_name, mime_type, original_size, stored_size, encoding,
                   (thumbnail IS NOT NULL) AS has_thumbnail, uploaded_by_role, uploaded_by_name, created_at`;

export async function getWorkspace(projectId, actor) {
  await expireUnacceptedAssignments();
  const access = await resolveAccess(projectId, actor);
  const [members, activities, files, events] = await Promise.all([
    listMembers([projectId]),
    query(
      `SELECT a.id, a.technician_id, t.full_name AS technician_name, a.scheduled_date::text AS scheduled_date,
              to_char(a.scheduled_time, 'HH24:MI') AS scheduled_time, a.status, a.completion_notes,
              a.completed_at, a.created_at
         FROM project_activities a JOIN technicians t ON t.id = a.technician_id
        WHERE a.project_id = $1
        ORDER BY a.scheduled_date DESC, a.scheduled_time DESC, a.created_at DESC`,
      [projectId]
    ),
    query(`SELECT ${FILE_META} FROM project_files WHERE project_id = $1 ORDER BY created_at DESC`, [projectId]),
    query(
      `SELECT id, event_type, actor_role, actor_name, message, created_at
         FROM project_events WHERE project_id = $1 ORDER BY created_at DESC LIMIT 500`,
      [projectId]
    )
  ]);
  const { project } = access;
  const storedBytes = files.rows.reduce((n, f) => n + f.stored_size, 0);
  return {
    project: {
      id: project.id, name: project.name, customer: project.customer, location: project.location,
      description: project.description, status: project.status,
      start_date: project.start_day, end_date: project.end_day,
      created_at: project.created_at, updated_at: project.updated_at, last_activity_at: project.last_activity_at,
      completion_file_id: project.completion_file_id, submitted_at: project.submitted_at,
      submitted_by_name: project.submitted_by_name, reviewed_at: project.reviewed_at,
      reviewed_by_name: project.reviewed_by_name, rejection_reason: project.rejection_reason
    },
    access: {
      isAdmin: access.isAdmin, canManage: access.canManage, canApprove: access.canApprove,
      memberRole: access.memberRole, actorId: actor.id, actorRole: actor.role
    },
    members: members.get(projectId) || [],
    activities: activities.rows,
    files: files.rows,
    events: events.rows,
    storage: { usedBytes: storedBytes, limitBytes: MAX_PROJECT_STORED_BYTES, fileCount: files.rows.length, maxFiles: MAX_FILES_PER_PROJECT }
  };
}

// -- Daily assignments ------------------------------------------------------

// Work a technician hasn't accepted within this many hours is cancelled so it
// doesn't sit in "Assigned" forever. Only rows with auto_expire (everything
// assigned after migration 048) — assignments that existed before are left
// exactly as they were. Cancelled, not deleted: the timeline
// still shows it, and a manager can simply assign the day again.
export const ASSIGNMENT_EXPIRY_HOURS = 36;

// Lazy sweep (same idea as the archive purge): runs from the project reads,
// at most once per interval per server process — no scheduler needed.
const EXPIRY_MIN_INTERVAL_MS = 5 * 60 * 1000;
let lastExpiryAt = 0;

export async function expireUnacceptedAssignments({ force = false } = {}) {
  const now = Date.now();
  if (!force && now - lastExpiryAt < EXPIRY_MIN_INTERVAL_MS) return 0;
  lastExpiryAt = now;
  try {
    return await withTransaction(async (client) => {
      // Not "someone worked on it": don't move the project's Last updated.
      await client.query("SELECT set_config('tasktel.skip_project_touch', 'on', true)");
      const { rows } = await client.query(
        `UPDATE project_activities a SET status = 'Cancelled'
           FROM technicians t
          WHERE t.id = a.technician_id AND a.status = 'Assigned' AND a.auto_expire
            AND a.created_at < now() - make_interval(hours => $1)
         RETURNING a.project_id, a.scheduled_date::text AS scheduled_date, t.full_name`,
        [ASSIGNMENT_EXPIRY_HOURS]
      );
      for (const r of rows) {
        await logEvent(client, r.project_id, { name: 'System' }, 'expired',
          `${r.full_name}'s work on ${fmtDay(r.scheduled_date)} was not accepted within ${ASSIGNMENT_EXPIRY_HOURS} hours and was cancelled`);
      }
      return rows.length;
    });
  } catch (error) {
    // Never block a page on a failed sweep; retry next interval.
    console.error('Failed to expire unaccepted assignments:', error.message);
    return 0;
  }
}

const assertOpen = (project) => {
  if (project.status === 'Pending Approval') throw fail(409, 'This project is waiting for completion approval', 'LOCKED');
  if (project.status === 'Completed') throw fail(409, 'This project is completed', 'LOCKED');
};

async function assertTeam(executor, projectId, technicianIds) {
  const { rows } = await executor.query(
    `SELECT m.technician_id FROM project_members m JOIN technicians t ON t.id = m.technician_id
      WHERE m.project_id = $1 AND m.technician_id = ANY($2::uuid[])
        AND t.is_active = true AND t.removed_at IS NULL`,
    [projectId, technicianIds]
  );
  if (rows.length !== technicianIds.length) {
    throw fail(400, 'Work can only be assigned to active members of this project\'s team', 'VALIDATION');
  }
}

const techNames = async (executor, ids) => {
  const { rows } = await executor.query(
    'SELECT full_name FROM technicians WHERE id = ANY($1::uuid[]) ORDER BY lower(full_name)', [ids]
  );
  return rows.map((r) => r.full_name).join(', ');
};

export async function assignActivities(projectId, { scheduled_date, scheduled_time, technician_ids }, actor) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(scheduled_date || '')) || Number.isNaN(Date.parse(scheduled_date))) {
    throw fail(400, 'Pick a valid date', 'VALIDATION');
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(scheduled_time || ''))) throw fail(400, 'Pick a valid time', 'VALIDATION');
  const ids = cleanIds(technician_ids, 'Technicians');
  if (!ids.length) throw fail(400, 'Pick at least one team member', 'VALIDATION');

  return withTransaction(async (client) => {
    const access = await resolveAccess(projectId, actor, client, { lock: true });
    requireManage(access);
    assertOpen(access.project);
    await assertTeam(client, projectId, ids);
    try {
      await client.query(
        `INSERT INTO project_activities (project_id, technician_id, scheduled_date, scheduled_time, status)
         SELECT $1, x, $2, $3, 'Assigned' FROM unnest($4::uuid[]) AS x`,
        [projectId, scheduled_date, scheduled_time, ids]
      );
    } catch (error) {
      if (error.code === '23505') throw fail(409, 'One or more of them already have work on this project that day', 'DUPLICATE_ACTIVITY');
      throw error;
    }
    if (access.project.status === 'Planning') {
      await client.query("UPDATE projects SET status = 'Active' WHERE id = $1", [projectId]);
    }
    await logEvent(client, projectId, actor, 'assigned',
      `Assigned ${await techNames(client, ids)} for ${fmtDay(scheduled_date)} at ${scheduled_time}`);
    return { assigned: ids.length };
  });
}

async function lockActivity(client, projectId, activityId) {
  if (!UUID_RE.test(String(activityId))) throw fail(404, 'Activity not found', 'NOT_FOUND');
  const { rows } = await client.query(
    `SELECT a.id, a.technician_id, a.status, a.scheduled_date::text AS scheduled_date, a.scheduled_time,
            t.full_name AS technician_name
       FROM project_activities a
       JOIN technicians t ON t.id = a.technician_id
      WHERE a.id = $1 AND a.project_id = $2 FOR UPDATE OF a`,
    [activityId, projectId]
  );
  if (!rows[0]) throw fail(404, 'Activity not found', 'NOT_FOUND');
  if (!['Assigned', 'Accepted'].includes(rows[0].status)) throw fail(409, `This work is already ${rows[0].status.toLowerCase()}`, 'INVALID_TRANSITION');
  return rows[0];
}

// History-safe: the original row is cancelled, never deleted.
export async function reassignActivity(projectId, activityId, technicianId, actor) {
  const [newId] = cleanIds([technicianId], 'Technician');
  return withTransaction(async (client) => {
    const access = await resolveAccess(projectId, actor, client, { lock: true });
    requireManage(access);
    assertOpen(access.project);
    const original = await lockActivity(client, projectId, activityId);
    if (original.technician_id === newId) throw fail(400, 'Pick a different team member', 'VALIDATION');
    await assertTeam(client, projectId, [newId]);
    await client.query("UPDATE project_activities SET status = 'Cancelled' WHERE id = $1", [activityId]);
    try {
      await client.query(
        `INSERT INTO project_activities (project_id, technician_id, scheduled_date, scheduled_time, status)
         VALUES ($1, $2, $3, $4, 'Assigned')`,
        [projectId, newId, original.scheduled_date, original.scheduled_time]
      );
    } catch (error) {
      if (error.code === '23505') throw fail(409, 'They already have work on this project that day', 'DUPLICATE_ACTIVITY');
      throw error;
    }
    await logEvent(client, projectId, actor, 'reassigned',
      `Moved ${fmtDay(original.scheduled_date)} work from ${original.technician_name} to ${await techNames(client, [newId])}`);
    return { reassigned: true };
  });
}

export async function cancelActivity(projectId, activityId, actor) {
  return withTransaction(async (client) => {
    const access = await resolveAccess(projectId, actor, client, { lock: true });
    requireManage(access);
    const activity = await lockActivity(client, projectId, activityId);
    await client.query("UPDATE project_activities SET status = 'Cancelled' WHERE id = $1", [activityId]);
    await logEvent(client, projectId, actor, 'cancelled',
      `Cancelled ${activity.technician_name}'s work on ${fmtDay(activity.scheduled_date)}`);
    return { cancelled: true };
  });
}

// -- Files ------------------------------------------------------------------

export const FILE_CATEGORY_LABELS = {
  design: 'Design diagram', boq: 'BOQ', image: 'Diagram / site image', document: 'Document', completion: 'Completion document'
};

// body = [thumbnail (thumbBytes)] + file. Metadata comes from the query string.
export async function uploadFile(projectId, meta, body, actor) {
  const thumbBytes = Number.parseInt(meta.thumb_bytes || '0', 10);
  if (!Number.isInteger(thumbBytes) || thumbBytes < 0 || thumbBytes >= (body?.length || 0)) {
    throw fail(400, 'Malformed upload', 'VALIDATION');
  }
  const thumbnail = checkThumbnail(thumbBytes ? body.subarray(0, thumbBytes) : null);
  const buffer = body.subarray(thumbBytes);
  const category = String(meta.category || '');
  const fileName = safeFileName(meta.file_name);
  const displayName = String(meta.display_name || '').trim().replace(/\s+/g, ' ');
  if (!displayName || displayName.length > 120) throw fail(400, 'Give the file a name (up to 120 characters)', 'VALIDATION');
  const { mime, compressible } = inspectFile({ fileName, category, buffer });
  const { data, encoding } = await packFile(buffer, compressible);

  return withTransaction(async (client) => {
    const access = await resolveAccess(projectId, actor, client, { lock: true });
    requireManage(access);
    if (access.project.status === 'Completed') throw fail(409, 'This project is completed', 'LOCKED');
    if (category === 'completion' && access.project.status === 'Pending Approval') {
      throw fail(409, 'A completion document is already waiting for approval', 'LOCKED');
    }
    const { rows: usage } = await client.query(
      'SELECT count(*)::int AS files, COALESCE(sum(stored_size), 0)::bigint AS bytes FROM project_files WHERE project_id = $1',
      [projectId]
    );
    if (usage[0].files >= MAX_FILES_PER_PROJECT) throw fail(409, `A project can hold at most ${MAX_FILES_PER_PROJECT} files — delete old ones first`, 'QUOTA');
    if (Number(usage[0].bytes) + data.length > MAX_PROJECT_STORED_BYTES) {
      throw fail(409, `This project's file space (${MAX_PROJECT_STORED_BYTES / (1024 * 1024)} MB) is full — delete old files first`, 'QUOTA');
    }
    const { rows } = await client.query(
      `INSERT INTO project_files (project_id, category, display_name, file_name, mime_type, original_size,
                                  stored_size, encoding, data, thumbnail, uploaded_by_role, uploaded_by_id, uploaded_by_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING ${FILE_META}`,
      [projectId, category, displayName, fileName, mime, buffer.length, data.length, encoding, data, thumbnail,
        actor.role, actor.id, actor.name]
    );
    await logEvent(client, projectId, actor, 'file', `Uploaded ${FILE_CATEGORY_LABELS[category].toLowerCase()} "${displayName}"`);
    return rows[0];
  });
}

export async function getFileContent(projectId, fileId, actor, { thumbnail = false } = {}) {
  if (!UUID_RE.test(String(fileId))) throw fail(404, 'File not found', 'NOT_FOUND');
  await resolveAccess(projectId, actor);
  const column = thumbnail ? 'thumbnail' : 'data';
  const { rows } = await query(
    `SELECT file_name, mime_type, encoding, ${column} AS bytes FROM project_files WHERE id = $1 AND project_id = $2`,
    [fileId, projectId]
  );
  const file = rows[0];
  if (!file || !file.bytes) throw fail(404, 'File not found', 'NOT_FOUND');
  if (thumbnail) return { fileName: file.file_name, mime: 'image/jpeg', buffer: file.bytes };
  return { fileName: file.file_name, mime: file.mime_type, buffer: await unpackFile(file.bytes, file.encoding) };
}

export async function deleteFile(projectId, fileId, actor) {
  if (!UUID_RE.test(String(fileId))) throw fail(404, 'File not found', 'NOT_FOUND');
  return withTransaction(async (client) => {
    const access = await resolveAccess(projectId, actor, client, { lock: true });
    requireManage(access);
    if (access.project.completion_file_id === fileId && !OPEN_STATUSES.includes(access.project.status)) {
      throw fail(409, 'This completion document is part of the approval record and cannot be deleted', 'LOCKED');
    }
    const { rows } = await client.query(
      'DELETE FROM project_files WHERE id = $1 AND project_id = $2 RETURNING display_name, category', [fileId, projectId]
    );
    if (!rows[0]) throw fail(404, 'File not found', 'NOT_FOUND');
    await logEvent(client, projectId, actor, 'file', `Deleted ${FILE_CATEGORY_LABELS[rows[0].category].toLowerCase()} "${rows[0].display_name}"`);
    return { deleted: true };
  });
}

// -- Completion approval ----------------------------------------------------

export async function submitForApproval(projectId, { file_id }, actor) {
  return withTransaction(async (client) => {
    const access = await resolveAccess(projectId, actor, client, { lock: true });
    requireManage(access);
    if (!OPEN_STATUSES.includes(access.project.status)) throw fail(409, `This project is already ${access.project.status.toLowerCase()}`, 'LOCKED');
    if (!UUID_RE.test(String(file_id || ''))) throw fail(400, 'Upload the signed completion document first', 'VALIDATION');
    const { rows: file } = await client.query(
      "SELECT display_name FROM project_files WHERE id = $1 AND project_id = $2 AND category = 'completion'", [file_id, projectId]
    );
    if (!file[0]) throw fail(400, 'Upload the signed completion document first', 'VALIDATION');
    const { rows: open } = await client.query(
      "SELECT count(*)::int AS n FROM project_activities WHERE project_id = $1 AND status IN ('Assigned', 'Accepted')", [projectId]
    );
    if (open[0].n > 0) {
      throw fail(409, `${open[0].n} daily assignment${open[0].n === 1 ? ' is' : 's are'} still open — complete or cancel ${open[0].n === 1 ? 'it' : 'them'} first`, 'UNRESOLVED_ACTIVITIES');
    }
    await client.query(
      `UPDATE projects SET status = 'Pending Approval', completion_file_id = $2, submitted_at = now(),
              submitted_by_name = $3, reviewed_at = NULL, reviewed_by_name = NULL, rejection_reason = NULL
        WHERE id = $1`,
      [projectId, file_id, actor.name]
    );
    await logEvent(client, projectId, actor, 'submitted', `Submitted for completion approval with "${file[0].display_name}"`);
    return { status: 'Pending Approval' };
  });
}

export async function reviewCompletion(projectId, { decision, reason }, actor) {
  if (!['approve', 'reject'].includes(decision)) throw fail(400, 'Decision must be approve or reject', 'VALIDATION');
  const why = String(reason || '').trim();
  if (decision === 'reject' && (why.length < 3 || why.length > 500)) {
    throw fail(400, 'Give a reason for rejecting (3–500 characters)', 'VALIDATION');
  }
  return withTransaction(async (client) => {
    const access = await resolveAccess(projectId, actor, client, { lock: true });
    if (!access.canApprove) throw fail(403, 'Only a Super Admin can approve project completion', 'FORBIDDEN');
    if (access.project.status !== 'Pending Approval') throw fail(409, 'This project is not waiting for approval', 'LOCKED');
    const approved = decision === 'approve';
    await client.query(
      `UPDATE projects SET status = $2, reviewed_at = now(), reviewed_by_name = $3, rejection_reason = $4 WHERE id = $1`,
      [projectId, approved ? 'Completed' : 'Active', actor.name, approved ? null : why]
    );
    await logEvent(client, projectId, actor, approved ? 'approved' : 'rejected',
      approved ? 'Approved completion — project closed' : `Rejected completion: ${why}`);
    return { status: approved ? 'Completed' : 'Active' };
  });
}

// Writes on create/edit from the admin Projects routes.
export const logProjectEvent = logEvent;
