// Projects workspace (projects-plan.md, migration 046): managers + view-only
// team, team-only assignment, mandatory daily comments, compressed file
// storage, and the completion approval flow. Real HTTP server, real
// PostgreSQL, no mocks — same pattern as ui-general-modules.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';

process.env.JWT_SECRET ||= 'integration-access-secret-change-me';
process.env.JWT_REFRESH_SECRET ||= 'integration-refresh-secret-change-me';

const { default: app } = await import('../server.js');
const { pool } = await import('../config/database.js');
const { generateToken } = await import('../middleware/auth.js');
const { indiaDateKey } = await import('../utils/indiaTime.js');

let server;
let baseUrl;
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const ids = {};
const tokens = {};
const createdProjects = [];

async function call(method, path, token, body) {
  const response = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await response.json().catch(() => null);
  return { status: response.status, json };
}

async function upload(projectId, token, { category, name, fileName, bytes, thumb }) {
  const qs = new URLSearchParams({ category, display_name: name, file_name: fileName, thumb_bytes: String(thumb?.length || 0) });
  const response = await fetch(`${baseUrl}/api/project-workspace/${projectId}/files?${qs}`, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream', authorization: `Bearer ${token}` },
    body: thumb ? Buffer.concat([thumb, bytes]) : bytes
  });
  return { status: response.status, json: await response.json().catch(() => null) };
}

const pdf = (text) => Buffer.from(`%PDF-1.4\n${text.repeat(200)}\n%%EOF`);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8]);

test.before(async () => {
  const tech = (name) => pool.query(
    'INSERT INTO technicians(full_name, email) VALUES ($1, $2) RETURNING id',
    [`PW ${name} ${suffix}`, `pw-${name}-${suffix}@example.com`]
  ).then((r) => r.rows[0].id);
  ids.manager = await tech('manager');
  ids.viewer = await tech('viewer');
  ids.outsider = await tech('outsider');
  const admin = (name, superAdmin) => pool.query(
    `INSERT INTO admins(email, password_hash, full_name, is_super_admin) VALUES ($1, 'x', $2, $3) RETURNING id, token_version`,
    [`pw-${name}-${suffix}@example.com`, `PW ${name}`, superAdmin]
  ).then((r) => r.rows[0]);
  ids.superAdmin = await admin('super', true);
  ids.projectsAdmin = await admin('projects', false);
  ids.otherAdmin = await admin('other', false);
  await pool.query(`INSERT INTO admin_permissions(admin_id, module, can_access) VALUES ($1, 'projects', true)`, [ids.projectsAdmin.id]);

  tokens.manager = generateToken(ids.manager, 'technician');
  tokens.viewer = generateToken(ids.viewer, 'technician');
  tokens.outsider = generateToken(ids.outsider, 'technician');
  tokens.superAdmin = generateToken(ids.superAdmin.id, 'admin', { tokenVersion: ids.superAdmin.token_version, isSuperAdmin: true });
  tokens.projectsAdmin = generateToken(ids.projectsAdmin.id, 'admin', { tokenVersion: ids.projectsAdmin.token_version });
  tokens.otherAdmin = generateToken(ids.otherAdmin.id, 'admin', { tokenVersion: ids.otherAdmin.token_version });

  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.query('DELETE FROM project_activities WHERE project_id = ANY($1)', [createdProjects]);
  await pool.query('UPDATE projects SET completion_file_id = NULL WHERE id = ANY($1)', [createdProjects]);
  await pool.query('DELETE FROM projects WHERE id = ANY($1)', [createdProjects]);
  await pool.query('DELETE FROM technicians WHERE id = ANY($1)', [[ids.manager, ids.viewer, ids.outsider]]);
  await pool.query('DELETE FROM admins WHERE id = ANY($1)', [[ids.superAdmin.id, ids.projectsAdmin.id, ids.otherAdmin.id]]);
});

let projectId;

