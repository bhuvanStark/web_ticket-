// Sales — create at a chosen stage, newest-first lists, the Funnel (star,
// costing, combined filters, ownership) and the daily report's lead fields.
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
const phone = () => `98${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;

async function createSuperAdmin(t) {
  const passwordHash = await bcrypt.hash('TestPassword123!', 10);
  const { rows } = await pool.query(
    `INSERT INTO admins (email, password_hash, full_name, is_active, is_super_admin)
     VALUES ($1, $2, 'Funnel Test Admin', true, true) RETURNING id, token_version`,
    [`funnel-admin-${suffix()}@example.com`, passwordHash]
  );
  t.after(() => pool.query('DELETE FROM admins WHERE id = $1', [rows[0].id]));
  return { id: rows[0].id, token: generateToken(rows[0].id, 'admin', { isSuperAdmin: true, tokenVersion: rows[0].token_version }) };
}

async function createSales(t, location = null) {
  const { rows } = await pool.query(
    `INSERT INTO sales (email, full_name, location, is_active) VALUES ($1, 'Funnel Test Sales', $2, true) RETURNING id, token_version`,
    [`funnel-sales-${suffix()}@example.com`, location]
  );
  t.after(() => pool.query('DELETE FROM sales WHERE id = $1', [rows[0].id]));
  return { id: rows[0].id, token: generateToken(rows[0].id, 'sales', { tokenVersion: rows[0].token_version }) };
}

const call = (method, path, token, body) => fetch(`${baseUrl}/api/sales-leads${path}`, {
  method, headers: headers(token), ...(body ? { body: JSON.stringify(body) } : {})
});

async function create(t, path, token, body) {
  const res = await call('POST', path, token, { company: `Funnel Co ${suffix()}`, phone: phone(), confirm_duplicate: true, ...body });
  const json = await res.json();
  if (json.data?.id) t.after(() => pool.query('DELETE FROM leads WHERE id = $1', [json.data.id]));
  return { status: res.status, json };
}

test('a lead can be created straight into a stage with that stage’s fields', async (t) => {
  const admin = await createSuperAdmin(t);
  const sales = await createSales(t);

  const plain = await create(t, '/mine', sales.token, {});
  assert.equal(plain.status, 201);
  assert.equal(plain.json.data.status, 'new');

  assert.equal((await create(t, '/mine', sales.token, { status: 'proposal' })).status, 400);
  const proposal = await create(t, '/mine', sales.token, { status: 'proposal', value_estimate: 1000, ref_id: 'R-1', product: ' AV ' });
  assert.equal(proposal.status, 201);
  assert.equal(proposal.json.data.status, 'proposal');
  assert.equal(proposal.json.data.ref_id, 'R-1');
  assert.equal(proposal.json.data.product, 'AV');
  assert.equal(proposal.json.data.assigned_to, sales.id);

  assert.equal((await create(t, '/mine', sales.token, { status: 'lost' })).status, 400);
  const lost = await create(t, '/mine', sales.token, { status: 'lost', lost_reason: 'price' });
  assert.equal(lost.json.data.status, 'lost');
  assert.equal(lost.json.data.lost_reason, 'price');

  assert.equal((await create(t, '/mine', sales.token, { status: 'won', person_to_contact: 'A', email: 'a@x.in', value_estimate: 5, ref_id: 'R' })).status, 403);
  assert.equal((await create(t, '/mine', sales.token, { status: 'dead', lost_reason: 'price' })).status, 403);

  const wonFields = { status: 'won', person_to_contact: 'A', email: 'a@x.in', value_estimate: 5000, ref_id: 'R-W' };
  assert.equal((await create(t, '/', admin.token, wonFields)).status, 400, 'Admin Won needs an owner');
  const won = await create(t, '/', admin.token, { ...wonFields, assigned_to: sales.id });
  assert.equal(won.status, 201);
  assert.equal(won.json.data.status, 'won');
  assert.equal(won.json.data.assigned_to, sales.id);
  const history = (await pool.query('SELECT event_type FROM lead_history WHERE lead_id = $1 ORDER BY created_at', [won.json.data.id])).rows;
  assert.deepEqual(history.map((h) => h.event_type), ['created', 'status_changed']);
});

test('a lead created Lost counts as closed this month in Analytics, with its history', async (t) => {
  const admin = await createSuperAdmin(t);
  const sales = await createSales(t);
  const lostCount = async () => (await (await call('GET', '/analytics?period=month', admin.token)).json()).data.overall.lostCount;
  const before = await lostCount();
  const lost = (await create(t, '/mine', sales.token, { status: 'lost', lost_reason: 'no_budget' })).json.data;
  assert.equal(await lostCount(), before + 1);
  const history = (await pool.query('SELECT event_type, details FROM lead_history WHERE lead_id = $1 ORDER BY created_at', [lost.id])).rows;
  assert.deepEqual(history.map((h) => h.event_type), ['created', 'status_changed']);
  assert.equal(history[1].details.to, 'lost');
  assert.equal(history[1].details.at_creation, true);
  assert.equal(history[1].details.lost_reason, 'no_budget');

  const plain = (await create(t, '/mine', sales.token, {})).json.data;
  const plainHistory = (await pool.query('SELECT event_type FROM lead_history WHERE lead_id = $1', [plain.id])).rows;
  assert.deepEqual(plainHistory.map((h) => h.event_type), ['created'], 'a New lead has no status row');
});

test('lead lists are newest first across pages', async (t) => {
  const sales = await createSales(t);
  const ids = [];
  for (let i = 0; i < 3; i++) ids.push((await create(t, '/mine', sales.token, {})).json.data.id);
  const page = async (offset) => (await (await call('GET', `/mine?limit=2&offset=${offset}`, sales.token)).json()).data.map((l) => l.id);
  assert.deepEqual([...(await page(0)), ...(await page(2))], ids.reverse());
});

test('Funnel: star, costing, filters and ownership', async (t) => {
  const admin = await createSuperAdmin(t);
  const loc = `Branch ${suffix()}`;
  const a = await createSales(t, loc);
  const b = await createSales(t);
  const mine = (await create(t, '/mine', a.token, { value_estimate: 1450000, product: 'AV' })).json.data;
  const other = (await create(t, '/mine', b.token, { product: 'VC' })).json.data;

  // Costing needs the star first; Sales can't star someone else's lead.
  assert.equal((await call('PATCH', `/${mine.id}/funnel`, a.token, { remark: 'x' })).status, 409);
  assert.equal((await call('POST', `/${other.id}/funnel-star`, a.token, { starred: true })).status, 403);
  assert.equal((await call('POST', `/${mine.id}/funnel-star`, a.token, { starred: 'yes' })).status, 400);
  assert.equal((await call('POST', `/${mine.id}/funnel-star`, a.token, { starred: true })).status, 200);
  assert.equal((await call('POST', `/${other.id}/funnel-star`, admin.token, { starred: true })).status, 200);

  const edit = await call('PATCH', `/${mine.id}/funnel`, a.token, { backup_value: 2100000, order_closed_value: 785500, remark: 'Under process' });
  assert.equal(edit.status, 200);
  assert.equal((await call('PATCH', `/${other.id}/funnel`, a.token, { remark: 'x' })).status, 403);

  // Sales see only their own funnel, whatever they put in the query.
  const own = await (await call('GET', `/mine/funnel?sales_id=${b.id}`, a.token)).json();
  assert.deepEqual(own.data.map((l) => l.id), [mine.id]);
  assert.deepEqual(own.totals, { value: 1450000, backup: 2100000, orderClosed: 785500 });
  assert.equal((await call('GET', '/funnel', a.token)).status, 403);

  // Admin filters combine.
  const ids = async (qs) => (await (await call('GET', `/funnel?${qs}`, admin.token)).json()).data.map((l) => l.id);
  assert.deepEqual(await ids(`location=${encodeURIComponent(loc)}`), [mine.id]);
  assert.deepEqual(await ids(`sales_id=${b.id}&product=vc`), [other.id]);
  assert.deepEqual(await ids(`sales_id=${b.id}&product=AV`), []);
  const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
  assert.ok((await ids(`from=${today}&to=${today}&sales_id=${a.id}`)).includes(mine.id));
  assert.deepEqual(await ids(`to=2000-01-01&sales_id=${a.id}`), []);
  assert.equal((await call('GET', '/funnel?from=bad', admin.token)).status, 400);

  const options = await (await call('GET', '/funnel/options', a.token)).json();
  assert.ok(options.data.products.includes('AV'));
  assert.ok(options.data.locations.includes(loc));

  // Un-starring keeps the costing; history records each step.
  assert.equal((await call('POST', `/${mine.id}/funnel-star`, a.token, { starred: false })).status, 200);
  assert.deepEqual((await (await call('GET', '/mine/funnel', a.token)).json()).data, []);
  const row = (await pool.query('SELECT funnel_backup_value FROM leads WHERE id = $1', [mine.id])).rows[0];
  assert.equal(Number(row.funnel_backup_value), 2100000);
  const events = (await pool.query('SELECT event_type FROM lead_history WHERE lead_id = $1 ORDER BY created_at', [mine.id])).rows.map((h) => h.event_type);
  assert.deepEqual(events, ['created', 'funnel_starred', 'funnel_updated', 'funnel_unstarred']);
});

test('daily report lines carry the lead’s details', async (t) => {
  const sales = await createSales(t);
  const lead = (await create(t, '/mine', sales.token, { status: 'proposal', value_estimate: 900, ref_id: 'R-D', product: 'EPABX', person_to_contact: 'Ravi' })).json.data;
  const res = await fetch(`${baseUrl}/api/sales-daily-reports/mine`, {
    method: 'POST', headers: headers(sales.token), body: JSON.stringify({ items: [{ lead_id: lead.id, comment: 'Sent proposal' }] })
  });
  const report = (await res.json()).data;
  t.after(() => pool.query('DELETE FROM sales_daily_reports WHERE id = $1', [report.id]));
  assert.equal(res.status, 201);
  const line = report.items[0].lead;
  assert.equal(line.status, 'proposal');
  assert.equal(line.ref_id, 'R-D');
  assert.equal(line.product, 'EPABX');
  assert.equal(line.person_to_contact, 'Ravi');
  assert.equal(Number(line.value_estimate), 900);
  assert.equal(line.in_funnel, false);
});
