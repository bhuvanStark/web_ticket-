// Regression tests for the Sales/Leads audit fixes (P1-1, P1-2, P1-3, P2-1).
import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';

process.env.JWT_SECRET ||= 'integration-access-secret-change-me';
process.env.JWT_REFRESH_SECRET ||= 'integration-refresh-secret-change-me';

const { default: app } = await import('../server.js');
// See integration-tests/api.test.js's import comment: the DB pool is a
// process-wide singleton shared by every integration test file under
// `--test-isolation=none` — no individual file closes it; `npm run
// test:integration` passes `--test-force-exit` to terminate cleanly once
// all tests report, regardless of the pool's still-open connections.
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

function suffix() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// Returns { id, token } — every caller must clean up `id` in its own
// t.after (see each test below). This used to return only the token, so no
// test could ever delete the admin row it created; every run of this file
// leaked one fresh Super Admin permanently into the admins table, and
// enough accumulated runs inflated other tests' (e.g.
// rbac-security.test.js's) "how many Super Admins currently exist"
// assertions into false failures unrelated to any real application bug.
async function createSuperAdmin() {
  const passwordHash = await bcrypt.hash('TestPassword123!', 10);
  const { rows } = await pool.query(
    `INSERT INTO admins (email, password_hash, full_name, is_active, is_super_admin)
     VALUES ($1, $2, 'Leads Test Admin', true, true) RETURNING id, token_version`,
    [`leads-test-admin-${suffix()}@example.com`, passwordHash]
  );
  return { id: rows[0].id, token: generateToken(rows[0].id, 'admin', { isSuperAdmin: true, tokenVersion: rows[0].token_version }) };
}

async function createSales() {
  const { rows } = await pool.query(
    `INSERT INTO sales (email, full_name, is_active) VALUES ($1, 'Leads Test Sales', true) RETURNING id, token_version`,
    [`leads-test-sales-${suffix()}@example.com`]
  );
  return { id: rows[0].id, token: generateToken(rows[0].id, 'sales', { tokenVersion: rows[0].token_version }) };
}

function adminHeaders(token) {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
}

async function createLead(adminToken, overrides = {}) {
  const res = await fetch(`${baseUrl}/api/sales-leads`, {
    method: 'POST', headers: adminHeaders(adminToken),
    body: JSON.stringify({ company: `Test Co ${suffix()}`, phone: '9812340000', ...overrides })
  });
  const body = await res.json();
  return body.data;
}

async function setStatus(adminToken, leadId, status) {
  return fetch(`${baseUrl}/api/sales-leads/${leadId}/status`, {
    method: 'PATCH', headers: adminHeaders(adminToken), body: JSON.stringify({ status })
  });
}

test('P1-1: a Sales employee cannot accept a Dead lead directly by ID, bypassing the pool filter', async (t) => {
  const { id: adminId, token: adminToken } = await createSuperAdmin();
  const sales = await createSales();
  const lead = await createLead(adminToken);
  t.after(() => pool.query('DELETE FROM leads WHERE id = $1', [lead.id])
    .then(() => pool.query('DELETE FROM sales WHERE id = $1', [sales.id]))
    .then(() => pool.query('DELETE FROM admins WHERE id = $1', [adminId])));

  await setStatus(adminToken, lead.id, 'dead');

  const inPool = await fetch(`${baseUrl}/api/sales-leads/pool`, { headers: { authorization: `Bearer ${sales.token}` } }).then((r) => r.json());
  assert.ok(!inPool.data.some((l) => l.id === lead.id), 'a Dead lead must not appear in the pool');

  const accept = await fetch(`${baseUrl}/api/sales-leads/${lead.id}/accept`, { method: 'POST', headers: { authorization: `Bearer ${sales.token}` } });
  assert.equal(accept.status, 409, 'accepting a Dead lead directly by ID must be rejected');

  const check = await pool.query('SELECT assigned_to FROM leads WHERE id = $1', [lead.id]);
  assert.equal(check.rows[0].assigned_to, null, 'the Dead lead must remain unassigned');
});

test('P1-3: a Sales employee cannot release a Won lead back into the pool', async (t) => {
  const { id: adminId, token: adminToken } = await createSuperAdmin();
  const sales = await createSales();
  const lead = await createLead(adminToken);
  t.after(() => pool.query('DELETE FROM leads WHERE id = $1', [lead.id])
    .then(() => pool.query('DELETE FROM sales WHERE id = $1', [sales.id]))
    .then(() => pool.query('DELETE FROM admins WHERE id = $1', [adminId])));

  await fetch(`${baseUrl}/api/sales-leads/${lead.id}/accept`, { method: 'POST', headers: { authorization: `Bearer ${sales.token}` } });
  await setStatus(sales.token, lead.id, 'won');

  const release = await fetch(`${baseUrl}/api/sales-leads/${lead.id}/release`, {
    method: 'POST', headers: adminHeaders(sales.token), body: JSON.stringify({ reason: 'test' })
  });
  assert.equal(release.status, 409, 'releasing a Won lead must be rejected');

  const check = await pool.query('SELECT assigned_to, status FROM leads WHERE id = $1', [lead.id]);
  assert.equal(check.rows[0].assigned_to, sales.id, 'the Won lead must stay assigned to its owner, not fall back into the pool');
  assert.equal(check.rows[0].status, 'won');
});

