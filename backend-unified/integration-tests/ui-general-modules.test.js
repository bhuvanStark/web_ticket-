// Regression tests for the UI & General module updates (NeedUpdate.md §1):
// RBAC on shared customer/location/room/ticket routes and per-admin module
// permissions, the project delete -> 3-day archive flow, and attendance
// holidays / leave / half-day leave. Same pattern as api.test.js: real HTTP
// server, real PostgreSQL, no mocks.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET ||= 'integration-access-secret-change-me';
process.env.JWT_REFRESH_SECRET ||= 'integration-refresh-secret-change-me';

const { default: app } = await import('../server.js');
// See integration-tests/api.test.js's import comment: the shared pool is
// never closed by an individual file.
const { pool } = await import('../config/database.js');
const { generateToken } = await import('../middleware/auth.js');
const { purgeExpiredArchivedProjects } = await import('../services/projectService.js');
const { isSundayDateKey } = await import('../services/attendanceService.js');
const { indiaDateKey, addDaysToDateKey } = await import('../utils/indiaTime.js');

let server;
let baseUrl;
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const ids = {};
const tokens = {};
const createdProjects = [];
const createdHolidays = [];

async function call(method, path, token, body) {
  const response = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await response.json().catch(() => null);
  return { status: response.status, json };
}

// The next weekday (Mon-Sat) on or after `fromKey` that has no holiday.
const nextWorkingDay = (fromKey) => {
  let key = fromKey;
  while (isSundayDateKey(key)) key = addDaysToDateKey(key, 1);
  return key;
};

test.before(async () => {
  const customer = (name) => pool.query(
    'INSERT INTO customers(name, company_name, email) VALUES ($1, $2, $3) RETURNING id',
    [`UiGen ${name}`, `UiGen ${name} Co`, `uigen-${name}-${suffix}@example.com`]
  ).then((r) => r.rows[0].id);
  ids.customerA = await customer('a');
  ids.customerB = await customer('b');
  ids.locationA = (await pool.query(
    'INSERT INTO locations(customer_id, name, city) VALUES ($1, $2, $3) RETURNING id',
    [ids.customerA, `UiGen Office ${suffix}`, 'Chennai']
  )).rows[0].id;
  ids.roomA = (await pool.query(
    'INSERT INTO rooms(location_id, name) VALUES ($1, $2) RETURNING id',
    [ids.locationA, `UiGen Room ${suffix}`]
  )).rows[0].id;
  const tech = (name) => pool.query(
    'INSERT INTO technicians(full_name, email) VALUES ($1, $2) RETURNING id',
    [`UiGen ${name} ${suffix}`, `uigen-${name}-${suffix}@example.com`]
  ).then((r) => r.rows[0].id);
  ids.technician = await tech('tech');
  ids.otherTechnician = await tech('other');
  const admin = (name, superAdmin) => pool.query(
    `INSERT INTO admins(email, password_hash, full_name, is_super_admin) VALUES ($1, 'x', $2, $3) RETURNING id, token_version`,
    [`uigen-${name}-${suffix}@example.com`, `UiGen ${name}`, superAdmin]
  ).then((r) => r.rows[0]);
  ids.superAdmin = await admin('super', true);
  ids.plainAdmin = await admin('plain', false);

  tokens.customerA = generateToken(ids.customerA, 'customer');
  tokens.customerB = generateToken(ids.customerB, 'customer');
  tokens.technician = generateToken(ids.technician, 'technician');
  tokens.otherTechnician = generateToken(ids.otherTechnician, 'technician');
  tokens.superAdmin = generateToken(ids.superAdmin.id, 'admin', { tokenVersion: ids.superAdmin.token_version, isSuperAdmin: true });
  tokens.plainAdmin = generateToken(ids.plainAdmin.id, 'admin', { tokenVersion: ids.plainAdmin.token_version });

  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.query('DELETE FROM project_activities WHERE project_id = ANY($1)', [createdProjects]);
  await pool.query('DELETE FROM projects WHERE id = ANY($1)', [createdProjects]);
  await pool.query('DELETE FROM holidays WHERE id = ANY($1)', [createdHolidays]);
  await pool.query('DELETE FROM attendance_records WHERE technician_id = ANY($1)', [[ids.technician, ids.otherTechnician]]);
  await pool.query('DELETE FROM service_requests WHERE customer_id = ANY($1)', [[ids.customerA, ids.customerB]]);
  await pool.query('DELETE FROM rooms WHERE id = $1', [ids.roomA]);
  await pool.query('DELETE FROM customers WHERE id = ANY($1)', [[ids.customerA, ids.customerB]]);
  await pool.query('DELETE FROM technicians WHERE id = ANY($1)', [[ids.technician, ids.otherTechnician]]);
  await pool.query('DELETE FROM admins WHERE id = ANY($1)', [[ids.superAdmin.id, ids.plainAdmin.id]]);
});

