// Tally Desk voucher math + XML (services/tallyXml.js). The Admin Dash keeps
// a copy of computeVoucher / voucherProblems in components/tally/tallyShared.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeVoucher, voucherProblems, buildVoucherXml, defaultVoucherType } from '../services/tallyXml.js';

const settings = {
  company_name: 'TASKTEL TECHNOLOGEES PVT LTD', home_state: 'Karnataka', godown_name: 'Main Location',
  ledger_sales_goods: 'Sales @18%', ledger_sales_services: 'Installation Charges', ledger_cgst: 'Output CGST',
  ledger_sgst: 'Output SGST', ledger_igst: 'Output IGST', ledger_round_off: 'Round Off',
  vch_sales_order: 'Sales Order', vch_proforma: 'Profroma Invoice', vch_delivery_note: 'Delivery Note',
  vch_invoice_goods: 'Sales', vch_invoice_services: 'SERVICE - SALES'
};
const voucher = (patch = {}) => ({
  kind: 'invoice', voucher_type: 'Sales', voucher_date: '2026-11-23', po_number: 'PO/77', po_date: '2026-11-01',
  party_ledger: 'ABC Pvt Ltd', bill_name: 'ABC Pvt Ltd', bill_address: '1 MG Road\nBengaluru', bill_gstin: '29ABCDE1234F1Z5',
  bill_state: 'Karnataka', place_of_supply: 'Karnataka', narration: 'Ref R1', ...patch
});
const goods = (patch = {}) => ({ line_type: 'supply', description: 'LG 55UL5Q', stock_item_name: 'LG 55UL5Q', unit_name: 'Nos', qty: 2, rate: 1000.5, gst_rate: 18, ...patch });
const service = (patch = {}) => ({ line_type: 'service', description: 'Installation and Commissioning Charges', qty: 1, rate: 333.33, gst_rate: 18, ...patch });

// Sum of every voucher-level AMOUNT (party, inventory, ledgers). A balanced
// Tally voucher sums to zero; accounting allocations inside an inventory
// entry repeat its amount, so they are skipped.
function balance(xml) {
  const top = xml.replace(/<ACCOUNTINGALLOCATIONS\.LIST>.*?<\/ACCOUNTINGALLOCATIONS\.LIST>/g, '')
    .replace(/<BATCHALLOCATIONS\.LIST>.*?<\/BATCHALLOCATIONS\.LIST>/g, '');
  const amounts = [...top.matchAll(/<AMOUNT>(-?[\d.]+)<\/AMOUNT>/g)].map((m) => Number(m[1]));
  return Math.round(amounts.reduce((a, b) => a + b, 0) * 100) / 100 + 0;
}

test('same state: CGST + SGST split per line, rounded to the rupee', () => {
  const calc = computeVoucher(voucher(), [goods(), service()], settings);
  assert.equal(calc.intra, true);
  assert.equal(calc.goods, 2001);
  assert.equal(calc.services, 333.33);
  assert.equal(calc.cgst + calc.sgst, calc.tax);
  assert.equal(calc.igst, 0);
  assert.equal(calc.total, Math.round(2334.33 + calc.tax));
  assert.equal(Math.round((calc.taxable + calc.tax + calc.round_off) * 100) / 100, calc.total);
});

test('other state: IGST only; state names compare ignoring case and spaces', () => {
  const calc = computeVoucher(voucher({ place_of_supply: ' tamil nadu ' }), [goods()], settings);
  assert.equal(calc.intra, false);
  assert.equal(calc.igst, 360.18);
  assert.equal(calc.cgst, 0);
  assert.equal(computeVoucher(voucher({ place_of_supply: ' KARNATAKA' }), [goods()], settings).intra, true);
});

test('no round off ledger → exact total; delivery note carries no GST', () => {
  const calc = computeVoucher(voucher(), [goods()], { ...settings, ledger_round_off: null });
  assert.equal(calc.round_off, 0);
  assert.equal(calc.total, 2361.18);
  const dc = computeVoucher(voucher({ kind: 'delivery_note' }), [goods()], settings);
  assert.equal(dc.tax, 0);
  assert.equal(dc.total, 2001);
});

test('problems list everything Tally would reject', () => {
  assert.deepEqual(voucherProblems(voucher(), [goods(), service()], settings), []);
  const bad = voucherProblems(voucher({ party_ledger: null, voucher_type: null, place_of_supply: null }),
    [goods({ stock_item_name: null })], settings);
  assert.ok(bad.some((p) => /voucher type/.test(p)));
  assert.ok(bad.some((p) => /party ledger/.test(p)));
  assert.ok(bad.some((p) => /place of supply/.test(p)));
  assert.ok(bad.some((p) => /stock item name/.test(p)));
  assert.ok(voucherProblems(voucher({ kind: 'sales_order' }), [service()], settings).some((p) => /goods only/.test(p)));
  assert.ok(voucherProblems(voucher({ place_of_supply: 'Kerala' }), [goods()], { ...settings, ledger_igst: '' })
    .some((p) => /IGST/.test(p)));
  assert.ok(voucherProblems(voucher(), [], settings).some((p) => /at least one line/.test(p)));
  // 0% GST lines need no tax ledgers.
  assert.deepEqual(voucherProblems(voucher(), [goods({ gst_rate: 0 })], { ...settings, ledger_cgst: '' }), []);
});

