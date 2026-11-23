import test from 'node:test';
import assert from 'node:assert/strict';
import { computeLine, computeVersion, roundUpToStep } from '../services/quoteEngine.js';
import { parseVersionPayload, parseImportRows, parseStatus, parseItem, parseLead } from '../services/quoteService.js';

const status400 = (fn, re) => assert.throws(fn, (err) => err.status === 400 && (!re || re.test(err.message)));

test('selling price is OSP ÷ SM rounded up to the step', () => {
  const calc = computeLine({ qty: 2, osp_unit: 31000, gst_rate: 18 }, { sm: 0.85, rounding_step: 100 });
  // 31000 / 0.85 = 36470.58… → 36500
  assert.equal(calc.unit_price, 36500);
  assert.equal(calc.amount, 73000);
  assert.equal(calc.gst, 13140);
  assert.equal(calc.total, 86140);
  assert.equal(calc.osp_total, 62000);
  assert.equal(calc.margin, 11000);
});

test('rounding never adds a step for float noise on an exact multiple', () => {
  assert.equal(roundUpToStep(1200.0000000001, 100), 1200);
  assert.equal(roundUpToStep(1200.01, 100), 1300);
  assert.equal(roundUpToStep(1234.5, 1), 1235);
  assert.equal(roundUpToStep(0, 100), 0);
});

test('a line SM override beats the quote SM; a price override beats both', () => {
  const settings = { sm: 0.85, rounding_step: 10 };
  assert.equal(computeLine({ qty: 1, osp_unit: 1000, sm_override: 0.5, gst_rate: 18 }, settings).unit_price, 2000);
  assert.equal(computeLine({ qty: 1, osp_unit: 1000, sm_override: 0.5, price_override: 1500, gst_rate: 18 }, settings).unit_price, 1500);
});

test('version totals split supply and services like the summary sheet', () => {
  const { totals, sections } = computeVersion({
    sm: 0.5,
    rounding_step: 1,
    sections: [
      { lines: [{ line_type: 'supply', qty: 1, osp_unit: 1000, gst_rate: 18 }, { line_type: 'service', qty: 1, osp_unit: 100, gst_rate: 18 }] },
      { kind: 'ppm', lines: [{ line_type: 'service', qty: 1, osp_unit: 50, price_override: 60, gst_rate: 18 }] }
    ]
  });
  assert.equal(sections[0].totals.supply_price, 2000);
  assert.equal(sections[0].totals.services_price, 200);
  assert.deepEqual(
    { supply_osp: totals.supply_osp, supply_price: totals.supply_price, services_osp: totals.services_osp, services_price: totals.services_price },
    { supply_osp: 1000, supply_price: 2000, services_osp: 150, services_price: 260 }
  );
  assert.equal(totals.subtotal, 2260);
  assert.equal(totals.gst_total, 406.8);
  assert.equal(totals.grand_total, 2666.8);
  assert.equal(totals.margin, 1110);
});

const validVersion = { sm: 0.85, rounding_step: 100, quote_date: '2026-10-04', sections: [] };

test('version payload validates SM, rounding step and date', () => {
  status400(() => parseVersionPayload({ ...validVersion, sm: 0 }), /SM/);
  status400(() => parseVersionPayload({ ...validVersion, sm: 3 }), /SM/);
  status400(() => parseVersionPayload({ ...validVersion, rounding_step: 50 }), /Rounding/);
  status400(() => parseVersionPayload({ ...validVersion, quote_date: '04/10/2026' }), /date/);
  assert.equal(parseVersionPayload(validVersion).sm, 0.85);
});

test('PPM lines are always services and a line needs an item or description', () => {
  const parsed = parseVersionPayload({
    ...validVersion,
    sections: [{ kind: 'ppm', name: 'PPM', lines: [{ line_type: 'supply', description: 'Co-ordination', qty: 1, osp_unit: 50000 }] }]
  });
  assert.equal(parsed.sections[0].lines[0].line_type, 'service');
  assert.equal(parsed.sections[0].lines[0].gst_rate, 18);
  status400(() => parseVersionPayload({ ...validVersion, sections: [{ lines: [{ qty: 1 }] }] }), /pick an item/);
});

test('import lists every bad row and defaults GST to 18', () => {
  const row = { group: 'LG', category: 'Display', model_no: '55UL5Q', model_name: '55-inch 4K UHD Display', hsn_code: '85287219', price: '42,000' };
  const ok = parseImportRows([row]);
  assert.equal(ok[0].price, 42000);
  assert.equal(ok[0].gst_rate, 18);
  assert.throws(
    () => parseImportRows([{ ...row, group: '' }, { ...row, price: 'abc' }]),
    (err) => err.status === 400 && err.details.length === 2 && err.details[0].row === 2
  );
});

