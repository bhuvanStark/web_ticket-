// Quotation sharing rules (migration 049): unique customer + project leads,
// one quotation per lead, one editor at a time, issue-to-client freezing,
// Super Admin approved deletes and the activity log. Real HTTP server, real
// PostgreSQL, no mocks — same pattern as project-workspace.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET ||= 'integration-access-secret-change-me';
process.env.JWT_REFRESH_SECRET ||= 'integration-refresh-secret-change-me';

const { default: app } = await import('../server.js');
const { pool } = await import('../config/database.js');
const { generateToken } = await import('../middleware/auth.js');

let server;
let baseUrl;
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const ids = {};
const tokens = {};
const quoteIds = new Set();

async function call(method, path, token, body) {
  const response = await fetch(`${baseUrl}/api/quotes${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await response.json().catch(() => null);
  return { status: response.status, json };
}

const payload = (base, description = 'Install') => ({
  sm: 0.85, rounding_step: 100, quote_date: '2026-11-11', notes: 'n', project_ref: 'REF-1', base_updated_at: base,
  sections: [{ kind: 'solution', name: 'Room', lines: [{ line_type: 'service', description, qty: 1, osp_unit: 850 }] }]
});

test.before(async () => {
  const bo = async (name, manager) => {
    const { rows } = await pool.query('INSERT INTO back_office(full_name, email) VALUES ($1, $2) RETURNING id',
      [`QS ${name}`, `qs-${name}-${suffix}@example.com`]);
    if (manager) await pool.query('INSERT INTO quote_managers(back_office_id) VALUES ($1)', [rows[0].id]);
    return rows[0].id;
  };
  ids.a = await bo('Asha', true);
  ids.b = await bo('Bala', true);
  ids.plain = await bo('Plain', false);
  const { rows } = await pool.query(
    `INSERT INTO admins(email, password_hash, full_name, is_super_admin) VALUES ($1, 'x', 'QS Super', true) RETURNING id, token_version`,
    [`qs-super-${suffix}@example.com`]
  );
  ids.superAdmin = rows[0];
  tokens.a = generateToken(ids.a, 'back_office');
  tokens.b = generateToken(ids.b, 'back_office');
  tokens.plain = generateToken(ids.plain, 'back_office');
  tokens.superAdmin = generateToken(ids.superAdmin.id, 'admin', { tokenVersion: ids.superAdmin.token_version, isSuperAdmin: true });

  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.query('DELETE FROM quote_events WHERE quote_id = ANY($1)', [[...quoteIds]]);
  await pool.query(`DELETE FROM quotes WHERE lead_id IN (SELECT id FROM quote_leads WHERE customer LIKE 'QS %${suffix}')`);
  await pool.query(`DELETE FROM quote_leads WHERE customer LIKE 'QS %${suffix}'`);
  await pool.query('DELETE FROM back_office WHERE id = ANY($1)', [[ids.a, ids.b, ids.plain]]);
  await pool.query('DELETE FROM admins WHERE id = $1', [ids.superAdmin.id]);
  if (ids.sales) await pool.query('DELETE FROM sales WHERE id = $1', [ids.sales]);
  await pool.end();
});

const customer = `QS Acme ${suffix}`;
const state = {};

test('a lead is unique on customer + project, ignoring case and spacing; project is required', async () => {
  const created = await call('POST', '/leads', tokens.a, { customer, project: 'Board Room', site_location: 'BLR' });
  assert.equal(created.status, 201);
  state.leadId = created.json.data.id;

  const dup = await call('POST', '/leads', tokens.b, { customer: `  ${customer.toUpperCase()} `, project: 'board   room' });
  assert.equal(dup.status, 409);
  assert.equal(dup.json.details.code, 'DUPLICATE_LEAD');
  assert.equal(dup.json.details.lead_id, state.leadId);

  assert.equal((await call('POST', '/leads', tokens.a, { customer })).status, 400);

  const other = await call('POST', '/leads', tokens.b, { customer, project: 'Lobby' });
  assert.equal(other.status, 201);
  state.otherLeadId = other.json.data.id;
  const renameToDup = await call('PATCH', `/leads/${state.otherLeadId}`, tokens.b, { customer, project: 'BOARD ROOM' });
  assert.equal(renameToDup.status, 409);
});

test('one quotation per lead, visible to every Quote Manager', async () => {
  const first = await call('POST', '/', tokens.a, { lead_id: state.leadId });
  assert.equal(first.status, 201);
  state.quoteId = first.json.data.id;
  state.v1 = first.json.data.version_id;
  quoteIds.add(state.quoteId);

  const second = await call('POST', '/', tokens.b, { lead_id: state.leadId });
  assert.equal(second.status, 409);
  assert.equal(second.json.details.quote_id, state.quoteId);

  const leads = await call('GET', `/leads?search=${encodeURIComponent(customer)}`, tokens.b);
  assert.equal(leads.json.data.find((l) => l.id === state.leadId).quote_id, state.quoteId);
  assert.equal((await call('GET', `/${state.quoteId}`, tokens.b)).status, 200);
  assert.equal((await call('GET', `/${state.quoteId}`, tokens.plain)).status, 403);
});

test('one editor at a time: the lease blocks others until it is taken over', async () => {
  const lockA = await call('POST', `/${state.quoteId}/lock`, tokens.a, {});
  assert.equal(lockA.json.data.mine, true);

  const lockB = await call('POST', `/${state.quoteId}/lock`, tokens.b, {});
  assert.equal(lockB.json.data.mine, false);
  assert.equal(lockB.json.data.editing.name, 'QS Asha');

  const version = (await call('GET', `/${state.quoteId}/versions/${state.v1}`, tokens.a)).json.data.version;
  const blocked = await call('PUT', `/${state.quoteId}/versions/${state.v1}`, tokens.b, payload(version.updated_at));
  assert.equal(blocked.status, 409);
  assert.equal(blocked.json.details.code, 'LOCKED');

  const missingBase = await call('PUT', `/${state.quoteId}/versions/${state.v1}`, tokens.a, payload(null));
  assert.equal(missingBase.status, 409);

  const saved = await call('PUT', `/${state.quoteId}/versions/${state.v1}`, tokens.a, payload(version.updated_at));
  assert.equal(saved.status, 200);
  const again = await call('PUT', `/${state.quoteId}/versions/${state.v1}`, tokens.a, payload(saved.json.data.version.updated_at, 'Install v2'));
  assert.equal(again.status, 200);
  state.v1UpdatedAt = again.json.data.version.updated_at;

  const takeover = await call('POST', `/${state.quoteId}/lock`, tokens.b, { takeover: true });
  assert.equal(takeover.json.data.mine, true);
  const lostLease = await call('PUT', `/${state.quoteId}/versions/${state.v1}`, tokens.a, payload(state.v1UpdatedAt));
  assert.equal(lostLease.json.details?.code, 'LOCKED');
});

test('issuing to the client freezes the version and snapshots the lead', async () => {
  const issued = await call('POST', `/${state.quoteId}/versions/${state.v1}/issue`, tokens.b, { format: 'pdf' });
  assert.equal(issued.status, 200);
  assert.ok(issued.json.data.version.issued_at);
  assert.equal(issued.json.data.version.issued_customer, customer);

  const edit = await call('PUT', `/${state.quoteId}/versions/${state.v1}`, tokens.b, payload(issued.json.data.version.updated_at));
  assert.equal(edit.status, 409);
  assert.match(edit.json.error, /issued to the client/);

  await call('PATCH', `/leads/${state.leadId}`, tokens.b, { customer: `QS Renamed ${suffix}`, project: 'Board Room' });
  const reread = (await call('GET', `/${state.quoteId}/versions/${state.v1}`, tokens.b)).json.data;
  assert.equal(reread.version.issued_customer, customer);
  assert.equal(reread.quote.customer, `QS Renamed ${suffix}`);
});

test('a new version is editable, keeps the status, and Under Process / Won issue it', async () => {
  await call('PATCH', `/${state.quoteId}/status`, tokens.b, { status: 'sent' });
  const next = await call('POST', `/${state.quoteId}/versions`, tokens.b);
  assert.equal(next.status, 201);
  state.v2 = next.json.data.version_id;
  const quote = (await call('GET', `/${state.quoteId}`, tokens.b)).json.data;
  assert.equal(quote.status, 'sent');
  assert.equal(quote.versions[0].issued_at, null);

  const v2 = (await call('GET', `/${state.quoteId}/versions/${state.v2}`, tokens.b)).json.data.version;
  assert.equal((await call('PUT', `/${state.quoteId}/versions/${state.v2}`, tokens.b, payload(v2.updated_at))).status, 200);

  const won = await call('PATCH', `/${state.quoteId}/status`, tokens.b, { status: 'won', po_number: 'PO-9', po_date: '2026-11-11' });
  assert.equal(won.status, 200);
  assert.equal(won.json.data.won_version_id, state.v2);
  assert.ok(won.json.data.versions[0].issued_at);

  const reopened = await call('PATCH', `/${state.quoteId}/status`, tokens.b, { status: 'sent' });
  assert.equal(reopened.json.data.won_version_id, null);
});

test('deleting needs Super Admin approval; the trail outlives the quotation', async () => {
  assert.equal((await call('POST', `/${state.quoteId}/delete-request`, tokens.a, { reason: 'dup' })).json.details?.code, 'LOCKED');
  await call('DELETE', `/${state.quoteId}/lock`, tokens.b);

  assert.equal((await call('POST', `/${state.quoteId}/delete-request`, tokens.a, {})).status, 400);
  const asked = await call('POST', `/${state.quoteId}/delete-request`, tokens.a, { reason: 'Client cancelled the tender' });
  assert.equal(asked.status, 200);
  assert.ok(asked.json.data.delete_requested_at);

  assert.equal((await call('POST', `/${state.quoteId}/versions`, tokens.b)).status, 409);
  assert.equal((await call('POST', `/${state.quoteId}/delete-request/approve`, tokens.b)).status, 403);
  assert.equal((await call('DELETE', `/${state.quoteId}`, tokens.a)).status, 404);

  const rejected = await call('POST', `/${state.quoteId}/delete-request/reject`, tokens.superAdmin, { note: 'Keep it' });
  assert.equal(rejected.json.data.delete_requested_at, null);

  await call('POST', `/${state.quoteId}/delete-request`, tokens.a, { reason: 'Really cancelled' });
  assert.equal((await call('POST', `/${state.quoteId}/delete-request/approve`, tokens.superAdmin)).status, 200);
  assert.equal((await call('GET', `/${state.quoteId}`, tokens.a)).status, 404);

  const { rows } = await pool.query('SELECT action, actor_name FROM quote_events WHERE quote_id = $1 ORDER BY id', [state.quoteId]);
  const actions = rows.map((r) => r.action);
  assert.deepEqual(actions.filter((a) => a === 'saved').length, 2, 'consecutive saves by one person collapse');
  for (const a of ['created', 'lock_taken_over', 'issued', 'version_created', 'status_won', 'delete_requested', 'delete_rejected', 'deleted']) {
    assert.ok(actions.includes(a), `missing ${a}`);
  }
  assert.equal(rows.at(-1).actor_name, 'QS Super');

  const fresh = await call('POST', '/', tokens.b, { lead_id: state.leadId });
  assert.equal(fresh.status, 201, 'the lead can start a new quotation after an approved delete');
  quoteIds.add(fresh.json.data.id);
});

test('the Super Admin stays read-only for quotation content', async () => {
  assert.equal((await call('POST', '/leads', tokens.superAdmin, { customer, project: 'X' })).status, 403);
  assert.equal((await call('POST', `/${[...quoteIds].at(-1)}/lock`, tokens.superAdmin, {})).status, 403);
});

test('contact person, account manager and Terms & Conditions print as issued', async () => {
  const { rows } = await pool.query(
    'INSERT INTO sales(full_name, email, phone) VALUES ($1, $2, $3) RETURNING id', ['QS Ravi', `qs-sales-${suffix}@example.com`, '9876543210']
  );
  ids.sales = rows[0].id;
  const managers = await call('GET', '/account-managers', tokens.a);
  assert.ok(managers.json.data.some((m) => m.id === ids.sales && m.phone === '9876543210'));

  const lead = await call('POST', '/leads', tokens.a, {
    customer, project: 'Terms Room', contact_person: 'Meena', account_manager_id: ids.sales
  });
  assert.equal(lead.status, 201);
  const created = (await call('POST', '/', tokens.a, { lead_id: lead.json.data.id })).json.data;
  quoteIds.add(created.id);

  const v1 = (await call('GET', `/${created.id}/versions/${created.version_id}`, tokens.a)).json.data.version;
  assert.match(v1.terms, /valid for 30 days/);
  assert.match(v1.notes, /DTH connectivity/);
  await call('POST', `/${created.id}/lock`, tokens.a, {});
  const saved = await call('PUT', `/${created.id}/versions/${created.version_id}`, tokens.a,
    { ...payload(v1.updated_at), terms: 'Custom terms', delivery_timeline: '3 weeks from PO' });
  assert.equal(saved.json.data.version.delivery_timeline, '3 weeks from PO');

  const issued = (await call('POST', `/${created.id}/versions/${created.version_id}/issue`, tokens.a, { format: 'pdf' })).json.data.version;
  assert.equal(issued.issued_contact_person, 'Meena');
  assert.equal(issued.issued_account_manager, 'QS Ravi');
  assert.equal(issued.issued_account_manager_phone, '9876543210');

  const next = (await call('POST', `/${created.id}/versions`, tokens.a)).json.data;
  const v2 = (await call('GET', `/${created.id}/versions/${next.version_id}`, tokens.a)).json.data.version;
  assert.equal(v2.terms, 'Custom terms');
  assert.equal(v2.delivery_timeline, '3 weeks from PO');
});
