// Regression tests for the Sales audit fixes that need a real database:
// live sessions on shared routes, the Follow-up ↔ Hold clock, Won only from
// Proposal, Won requests + auto-closing duplicates, close reasons, Won leads
// can't be archived, and the clock restart on reassignment.
// Writes to the database in DATABASE_URL — run against a test database.
import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';

process.env.JWT_SECRET ||= 'integration-access-secret-change-me';
process.env.JWT_REFRESH_SECRET ||= 'integration-refresh-secret-change-me';

const { default: app } = await import('../server.js');
const { pool } = await import('../config/database.js');
const { generateToken } = await import('../middleware/auth.js');

let server;
let baseUrl;

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

const suffix = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const headers = (token) => ({ authorization: `Bearer ${token}`, 'content-type': 'application/json' });

async function createSuperAdmin(t) {
  const passwordHash = await bcrypt.hash('TestPassword123!', 10);
  const { rows } = await pool.query(
    `INSERT INTO admins (email, password_hash, full_name, is_active, is_super_admin)
     VALUES ($1, $2, 'Audit Test Admin', true, true) RETURNING id, token_version`,
    [`audit-admin-${suffix()}@example.com`, passwordHash]
  );
  t.after(() => pool.query('DELETE FROM admins WHERE id = $1', [rows[0].id]));
  return { id: rows[0].id, token: generateToken(rows[0].id, 'admin', { isSuperAdmin: true, tokenVersion: rows[0].token_version }) };
}

async function createSales(t) {
  const { rows } = await pool.query(
    `INSERT INTO sales (email, full_name, is_active) VALUES ($1, 'Audit Test Sales', true) RETURNING id, token_version`,
    [`audit-sales-${suffix()}@example.com`]
  );
  t.after(() => pool.query('DELETE FROM sales WHERE id = $1', [rows[0].id]));
  return { id: rows[0].id, token: generateToken(rows[0].id, 'sales', { tokenVersion: rows[0].token_version }) };
}

const call = (method, path, token, body) => fetch(`${baseUrl}/api/sales-leads${path}`, {
  method, headers: headers(token), ...(body ? { body: JSON.stringify(body) } : {})
});

// An Admin-created, Won-ready lead (contact + email) assigned to `sales`.
async function createAssignedLead(t, admin, sales, overrides = {}) {
  const res = await call('POST', '/', admin.token, {
    company: `Audit Co ${suffix()}`, phone: '9811100000', person_to_contact: 'Asha', email: 'asha@example.com',
    confirm_duplicate: true, ...overrides
  });
  const lead = (await res.json()).data;
  t.after(() => pool.query('DELETE FROM leads WHERE id = $1', [lead.id]));
  if (sales) assert.equal((await call('POST', `/${lead.id}/assign`, admin.token, { sales_id: sales.id })).status, 200);
  return lead;
}

async function toProposal(token, leadId) {
  assert.equal((await call('PATCH', `/${leadId}/status`, token, { status: 'meeting' })).status, 200);
  const res = await call('PATCH', `/${leadId}/status`, token, { status: 'proposal', value_estimate: 50000, ref_id: `REF-${suffix()}` });
  assert.equal(res.status, 200);
}

const leadRow = async (id) => (await pool.query('SELECT * FROM leads WHERE id = $1', [id])).rows[0];

test('shared lead routes reject a deactivated admin and a revoked Sales session', async (t) => {
  const admin = await createSuperAdmin(t);
  const sales = await createSales(t);
  const lead = await createAssignedLead(t, admin, sales);

  assert.equal((await call('GET', `/${lead.id}`, sales.token)).status, 200);
  await pool.query('UPDATE sales SET token_version = token_version + 1 WHERE id = $1', [sales.id]);
  assert.equal((await call('GET', `/${lead.id}`, sales.token)).status, 401);
  assert.equal((await call('PATCH', `/${lead.id}/remarks`, sales.token, { remarks: 'x' })).status, 401);

  const other = await createSuperAdmin(t);
  await pool.query('UPDATE admins SET is_active = false WHERE id = $1', [other.id]);
  assert.equal((await call('PATCH', `/${lead.id}/status`, other.token, { status: 'dead', lost_reason: 'other', lost_note: 'x' })).status, 401);
  assert.equal((await call('POST', '/stream-ticket', other.token)).status, 401);
});