test('an admin with the Projects module creates a project with managers and a view-only team', async () => {
  assert.equal((await call('GET', '/projects/technicians', tokens.otherAdmin)).status, 403);
  const techs = await call('GET', '/projects/technicians', tokens.projectsAdmin);
  assert.equal(techs.status, 200);
  assert.ok(techs.json.data.some((t) => t.id === ids.manager));

  const res = await call('POST', '/projects', tokens.projectsAdmin, {
    name: `PW project ${suffix}`, customer: 'PW Co', location: 'Chennai',
    manager_ids: [ids.manager], viewer_ids: [ids.viewer, ids.manager]
  });
  assert.equal(res.status, 201, JSON.stringify(res.json));
  projectId = res.json.data.id;
  createdProjects.push(projectId);
  assert.deepEqual(res.json.data.managers.map((m) => m.id), [ids.manager]);
  assert.deepEqual(res.json.data.team.map((m) => m.id), [ids.viewer], 'a manager listed twice stays a manager');

  const bad = await call('POST', '/projects', tokens.projectsAdmin, {
    name: `PW bad ${suffix}`, customer: 'PW Co', location: 'Chennai', manager_ids: ['not-a-uuid']
  });
  assert.equal(bad.status, 400);
});

test('team members see the whole project read-only; outsiders and other roles cannot', async () => {
  assert.equal((await call('GET', `/project-workspace/${projectId}`, tokens.outsider)).status, 404);
  assert.equal((await call('GET', `/project-workspace/${projectId}`, tokens.otherAdmin)).status, 403);

  const view = await call('GET', `/project-workspace/${projectId}`, tokens.viewer);
  assert.equal(view.status, 200);
  assert.equal(view.json.data.access.canManage, false);
  assert.equal(view.json.data.members.length, 2);

  const mine = await call('GET', '/project-workspace', tokens.viewer);
  assert.ok(mine.json.data.some((p) => p.id === projectId && p.my_role === 'viewer'));

  const refused = await call('POST', `/project-workspace/${projectId}/activities`, tokens.viewer, {
    scheduled_date: indiaDateKey(), scheduled_time: '10:00', technician_ids: [ids.viewer]
  });
  assert.equal(refused.status, 403);
});

test('a manager assigns daily work to the team (themselves included), never to outsiders', async () => {
  const outsider = await call('POST', `/project-workspace/${projectId}/activities`, tokens.manager, {
    scheduled_date: indiaDateKey(), scheduled_time: '10:00', technician_ids: [ids.outsider]
  });
  assert.equal(outsider.status, 400);

  const before = (await pool.query('SELECT last_activity_at FROM projects WHERE id = $1', [projectId])).rows[0].last_activity_at;
  const res = await call('POST', `/project-workspace/${projectId}/activities`, tokens.manager, {
    scheduled_date: indiaDateKey(), scheduled_time: '09:30', technician_ids: [ids.manager, ids.viewer]
  });
  assert.equal(res.status, 201, JSON.stringify(res.json));
  const { rows } = await pool.query('SELECT status, last_activity_at FROM projects WHERE id = $1', [projectId]);
  assert.equal(rows[0].status, 'Active', 'first assignment moves Planning to Active');
  assert.ok(rows[0].last_activity_at > before, 'Last updated moves forward');

  const dup = await call('POST', `/project-workspace/${projectId}/activities`, tokens.manager, {
    scheduled_date: indiaDateKey(), scheduled_time: '11:00', technician_ids: [ids.viewer]
  });
  assert.equal(dup.status, 409);
});

test('a day cannot be completed without a comment', async () => {
  const { rows } = await pool.query(
    'SELECT id FROM project_activities WHERE project_id = $1 AND technician_id = $2', [projectId, ids.viewer]
  );
  const activityId = rows[0].id;
  assert.equal((await call('PATCH', `/project-activities/${activityId}/status`, tokens.viewer, { status: 'Accepted' })).status, 200);
  const empty = await call('PATCH', `/technician/project-activities/${activityId}/complete`, tokens.viewer, { completion_notes: '   ' });
  assert.equal(empty.status, 400);
  const ok = await call('PATCH', `/technician/project-activities/${activityId}/complete`, tokens.viewer, {
    completion_notes: 'Mounted 4 displays. Pending: cabling in room 2.'
  });
  assert.equal(ok.status, 200);
});

let designFileId;

