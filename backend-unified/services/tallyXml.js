// Tally Desk — voucher math and the TallyPrime XML import file. Pure
// functions, no DB; tests/tallyXml.test.js pins them.
//
// The file is the standard Tally "Import Data → Vouchers" envelope that
// Gateway of Tally → Import → Transactions accepts. Every ledger, stock item,
// unit and voucher type is referenced by its exact Tally name, so they must
// already exist in Tally — Tally rejects the voucher otherwise and says which
// name is missing.
//
// Sign rule in Tally XML: debit = ISDEEMEDPOSITIVE Yes + negative AMOUNT,
// credit = ISDEEMEDPOSITIVE No + positive AMOUNT. On a sale the party is
// debited the total; sales, tax and (upward) round off are credited.

export const VOUCHER_KINDS = {
  sales_order: { label: 'Sales Order', services: false, taxed: true, roundOff: false },
  proforma: { label: 'Proforma', services: true, taxed: true, roundOff: true },
  delivery_note: { label: 'Delivery Note (DC)', services: false, taxed: false, roundOff: false },
  invoice: { label: 'Sales Invoice', services: true, taxed: true, roundOff: true }
};

const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const sameState = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

// The voucher type a voucher uses unless the maker picked another: an
// invoice with only service lines takes the services type when one is set.
export function defaultVoucherType(kind, settings, lines = []) {
  if (kind === 'sales_order') return settings.vch_sales_order || null;
  if (kind === 'proforma') return settings.vch_proforma || null;
  if (kind === 'delivery_note') return settings.vch_delivery_note || null;
  const servicesOnly = lines.length > 0 && lines.every((l) => l.line_type === 'service');
  return (servicesOnly && settings.vch_invoice_services) || settings.vch_invoice_goods || null;
}

// Amounts per line and for the voucher. GST is per line (as on the quote),
// CGST/SGST split per line so the halves always add back to the line's GST.
export function computeVoucher(voucher, lines, settings) {
  const kind = VOUCHER_KINDS[voucher.kind];
  const intra = sameState(voucher.place_of_supply, settings.home_state);
  const totals = { goods: 0, services: 0, cgst: 0, sgst: 0, igst: 0 };
  const out = lines.map((line) => {
    const amount = round2(Number(line.qty) * Number(line.rate));
    const gst = kind?.taxed ? round2(amount * Number(line.gst_rate) / 100) : 0;
    const cgst = intra ? round2(gst / 2) : 0;
    const sgst = intra ? round2(gst - cgst) : 0;
    const igst = intra ? 0 : gst;
    totals[line.line_type === 'service' ? 'services' : 'goods'] += amount;
    totals.cgst += cgst;
    totals.sgst += sgst;
    totals.igst += igst;
    return { ...line, amount, gst, cgst, sgst, igst };
  });
  for (const key of Object.keys(totals)) totals[key] = round2(totals[key]);
  const taxable = round2(totals.goods + totals.services);
  const tax = round2(totals.cgst + totals.sgst + totals.igst);
  const exact = round2(taxable + tax);
  const rounds = Boolean(kind?.roundOff && settings.ledger_round_off);
  const total = rounds ? Math.round(exact) : exact;
  return { lines: out, intra, ...totals, taxable, tax, round_off: round2(total - exact), total };
}

