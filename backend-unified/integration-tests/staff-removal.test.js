// Staff removal end to end (PLAN_Staff_Removal.md, migration 040): Remove
// locks a Technician / Sales / Back-Office employee out for good, deletes
// their attendance and hands over open work, while finished work stays.
// Delete is refused while there is work history. Same pattern as
// api.test.js: real HTTP server, real PostgreSQL, no mocks.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET ||= 'integration-access-secret-change-me';
process.env.JWT_REFRESH_SECRET ||= 'integration-refresh-secret-change-me';

const { default: app } = await import('../server.js');
// See integration-tests/api.test.js's import comment: the shared pool is
// never closed by an individual file.
const { pool } = await import('../config/database.js');
const { generateToken, generateRefreshToken, hashPassword } = await import('../middleware/auth.js');

let server;
let baseUrl;
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const ids = {};
const tokens = {};
const TECH_PASSWORD = 'removal-test-pass';

async function call(method, path, token, body) {
  const response = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await response.json().catch(() => null);
  return { status: response.status, json };
}

const one = async (sql, values) => (await pool.query(sql, values)).rows[0];
const insertId = (sql, values) => one(sql, values).then((r) => r.id);

const ticket = (title, status, technicianId) => insertId(
  `INSERT INTO service_requests (customer_id, location_id, issue_category, issue_title, issue_description, status, assigned_technician_id, support_category, priority)
   VALUES ($1, $2, 'Hardware', $3, 'Staff removal test', $4, $5, 'epabx', 'low') RETURNING id`,
  [ids.customer, ids.location, `${title} ${suffix}`, status, technicianId]
);
const attendance = (column, id) => pool.query(
  `INSERT INTO attendance_records (${column}, status, location_status) VALUES ($1, 'absent', 'no_location')`, [id]
);
const lead = (status, salesId) => insertId(
  'INSERT INTO leads (company, phone, status, assigned_to) VALUES ($1, $2, $3, $4) RETURNING id',
  [`Removal Co ${status} ${suffix}`, `9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`, status, salesId]
);

