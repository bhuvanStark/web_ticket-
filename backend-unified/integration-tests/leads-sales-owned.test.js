// Sales-created leads, Sales editing, Remarks, and Won completeness
// validation. Same harness as leads-security.test.js.
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

function suffix() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function randomPhone() {
  return `96${String(Math.floor(Math.random() * 100000000)).padStart(8, '0')}`;
}

async function createSuperAdmin() {
  const passwordHash = await bcrypt.hash('TestPassword123!', 10);
  const { rows } = await pool.query(
    `INSERT INTO admins (email, password_hash, full_name, is_active, is_super_admin)
     VALUES ($1, $2, 'Sales-Owned Test Admin', true, true) RETURNING id, token_version`,
    [`sales-owned-admin-${suffix()}@example.com`, passwordHash]
  );
  return { id: rows[0].id, token: generateToken(rows[0].id, 'admin', { isSuperAdmin: true, tokenVersion: rows[0].token_version }) };
}

async function createSales() {
  const { rows } = await pool.query(
    `INSERT INTO sales (email, full_name, is_active) VALUES ($1, 'Sales-Owned Test Sales', true) RETURNING id, token_version`,
    [`sales-owned-sales-${suffix()}@example.com`]
  );
  return { id: rows[0].id, token: generateToken(rows[0].id, 'sales', { tokenVersion: rows[0].token_version }) };
}

const headers = (token) => ({ authorization: `Bearer ${token}`, 'content-type': 'application/json' });
const api = (path, token, init = {}) => fetch(`${baseUrl}/api/sales-leads${path}`, { ...init, headers: headers(token) });
const send = (method, path, token, body) => api(path, token, { method, body: JSON.stringify(body ?? {}) });

// Fixture tracker: every test registers what it created and cleans it all up.
function fixtures(t) {
  const leads = [];
  const sales = [];
  const admins = [];
  t.after(async () => {
    if (leads.length) await pool.query('DELETE FROM leads WHERE id = ANY($1)', [leads]);
    if (sales.length) await pool.query('DELETE FROM sales WHERE id = ANY($1)', [sales]);
    if (admins.length) await pool.query('DELETE FROM admins WHERE id = ANY($1)', [admins]);
  });
  return {
    async admin() { const a = await createSuperAdmin(); admins.push(a.id); return a; },
    async sales() { const s = await createSales(); sales.push(s.id); return s; },
    lead(id) { if (id) leads.push(id); return id; }
  };
}

async function salesCreate(token, overrides = {}) {
  const res = await send('POST', '/mine', token, { company: `Own Co ${suffix()}`, phone: randomPhone(), ...overrides });
  return { res, body: await res.json() };
}

const listIds = async (path, token) => (await (await api(path, token)).json()).data.map((l) => l.id);
const dbLead = async (id) => (await pool.query('SELECT * FROM leads WHERE id = $1', [id])).rows[0];

test('Sales-created lead is owned by its creator on creation and never enters the pool', async (t) => {
  const f = fixtures(t);
  const owner = await f.sales();
  const other = await f.sales();

  // An assigned_to in the body is ignored — the owner is always the caller.
  const { res, body } = await salesCreate(owner.token, { assigned_to: other.id, value_estimate: '' });
  f.lead(body.data?.id);
  assert.equal(res.status, 201);
  assert.equal(body.data.assigned_to, owner.id);
  assert.equal(body.data.status, 'new');
  assert.equal(body.data.value_estimate, null, 'value can be empty on creation');
  assert.ok(body.data.accepted_at, 'the 5-day Meeting timer starts on creation');

  assert.ok((await listIds('/mine', owner.token)).includes(body.data.id), 'shows in the creator\'s My Leads');
  assert.ok(!(await listIds('/pool', owner.token)).includes(body.data.id), 'not in the pool');
  assert.ok(!(await listIds('/pool', other.token)).includes(body.data.id), 'not in anyone\'s pool');
  assert.ok(!(await listIds('/mine', other.token)).includes(body.data.id));

  const accept = await send('POST', `/${body.data.id}/accept`, other.token);
  assert.equal(accept.status, 409, 'another salesperson cannot claim it');
  assert.equal((await api(`/${body.data.id}`, other.token)).status, 403, 'nor view it');

  const { rows } = await pool.query(`SELECT event_type, actor_type, details FROM lead_history WHERE lead_id = $1`, [body.data.id]);
  assert.deepEqual(rows.map((r) => [r.event_type, r.actor_type, r.details.source]), [['created', 'sales', 'sales']]);
});