// Everything that would make Tally reject the voucher, as plain sentences.
// An empty list means the file can be downloaded.
export function voucherProblems(voucher, lines, settings) {
  const kind = VOUCHER_KINDS[voucher.kind];
  const problems = [];
  if (!kind) return ['Unknown voucher kind'];
  if (!voucher.voucher_type) problems.push(`Pick the Tally voucher type for this ${kind.label}`);
  if (!voucher.party_ledger) problems.push('Enter the customer\'s party ledger name as it is in Tally');
  if (!lines.length) problems.push('Tick at least one line');
  if (kind.taxed && !voucher.place_of_supply) problems.push('Pick the place of supply (state)');
  if (!kind.services && lines.some((l) => l.line_type === 'service')) {
    problems.push(`A ${kind.label} carries goods only — untick the service lines`);
  }
  const supply = lines.filter((l) => l.line_type !== 'service');
  supply.forEach((line, i) => {
    if (!line.stock_item_name) problems.push(`Line "${line.description}": enter its Tally stock item name`);
    else if (!line.unit_name) problems.push(`Line "${line.description}": enter its Tally unit`);
    if (i === 0 && !settings.ledger_sales_goods) problems.push('Set the goods sales ledger in Tally Settings');
  });
  if (lines.some((l) => l.line_type === 'service') && kind.services && !settings.ledger_sales_services) {
    problems.push('Set the services sales ledger in Tally Settings');
  }
  if (kind.taxed && voucher.place_of_supply && lines.some((l) => Number(l.gst_rate) > 0)) {
    if (sameState(voucher.place_of_supply, settings.home_state)) {
      if (!settings.ledger_cgst || !settings.ledger_sgst) problems.push('Set the CGST and SGST ledgers in Tally Settings');
    } else if (!settings.ledger_igst) {
      problems.push('Set the IGST ledger in Tally Settings');
    }
  }
  return problems;
}

// ---- XML ----

