// Tally Desk, Phase 1: Tally Maker access, won quotations, vouchers, the XML
// download, remembered names, the imported lock — and that the Quotation
// module keeps working around it. Real HTTP server, real PostgreSQL, no
// mocks (same pattern as quote-sharing-rules.test.js). Everything created
// here carries this run's suffix and is removed after.
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
const state = {};
let savedSettings;

async function call(method, path, token, body) {
  const response = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await response.json().catch(() => null);
  return { status: response.status, json, data: json?.data };
}
const tally = (method, path, token, body) => call(method, `/tally${path}`, token, body);
const quotes = (method, path, token, body) => call(method, `/quotes${path}`, token, body);

test.before(async () => {
  const bo = async (name) => {
    const { rows } = await pool.query('INSERT INTO back_office(full_name, email) VALUES ($1, $2) RETURNING id',
      [`TD ${name}`, `td-${name}-${suffix}@example.com`]);
    return rows[0].id;
  };
  ids.quoter = await bo('Quoter');
  ids.maker = await bo('Maker');
  ids.plain = await bo('Plain');
  await pool.query('INSERT INTO quote_managers(back_office_id) VALUES ($1)', [ids.quoter]);
  const { rows } = await pool.query(
    `INSERT INTO admins(email, password_hash, full_name, is_super_admin) VALUES ($1, 'x', 'TD Super', true) RETURNING id, token_version`,
    [`td-super-${suffix}@example.com`]
  );
  ids.superAdmin = rows[0];
  tokens.quoter = generateToken(ids.quoter, 'back_office');
  tokens.maker = generateToken(ids.maker, 'back_office');
  tokens.plain = generateToken(ids.plain, 'back_office');
  tokens.superAdmin = generateToken(ids.superAdmin.id, 'admin', { tokenVersion: ids.superAdmin.token_version, isSuperAdmin: true });

  const group = await pool.query('INSERT INTO quote_groups(name) VALUES ($1) RETURNING id', [`TD LG ${suffix}`]);
  ids.group = group.rows[0].id;
  const item = await pool.query(
    `INSERT INTO quote_items(group_id, model_name, model_no, hsn_code, price) VALUES ($1, $2, $3, '85287219', 85000) RETURNING id`,
    [ids.group, `TD 55in Display ${suffix}`, `55UL5Q-${suffix.slice(0, 6)}`]
  );
  ids.item = item.rows[0].id;
  savedSettings = (await pool.query('SELECT * FROM tally_settings WHERE id')).rows[0];

  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  if (savedSettings) {
    const { id, updated_at, ...rest } = savedSettings;
    const cols = Object.keys(rest);
    await pool.query(`UPDATE tally_settings SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')} WHERE id`, cols.map((c) => rest[c]));
  }
  await pool.query(`DELETE FROM tally_parties WHERE customer_key LIKE $1`, [`%${suffix}`]);
  await pool.query(`DELETE FROM quotes WHERE lead_id IN (SELECT id FROM quote_leads WHERE customer LIKE $1)`, [`%${suffix}`]);
  await pool.query('DELETE FROM quote_leads WHERE customer LIKE $1', [`%${suffix}`]);
  await pool.query('DELETE FROM quote_items WHERE group_id = $1', [ids.group]);
  await pool.query('DELETE FROM quote_groups WHERE id = $1', [ids.group]);
  await pool.query('DELETE FROM back_office WHERE id = ANY($1)', [[ids.quoter, ids.maker, ids.plain]]);
  await pool.query('DELETE FROM admins WHERE id = $1', [ids.superAdmin.id]);
});