test('Admin-created leads still go to the common pool, and Admins cannot use the Sales create/edit routes', async (t) => {
  const f = fixtures(t);
  const admin = await f.admin();
  const sales = await f.sales();
  const res = await send('POST', '', admin.token, { company: `Admin Co ${suffix()}`, phone: randomPhone() });
  const lead = (await res.json()).data;
  f.lead(lead.id);
  assert.equal(lead.assigned_to, null);
  assert.ok((await listIds('/pool', sales.token)).includes(lead.id));

  assert.equal((await send('POST', '/mine', admin.token, { company: 'X', phone: randomPhone() })).status, 403);
  assert.equal((await send('PUT', `/${lead.id}/details`, admin.token, { company: 'X' })).status, 403);
});

test('Sales create/edit reject duplicate phone numbers (any formatting)', async (t) => {
  const f = fixtures(t);
  const admin = await f.admin();
  const sales = await f.sales();
  const phone = randomPhone();
  const existing = (await (await send('POST', '', admin.token, { company: `Dup ${suffix()}`, phone })).json()).data;
  f.lead(existing.id);

  for (const variant of [phone, `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`, `0${phone}`]) {
    const { res, body } = await salesCreate(sales.token, { phone: variant });
    f.lead(body.data?.id);
    assert.equal(res.status, 409, `${variant} must be flagged as a duplicate`);
  }

  const { body: own } = await salesCreate(sales.token);
  f.lead(own.data.id);
  const edit = await send('PUT', `/${own.data.id}/details`, sales.token, { phone });
  assert.equal(edit.status, 409, 'an edit cannot copy another lead\'s phone');
  const keepSame = await send('PUT', `/${own.data.id}/details`, sales.token, { phone: own.data.phone, company: 'Renamed' });
  assert.equal(keepSame.status, 200, 'keeping the lead\'s own phone is not a duplicate');
});

test('5-day rule: a Sales-created lead with no Meeting returns to the pool after 5 days', async (t) => {
  const f = fixtures(t);
  const owner = await f.sales();
  const overdue = f.lead((await salesCreate(owner.token)).body.data.id);
  const recent = f.lead((await salesCreate(owner.token)).body.data.id);
  const met = f.lead((await salesCreate(owner.token)).body.data.id);

  assert.equal((await send('PATCH', `/${met}/status`, owner.token, { status: 'meeting' })).status, 200);
  await pool.query(`UPDATE leads SET accepted_at = now() - interval '6 days' WHERE id = ANY($1)`, [[overdue, met]]);
  await pool.query(`UPDATE leads SET accepted_at = now() - interval '4 days' WHERE id = $1`, [recent]);

  const poolIds = await listIds('/pool', owner.token); // listing runs the sweep
  assert.ok(poolIds.includes(overdue), 'overdue lead released to the pool');
  assert.ok(!poolIds.includes(recent), 'a lead inside the 5 days stays owned');
  assert.ok(!poolIds.includes(met), 'reaching Meeting stops the timer');

  assert.equal((await dbLead(overdue)).assigned_to, null);
  assert.equal((await dbLead(recent)).assigned_to, owner.id);
  assert.equal((await dbLead(met)).assigned_to, owner.id);
  const { rows } = await pool.query(`SELECT 1 FROM lead_history WHERE lead_id = $1 AND event_type = 'auto_released'`, [overdue]);
  assert.equal(rows.length, 1);

  assert.equal((await send('PUT', `/${overdue}/details`, owner.token, { company: 'Too late' })).status, 403, 'the former owner can no longer edit it');
});