test('the stream no longer accepts a raw token, only a ticket', async (t) => {
  const admin = await createSuperAdmin(t);
  assert.equal((await fetch(`${baseUrl}/api/sales-leads/stream?token=${admin.token}`)).status, 401);
  const ticket = (await (await call('POST', '/stream-ticket', admin.token)).json()).data.ticket;
  const controller = new AbortController();
  const res = await fetch(`${baseUrl}/api/sales-leads/stream?ticket=${ticket}`, { signal: controller.signal });
  assert.equal(res.status, 200);
  controller.abort();
  // Single use.
  assert.equal((await fetch(`${baseUrl}/api/sales-leads/stream?ticket=${ticket}`)).status, 401);
});

test('Sales cannot mark Won before Proposal; Lost needs a reason', async (t) => {
  const admin = await createSuperAdmin(t);
  const sales = await createSales(t);
  const lead = await createAssignedLead(t, admin, sales);
  assert.equal((await call('PATCH', `/${lead.id}/status`, sales.token, { status: 'won' })).status, 400);
  assert.equal((await call('PATCH', `/${lead.id}/status`, sales.token, { status: 'lost' })).status, 400);
  const res = await call('PATCH', `/${lead.id}/status`, sales.token, { status: 'lost', lost_reason: 'price' });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).data.lost_reason, 'price');
});

test('moving Follow-up ↔ Hold keeps the stage clock', async (t) => {
  const admin = await createSuperAdmin(t);
  const sales = await createSales(t);
  const lead = await createAssignedLead(t, admin, sales);
  await toProposal(sales.token, lead.id);
  assert.equal((await call('PATCH', `/${lead.id}/status`, sales.token, { status: 'follow_up', value_estimate: 50000, ref_id: 'REF-FU' })).status, 200);
  await pool.query("UPDATE leads SET status_changed_at = now() - interval '12 days' WHERE id = $1", [lead.id]);
  const clock = (await leadRow(lead.id)).status_changed_at.getTime();
  assert.equal((await call('PATCH', `/${lead.id}/status`, sales.token, { status: 'hold' })).status, 200);
  assert.equal((await call('PATCH', `/${lead.id}/status`, sales.token, { status: 'follow_up' })).status, 200);
  assert.equal((await leadRow(lead.id)).status_changed_at.getTime(), clock);
});

test('a Sales Won with no duplicates is immediate; Won leads cannot be archived', async (t) => {
  const admin = await createSuperAdmin(t);
  const sales = await createSales(t);
  const lead = await createAssignedLead(t, admin, sales, { phone: '9811100001' });
  await toProposal(sales.token, lead.id);
  const res = await call('PATCH', `/${lead.id}/status`, sales.token, { status: 'won' });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).data.won_request_pending, false);
  assert.equal((await leadRow(lead.id)).status, 'won');
  assert.equal((await call('DELETE', `/${lead.id}`, admin.token)).status, 409);
});