test('only Tally Makers get in; only the Super Admin grants the tag, to Back-Office staff', async () => {
  assert.equal((await tally('GET', '/access', tokens.maker)).data.canAccess, false);
  assert.equal((await tally('GET', '/settings', tokens.maker)).status, 403);
  assert.equal((await tally('PUT', `/makers/${ids.maker}`, tokens.quoter, { enabled: true })).status, 403);

  const granted = await tally('PUT', `/makers/${ids.maker}`, tokens.superAdmin, { enabled: true });
  assert.equal(granted.status, 200);
  assert.ok((await tally('GET', '/makers', tokens.superAdmin)).data.includes(ids.maker));
  assert.equal((await tally('GET', '/access', tokens.maker)).data.canAccess, true);
  assert.equal((await tally('GET', '/settings', tokens.maker)).status, 200);

  // A Quote Manager without the tag, a plain employee and the Super Admin
  // (an admin, not a Tally Maker) stay out.
  assert.equal((await tally('GET', '/quotes', tokens.quoter)).status, 403);
  assert.equal((await tally('GET', '/quotes', tokens.plain)).status, 403);
  assert.equal((await tally('GET', '/quotes', tokens.superAdmin)).status, 403);
  assert.equal((await tally('GET', '/quotes')).status, 401);
  // …and a Tally Maker gets nothing extra in Quotations.
  assert.equal((await quotes('GET', '/', tokens.maker)).status, 403);
  // Inactive employees cannot be tagged.
  await pool.query('UPDATE back_office SET is_active = false WHERE id = $1', [ids.plain]);
  assert.equal((await tally('PUT', `/makers/${ids.plain}`, tokens.superAdmin, { enabled: true })).status, 400);
  await pool.query('UPDATE back_office SET is_active = true WHERE id = $1', [ids.plain]);
});

test('a quotation shows on Tally Desk only once it is Won', async () => {
  const lead = await quotes('POST', '/leads', tokens.quoter, { customer: `TD Acme ${suffix}`, project: 'Board Room', site_location: 'Whitefield, Bengaluru' });
  assert.equal(lead.status, 201);
  const quote = (await quotes('POST', '/', tokens.quoter, { lead_id: lead.data.id })).data;
  state.quoteId = quote.id;
  const version = (await quotes('GET', `/${quote.id}/versions/${quote.version_id}`, tokens.quoter)).data.version;
  const saved = await quotes('PUT', `/${quote.id}/versions/${quote.version_id}`, tokens.quoter, {
    sm: 0.85, rounding_step: 100, quote_date: '2026-11-23', notes: '', project_ref: 'R-TD', base_updated_at: version.updated_at,
    sections: [{
      kind: 'solution', name: 'Board Room', lines: [
        { line_type: 'supply', item_id: ids.item, model_name: 'LG 55"', hsn_code: '85287219', qty: 4, osp_unit: 85000 },
        { line_type: 'supply', model_name: 'HDMI Cable', hsn_code: '85444299', qty: 10, osp_unit: 500, price_override: 750 },
        { line_type: 'service', description: 'Installation and Commissioning Charges', hsn_code: '998739', qty: 1, osp_unit: 0, price_override: 20000 }
      ]
    }]
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.json));
  assert.ok(!(await tally('GET', `/quotes?search=${suffix}`, tokens.maker)).data.length, 'a draft is not listed');
  assert.equal((await tally('POST', '/vouchers', tokens.maker, { quote_id: quote.id, kind: 'invoice', voucher_date: '2026-11-23', lines: [] })).status, 400);

  const won = await quotes('PATCH', `/${quote.id}/status`, tokens.quoter, { status: 'won', po_number: 'PO-TD-1', po_date: '2026-11-20' });
  assert.equal(won.status, 200, JSON.stringify(won.json));
  const listed = (await tally('GET', `/quotes?search=${suffix}`, tokens.maker)).data;
  assert.equal(listed.length, 1);
  assert.equal(listed[0].po_number, 'PO-TD-1');

  const detail = (await tally('GET', `/quotes/${quote.id}`, tokens.maker)).data;
  assert.equal(detail.lines.length, 3);
  const display = detail.lines.find((l) => l.item_id === ids.item);
  assert.equal(display.rate, 100000, 'selling price (85000 ÷ 0.85), never the cost');
  assert.equal(display.model_no.startsWith('55UL5Q'), true);
  for (const line of detail.lines) {
    assert.equal(line.osp_unit, undefined, 'cost is not exposed');
    assert.equal(line.sm_override, undefined);
  }
  state.lines = detail.lines;
});