// ---------------------------------------------------------------- RBAC

test('a customer sees only its own customer record and cannot edit or delete customers', async () => {
  const list = await call('GET', '/customers', tokens.customerB);
  assert.equal(list.status, 200);
  assert.deepEqual(list.json.data.map((c) => c.id), [ids.customerB]);

  assert.equal((await call('GET', `/customers/${ids.customerA}`, tokens.customerB)).status, 404);
  assert.equal((await call('GET', `/customers/${ids.customerB}`, tokens.customerB)).status, 200);
  assert.equal((await call('GET', '/customers/search/query?q=UiGen', tokens.customerB)).status, 403);

  assert.equal((await call('PATCH', `/customers/${ids.customerA}`, tokens.customerB, { phone: '9000000000' })).status, 403);
  assert.equal((await call('DELETE', `/customers/${ids.customerA}`, tokens.customerB)).status, 403);
  assert.equal((await call('DELETE', `/customers/${ids.customerA}`, tokens.technician)).status, 403);
  const stillThere = await pool.query('SELECT id FROM customers WHERE id = $1', [ids.customerA]);
  assert.equal(stillThere.rows.length, 1);
});

test('customer writes need the admin customers permission', async () => {
  assert.equal((await call('PATCH', `/customers/${ids.customerA}`, tokens.plainAdmin, { phone: '9000000001' })).status, 403);
  assert.equal((await call('PATCH', `/customers/${ids.customerA}`, tokens.superAdmin, { phone: '9000000001' })).status, 200);
  // Reading stays open to every admin (ticket creation needs the list).
  assert.equal((await call('GET', '/customers', tokens.plainAdmin)).status, 200);
});

test('locations and rooms: customers are limited to their scoped lists; writes need admin permission', async () => {
  assert.equal((await call('GET', `/locations/${ids.locationA}`, tokens.customerB)).status, 403);
  assert.equal((await call('DELETE', `/locations/${ids.locationA}`, tokens.customerA)).status, 403);
  assert.equal((await call('GET', `/rooms/${ids.roomA}`, tokens.customerB)).status, 403);
  assert.equal((await call('DELETE', `/rooms/${ids.roomA}`, tokens.customerA)).status, 403);
  assert.equal((await call('DELETE', `/rooms/${ids.roomA}`, tokens.plainAdmin)).status, 403);

  const ownLocations = await call('GET', '/locations', tokens.customerA);
  assert.equal(ownLocations.status, 200);
  assert.ok(ownLocations.json.data.every((l) => l.customer_id === ids.customerA));
  assert.equal((await call('GET', `/rooms/${ids.roomA}`, tokens.technician)).status, 200);
});

test('ticket status, notes and assignment are limited to people who own the ticket', async () => {
  const created = await call('POST', '/service-requests', tokens.customerA, {
    customer_id: ids.customerA,
    location_id: ids.locationA,
    support_category: 'epabx',
    issue_category: 'Hardware',
    issue_title: `UiGen ticket ${suffix}`,
    issue_description: 'RBAC regression test',
    service_type: 'onsite_service',
    priority: 'low'
  });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  const ticketId = created.json.data.id;
  const status = async () => (await pool.query('SELECT status FROM service_requests WHERE id = $1', [ticketId])).rows[0].status;
  const before = await status();

  assert.equal((await call('PATCH', `/service-requests/${ticketId}/status`, tokens.customerB, { status: 'closed' })).status, 404);
  assert.equal((await call('PATCH', `/service-requests/${ticketId}/status`, tokens.technician, { status: 'technician_on_the_way' })).status, 404);
  assert.equal((await call('POST', `/service-requests/${ticketId}/updates`, tokens.customerB, { notes: 'not mine' })).status, 404);
  assert.equal((await call('POST', `/service-requests/${ticketId}/assign`, tokens.customerA, { technician_id: ids.technician })).status, 403);
  assert.equal((await call('POST', `/service-requests/${ticketId}/assign`, tokens.technician, { technician_id: ids.technician })).status, 403);
  assert.equal(await status(), before);

  const assigned = await call('POST', `/service-requests/${ticketId}/assign`, tokens.superAdmin, { technician_id: ids.technician });
  assert.equal(assigned.status, 200, JSON.stringify(assigned.json));
  assert.equal((await call('PATCH', `/service-requests/${ticketId}/status`, tokens.technician, { status: 'technician_on_the_way' })).status, 200);
  assert.equal((await call('PATCH', `/service-requests/${ticketId}/status`, tokens.otherTechnician, { status: 'service_in_progress' })).status, 404);
  assert.equal((await call('POST', `/service-requests/${ticketId}/updates`, tokens.customerA, { notes: 'any update?' })).status, 201);
});

