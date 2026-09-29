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

// ---------------------------------------------------------------------------
// Sales/Leads audit round 2 — value_estimate validation, Won finality.
// ---------------------------------------------------------------------------

async function assignTo(adminToken, leadId, salesId) {
  return fetch(`${baseUrl}/api/sales-leads/${leadId}/assign`, {
    method: 'POST', headers: adminHeaders(adminToken), body: JSON.stringify({ sales_id: salesId })
  });
}

async function statusHistory(leadId) {
  const { rows } = await pool.query(
    `SELECT details->>'to' AS "to" FROM lead_history WHERE lead_id = $1 AND event_type = 'status_changed' ORDER BY created_at`,
    [leadId]
  );
  return rows.map((r) => r.to);
}

function randomPhone() {
  return `97${String(Math.floor(Math.random() * 100000000)).padStart(8, '0')}`;
}

test('P1 value: create/update reject NaN, non-numeric, negative, and oversized value_estimate with a clean 400', async (t) => {
  const { id: adminId, token: adminToken } = await createSuperAdmin();
  const created = [];
  t.after(async () => {
    for (const id of created) await pool.query('DELETE FROM leads WHERE id = $1', [id]);
    await pool.query('DELETE FROM admins WHERE id = $1', [adminId]);
  });

  for (const bad of ['abc', 'approx 5L', 'NaN', -1, 1e15, true]) {
    const res = await fetch(`${baseUrl}/api/sales-leads`, {
      method: 'POST', headers: adminHeaders(adminToken),
      body: JSON.stringify({ company: `Bad Value ${suffix()}`, phone: randomPhone(), value_estimate: bad })
    });
    assert.equal(res.status, 400, `create with ${JSON.stringify(bad)} must be a 400, not a 500/201`);
    const body = await res.json();
    assert.match(body.error, /Value estimate/);
  }

  const ok = await createLead(adminToken, { phone: randomPhone(), value_estimate: '₹5,00,000' });
  created.push(ok.id);
  assert.equal(Number(ok.value_estimate), 500000);

  for (const bad of ['abc', -5, 1e15]) {
    const res = await fetch(`${baseUrl}/api/sales-leads/${ok.id}`, {
      method: 'PUT', headers: adminHeaders(adminToken), body: JSON.stringify({ value_estimate: bad })
    });
    assert.equal(res.status, 400, `update with ${JSON.stringify(bad)} must be a 400`);
  }
  const cleared = await fetch(`${baseUrl}/api/sales-leads/${ok.id}`, {
    method: 'PUT', headers: adminHeaders(adminToken), body: JSON.stringify({ value_estimate: null })
  });
  assert.equal(cleared.status, 200, 'clearing the estimate (null) stays allowed');

  const { rows } = await pool.query('SELECT value_estimate FROM leads WHERE id = $1', [ok.id]);
  assert.equal(rows[0].value_estimate, null);
});

test('P1 value: Excel import flags invalid values per row and never stores NaN', async (t) => {
  const { id: adminId, token: adminToken } = await createSuperAdmin();
  const phones = [randomPhone(), randomPhone(), randomPhone(), randomPhone(), randomPhone(), randomPhone()];
  t.after(async () => {
    await pool.query('DELETE FROM leads WHERE phone = ANY($1)', [phones]);
    await pool.query('DELETE FROM admins WHERE id = $1', [adminId]);
  });

  const rows = [
    { company: 'Import Text', phone: phones[0], value_estimate: 'approx 5L' },
    { company: 'Import Negative', phone: phones[1], value_estimate: -100 },
    { company: 'Import Huge', phone: phones[2], value_estimate: 1e15 },
    { company: 'Import Formatted', phone: phones[3], value_estimate: '₹1,20,000' },
    { company: 'Import Formula', phone: phones[4], value_estimate: { formula: 'A1*2', result: 2400 } },
    { company: 'Import Blank', phone: phones[5], value_estimate: '' }
  ];

  const validate = await fetch(`${baseUrl}/api/sales-leads/import/validate`, {
    method: 'POST', headers: adminHeaders(adminToken), body: JSON.stringify({ rows })
  }).then((r) => r.json());
  assert.deepEqual(validate.data.failed.map((r) => r.row), [1, 2, 3], 'text, negative and oversized rows fail validation');
  for (const r of validate.data.failed) assert.ok(r.errors.some((e) => /Value estimate/.test(e)));
  assert.deepEqual(validate.data.valid.map((r) => r.value_estimate), [120000, 2400, null]);

  const imported = await fetch(`${baseUrl}/api/sales-leads/import`, {
    method: 'POST', headers: adminHeaders(adminToken), body: JSON.stringify({ rows })
  });
  assert.equal(imported.status, 200);
  assert.equal((await imported.json()).data.imported, 3);

  const stored = await pool.query(`SELECT value_estimate::text AS v FROM leads WHERE phone = ANY($1) ORDER BY company`, [phones]);
  assert.ok(!stored.rows.some((r) => r.v === 'NaN'), 'NaN must never be stored');
  assert.equal(stored.rows.length, 3, 'only the valid rows were imported');
});

test('P1 value: the database rejects NaN and negative value_estimate directly', async () => {
  for (const bad of ['NaN', '-1', '10000000000.01']) {
    await assert.rejects(
      pool.query(`INSERT INTO leads (company, phone, value_estimate) VALUES ('DB Check', '9000000000', $1::numeric)`, [bad]),
      /leads_value_estimate_valid/
    );
  }
});

