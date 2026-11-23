// Item catalog clean-up (migration 053): brands > shared categories > items,
// brand + model no unique, HSN/SAC required, and the Clean-up actions (merge,
// turn a brand into a category, bulk set, model nos, HSN codes). Real HTTP
// server, real PostgreSQL, no mocks — same pattern as quote-sharing-rules.test.js.
// Every brand/category/item here is named with this run's suffix and removed after.
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
const tag = (name) => `CC ${name} ${suffix}`;
let managerId;
let token;

async function call(method, path, body) {
  const response = await fetch(`${baseUrl}/api/quotes${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await response.json().catch(() => null);
  return { status: response.status, json, data: json?.data };
}

// An item as it looks right after migration 053: brand only.
async function oldItem(groupId, description, { modelNo = null, hsn = '85287219', remark = null } = {}) {
  const { rows } = await pool.query(
    `INSERT INTO quote_items (group_id, model_name, model_no, hsn_code, remark, price)
     VALUES ($1, $2, $3, $4, $5, 100) RETURNING id`,
    [groupId, tag(description), modelNo, hsn, remark]
  );
  return rows[0].id;
}

const item = async (id) => (await call('GET', `/items?search=${encodeURIComponent(suffix)}&limit=200`)).data.rows.find((r) => r.id === id);
const groupNamed = async (name) => (await call('GET', '/groups')).data.find((g) => g.name === tag(name));

test.before(async () => {
  const { rows } = await pool.query('INSERT INTO back_office(full_name, email) VALUES ($1, $2) RETURNING id',
    [`CC Manager ${suffix}`, `cc-${suffix}@example.com`]);
  managerId = rows[0].id;
  await pool.query('INSERT INTO quote_managers(back_office_id) VALUES ($1)', [managerId]);
  token = generateToken(managerId, 'back_office');
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.query('DELETE FROM quote_items WHERE model_name LIKE $1', [`%${suffix}`]);
  await pool.query('DELETE FROM quote_groups WHERE name LIKE $1', [`%${suffix}`]);
  await pool.query('DELETE FROM quote_group_categories WHERE category_id IN (SELECT id FROM quote_categories WHERE name LIKE $1)', [`%${suffix}`]);
  await pool.query('DELETE FROM quote_categories WHERE name LIKE $1', [`%${suffix}`]);
  await pool.query('DELETE FROM back_office WHERE id = $1', [managerId]);
});

const state = {};

test('brands and categories refuse near-identical duplicates', async () => {
  const kramer = await call('POST', '/groups', { name: tag('Kramer') });
  assert.equal(kramer.status, 201);
  state.kramer = kramer.data;
  const dup = await call('POST', '/groups', { name: `  ${tag('kramer').toUpperCase()} ` });
  assert.equal(dup.status, 400);
  assert.match(dup.json.error, /already exists/);

  const display = await call('POST', '/categories', { name: tag('Display'), group_id: state.kramer.id });
  assert.equal(display.status, 201);
  state.display = display.data;
  assert.equal((await groupNamed('Kramer')).categories.length, 1, 'created inside the brand, so linked to it');
});

test('a new item needs brand, category, model no, description and HSN/SAC; brand + model no is unique', async () => {
  const base = { group_id: state.kramer.id, category_id: state.display.id, model_no: 'VM-4HDT', model_name: tag('Amplifier'), hsn_code: '85437099', price: 90000 };
  for (const [field, re] of [['category_id', /Category/], ['model_no', /Model no/], ['hsn_code', /HSN\/SAC/]]) {
    const res = await call('POST', '/items', { ...base, [field]: '' });
    assert.equal(res.status, 400, field);
    assert.match(res.json.error, re);
  }
  const ok = await call('POST', '/items', base);
  assert.equal(ok.status, 201);
  assert.equal(ok.data.needs_fix, false);
  const dup = await call('POST', '/items', { ...base, model_no: ' vm-4hdt ', model_name: tag('Other text') });
  assert.equal(dup.status, 400);
  assert.match(dup.json.error, /already has an item with this model no/);
});

test('summary and filters count what each old item is missing', async () => {
  state.krammer = (await call('POST', '/groups', { name: tag('Krammer') })).data;
  state.avSwitching = (await call('POST', '/groups', { name: tag('AV Switching') })).data;
  state.k1 = await oldItem(state.krammer.id, 'Scaler', { remark: 'Kramer VP-1' });
  state.a1 = await oldItem(state.avSwitching.id, 'Matrix', { remark: 'Kramer VS-44', hsn: null });
  state.a2 = await oldItem(state.avSwitching.id, 'Extender', { remark: 'Extron DTP-T' });

  const summary = (await call('GET', '/items/summary')).data;
  assert.ok(summary.to_fix >= 3 && summary.no_category >= 3 && summary.no_model_no >= 3 && summary.no_hsn >= 1);
  const noHsn = (await call('GET', `/items?needs_fix=hsn&search=${encodeURIComponent(suffix)}`)).data.rows.map((r) => r.id);
  assert.deepEqual(noHsn, [state.a1]);
  assert.equal((await call('GET', '/items?needs_fix=nonsense')).status, 400);
  assert.equal((await groupNamed('AV Switching')).to_fix_count, 2);
});

test('model nos: a duplicate inside one brand is skipped and reported, the rest save', async () => {
  const res = await call('POST', '/items/model-nos', { items: [{ id: state.k1, model_no: 'VS-44' }, { id: state.a1, model_no: 'VS-44' }, { id: state.a2, model_no: 'DTP-T' }] });
  assert.equal(res.status, 200);
  assert.equal(res.data.updated, 3, 'different brands may share a model no');
  const again = await call('POST', '/items/model-nos', { items: [{ id: state.a2, model_no: 'vs-44' }] });
  assert.deepEqual(again.data.skipped.map((s) => s.id), [state.a2]);
  assert.equal((await item(state.a2)).model_no, 'DTP-T', 'the skipped one keeps its old value');
});

test('merging a misspelt brand is refused when model nos would clash, then works once fixed', async () => {
  const blocked = await call('POST', `/groups/${state.krammer.id}/merge`, { into_group_id: state.avSwitching.id });
  assert.equal(blocked.status, 400);
  assert.match(blocked.json.error, /VS-44 would then appear twice/);
  assert.ok(await groupNamed('Krammer'), 'nothing changed');

  await call('POST', '/items/model-nos', { items: [{ id: state.k1, model_no: 'VP-1' }] });
  const merged = await call('POST', `/groups/${state.krammer.id}/merge`, { into_group_id: state.kramer.id });
  assert.equal(merged.status, 200);
  assert.equal(merged.data.moved, 1);
  assert.equal(await groupNamed('Krammer'), undefined, 'the empty brand is removed');
  assert.equal((await item(state.k1)).group_name, tag('Kramer'));
});

test('turning a brand into a category keeps model nos and leaves mixed items without a brand', async () => {
  const res = await call('POST', `/groups/${state.avSwitching.id}/to-category`, {});
  assert.equal(res.status, 200);
  assert.equal(res.data.moved, 2);
  assert.equal(res.data.category.name, tag('AV Switching'));
  state.avCategory = res.data.category;
  const a1 = await item(state.a1);
  assert.equal(a1.group_id, null);
  assert.equal(a1.category_name, tag('AV Switching'));
  assert.equal(a1.model_no, 'VS-44', 'model no kept');
  assert.ok((await call('GET', '/items/summary')).data.no_group >= 2);
  const noBrand = (await call('GET', `/items?group_id=none&search=${encodeURIComponent(suffix)}`)).data.rows.map((r) => r.id).sort();
  assert.deepEqual(noBrand, [state.a1, state.a2].sort());
});

test('bulk set brand checks clashes, then links the category to the brand', async () => {
  // a1 (VS-44) into Kramer is fine; a third brandless item with VS-44 would clash with it.
  state.a3 = await oldItem(null, 'Matrix copy', { modelNo: 'vs-44' });
  const both = await call('POST', '/items/bulk-set', { ids: [state.a1, state.a3], group_id: state.kramer.id });
  assert.equal(both.status, 400);
  assert.match(both.json.error, /would then appear twice/);
  assert.equal((await item(state.a1)).group_id, null, 'all or nothing');

  const one = await call('POST', '/items/bulk-set', { ids: [state.a1], group_id: state.kramer.id });
  assert.equal(one.status, 200);
  const kramer = await groupNamed('Kramer');
  assert.ok(kramer.categories.some((c) => c.id === state.avCategory.id), 'AV Switching now listed under Kramer');

  const later = await call('POST', '/items/bulk-set', { ids: [state.a3], group_id: state.kramer.id });
  assert.equal(later.status, 400, 'still a clash with the item already moved');
});

test('a category in use cannot be unlinked or deleted; an unused one can', async () => {
  const inUse = await call('DELETE', `/groups/${state.kramer.id}/categories/${state.avCategory.id}`);
  assert.equal(inUse.status, 400);
  assert.equal((await call('DELETE', `/categories/${state.avCategory.id}`)).status, 400);
  const spare = (await call('POST', '/categories', { name: tag('Spare'), group_id: state.kramer.id })).data;
  assert.equal((await call('DELETE', `/groups/${state.kramer.id}/categories/${spare.id}`)).status, 200);
  assert.equal((await call('DELETE', `/categories/${spare.id}`)).status, 200);
});

test('HSN codes fill in from the clean-up; an item is done once nothing is missing', async () => {
  await call('POST', '/items/bulk-set', { ids: [state.k1], category_id: state.display.id });
  assert.equal((await item(state.a1)).needs_fix, true, 'a1 still has no HSN');
  const res = await call('POST', '/items/hsn-codes', { items: [{ id: state.a1, hsn_code: '85437099' }] });
  assert.equal(res.data.updated, 1);
  assert.equal((await item(state.a1)).needs_fix, false);
  assert.equal((await item(state.k1)).needs_fix, false);
});

test('Excel import updates by brand + model no, else by description, and rejects the whole file on one bad row', async () => {
  const row = { group: tag('Kramer'), category: tag('Display'), model_no: 'VP-1', model_name: tag('Scaler v2'), hsn_code: '85437099', price: 5 };
  const res = await call('POST', '/items/import', { rows: [row] });
  assert.equal(res.status, 200);
  assert.deepEqual([res.data.created, res.data.updated], [0, 1]);
  assert.equal((await item(state.k1)).model_name, tag('Scaler v2'));

  // a2 has no brand yet: a filled-in export row finds it by description.
  const byDescription = { group: tag('Extron'), category: tag('AV Switching'), model_no: 'DTP-T', model_name: tag('Extender'), hsn_code: '85437099', price: 7 };
  const filled = await call('POST', '/items/import', { rows: [byDescription] });
  assert.deepEqual([filled.data.created, filled.data.updated, filled.data.groupsCreated], [0, 1, 1]);
  assert.equal((await item(state.a2)).group_name, tag('Extron'));

  const bad = await call('POST', '/items/import', { rows: [{ ...row, price: 9 }, { ...row, model_no: 'X', hsn_code: '' }] });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.details[0].row, 3);
  assert.equal((await item(state.k1)).price, 5, 'nothing saved');
});

test('an empty brand can be removed; one with items cannot', async () => {
  assert.equal((await call('DELETE', `/groups/${state.kramer.id}`)).status, 400);
  const empty = (await call('POST', '/groups', { name: tag('Empty') })).data;
  assert.equal((await call('DELETE', `/groups/${empty.id}`)).status, 200);
});