test('admin module permissions: projects/attendance/back-office/approvals are enforced and reported', async () => {
  const mine = await call('GET', '/admin/me/permissions', tokens.plainAdmin);
  assert.equal(mine.status, 200);
  assert.equal(mine.json.data.isSuperAdmin, false);
  assert.equal(mine.json.data.permissions.projects, false);

  assert.equal((await call('GET', '/projects', tokens.plainAdmin)).status, 403);
  assert.equal((await call('GET', '/admin/attendance', tokens.plainAdmin)).status, 403);
  assert.equal((await call('GET', '/back-office', tokens.plainAdmin)).status, 403);
  assert.equal((await call('GET', '/password-reset/admin/pending', tokens.plainAdmin)).status, 403);
  // Module toggles are readable by any admin; changing them is not.
  assert.equal((await call('GET', '/admin/settings', tokens.plainAdmin)).status, 200);
  assert.equal((await call('PUT', '/admin/settings', tokens.plainAdmin, { enabled_modules: {} })).status, 403);

  await pool.query(
    `INSERT INTO admin_permissions(admin_id, module, can_access) VALUES ($1, 'projects', true)`,
    [ids.plainAdmin.id]
  );
  assert.equal((await call('GET', '/projects', tokens.plainAdmin)).status, 200);
  assert.equal((await call('GET', '/admin/me/permissions', tokens.plainAdmin)).json.data.permissions.projects, true);

  const superMine = await call('GET', '/admin/me/permissions', tokens.superAdmin);
  assert.equal(superMine.json.data.isSuperAdmin, true);
  assert.ok(Object.values(superMine.json.data.permissions).every(Boolean));
});

// ---------------------------------------------------------------- Projects

async function createProject(name) {
  const res = await call('POST', '/projects', tokens.superAdmin, { name, customer: 'UiGen Co', location: 'Chennai' });
  assert.equal(res.status, 201, JSON.stringify(res.json));
  createdProjects.push(res.json.data.id);
  return res.json.data.id;
}

test('a project without history is deleted at once', async () => {
  const id = await createProject(`UiGen empty ${suffix}`);
  const res = await call('DELETE', `/projects/${id}`, tokens.superAdmin);
  assert.equal(res.status, 200);
  assert.equal(res.json.data.archived, false);
  assert.equal((await pool.query('SELECT id FROM projects WHERE id = $1', [id])).rows.length, 0);
});

test('a project with history needs confirmation, is archived for 3 days, restorable, then purged', async () => {
  const id = await createProject(`UiGen history ${suffix}`);
  const assigned = await call('POST', `/projects/${id}/activities`, tokens.superAdmin, {
    scheduled_date: indiaDateKey(), scheduled_time: '10:00', technician_ids: [ids.technician]
  });
  assert.equal(assigned.status, 201, JSON.stringify(assigned.json));

  const refused = await call('DELETE', `/projects/${id}`, tokens.superAdmin);
  assert.equal(refused.status, 409);
  assert.equal(refused.json.code, 'HAS_ACTIVITIES');
  assert.equal(refused.json.activityCount, 1);

  const archived = await call('DELETE', `/projects/${id}?withHistory=true`, tokens.superAdmin);
  assert.equal(archived.status, 200);
  assert.equal(archived.json.data.archived, true);
  assert.ok(archived.json.data.purge_at);

  const list = await call('GET', '/projects', tokens.superAdmin);
  assert.ok(!list.json.data.some((p) => p.id === id), 'archived project must leave the main list');
  const archivedList = await call('GET', '/projects/archived', tokens.superAdmin);
  assert.ok(archivedList.json.data.some((p) => p.id === id && p.purge_at));
  assert.equal((await call('PATCH', `/projects/${id}`, tokens.superAdmin, { name: 'edited' })).status, 409);
  const techActivities = await call('GET', '/technician/project-activities', tokens.technician);
  if (techActivities.status === 200) {
    assert.ok(!techActivities.json.data.some((a) => a.project_id === id), 'technician must not see archived project work');
  }

  assert.equal((await call('POST', `/projects/${id}/restore`, tokens.superAdmin)).status, 200);
  assert.ok((await call('GET', '/projects', tokens.superAdmin)).json.data.some((p) => p.id === id));

  // Archive again and age it past the retention window.
  assert.equal((await call('DELETE', `/projects/${id}?withHistory=true`, tokens.superAdmin)).status, 200);
  await pool.query(`UPDATE projects SET archived_at = now() - interval '4 days' WHERE id = $1`, [id]);
  const purged = await purgeExpiredArchivedProjects({ force: true });
  assert.ok(purged >= 1);
  assert.equal((await pool.query('SELECT id FROM projects WHERE id = $1', [id])).rows.length, 0);
  assert.equal((await pool.query('SELECT id FROM project_activities WHERE project_id = $1', [id])).rows.length, 0);
});