const invoiceBody = (patch = {}) => ({
  quote_id: state.quoteId, kind: 'invoice', voucher_date: '2026-11-23', po_number: 'PO-TD-1', po_date: '2026-11-20',
  party_ledger: `TD Acme Pvt Ltd ${suffix}`, bill_name: 'TD Acme Pvt Ltd', bill_address: '12 MG Road\nBengaluru',
  bill_gstin: '29abcde1234f1z5', bill_state: 'Karnataka', place_of_supply: 'Karnataka',
  lines: state.lines.map((l) => ({
    source_line_id: l.id, item_id: l.item_id, line_type: l.line_type, description: l.description, hsn_code: l.hsn_code,
    stock_item_name: l.line_type === 'supply' ? (l.item_id ? `LG ${l.model_no}` : 'HDMI CABLE 10M') : null,
    unit_name: 'Nos', qty: l.qty, rate: l.rate, gst_rate: l.gst_rate
  })),
  ...patch
});

test('settings: home state is required; names are saved as typed', async () => {
  assert.equal((await tally('PUT', '/settings', tokens.maker, { home_state: '' })).status, 400);
  const empty = await tally('PUT', '/settings', tokens.maker, { home_state: 'Karnataka', vch_invoice_goods: 'Sales' });
  assert.equal(empty.status, 200);
  assert.equal(empty.data.ledger_cgst, null);
});

test('a voucher saves while incomplete, but the file is refused with the reasons', async () => {
  const created = await tally('POST', '/vouchers', tokens.maker, invoiceBody());
  assert.equal(created.status, 201, JSON.stringify(created.json));
  state.invoiceId = created.data.voucher.id;
  assert.equal(created.data.voucher.bill_gstin, '29ABCDE1234F1Z5', 'GSTIN upper-cased');
  assert.equal(created.data.voucher.voucher_type, 'Sales');
  assert.ok(created.data.problems.some((p) => /CGST and SGST/.test(p)));
  assert.ok(created.data.problems.some((p) => /services sales ledger/.test(p)));

  const refused = await tally('POST', `/vouchers/${state.invoiceId}/download`, tokens.maker);
  assert.equal(refused.status, 400);
  assert.ok(refused.json.details.some((p) => /goods sales ledger/.test(p)));
  assert.equal((await tally('GET', `/vouchers/${state.invoiceId}`, tokens.maker)).data.voucher.status, 'draft');

  assert.equal((await tally('POST', '/vouchers', tokens.maker, invoiceBody({ bill_gstin: '12345' }))).status, 400);
  assert.equal((await tally('POST', '/vouchers', tokens.maker, invoiceBody({ kind: 'nope' }))).status, 400);
  const zero = invoiceBody();
  zero.lines[0].qty = 0;
  assert.equal((await tally('POST', '/vouchers', tokens.maker, zero)).status, 400);
});

