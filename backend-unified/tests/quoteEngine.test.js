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
  const ok = parseImportRows([{ category: 'Displays', model_name: '55UL5Q', price: '42,000' }]);
  assert.equal(ok[0].price, 42000);
  assert.equal(ok[0].gst_rate, 18);
  assert.throws(
    () => parseImportRows([{ category: '', model_name: 'X', price: 1 }, { category: 'A', model_name: 'Y', price: 'abc' }]),
    (err) => err.status === 400 && err.details.length === 2 && err.details[0].row === 2
  );
});

test('item needs a category, a model name and a price', () => {
  status400(() => parseItem({ model_name: 'X', price: 1 }), /Category/);
  status400(() => parseItem({ category_id: '00000000-0000-4000-8000-000000000000', price: 1 }), /Model/);
  status400(() => parseItem({ category_id: '00000000-0000-4000-8000-000000000000', model_name: 'X' }), /Price/);
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

test('a model repeated in one import file keeps the last row', () => {
  const rows = parseImportRows([
    { category: 'A', model_name: '55UL5Q', price: 1 },
    { category: 'A', model_name: '55ul5q', price: 2 }
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].price, 2);
});

test('a quote lead needs a customer and a project', () => {
  status400(() => parseLead({ customer: 'Acme' }), /Project/);
  status400(() => parseLead({ customer: ' ', project: 'Lobby' }), /Customer/);
  assert.deepEqual(parseLead({ customer: ' Acme ', project: 'Lobby' }), {
    customer: 'Acme', project: 'Lobby', site_location: null, contact_person: null, account_manager_id: null
  });
  status400(() => parseLead({ customer: 'Acme', project: 'Lobby', account_manager_id: 'nope' }), /Account manager/);
});