test.before(async () => {
  ids.customer = await insertId(
    'INSERT INTO customers(name, company_name, email) VALUES ($1, $2, $3) RETURNING id',
    ['Removal Customer', 'Removal Customer Co', `removal-customer-${suffix}@example.com`]
  );
  ids.location = await insertId(
    'INSERT INTO locations(customer_id, name, city) VALUES ($1, $2, $3) RETURNING id',
    [ids.customer, `Removal Office ${suffix}`, 'Chennai']
  );
  const passwordHash = await hashPassword(TECH_PASSWORD);
  const tech = (name) => insertId(
    'INSERT INTO technicians(full_name, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
    [name, `removal-${name.toLowerCase().replace(/ /g, '-')}-${suffix}@example.com`, passwordHash]
  );
  ids.tech = await tech('Removal Tech');
  ids.otherTech = await tech('Other Tech');
  ids.newTech = await tech('New Tech');
  ids.sales = await insertId(
    'INSERT INTO sales(full_name, email) VALUES ($1, $2) RETURNING id',
    ['Removal Sales', `removal-sales-${suffix}@example.com`]
  );
  ids.backOffice = await insertId(
    'INSERT INTO back_office(full_name, email) VALUES ($1, $2) RETURNING id',
    ['Removal Back Office', `removal-bo-${suffix}@example.com`]
  );
  ids.admin = await one(
    `INSERT INTO admins (email, password_hash, full_name, is_active, is_super_admin)
     VALUES ($1, 'x', 'Removal Admin', true, true) RETURNING id, token_version`,
    [`removal-admin-${suffix}@example.com`]
  );

  // Technician work: an open ticket, an active ticket, a completed one with a
  // report, and co-technician rows on an open and on a completed ticket.
  ids.openTicket = await ticket('Open', 'assigned', ids.tech);
  ids.activeTicket = await ticket('Active', 'active', ids.tech);
  ids.doneTicket = await ticket('Done', 'completed', ids.tech);
  ids.coOpenTicket = await ticket('Co open', 'assigned', ids.otherTech);
  ids.coDoneTicket = await ticket('Co done', 'completed', ids.otherTech);
  await pool.query(
    'INSERT INTO service_request_technicians (service_request_id, technician_id) VALUES ($1, $3), ($2, $3)',
    [ids.coOpenTicket, ids.coDoneTicket, ids.tech]
  );
  await pool.query(
    `INSERT INTO service_reports (service_request_id, work_done, tech_signed, tech_signer_name)
     VALUES ($1, 'Replaced card', true, 'Removal Tech')`, [ids.doneTicket]
  );
  await attendance('technician_id', ids.tech);
  await attendance('technician_id', ids.otherTech);

  // Sales work: Won, Lost and an open lead, a daily report.
  ids.wonLead = await lead('won', ids.sales);
  ids.lostLead = await lead('lost', ids.sales);
  ids.openLead = await lead('proposal', ids.sales);
  await pool.query('INSERT INTO sales_daily_reports (sales_id, report_date) VALUES ($1, current_date)', [ids.sales]);
  await attendance('sales_id', ids.sales);
  await attendance('back_office_id', ids.backOffice);

  tokens.admin = generateToken(ids.admin.id, 'admin', { tokenVersion: ids.admin.token_version });
  tokens.customer = generateToken(ids.customer, 'customer');
  // No tokenVersion claim, like every technician token issued before 040.
  tokens.tech = generateToken(ids.tech, 'technician');
  tokens.techRefresh = generateRefreshToken(ids.tech, 'technician');
  tokens.otherTech = generateToken(ids.otherTech, 'technician');
  tokens.sales = generateToken(ids.sales, 'sales', { tokenVersion: 0 });
  tokens.backOffice = generateToken(ids.backOffice, 'back_office');

  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await pool.query('DELETE FROM service_requests WHERE customer_id = $1', [ids.customer]);
  await pool.query('DELETE FROM customers WHERE id = $1', [ids.customer]);
  await pool.query('DELETE FROM leads WHERE id = ANY($1)', [[ids.wonLead, ids.lostLead, ids.openLead]]);
  await pool.query('DELETE FROM attendance_records WHERE technician_id = ANY($1)', [[ids.tech, ids.otherTech, ids.newTech]]);
  await pool.query('DELETE FROM technicians WHERE id = ANY($1)', [[ids.tech, ids.otherTech, ids.newTech]]);
  await pool.query('DELETE FROM sales WHERE id = $1', [ids.sales]);
  await pool.query('DELETE FROM back_office WHERE id = $1', [ids.backOffice]);
  await pool.query('DELETE FROM admins WHERE id = $1', [ids.admin.id]);
});

test('only an admin can create, edit, remove or delete technicians', async () => {
  for (const token of [tokens.customer, tokens.otherTech]) {
    assert.equal((await call('POST', '/technicians', token, { full_name: 'X', email: `x-${suffix}@example.com` })).status, 403);
    assert.equal((await call('PATCH', `/technicians/${ids.tech}`, token, { full_name: 'X', email: 'x@example.com' })).status, 403);
    assert.equal((await call('POST', `/technicians/${ids.tech}/remove`, token)).status, 403);
    assert.equal((await call('DELETE', `/technicians/${ids.tech}`, token)).status, 403);
  }
  // Reads are unchanged for any signed-in user.
  assert.equal((await call('GET', '/technicians', tokens.otherTech)).status, 200);
});