test('P1 Won is final: nobody can change status, reassign, or release a Won lead', async (t) => {
  const { id: adminId, token: adminToken } = await createSuperAdmin();
  const owner = await createSales();
  const other = await createSales();
  const lead = await createLead(adminToken, { phone: randomPhone(), value_estimate: 1000 });
  t.after(() => pool.query('DELETE FROM leads WHERE id = $1', [lead.id])
    .then(() => pool.query('DELETE FROM sales WHERE id = ANY($1)', [[owner.id, other.id]]))
    .then(() => pool.query('DELETE FROM admins WHERE id = $1', [adminId])));

  assert.equal((await assignTo(adminToken, lead.id, owner.id)).status, 200);
  assert.equal((await setStatus(owner.token, lead.id, 'won')).status, 200);

  for (const status of ['new', 'meeting', 'proposal', 'follow_up', 'lost', 'dead']) {
    const res = await setStatus(adminToken, lead.id, status);
    assert.equal(res.status, 409, `Admin moving Won -> ${status} must be rejected`);
  }
  assert.equal((await setStatus(owner.token, lead.id, 'follow_up')).status, 403, 'the owner cannot reopen it either');
  assert.equal((await assignTo(adminToken, lead.id, other.id)).status, 409, 'a Won lead cannot be reassigned');
  const release = await fetch(`${baseUrl}/api/sales-leads/${lead.id}/release`, {
    method: 'POST', headers: adminHeaders(owner.token), body: JSON.stringify({ reason: 'test' })
  });
  assert.equal(release.status, 409);

  const { rows } = await pool.query('SELECT status, assigned_to FROM leads WHERE id = $1', [lead.id]);
  assert.deepEqual(rows[0], { status: 'won', assigned_to: owner.id }, 'status and win credit are unchanged');
  assert.deepEqual(await statusHistory(lead.id), ['won'], 'Won history is preserved exactly');
});

test('P2 re-setting Won on a Won lead is a no-op: no new win activity, win date unchanged', async (t) => {
  const { id: adminId, token: adminToken } = await createSuperAdmin();
  const owner = await createSales();
  const lead = await createLead(adminToken, { phone: randomPhone(), value_estimate: 1000 });
  t.after(() => pool.query('DELETE FROM leads WHERE id = $1', [lead.id])
    .then(() => pool.query('DELETE FROM sales WHERE id = $1', [owner.id]))
    .then(() => pool.query('DELETE FROM admins WHERE id = $1', [adminId])));

  await assignTo(adminToken, lead.id, owner.id);
  await setStatus(owner.token, lead.id, 'won');
  // Backdate the win so a moved win date would be visible in "This Week".
  await pool.query(`UPDATE lead_history SET created_at = now() - interval '60 days' WHERE lead_id = $1 AND event_type = 'status_changed'`, [lead.id]);
  const before = await pool.query(`SELECT created_at FROM lead_history WHERE lead_id = $1 AND event_type = 'status_changed'`, [lead.id]);

  const again = await setStatus(adminToken, lead.id, 'won');
  assert.equal(again.status, 200, 'setting the same status is accepted as a no-op');

  const after = await pool.query(`SELECT created_at FROM lead_history WHERE lead_id = $1 AND event_type = 'status_changed'`, [lead.id]);
  assert.equal(after.rows.length, 1, 'no duplicate status_changed -> won row');
  assert.equal(after.rows[0].created_at.getTime(), before.rows[0].created_at.getTime(), 'win date unchanged');

  const week = await fetch(`${baseUrl}/api/sales-leads/analytics?period=week`, { headers: adminHeaders(adminToken) }).then((r) => r.json());
  const entry = week.data.leaderboard.find((e) => e.salesId === owner.id);
  assert.equal(entry.wonCount, 0, 'the 60-day-old win must not reappear in This Week');
});

test('P2 an unassigned lead cannot be marked Won', async (t) => {
  const { id: adminId, token: adminToken } = await createSuperAdmin();
  const lead = await createLead(adminToken, { phone: randomPhone(), value_estimate: 5000 });
  t.after(() => pool.query('DELETE FROM leads WHERE id = $1', [lead.id]).then(() => pool.query('DELETE FROM admins WHERE id = $1', [adminId])));

  const res = await setStatus(adminToken, lead.id, 'won');
  assert.equal(res.status, 409);
  assert.match((await res.json()).error, /Assign this lead/);
  const { rows } = await pool.query('SELECT status FROM leads WHERE id = $1', [lead.id]);
  assert.equal(rows[0].status, 'new');
  assert.deepEqual(await statusHistory(lead.id), []);
});

test('Lost/Dead leads can still be reopened and reassigned by an Admin (unchanged)', async (t) => {
  const { id: adminId, token: adminToken } = await createSuperAdmin();
  const owner = await createSales();
  const other = await createSales();
  const lead = await createLead(adminToken, { phone: randomPhone() });
  t.after(() => pool.query('DELETE FROM leads WHERE id = $1', [lead.id])
    .then(() => pool.query('DELETE FROM sales WHERE id = ANY($1)', [[owner.id, other.id]]))
    .then(() => pool.query('DELETE FROM admins WHERE id = $1', [adminId])));

  await assignTo(adminToken, lead.id, owner.id);
  assert.equal((await setStatus(owner.token, lead.id, 'lost')).status, 200);
  assert.equal((await assignTo(adminToken, lead.id, other.id)).status, 200, 'a Lost lead can still be reassigned');
  assert.equal((await setStatus(adminToken, lead.id, 'dead')).status, 200);
  assert.equal((await setStatus(adminToken, lead.id, 'follow_up')).status, 200, 'an Admin can still reopen a Dead lead');
});