test('files: managers upload named files, stored compressed; the team can open them', async () => {
  const bytes = pdf('design layer ');
  const res = await upload(projectId, tokens.manager, { category: 'design', name: 'Hall AV layout', fileName: 'layout.pdf', bytes });
  assert.equal(res.status, 201, JSON.stringify(res.json));
  designFileId = res.json.data.id;
  assert.equal(res.json.data.encoding, 'gzip');
  assert.ok(res.json.data.stored_size < bytes.length);
  const stored = await pool.query('SELECT data FROM project_files WHERE id = $1', [designFileId]);
  assert.deepEqual(zlib.gunzipSync(stored.rows[0].data), bytes);

  const download = await fetch(`${baseUrl}/api/project-workspace/${projectId}/files/${designFileId}`, {
    headers: { authorization: `Bearer ${tokens.viewer}` }
  });
  assert.equal(download.status, 200);
  assert.equal(download.headers.get('content-type'), 'application/pdf');
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);

  const outsiderDownload = await fetch(`${baseUrl}/api/project-workspace/${projectId}/files/${designFileId}`, {
    headers: { authorization: `Bearer ${tokens.outsider}` }
  });
  assert.equal(outsiderDownload.status, 404);

  assert.equal((await upload(projectId, tokens.viewer, { category: 'design', name: 'x', fileName: 'x.pdf', bytes })).status, 403);
  assert.equal((await upload(projectId, tokens.manager, { category: 'design', name: 'x', fileName: 'x.exe', bytes })).status, 400);
  assert.equal((await upload(projectId, tokens.manager, { category: 'image', name: 'x', fileName: 'x.png', bytes })).status, 400, 'contents must match the extension');
  assert.equal((await upload(projectId, tokens.manager, { category: 'design', name: '', fileName: 'x.pdf', bytes })).status, 400);

  const img = await upload(projectId, tokens.manager, { category: 'image', name: 'Rack photo', fileName: 'rack.jpg', bytes: jpeg, thumb: jpeg });
  assert.equal(img.status, 201, JSON.stringify(img.json));
  assert.equal(img.json.data.has_thumbnail, true);
  const thumb = await fetch(`${baseUrl}/api/project-workspace/${projectId}/files/${img.json.data.id}?thumb=1`, {
    headers: { authorization: `Bearer ${tokens.viewer}` }
  });
  assert.equal(thumb.status, 200);
});