// ---------------------------------------------------------------- Attendance

const rowFor = (data, employeeId) => data.rows.find((r) => r.employee.id === employeeId);

test('Sundays and configured holidays show as Holiday, never Absent', async () => {
  const sunday = (() => { let k = addDaysToDateKey(indiaDateKey(), 30); while (!isSundayDateKey(k)) k = addDaysToDateKey(k, 1); return k; })();
  const sundayList = await call('GET', `/admin/attendance?date=${sunday}`, tokens.superAdmin);
  assert.equal(sundayList.status, 200);
  assert.equal(rowFor(sundayList.json.data, ids.technician).bucket, 'holiday');
  assert.equal(rowFor(sundayList.json.data, ids.technician).holiday, 'Sunday');
  assert.equal(sundayList.json.data.holiday.name, 'Sunday');

  const festival = nextWorkingDay(addDaysToDateKey(indiaDateKey(), 40));
  const created = await call('POST', '/admin/attendance/holidays', tokens.superAdmin, { date: festival, name: 'Diwali' });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  createdHolidays.push(created.json.data.id);
  assert.equal((await call('POST', '/admin/attendance/holidays', tokens.superAdmin, { date: festival, name: 'Diwali again' })).status, 409);

  const festivalList = await call('GET', `/admin/attendance?date=${festival}&card=absent`, tokens.superAdmin);
  assert.ok(!rowFor(festivalList.json.data, ids.technician), 'holiday rows are not in the Absent list');
  const fullList = await call('GET', `/admin/attendance?date=${festival}`, tokens.superAdmin);
  assert.equal(rowFor(fullList.json.data, ids.technician).bucket, 'holiday');
  assert.equal(rowFor(fullList.json.data, ids.technician).holiday, 'Diwali');

  const markAll = await call('POST', '/admin/attendance/mark-all-absent', tokens.superAdmin, { date: festival, search: `UiGen tech ${suffix}` });
  assert.equal(markAll.status, 200, JSON.stringify(markAll.json));
  assert.equal(markAll.json.data.markedCount, 0);

  const exported = await call('GET', `/admin/attendance/export?start_date=${festival}&end_date=${addDaysToDateKey(festival, 1)}&search=${encodeURIComponent(`UiGen tech ${suffix}`)}`, tokens.superAdmin);
  assert.equal(exported.status, 200);
  assert.deepEqual(exported.json.data.rows.map((r) => [r.date, r.bucket]),
    [[festival, 'holiday'], [addDaysToDateKey(festival, 1), isSundayDateKey(addDaysToDateKey(festival, 1)) ? 'holiday' : 'unmarked']]);

  const mine = await call('GET', `/attendance/holidays?from=${festival}&to=${festival}`, tokens.technician);
  assert.deepEqual(mine.json.data, [{ date: festival, name: 'Diwali' }]);

  assert.equal((await call('POST', '/attendance/leave', tokens.technician, { date: festival, reason: 'Trip' })).status, 409);
  assert.equal((await call('DELETE', `/admin/attendance/holidays/${created.json.data.id}`, tokens.superAdmin)).status, 200);
});