test('Sales editing: owner only, value addable/updatable while open, locked once closed', async (t) => {
  const f = fixtures(t);
  const owner = await f.sales();
  const other = await f.sales();
  const id = f.lead((await salesCreate(owner.token)).body.data.id);

  let res = await send('PUT', `/${id}/details`, owner.token, { value_estimate: '₹2,50,000', person_to_contact: 'Asha', email: 'asha@example.com' });
  assert.equal(res.status, 200);
  assert.equal(Number((await res.json()).data.value_estimate), 250000);
  res = await send('PUT', `/${id}/details`, owner.token, { value_estimate: 300000 });
  assert.equal(Number((await res.json()).data.value_estimate), 300000, 'value can be updated later');
  assert.equal((await send('PUT', `/${id}/details`, owner.token, { value_estimate: 'approx 5L' })).status, 400);
  assert.equal((await send('PUT', `/${id}/details`, owner.token, { company: '  ' })).status, 400);
  assert.equal((await send('PUT', `/${id}/details`, owner.token, {})).status, 400);

  assert.equal((await send('PUT', `/${id}/details`, other.token, { company: 'Hijack' })).status, 403, 'non-owner cannot edit');
  assert.notEqual((await dbLead(id)).company, 'Hijack');

  const { rows } = await pool.query(`SELECT details FROM lead_history WHERE lead_id = $1 AND event_type = 'edited' ORDER BY created_at`, [id]);
  assert.equal(rows.length, 2, 'each successful edit is recorded');

  assert.equal((await send('PATCH', `/${id}/status`, owner.token, { status: 'lost' })).status, 200);
  res = await send('PUT', `/${id}/details`, owner.token, { value_estimate: 1 });
  assert.equal(res.status, 409, 'a Lost lead cannot be edited by Sales');
  assert.equal(Number((await dbLead(id)).value_estimate), 300000);
});

test('Remarks: owner and Admin can save; latest value is returned on reopen; non-owners cannot', async (t) => {
  const f = fixtures(t);
  const admin = await f.admin();
  const owner = await f.sales();
  const other = await f.sales();
  const id = f.lead((await salesCreate(owner.token, { remarks: '  First call done  ' })).body.data.id);
  assert.equal((await dbLead(id)).remarks, 'First call done', 'remarks can be set on creation (trimmed)');

  let res = await send('PATCH', `/${id}/remarks`, owner.token, { remarks: 'Wants a demo next week' });
  assert.equal(res.status, 200);
  const reopened = await (await api(`/${id}`, owner.token)).json();
  assert.equal(reopened.data.remarks, 'Wants a demo next week', 'GET /:id returns the latest remarks');
  assert.ok((await listIds('/mine', owner.token)).includes(id));
  const mine = (await (await api('/mine', owner.token)).json()).data.find((l) => l.id === id);
  assert.equal(mine.remarks, 'Wants a demo next week', 'list rows carry remarks too');

  assert.equal((await send('PATCH', `/${id}/remarks`, other.token, { remarks: 'nope' })).status, 403);
  assert.equal((await send('PATCH', `/${id}/remarks`, owner.token, { remarks: 'x'.repeat(5001) })).status, 400);
  assert.equal((await send('PATCH', `/${id}/remarks`, owner.token, { remarks: 42 })).status, 400);

  res = await send('PATCH', `/${id}/remarks`, admin.token, { remarks: 'Admin note' });
  assert.equal(res.status, 200, 'an Admin with the sales module can edit remarks');

  // Same text again is a no-op (no extra history row).
  await send('PATCH', `/${id}/remarks`, admin.token, { remarks: 'Admin note' });
  const { rows } = await pool.query(`SELECT details->>'remarks' AS r FROM lead_history WHERE lead_id = $1 AND event_type = 'remarks_updated' ORDER BY created_at`, [id]);
  assert.deepEqual(rows.map((r) => r.r), ['Wants a demo next week', 'Admin note']);

  // Remarks stay editable on a closed (Lost) lead, like follow-up notes...
  await send('PATCH', `/${id}/status`, owner.token, { status: 'lost' });
  assert.equal((await send('PATCH', `/${id}/remarks`, owner.token, { remarks: 'Budget cut' })).status, 200);
  // ...and can be cleared.
  assert.equal((await (await send('PATCH', `/${id}/remarks`, owner.token, { remarks: '' })).json()).data.remarks, null);

  // Archived leads are immutable.
  await pool.query('UPDATE leads SET archived_at = now() WHERE id = $1', [id]);
  assert.equal((await send('PATCH', `/${id}/remarks`, admin.token, { remarks: 'late' })).status, 409);
});