test('technician: preview, delete refused with history, then remove', async () => {
  const preview = await call('GET', `/technicians/${ids.tech}/removal-preview`, tokens.admin);
  assert.equal(preview.status, 200);
  assert.equal(preview.json.data.openTickets, 2);
  assert.equal(preview.json.data.completedTickets, 1);
  assert.equal(preview.json.data.attendanceRecords, 1);
  assert.equal(preview.json.data.canDelete, false);

  assert.equal((await call('DELETE', `/technicians/${ids.tech}`, tokens.admin)).status, 409);

  // Works before removal (token without a tokenVersion claim).
  assert.equal((await call('GET', '/technician/dashboard', tokens.tech)).status, 200);

  const removed = await call('POST', `/technicians/${ids.tech}/remove`, tokens.admin);
  assert.equal(removed.status, 200, JSON.stringify(removed.json));
  assert.equal(removed.json.data.ticketsUnassigned, 2);
  assert.equal(removed.json.data.attendanceDeleted, 1);

  const row = await one('SELECT is_active, token_version, removed_at, removed_by FROM technicians WHERE id = $1', [ids.tech]);
  assert.equal(row.is_active, false);
  assert.equal(row.token_version, 1);
  assert.ok(row.removed_at);
  assert.equal(row.removed_by, ids.admin.id);

  const tickets = (await pool.query(
    'SELECT id, status, assigned_technician_id FROM service_requests WHERE id = ANY($1)',
    [[ids.openTicket, ids.activeTicket, ids.doneTicket]]
  )).rows;
  const byId = Object.fromEntries(tickets.map((t) => [t.id, t]));
  for (const id of [ids.openTicket, ids.activeTicket]) {
    assert.equal(byId[id].status, 'unassigned');
    assert.equal(byId[id].assigned_technician_id, null);
  }
  assert.equal(byId[ids.doneTicket].status, 'completed');
  assert.equal(byId[ids.doneTicket].assigned_technician_id, ids.tech);
  assert.ok(await one('SELECT 1 FROM service_reports WHERE service_request_id = $1', [ids.doneTicket]));

  const coRows = (await pool.query(
    'SELECT service_request_id FROM service_request_technicians WHERE technician_id = $1', [ids.tech]
  )).rows.map((r) => r.service_request_id);
  assert.deepEqual(coRows, [ids.coDoneTicket]);

  assert.equal((await one('SELECT COUNT(*)::int AS n FROM attendance_records WHERE technician_id = $1', [ids.tech])).n, 0);
  // Another technician's attendance and session are untouched.
  assert.equal((await one('SELECT COUNT(*)::int AS n FROM attendance_records WHERE technician_id = $1', [ids.otherTech])).n, 1);
  assert.equal((await call('GET', '/technician/dashboard', tokens.otherTech)).status, 200);

  assert.equal((await call('POST', `/technicians/${ids.tech}/remove`, tokens.admin)).status, 409);
});

test('a removed technician is locked out everywhere', async () => {
  assert.equal((await call('GET', '/technician/dashboard', tokens.tech)).status, 401);
  assert.equal((await call('GET', '/technicians', tokens.tech)).status, 401);
  assert.equal((await call('GET', '/service-requests', tokens.tech)).status, 401);
  assert.equal((await call('GET', '/attendance/today', tokens.tech)).status, 401);
  assert.equal((await call('GET', '/auth/session', tokens.tech)).status, 401);
  assert.equal((await call('POST', '/auth/refresh', null, { refreshToken: tokens.techRefresh })).status, 401);

  const email = (await one('SELECT email FROM technicians WHERE id = $1', [ids.tech])).email;
  assert.equal((await call('POST', '/auth/technician/login', null, { email, password: TECH_PASSWORD })).status, 401);
  assert.equal((await call('POST', '/password-reset/technician/request-otp', null, { email })).status, 404);
  assert.equal((await call('POST', '/password-reset/technician/verify-otp', null, { email, otp: '1234' })).status, 400);

  // Re-creating the same email is refused with a clear reason.
  const recreate = await call('POST', '/technicians', tokens.admin, { full_name: 'Again', email });
  assert.equal(recreate.status, 400);
  assert.match(recreate.json.error, /removed employee/);
});

test('a resubmitted report by a different technician replaces the technician drawing', async () => {
  const sig = (path) => ({ path, width: 500, height: 110 });
  const ticketId = await ticket('Resubmit', 'assigned', ids.newTech);
  const reportId = await insertId(
    `INSERT INTO service_reports (service_request_id, work_done, tech_signed, tech_signer_name)
     VALUES ($1, 'First visit', true, 'Removal Tech') RETURNING id`, [ticketId]
  );
  await pool.query(
    `INSERT INTO service_report_signatures (service_report_id, party, path_data, width, height, signer_name)
     VALUES ($1, 'technician', 'M1 1L2 2', 500, 110, 'Removal Tech')`, [reportId]
  );
  const res = await call('POST', `/service-requests/${ticketId}/report`, generateToken(ids.newTech, 'technician'), {
    work_done: 'Finished', tech_signer_name: 'New Tech', customer_signer_details: 'Cust - 9000000000',
    customer_present: false, tech_signature: sig('M5 5L9 9')
  });
  assert.equal(res.status, 201, JSON.stringify(res.json));
  const stored = await one(
    `SELECT path_data, signer_name FROM service_report_signatures WHERE service_report_id = $1 AND party = 'technician'`, [reportId]
  );
  assert.deepEqual(stored, { path_data: 'M5 5L9 9', signer_name: 'New Tech' });
});