test('completion: manager submits with a document, only a Super Admin approves; rejection needs a reason', async () => {
  const noDoc = await call('POST', `/project-workspace/${projectId}/submit`, tokens.manager, { file_id: designFileId });
  assert.equal(noDoc.status, 400, 'a design file is not a completion document');

  assert.equal((await upload(projectId, tokens.manager, { category: 'completion', name: 'Sign-off', fileName: 'x.xlsx', bytes: Buffer.from('PK\x03\x04abc') })).status, 400);
  const doc = await upload(projectId, tokens.manager, { category: 'completion', name: 'Signed completion', fileName: 'signed.pdf', bytes: pdf('signed ') });
  assert.equal(doc.status, 201);
  const fileId = doc.json.data.id;

  const open = await call('POST', `/project-workspace/${projectId}/submit`, tokens.manager, { file_id: fileId });
  assert.equal(open.status, 409, 'the manager\'s own assignment is still open');
  const { rows } = await pool.query(
    "SELECT id FROM project_activities WHERE project_id = $1 AND status IN ('Assigned', 'Accepted')", [projectId]
  );
  assert.equal((await call('PATCH', `/project-workspace/${projectId}/activities/${rows[0].id}/cancel`, tokens.viewer)).status, 403);
  assert.equal((await call('PATCH', `/project-workspace/${projectId}/activities/${rows[0].id}/cancel`, tokens.manager)).status, 200);

  assert.equal((await call('POST', `/project-workspace/${projectId}/submit`, tokens.viewer, { file_id: fileId })).status, 403);
  const submitted = await call('POST', `/project-workspace/${projectId}/submit`, tokens.manager, { file_id: fileId });
  assert.equal(submitted.status, 200, JSON.stringify(submitted.json));
  assert.equal(submitted.json.data.status, 'Pending Approval');

  const locked = await call('POST', `/project-workspace/${projectId}/activities`, tokens.manager, {
    scheduled_date: indiaDateKey(), scheduled_time: '12:00', technician_ids: [ids.viewer]
  });
  assert.equal(locked.status, 409);
  const delDoc = await fetch(`${baseUrl}/api/project-workspace/${projectId}/files/${fileId}`, {
    method: 'DELETE', headers: { authorization: `Bearer ${tokens.manager}` }
  });
  assert.equal(delDoc.status, 409, 'the submitted document is kept');

  assert.equal((await call('POST', `/project-workspace/${projectId}/review`, tokens.projectsAdmin, { decision: 'approve' })).status, 403);
  assert.equal((await call('POST', `/project-workspace/${projectId}/review`, tokens.superAdmin, { decision: 'reject' })).status, 400);
  const rejected = await call('POST', `/project-workspace/${projectId}/review`, tokens.superAdmin, { decision: 'reject', reason: 'Seal missing on page' });
  assert.equal(rejected.status, 200);
  const afterReject = await call('GET', `/project-workspace/${projectId}`, tokens.manager);
  assert.equal(afterReject.json.data.project.status, 'Active');
  assert.equal(afterReject.json.data.project.rejection_reason, 'Seal missing on page');

  assert.equal((await call('POST', `/project-workspace/${projectId}/submit`, tokens.projectsAdmin, { file_id: fileId })).status, 200);
  const approved = await call('POST', `/project-workspace/${projectId}/review`, tokens.superAdmin, { decision: 'approve' });
  assert.equal(approved.status, 200);
  const final = await call('GET', `/project-workspace/${projectId}`, tokens.viewer);
  assert.equal(final.json.data.project.status, 'Completed');
  assert.ok(final.json.data.events.some((e) => e.event_type === 'approved'));
});

test('work not accepted within 36 hours is cancelled (kept, logged), without bumping Last updated', async () => {
  const { expireUnacceptedAssignments } = await import('../services/projectWorkspaceService.js');
  const res = await call('POST', '/projects', tokens.projectsAdmin, {
    name: `PW expiry ${suffix}`, customer: 'PW Co', location: 'Chennai', viewer_ids: [ids.viewer, ids.manager]
  });
  const pid = res.json.data.id;
  createdProjects.push(pid);
  const insert = (tech, day, status, hoursAgo) => pool.query(
    `INSERT INTO project_activities (project_id, technician_id, scheduled_date, scheduled_time, status, created_at)
     VALUES ($1, $2, current_date + $3::int, '09:00', $4, now() - make_interval(hours => $5)) RETURNING id`,
    [pid, tech, day, status, hoursAgo]
  ).then((r) => r.rows[0].id);
  const stale = await insert(ids.viewer, 1, 'Assigned', 37);
  const fresh = await insert(ids.viewer, 2, 'Assigned', 30);
  const accepted = await insert(ids.manager, 1, 'Accepted', 50);
  await pool.query(`UPDATE projects SET last_activity_at = now() - interval '5 days' WHERE id = $1`, [pid]);

  assert.ok(await expireUnacceptedAssignments({ force: true }) >= 1);
  const status = async (id) => (await pool.query('SELECT status FROM project_activities WHERE id = $1', [id])).rows[0].status;
  assert.equal(await status(stale), 'Cancelled');
  assert.equal(await status(fresh), 'Assigned');
  assert.equal(await status(accepted), 'Accepted');

  const ws = await call('GET', `/project-workspace/${pid}`, tokens.viewer);
  assert.ok(ws.json.data.events.some((e) => e.event_type === 'expired' && e.actor_name === 'System'));
  const { rows } = await pool.query(`SELECT last_activity_at < now() - interval '4 days' AS untouched FROM projects WHERE id = $1`, [pid]);
  assert.equal(rows[0].untouched, true, 'an automatic expiry is not project activity');
});

test('the old direct "mark complete" endpoint is gone', async () => {
  assert.equal((await call('PATCH', `/projects/${projectId}/complete`, tokens.superAdmin)).status, 404);
});