const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
  // Characters XML 1.0 cannot carry (control codes pasted from elsewhere).
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const tag = (name, value) => (value == null || value === '' ? '' : `<${name}>${esc(value)}</${name}>`);
const amt = (value) => round2(value).toFixed(2);
const qtyText = (qty, unit) => `${Number(qty)} ${unit}`;
const tallyDate = (value) => String(value || '').slice(0, 10).replace(/-/g, '');
const addressList = (listTag, value) => {
  const lines = String(value || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return lines.length ? `<${listTag} TYPE="String">${lines.map((l) => tag('ADDRESS', l)).join('')}</${listTag}>` : '';
};

function ledgerEntry(name, amount, { party = false } = {}) {
  // Credit when positive, debit when negative (see header).
  const debit = amount < 0;
  return '<LEDGERENTRIES.LIST>'
    + tag('LEDGERNAME', name)
    + tag('ISDEEMEDPOSITIVE', debit ? 'Yes' : 'No')
    + (party ? tag('ISPARTYLEDGER', 'Yes') : '')
    + tag('AMOUNT', amt(amount))
    + '</LEDGERENTRIES.LIST>';
}

function inventoryEntry(line, voucher, settings) {
  const qty = qtyText(line.qty, line.unit_name);
  const batch = voucher.kind === 'sales_order' ? '' : '<BATCHALLOCATIONS.LIST>'
    + tag('GODOWNNAME', settings.godown_name)
    + tag('BATCHNAME', settings.godown_name ? 'Primary Batch' : '')
    + tag('AMOUNT', amt(line.amount))
    + tag('ACTUALQTY', qty)
    + tag('BILLEDQTY', qty)
    + '</BATCHALLOCATIONS.LIST>';
  return '<ALLINVENTORYENTRIES.LIST>'
    + tag('STOCKITEMNAME', line.stock_item_name)
    + tag('ISDEEMEDPOSITIVE', 'No')
    + tag('RATE', `${amt(line.rate)}/${line.unit_name}`)
    + tag('AMOUNT', amt(line.amount))
    + tag('ACTUALQTY', qty)
    + tag('BILLEDQTY', qty)
    + (settings.godown_name ? batch : '')
    + '<ACCOUNTINGALLOCATIONS.LIST>'
    + tag('LEDGERNAME', settings.ledger_sales_goods)
    + tag('ISDEEMEDPOSITIVE', 'No')
    + tag('AMOUNT', amt(line.amount))
    + '</ACCOUNTINGALLOCATIONS.LIST>'
    + '</ALLINVENTORYENTRIES.LIST>';
}

export function buildVoucherXml(voucher, lines, settings) {
  const calc = computeVoucher(voucher, lines, settings);
  const kind = VOUCHER_KINDS[voucher.kind];
  const ledgers = [ledgerEntry(voucher.party_ledger, -calc.total, { party: true })];
  // Services are income ledger rows (not stock items), one per line so the
  // description travels with it.
  for (const line of calc.lines.filter((l) => l.line_type === 'service')) {
    ledgers.push(ledgerEntry(settings.ledger_sales_services, line.amount));
  }
  if (calc.cgst) ledgers.push(ledgerEntry(settings.ledger_cgst, calc.cgst));
  if (calc.sgst) ledgers.push(ledgerEntry(settings.ledger_sgst, calc.sgst));
  if (calc.igst) ledgers.push(ledgerEntry(settings.ledger_igst, calc.igst));
  if (calc.round_off) ledgers.push(ledgerEntry(settings.ledger_round_off, calc.round_off));

  const orderRef = voucher.po_number && voucher.kind !== 'sales_order'
    ? '<INVOICEORDERLIST.LIST>' + tag('BASICPURCHASEORDERNO', voucher.po_number)
      + tag('BASICORDERDATE', voucher.po_date ? tallyDate(voucher.po_date) : '') + '</INVOICEORDERLIST.LIST>'
    : '';

  // A voucher with no stock lines (services only) is an accounting invoice.
  const goods = calc.lines.filter((l) => l.line_type !== 'service');
  const view = goods.length ? 'Invoice Voucher View' : 'Accounting Voucher View';
  const body = `<VOUCHER VCHTYPE="${esc(voucher.voucher_type)}" ACTION="Create" OBJVIEW="${view}">`
    + tag('DATE', tallyDate(voucher.voucher_date))
    + tag('VOUCHERTYPENAME', voucher.voucher_type)
    + tag('REFERENCE', voucher.po_number)
    + tag('REFERENCEDATE', voucher.po_date ? tallyDate(voucher.po_date) : '')
    + tag('PARTYLEDGERNAME', voucher.party_ledger)
    + tag('PARTYNAME', voucher.party_ledger)
    + tag('PARTYMAILINGNAME', voucher.bill_name)
    + addressList('ADDRESS.LIST', voucher.bill_address)
    + tag('PARTYGSTIN', voucher.bill_gstin)
    + tag('STATENAME', voucher.bill_state)
    + tag('COUNTRYOFRESIDENCE', 'India')
    + tag('PLACEOFSUPPLY', voucher.place_of_supply)
    + tag('BASICBUYERNAME', voucher.ship_name)
    + addressList('BASICBUYERADDRESS.LIST', voucher.ship_address)
    + tag('CONSIGNEEGSTIN', voucher.ship_gstin)
    + tag('CONSIGNEESTATENAME', voucher.ship_state)
    + tag('CONSIGNEECOUNTRYNAME', voucher.ship_name ? 'India' : '')
    + tag('NARRATION', voucher.narration)
    + tag('PERSISTEDVIEW', view)
    + tag('VCHENTRYMODE', goods.length ? 'Item Invoice' : 'Accounting Invoice')
    + tag('ISINVOICE', kind.taxed && kind.roundOff ? 'Yes' : 'No')
    + orderRef
    + goods.map((l) => inventoryEntry(l, voucher, settings)).join('')
    + ledgers.join('')
    + '</VOUCHER>';

  const company = settings.company_name
    ? `<STATICVARIABLES>${tag('SVCURRENTCOMPANY', settings.company_name)}</STATICVARIABLES>` : '';
  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA>'
    + `<REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME>${company}</REQUESTDESC>`
    + `<REQUESTDATA><TALLYMESSAGE xmlns:UDF="TallyUDF">${body}</TALLYMESSAGE></REQUESTDATA>`
    + '</IMPORTDATA></BODY></ENVELOPE>\n';
}