test('sales: closed leads archived with owner kept, open leads reopened, reports kept', async () => {
  assert.equal((await call('GET', '/sales-leads/mine', tokens.sales)).status, 200);
  const preview = await call('GET', `/sales/${ids.sales}/removal-preview`, tokens.admin);
  assert.equal(preview.json.data.closedLeads, 2);
  assert.equal(preview.json.data.openLeads, 1);
  assert.equal(preview.json.data.canDelete, false);
  assert.equal((await call('DELETE', `/sales/${ids.sales}`, tokens.admin)).status, 409);

  const removed = await call('POST', `/sales/${ids.sales}/remove`, tokens.admin);
  assert.equal(removed.status, 200, JSON.stringify(removed.json));
  assert.equal(removed.json.data.leadsArchived, 2);
  assert.equal(removed.json.data.leadsReopened, 1);

  const leads = (await pool.query(
    'SELECT id, status, assigned_to, archived_at, archive_reason FROM leads WHERE id = ANY($1)',
    [[ids.wonLead, ids.lostLead, ids.openLead]]
  )).rows;
  const byId = Object.fromEntries(leads.map((l) => [l.id, l]));
  for (const id of [ids.wonLead, ids.lostLead]) {
    assert.ok(byId[id].archived_at);
    assert.equal(byId[id].archive_reason, 'owner_removed');
    assert.equal(byId[id].assigned_to, ids.sales);
  }
  assert.equal(byId[ids.openLead].assigned_to, null);
  assert.equal(byId[ids.openLead].archived_at, null);
  assert.equal(byId[ids.openLead].status, 'proposal');

  assert.equal((await one('SELECT COUNT(*)::int AS n FROM sales_daily_reports WHERE sales_id = $1', [ids.sales])).n, 1);
  assert.equal((await one('SELECT COUNT(*)::int AS n FROM attendance_records WHERE sales_id = $1', [ids.sales])).n, 0);
  assert.equal((await call('GET', '/sales-leads/mine', tokens.sales)).status, 401);
  assert.equal((await call('GET', '/attendance/today', tokens.sales)).status, 401);
});

test('back office: remove locks out and deletes attendance; delete works with no history', async () => {
  assert.equal((await call('GET', '/attendance/today', tokens.backOffice)).status, 200);
  const removed = await call('POST', `/back-office/${ids.backOffice}/remove`, tokens.admin);
  assert.equal(removed.status, 200, JSON.stringify(removed.json));
  assert.equal(removed.json.data.attendanceDeleted, 1);
  assert.equal((await call('GET', '/attendance/today', tokens.backOffice)).status, 401);
  assert.equal((await call('GET', '/auth/session', tokens.backOffice)).status, 401);

  const spare = await insertId(
    'INSERT INTO back_office(full_name, email) VALUES ($1, $2) RETURNING id', ['Spare BO', `spare-bo-${suffix}@example.com`]
  );
  await attendance('back_office_id', spare);
  assert.equal((await call('DELETE', `/back-office/${spare}`, tokens.admin)).status, 200);
  assert.equal(await one('SELECT id FROM back_office WHERE id = $1', [spare]), undefined);
});

test('a technician with no work history can still be deleted outright', async () => {
  const spare = await insertId(
    'INSERT INTO technicians(full_name, email) VALUES ($1, $2) RETURNING id', ['Spare Tech', `spare-tech-${suffix}@example.com`]
  );
  await attendance('technician_id', spare);
  const res = await call('DELETE', `/technicians/${spare}`, tokens.admin);
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.equal(await one('SELECT id FROM technicians WHERE id = $1', [spare]), undefined);
});