test('import keeps the last row for the same brand + model no', () => {
  const row = { group: 'LG', category: 'Display', model_no: '55UL5Q', model_name: 'A', hsn_code: '85287219', price: 1 };
  const out = parseImportRows([row, { ...row, group: 'lg', model_no: '55ul5q', model_name: 'B' }, { ...row, group: 'Samsung' }]);
  assert.deepEqual(out.map((r) => r.model_name), ['B', 'A']);
  assert.throws(() => parseImportRows([{ ...row, model_no: '' }]), (err) => /Model no/.test(err.details[0].error));
  assert.throws(() => parseImportRows([{ ...row, hsn_code: ' ' }]), (err) => /HSN\/SAC/.test(err.details[0].error));
});

test('item needs a brand, a category, a model no, a description, an HSN/SAC and a price', () => {
  const id = '00000000-0000-4000-8000-000000000000';
  const full = { group_id: id, category_id: id, model_no: '55UL5Q', model_name: 'X', hsn_code: '85287219', price: 1 };
  status400(() => parseItem({ ...full, group_id: undefined }), /Brand/);
  status400(() => parseItem({ ...full, category_id: undefined }), /Category/);
  status400(() => parseItem({ ...full, model_no: ' ' }), /Model no/);
  status400(() => parseItem({ ...full, model_name: '' }), /Description/);
  status400(() => parseItem({ ...full, price: undefined }), /Price/);
  status400(() => parseItem({ ...full, hsn_code: '' }), /HSN\/SAC/);
});

test('product links must be web addresses; a bare domain gets https://', () => {
  const id = '00000000-0000-4000-8000-000000000000';
  const item = { group_id: id, category_id: id, model_no: 'M1', model_name: 'X', hsn_code: '998739', price: 1 };
  assert.equal(parseItem(item).product_link, null);
  assert.equal(parseItem({ ...item, product_link: ' www.lg.com/55UL5Q ' }).product_link, 'https://www.lg.com/55UL5Q');
  assert.equal(parseItem({ ...item, product_link: 'http://neat.no' }).product_link, 'http://neat.no');
  status400(() => parseItem({ ...item, product_link: 'javascript:alert(1)' }), /Product link/);
  status400(() => parseItem({ ...item, product_link: 'not a link' }), /Product link/);
  status400(() => parseImportRows([{ category: 'A', model_name: 'Y', price: 1, product_link: 'ftp://x.com' }]));
  const line = parseVersionPayload({ ...validVersion, sections: [{ lines: [{ model_name: 'D', qty: 0, comment: ' Client has it ', product_link: 'lg.com' }] }] })
    .sections[0].lines[0];
  assert.deepEqual([line.comment, line.product_link], ['Client has it', 'https://lg.com']);
});

test('Won needs PO number and date; Lost needs a reason', () => {
  status400(() => parseStatus({ status: 'won', po_number: 'PO-1' }), /PO date/);
  status400(() => parseStatus({ status: 'lost' }), /reason/);
  assert.deepEqual(parseStatus({ status: 'won', po_number: 'PO-1', po_date: '2026-11-01' }),
    { status: 'won', po_number: 'PO-1', po_date: '2026-11-01', lost_reason: null });
  assert.equal(parseStatus({ status: 'draft', lost_reason: 'x' }).lost_reason, null);
});

test('impossible dates are rejected, not rolled over', () => {
  status400(() => parseVersionPayload({ ...validVersion, quote_date: '2026-02-31' }), /date/);
  status400(() => parseStatus({ status: 'won', po_number: 'PO-1', po_date: '2026-13-01' }), /PO date/);
  assert.equal(parseVersionPayload({ ...validVersion, quote_date: '2028-02-29' }).quote_date, '2028-02-29');
});

test('values are rounded to what the database stores', () => {
  const parsed = parseVersionPayload({
    ...validVersion, sm: 0.85555,
    sections: [{ lines: [{ description: 'x', qty: 1.333, osp_unit: 100.005, gst_rate: 18.004, sm_override: 0.123456 }] }]
  });
  assert.equal(parsed.sm, 0.8556);
  const line = parsed.sections[0].lines[0];
  assert.deepEqual([line.qty, line.osp_unit, line.gst_rate, line.sm_override], [1.33, 100.01, 18, 0.1235]);
});

test('an SM that would store as zero is rejected', () => {
  status400(() => parseVersionPayload({ ...validVersion, sm: 0.00001 }), /SM/);
  status400(() => parseVersionPayload({ ...validVersion, sections: [{ lines: [{ description: 'x', sm_override: 0.001 }] }] }), /SM/);
});

test('a quote lead needs a customer and a project', () => {
  status400(() => parseLead({ customer: 'Acme' }), /Project/);
  status400(() => parseLead({ customer: ' ', project: 'Lobby' }), /Customer/);
  assert.deepEqual(parseLead({ customer: ' Acme ', project: 'Lobby' }), {
    customer: 'Acme', project: 'Lobby', site_location: null, contact_person: null, account_manager_id: null
  });
  status400(() => parseLead({ customer: 'Acme', project: 'Lobby', account_manager_id: 'nope' }), /Account manager/);
});