test('with the names set, the XML downloads, balances, and the names are remembered', async () => {
  const settings = await tally('PUT', '/settings', tokens.maker, {
    company_name: 'TASKTEL TECHNOLOGEES PVT LTD', home_state: 'Karnataka', godown_name: 'Main Location',
    ledger_sales_goods: 'Sales @18%', ledger_sales_services: 'Installation Charges', ledger_cgst: 'Output CGST',
    ledger_sgst: 'Output SGST', ledger_igst: 'Output IGST', ledger_round_off: 'Round Off',
    vch_sales_order: 'Sales Order', vch_proforma: 'Profroma Invoice', vch_delivery_note: 'Delivery Note',
    vch_invoice_goods: 'Sales', vch_invoice_services: 'SERVICE - SALES'
  });
  assert.equal(settings.status, 200);
  assert.deepEqual((await tally('GET', `/vouchers/${state.invoiceId}`, tokens.maker)).data.problems, []);

  const file = await tally('POST', `/vouchers/${state.invoiceId}/download`, tokens.maker);
  assert.equal(file.status, 200, JSON.stringify(file.json));
  const { xml, filename } = file.data;
  assert.match(filename, /^TD-\d+-Sales-Invoice-TD-Acme-.*\.xml$/);
  assert.match(xml, /<SVCURRENTCOMPANY>TASKTEL TECHNOLOGEES PVT LTD<\/SVCURRENTCOMPANY>/);
  assert.match(xml, /<STOCKITEMNAME>HDMI CABLE 10M<\/STOCKITEMNAME>/);
  assert.match(xml, /<RATE>100000\.00\/Nos<\/RATE>/);
  assert.match(xml, /<LEDGERNAME>Output CGST<\/LEDGERNAME>/);
  // 4 × 100000 + 10 × 750 + 20000 = 427500; GST 18% = 76950; total 504450.
  assert.match(xml, /<ISPARTYLEDGER>Yes<\/ISPARTYLEDGER><AMOUNT>-504450\.00<\/AMOUNT>/);

  const after = (await tally('GET', `/vouchers/${state.invoiceId}`, tokens.maker)).data.voucher;
  assert.equal(after.status, 'downloaded');
  assert.equal(after.download_count, 1);

  const detail = (await tally('GET', `/quotes/${state.quoteId}`, tokens.maker)).data;
  assert.equal(detail.lines.find((l) => l.item_id === ids.item).stock_item_name, `LG ${state.lines.find((l) => l.item_id).model_no}`,
    'catalog item remembers its Tally stock item');
  assert.equal(detail.party.party_ledger, `TD Acme Pvt Ltd ${suffix}`, 'customer remembers its party ledger');
  assert.ok(detail.used.some((u) => u.kind === 'invoice' && u.qty === 4));
  const items = (await tally('GET', `/items?search=${suffix}&linked=yes`, tokens.maker)).data;
  assert.equal(items.rows.length, 1);
});

test('partial delivery: a DC takes part of the qty; goods only', async () => {
  const displayLine = state.lines.find((l) => l.item_id === ids.item);
  const serviceLine = state.lines.find((l) => l.line_type === 'service');
  const dcBody = invoiceBody({ kind: 'delivery_note', place_of_supply: null });
  dcBody.lines = [{ ...dcBody.lines.find((l) => l.source_line_id === displayLine.id), qty: 1 },
    { ...dcBody.lines.find((l) => l.source_line_id === serviceLine.id) }];
  const dc = await tally('POST', '/vouchers', tokens.maker, dcBody);
  assert.equal(dc.status, 201);
  assert.ok(dc.data.problems.some((p) => /goods only/.test(p)));
  assert.equal((await tally('POST', `/vouchers/${dc.data.voucher.id}/download`, tokens.maker)).status, 400);

  dcBody.lines = dcBody.lines.slice(0, 1);
  const fixed = await tally('PUT', `/vouchers/${dc.data.voucher.id}`, tokens.maker, dcBody);
  assert.deepEqual(fixed.data.problems, []);
  assert.equal(fixed.data.calc.tax, 0);
  const file = await tally('POST', `/vouchers/${dc.data.voucher.id}/download`, tokens.maker);
  assert.match(file.data.xml, /VCHTYPE="Delivery Note"/);
  assert.doesNotMatch(file.data.xml, /Output CGST/);
  assert.ok((await tally('GET', `/quotes/${state.quoteId}`, tokens.maker)).data.used
    .some((u) => u.kind === 'delivery_note' && u.qty === 1 && u.source_line_id === displayLine.id));
  // The kind of a voucher never changes.
  assert.equal((await tally('PUT', `/vouchers/${dc.data.voucher.id}`, tokens.maker, invoiceBody())).status, 400);
});