test('P1-3: a Sales employee cannot move a lead off Won/Lost/Dead, but an Admin can reopen it', async (t) => {
  const { id: adminId, token: adminToken } = await createSuperAdmin();
  const sales = await createSales();
  const lead = await createLead(adminToken);
  t.after(() => pool.query('DELETE FROM leads WHERE id = $1', [lead.id])
    .then(() => pool.query('DELETE FROM sales WHERE id = $1', [sales.id]))
    .then(() => pool.query('DELETE FROM admins WHERE id = $1', [adminId])));

  await fetch(`${baseUrl}/api/sales-leads/${lead.id}/accept`, { method: 'POST', headers: { authorization: `Bearer ${sales.token}` } });
  await setStatus(sales.token, lead.id, 'lost');

  const salesReopen = await setStatus(sales.token, lead.id, 'new');
  assert.equal(salesReopen.status, 403, 'a Sales employee must not be able to reopen a closed lead on their own');

  const adminReopen = await setStatus(adminToken, lead.id, 'new');
  assert.equal(adminReopen.status, 200, 'an Admin must be able to explicitly reopen a closed lead');
});

test('P1-2: an archived lead is immutable — accept, edit, assign, status change, and follow-up are all rejected', async (t) => {
  const { id: adminId, token: adminToken } = await createSuperAdmin();
  const sales = await createSales();
  const lead = await createLead(adminToken);
  t.after(() => pool.query('DELETE FROM leads WHERE id = $1', [lead.id])
    .then(() => pool.query('DELETE FROM sales WHERE id = $1', [sales.id]))
    .then(() => pool.query('DELETE FROM admins WHERE id = $1', [adminId])));

  // Give it real history (accept + release) so DELETE archives instead of hard-deleting.
  await fetch(`${baseUrl}/api/sales-leads/${lead.id}/accept`, { method: 'POST', headers: { authorization: `Bearer ${sales.token}` } });
  await fetch(`${baseUrl}/api/sales-leads/${lead.id}/release`, {
    method: 'POST', headers: adminHeaders(sales.token), body: JSON.stringify({ reason: 'test' })
  });
  const archiveRes = await fetch(`${baseUrl}/api/sales-leads/${lead.id}`, { method: 'DELETE', headers: adminHeaders(adminToken) });
  const archiveBody = await archiveRes.json();
  assert.match(archiveBody.message, /archived/);

  const accept = await fetch(`${baseUrl}/api/sales-leads/${lead.id}/accept`, { method: 'POST', headers: { authorization: `Bearer ${sales.token}` } });
  assert.equal(accept.status, 409, 'accepting an archived lead must be rejected');

  const edit = await fetch(`${baseUrl}/api/sales-leads/${lead.id}`, {
    method: 'PUT', headers: adminHeaders(adminToken), body: JSON.stringify({ company: 'Resurrected', phone: '9812340000' })
  });
  assert.equal(edit.status, 409, 'editing an archived lead must be rejected, even for an Admin');

  const assign = await fetch(`${baseUrl}/api/sales-leads/${lead.id}/assign`, {
    method: 'POST', headers: adminHeaders(adminToken), body: JSON.stringify({ sales_id: sales.id })
  });
  assert.equal(assign.status, 409, 'assigning an archived lead must be rejected, even for an Admin');

  const status = await setStatus(adminToken, lead.id, 'new');
  assert.equal(status.status, 409, 'changing status on an archived lead must be rejected, even for an Admin');

  const followUp = await fetch(`${baseUrl}/api/sales-leads/${lead.id}/follow-ups`, {
    method: 'POST', headers: adminHeaders(adminToken), body: JSON.stringify({ note: 'test' })
  });
  assert.equal(followUp.status, 409, 'adding a follow-up to an archived lead must be rejected');
});

test('P2-1: 9876543210, 09876543210, and +91 98765 43210 normalize to the same stored phone and are treated as duplicates', async (t) => {
  const { id: adminId, token: adminToken } = await createSuperAdmin();
  const phone = `98${String(Math.floor(Math.random() * 100000000)).padStart(8, '0')}`;
  const lead = await createLead(adminToken, { phone });
  t.after(() => pool.query('DELETE FROM leads WHERE id = $1', [lead.id]).then(() => pool.query('DELETE FROM admins WHERE id = $1', [adminId])));

  assert.equal(lead.phone, phone, 'a bare 10-digit number is stored unchanged');

  const validate = await fetch(`${baseUrl}/api/sales-leads/import/validate`, {
    method: 'POST', headers: adminHeaders(adminToken),
    body: JSON.stringify({
      rows: [
        { company: 'Dup A', phone: `+91 ${phone.slice(0, 5)} ${phone.slice(5)}` },
        { company: 'Dup B', phone: `0${phone}` }
      ]
    })
  }).then((r) => r.json());

  assert.equal(validate.data.rows[0].phone, phone, '+91-prefixed variant normalizes to the same bare 10 digits');
  assert.equal(validate.data.rows[1].phone, phone, '0-prefixed variant normalizes to the same bare 10 digits');
  // Row 0 is flagged against the pre-existing DB lead ('existing lead');
  // row 1 normalizes to that same phone too, but since row 0 already
  // claimed it within this file, row 1 is flagged against *that* ('this
  // file') rather than re-checked against the DB — an implementation
  // detail of which reason string wins, not a correctness requirement.
  // What matters is that normalization made both rows collide at all.
  assert.equal(validate.data.rows[0].duplicateOf, 'existing lead');
  assert.equal(validate.data.rows[1].duplicateOf, 'this file');
  assert.equal(validate.data.valid.length, 0, 'both variants must be excluded from the importable set');
});