test('the XML balances (debits = credits) for every voucher kind', () => {
  for (const kind of ['invoice', 'proforma', 'sales_order', 'delivery_note']) {
    const lines = kind === 'invoice' || kind === 'proforma' ? [goods(), goods({ qty: 3, rate: 99.99 }), service()] : [goods()];
    for (const place of ['Karnataka', 'Maharashtra']) {
      const xml = buildVoucherXml(voucher({ kind, place_of_supply: place }), lines, settings);
      assert.equal(balance(xml), 0, `${kind} / ${place}`);
    }
  }
});

test('the XML carries the exact Tally names, escaped, and the right entries', () => {
  const xml = buildVoucherXml(voucher({ party_ledger: 'A & B <Pvt> "Ltd"' }), [goods(), service()], settings);
  assert.match(xml, /<SVCURRENTCOMPANY>TASKTEL TECHNOLOGEES PVT LTD<\/SVCURRENTCOMPANY>/);
  assert.match(xml, /VCHTYPE="Sales" ACTION="Create"/);
  assert.match(xml, /<PARTYLEDGERNAME>A &amp; B &lt;Pvt&gt; &quot;Ltd&quot;<\/PARTYLEDGERNAME>/);
  assert.match(xml, /<DATE>20261123<\/DATE>/);
  assert.match(xml, /<STOCKITEMNAME>LG 55UL5Q<\/STOCKITEMNAME>/);
  assert.match(xml, /<RATE>1000\.50\/Nos<\/RATE>/);
  assert.match(xml, /<ACTUALQTY>2 Nos<\/ACTUALQTY>/);
  assert.match(xml, /<GODOWNNAME>Main Location<\/GODOWNNAME>/);
  assert.match(xml, /<LEDGERNAME>Installation Charges<\/LEDGERNAME><ISDEEMEDPOSITIVE>No<\/ISDEEMEDPOSITIVE><AMOUNT>333\.33<\/AMOUNT>/);
  assert.match(xml, /<BASICPURCHASEORDERNO>PO\/77<\/BASICPURCHASEORDERNO>/);
  assert.match(xml, /<ADDRESS>1 MG Road<\/ADDRESS><ADDRESS>Bengaluru<\/ADDRESS>/);
  // Party is debited (negative, deemed positive).
  assert.match(xml, /<LEDGERNAME>A &amp; B &lt;Pvt&gt; &quot;Ltd&quot;<\/LEDGERNAME><ISDEEMEDPOSITIVE>Yes<\/ISDEEMEDPOSITIVE><ISPARTYLEDGER>Yes<\/ISPARTYLEDGER><AMOUNT>-/);
  assert.doesNotMatch(xml, /Output IGST/);
});

test('sales order has no batch allocations; no godown or company → those tags are left out', () => {
  const so = buildVoucherXml(voucher({ kind: 'sales_order', voucher_type: 'Sales Order' }), [goods()], settings);
  assert.doesNotMatch(so, /BATCHALLOCATIONS/);
  const bare = buildVoucherXml(voucher(), [goods()], { ...settings, godown_name: null, company_name: null });
  assert.doesNotMatch(bare, /BATCHALLOCATIONS|SVCURRENTCOMPANY|STATICVARIABLES/);
});

test('a round-down is a debit to the round off ledger', () => {
  // 1 × 100.40 + 18% = 118.47 → 118: round off −0.47
  const xml = buildVoucherXml(voucher(), [goods({ qty: 1, rate: 100.4 })], settings);
  assert.match(xml, /<LEDGERNAME>Round Off<\/LEDGERNAME><ISDEEMEDPOSITIVE>Yes<\/ISDEEMEDPOSITIVE><AMOUNT>-0\.47<\/AMOUNT>/);
  assert.equal(balance(xml), 0);
});

test('default voucher type: a services-only invoice takes the services type', () => {
  assert.equal(defaultVoucherType('invoice', settings, [service()]), 'SERVICE - SALES');
  assert.equal(defaultVoucherType('invoice', settings, [service(), goods()]), 'Sales');
  assert.equal(defaultVoucherType('invoice', { ...settings, vch_invoice_services: null }, [service()]), 'Sales');
  assert.equal(defaultVoucherType('delivery_note', settings), 'Delivery Note');
});

test('the Admin Dash copy of the voucher math is identical', async () => {
  const { readFile } = await import('node:fs/promises');
  const backend = await readFile(new URL('../services/tallyXml.js', import.meta.url), 'utf8');
  const frontend = await readFile(new URL('../../ADMIN_TECHNICIAN/ADMIN DASH/src/components/tally/tallyShared.js', import.meta.url), 'utf8')
    .catch(() => null);
  if (frontend == null) return; // backend deployed on its own
  const body = (src, name) => src.match(new RegExp(`export function ${name}\\([\\s\\S]*?\\n}\\n`))?.[0];
  for (const name of ['defaultVoucherType', 'computeVoucher', 'voucherProblems']) {
    assert.ok(body(backend, name), `${name} in backend`);
    assert.equal(body(frontend, name), body(backend, name), name);
  }
});

test('a services-only invoice is an accounting invoice; one with goods is an item invoice', () => {
  const svc = buildVoucherXml(voucher({ voucher_type: 'SERVICE - SALES' }), [service()], settings);
  assert.match(svc, /OBJVIEW="Accounting Voucher View"/);
  assert.match(svc, /<VCHENTRYMODE>Accounting Invoice<\/VCHENTRYMODE>/);
  assert.doesNotMatch(svc, /ALLINVENTORYENTRIES/);
  assert.equal(balance(svc), 0);
  assert.match(buildVoucherXml(voucher(), [goods()], settings), /<VCHENTRYMODE>Item Invoice<\/VCHENTRYMODE>/);
});