test('"In Tally" locks a voucher until undone; a draft cannot be marked', async () => {
  const draft = await tally('POST', '/vouchers', tokens.maker, invoiceBody({ kind: 'proforma' }));
  assert.equal((await tally('PATCH', `/vouchers/${draft.data.voucher.id}/imported`, tokens.maker, { imported: true })).status, 400);
  assert.equal((await tally('DELETE', `/vouchers/${draft.data.voucher.id}`, tokens.maker)).status, 200);

  const marked = await tally('PATCH', `/vouchers/${state.invoiceId}/imported`, tokens.maker, { imported: true, tally_voucher_no: 'TT/1043' });
  assert.equal(marked.status, 200);
  assert.equal(marked.data.voucher.status, 'imported');
  assert.equal(marked.data.voucher.tally_voucher_no, 'TT/1043');
  assert.equal((await tally('PUT', `/vouchers/${state.invoiceId}`, tokens.maker, invoiceBody())).status, 400);
  assert.equal((await tally('DELETE', `/vouchers/${state.invoiceId}`, tokens.maker)).status, 400);
  const listed = (await tally('GET', `/quotes?search=${suffix}`, tokens.maker)).data[0];
  assert.equal(listed.imported_count, 1);

  const undone = await tally('PATCH', `/vouchers/${state.invoiceId}/imported`, tokens.maker, { imported: false });
  assert.equal(undone.data.voucher.status, 'downloaded');
  assert.equal(undone.data.voucher.tally_voucher_no, null);
  assert.equal((await tally('PUT', `/vouchers/${state.invoiceId}`, tokens.maker, invoiceBody())).status, 200);
});

test('the Quotation module is unaffected: reopen, delete item, delete quotation', async () => {
  // Reopening the quote takes it off Tally Desk's list and blocks new
  // vouchers, but keeps the ones already made.
  const reopened = await quotes('PATCH', `/${state.quoteId}/status`, tokens.quoter, { status: 'sent' });
  assert.equal(reopened.status, 200, JSON.stringify(reopened.json));
  assert.equal((await tally('GET', `/quotes?search=${suffix}`, tokens.maker)).data.length, 0);
  assert.equal((await tally('POST', '/vouchers', tokens.maker, invoiceBody())).status, 400);
  const kept = (await tally('GET', `/vouchers?quote_id=${state.quoteId}`, tokens.maker)).data;
  assert.equal(kept.length, 2);
  // The old voucher still opens; its lines keep their copied values.
  const old = (await tally('GET', `/vouchers/${state.invoiceId}`, tokens.maker)).data;
  assert.equal(old.lines.length, 3);

  // Deleting a catalog item that has a Tally name still works.
  const del = await quotes('POST', '/items/delete', tokens.quoter, { ids: [ids.item] });
  assert.equal(del.status, 200, JSON.stringify(del.json));
  assert.equal((await pool.query('SELECT 1 FROM tally_item_map WHERE item_id = $1', [ids.item])).rowCount, 0);
  assert.equal((await tally('GET', `/vouchers/${state.invoiceId}`, tokens.maker)).data.lines.length, 3, 'voucher keeps its lines');

  // Deleting the quotation (request + Super Admin approval) removes its vouchers too.
  assert.equal((await quotes('POST', `/${state.quoteId}/delete-request`, tokens.quoter, { reason: 'test' })).status, 200);
  const approved = await quotes('POST', `/${state.quoteId}/delete-request/approve`, tokens.superAdmin);
  assert.equal(approved.status, 200, JSON.stringify(approved.json));
  assert.equal((await pool.query('SELECT 1 FROM tally_vouchers WHERE quote_id = $1', [state.quoteId])).rowCount, 0);
});

test('revoking the tag locks the maker out on the next request', async () => {
  assert.equal((await tally('PUT', `/makers/${ids.maker}`, tokens.superAdmin, { enabled: false })).status, 200);
  assert.equal((await tally('GET', '/settings', tokens.maker)).status, 403);
});