test('Remarks: a Sales employee cannot set remarks on an unassigned pool lead', async (t) => {
  const f = fixtures(t);
  const admin = await f.admin();
  const sales = await f.sales();
  const lead = (await (await send('POST', '', admin.token, { company: `Pool ${suffix()}`, phone: randomPhone() })).json()).data;
  f.lead(lead.id);
  assert.equal((await send('PATCH', `/${lead.id}/remarks`, sales.token, { remarks: 'mine now?' })).status, 403);
  assert.equal((await dbLead(lead.id)).remarks, null);
});

test('Won requires every lead field incl. value — enforced on the backend for Sales and Admin', async (t) => {
  const f = fixtures(t);
  const admin = await f.admin();
  const owner = await f.sales();
  const id = f.lead((await salesCreate(owner.token)).body.data.id);

  let res = await send('PATCH', `/${id}/status`, owner.token, { status: 'won' });
  assert.equal(res.status, 400);
  const { error } = await res.json();
  assert.match(error, /Missing: Person to Contact, Email, Value Estimate/);
  assert.equal((await dbLead(id)).status, 'new', 'status unchanged');

  await send('PUT', `/${id}/details`, owner.token, { person_to_contact: 'Ravi', email: 'ravi@example.com' });
  res = await send('PATCH', `/${id}/status`, admin.token, { status: 'won' });
  assert.equal(res.status, 400, 'Admins are held to the same rule');
  assert.match((await res.json()).error, /Missing: Value Estimate$|Missing: Value Estimate\./);

  // Whitespace-only fields don't count as filled (checked in SQL too).
  await pool.query(`UPDATE leads SET email = '   ', value_estimate = 1000 WHERE id = $1`, [id]);
  assert.equal((await send('PATCH', `/${id}/status`, owner.token, { status: 'won' })).status, 400);

  await send('PUT', `/${id}/details`, owner.token, { email: 'ravi@example.com', value_estimate: 0 });
  res = await send('PATCH', `/${id}/status`, owner.token, { status: 'won' });
  assert.equal(res.status, 200, 'a value of 0 is a filled value');
  assert.equal((await dbLead(id)).status, 'won');

  // Once Won: Sales cannot edit; Admin cannot blank a required field but can
  // still make other edits.
  assert.equal((await send('PUT', `/${id}/details`, owner.token, { value_estimate: 5 })).status, 409);
  for (const blank of [{ value_estimate: null }, { email: '' }, { person_to_contact: null }]) {
    const r = await send('PUT', `/${id}`, admin.token, blank);
    assert.equal(r.status, 409, `Admin clearing ${Object.keys(blank)[0]} on a Won lead must be rejected`);
  }
  assert.equal((await send('PUT', `/${id}`, admin.token, { company: 'Renamed Ltd', value_estimate: 2000 })).status, 200);
  const final = await dbLead(id);
  assert.equal(final.status, 'won');
  assert.equal(final.email, 'ravi@example.com');
  assert.equal(Number(final.value_estimate), 2000);
});

test('Existing restrictions hold for Sales-created leads: no Dead, no reopening Lost', async (t) => {
  const f = fixtures(t);
  const owner = await f.sales();
  const id = f.lead((await salesCreate(owner.token)).body.data.id);
  assert.equal((await send('PATCH', `/${id}/status`, owner.token, { status: 'dead' })).status, 403);
  assert.equal((await send('PATCH', `/${id}/status`, owner.token, { status: 'lost' })).status, 200);
  assert.equal((await send('PATCH', `/${id}/status`, owner.token, { status: 'new' })).status, 403);
  assert.equal((await send('POST', `/${id}/release`, owner.token, { reason: 'x' })).status, 409);
});