test('a Sales Won on a duplicate waits for Admin; approval closes the other duplicate as Lost', async (t) => {
  const admin = await createSuperAdmin(t);
  const salesA = await createSales(t);
  const salesB = await createSales(t);
  const company = `Dup Co ${suffix()}`;
  const a = await createAssignedLead(t, admin, salesA, { company: `${company} Pvt. Ltd.`, phone: '9811100002' });
  const b = await createAssignedLead(t, admin, salesB, { company, phone: '+91 98111 00002' });
  await toProposal(salesA.token, a.id);
  await toProposal(salesB.token, b.id);

  const res = await call('PATCH', `/${a.id}/status`, salesA.token, { status: 'won' });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).data.won_request_pending, true);
  assert.equal((await leadRow(a.id)).status, 'proposal');
  // Locked for Sales while pending.
  const locked = await call('PATCH', `/${a.id}/status`, salesA.token, { status: 'lost', lost_reason: 'price' });
  assert.equal(locked.status, 409);
  assert.equal((await locked.json()).code, 'WON_PENDING');
  assert.equal((await call('POST', `/${a.id}/release`, salesA.token, { reason: 'x' })).status, 409);

  assert.equal((await call('POST', `/${a.id}/won-request`, admin.token, { action: 'approve' })).status, 200);
  assert.equal((await leadRow(a.id)).status, 'won');
  const closed = await leadRow(b.id);
  assert.equal(closed.status, 'lost');
  assert.equal(closed.lost_reason, 'duplicate');
});

test('rejecting a Won request gives back the paused time', async (t) => {
  const admin = await createSuperAdmin(t);
  const salesA = await createSales(t);
  const salesB = await createSales(t);
  const company = `Pause Co ${suffix()}`;
  const a = await createAssignedLead(t, admin, salesA, { company, phone: '9811100003' });
  await createAssignedLead(t, admin, salesB, { company, phone: '9811100003' });
  await toProposal(salesA.token, a.id);
  await call('PATCH', `/${a.id}/status`, salesA.token, { status: 'won' });
  await pool.query("UPDATE leads SET won_requested_at = now() - interval '3 days', status_changed_at = status_changed_at - interval '3 days' WHERE id = $1", [a.id]);
  const before = (await leadRow(a.id)).status_changed_at.getTime();

  assert.equal((await call('POST', `/${a.id}/won-request`, admin.token, { action: 'reject' })).status, 400);
  assert.equal((await call('POST', `/${a.id}/won-request`, admin.token, { action: 'reject', reason: 'Not confirmed' })).status, 200);
  const after = await leadRow(a.id);
  assert.equal(after.won_requested_at, null);
  assert.ok(after.status_changed_at.getTime() - before >= 3 * 24 * 60 * 60 * 1000 - 60000);
});

test('an Admin Won on an already-Won customer needs confirming', async (t) => {
  const admin = await createSuperAdmin(t);
  const sales = await createSales(t);
  const company = `Repeat Co ${suffix()}`;
  const first = await createAssignedLead(t, admin, sales, { company, phone: '9811100004' });
  await toProposal(sales.token, first.id);
  await call('PATCH', `/${first.id}/status`, sales.token, { status: 'won' });
  const second = await createAssignedLead(t, admin, sales, { company, phone: '9811100004' });
  await toProposal(admin.token, second.id);
  const res = await call('PATCH', `/${second.id}/status`, admin.token, { status: 'won' });
  assert.equal(res.status, 409);
  assert.equal((await res.json()).code, 'DUPLICATE_WON');
  assert.equal((await call('PATCH', `/${second.id}/status`, admin.token, { status: 'won', confirm_duplicate: true })).status, 200);
});

test('assigning an unassigned lead past New restarts its clock', async (t) => {
  const admin = await createSuperAdmin(t);
  const sales = await createSales(t);
  const lead = await createAssignedLead(t, admin, null, { phone: '9811100005' });
  await pool.query(
    "UPDATE leads SET status = 'proposal', value_estimate = 1, ref_id = 'R', status_changed_at = now() - interval '30 days' WHERE id = $1",
    [lead.id]
  );
  assert.equal((await call('POST', `/${lead.id}/assign`, admin.token, { sales_id: sales.id })).status, 200);
  const row = await leadRow(lead.id);
  assert.ok(Date.now() - row.status_changed_at.getTime() < 60000);
});