test('employee leave: needs a reason, applies, shows as Leave, cannot be doubled, can be cancelled', async () => {
  const day = nextWorkingDay(addDaysToDateKey(indiaDateKey(), 3));
  assert.equal((await call('POST', '/attendance/leave', tokens.technician, { date: day, reason: '  ' })).status, 400);
  assert.equal((await call('POST', '/attendance/leave', tokens.technician, { date: addDaysToDateKey(indiaDateKey(), -2), reason: 'Late entry' })).status, 400);
  assert.equal((await call('POST', '/attendance/leave', tokens.technician, { date: addDaysToDateKey(indiaDateKey(), 120), reason: 'Far away' })).status, 400);

  const applied = await call('POST', '/attendance/leave', tokens.technician, { date: day, reason: 'Family function' });
  assert.equal(applied.status, 201, JSON.stringify(applied.json));
  assert.equal(applied.json.data.status, 'leave');
  assert.equal(applied.json.data.leave_reason, 'Family function');
  assert.equal((await call('POST', '/attendance/leave', tokens.technician, { date: day, reason: 'again' })).status, 409);

  const list = await call('GET', `/admin/attendance?date=${day}&card=leave`, tokens.superAdmin);
  assert.equal(rowFor(list.json.data, ids.technician).bucket, 'leave');
  assert.ok(list.json.data.counts.leave >= 1);

  assert.equal((await call('POST', '/attendance/leave/cancel', tokens.technician, { date: day })).status, 200);
  assert.equal((await pool.query('SELECT id FROM attendance_records WHERE technician_id = $1 AND attendance_date = $2', [ids.technician, day])).rows.length, 0);
  assert.equal((await call('POST', '/attendance/leave/cancel', tokens.technician, { date: day })).status, 404);
});

test('admin can record leave for a past absent day; employees cannot', async () => {
  const past = (() => { let k = addDaysToDateKey(indiaDateKey(), -3); while (isSundayDateKey(k)) k = addDaysToDateKey(k, -1); return k; })();
  assert.equal((await call('POST', `/admin/attendance/technician/${ids.technician}/mark-absent`, tokens.superAdmin, { date: past })).status, 201);
  const applied = await call('POST', `/admin/attendance/technician/${ids.technician}/leave`, tokens.superAdmin, { date: past, half_day: true, reason: 'Doctor visit' });
  assert.equal(applied.status, 201, JSON.stringify(applied.json));
  assert.equal(applied.json.data.status, 'half_day_leave');
  assert.equal(applied.json.data.half_day, true);
  assert.equal(applied.json.data.marked_absent_by, ids.superAdmin.id);
  assert.equal((await call('POST', `/admin/attendance/technician/${ids.technician}/cancel-leave`, tokens.superAdmin, { date: past })).status, 200);
});

test('half-day leave keeps check-in working for the other half', async (t) => {
  const today = indiaDateKey();
  if (isSundayDateKey(today)) return t.skip('today is a Sunday holiday');

  const applied = await call('POST', '/attendance/leave', tokens.otherTechnician, { half_day: true, reason: 'Bank work' });
  assert.equal(applied.status, 201, JSON.stringify(applied.json));
  assert.equal(applied.json.data.status, 'half_day_leave');

  const checkedIn = await call('POST', '/attendance/check-in', tokens.otherTechnician, { location_status: 'permission_denied' });
  assert.equal(checkedIn.status, 201, JSON.stringify(checkedIn.json));
  assert.equal(checkedIn.json.data.status, 'checked_in');
  assert.equal(checkedIn.json.data.half_day, true);
  assert.equal(checkedIn.json.data.leave_reason, 'Bank work');

  const list = await call('GET', `/admin/attendance?date=${today}&card=leave`, tokens.superAdmin);
  assert.ok(rowFor(list.json.data, ids.otherTechnician), 'a half-day row with a check-in is still in the Leave list');

  const checkedOut = await call('POST', `/attendance/${checkedIn.json.data.id}/check-out`, tokens.otherTechnician);
  assert.equal(checkedOut.status, 200);
  assert.equal(checkedOut.json.data.half_day, true);

  const cancelled = await call('POST', '/attendance/leave/cancel', tokens.otherTechnician, {});
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.json.data.status, 'checked_out');
  assert.equal(cancelled.json.data.half_day, false);
});

test('full leave today blocks check-in until cancelled', async (t) => {
  const today = indiaDateKey();
  if (isSundayDateKey(today)) return t.skip('today is a Sunday holiday');
  assert.equal((await call('POST', '/attendance/leave', tokens.technician, { reason: 'Unwell' })).status, 201);
  const blocked = await call('POST', '/attendance/check-in', tokens.technician, { location_status: 'permission_denied' });
  assert.equal(blocked.status, 409);
  assert.match(blocked.json.error, /on leave/);
  assert.equal((await call('POST', '/attendance/leave/cancel', tokens.technician, {})).status, 200);
  assert.equal((await call('POST', '/attendance/check-in', tokens.technician, { location_status: 'permission_denied' })).status, 201);
});
