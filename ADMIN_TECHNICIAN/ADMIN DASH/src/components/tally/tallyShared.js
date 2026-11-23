// Tally Desk — nav entry, access hook, voucher kinds and the live voucher
// math. computeVoucher / voucherProblems / defaultVoucherType are an exact
// copy of backend-unified/services/tallyXml.js (the backend recomputes and
// re-checks everything before it builds the file).
import { useEffect, useState } from 'react';
import { Landmark } from 'lucide-react';
import { fetchTallyAccess } from '../../services/tallyApiService';

// Back-Office Tally Makers get this on top of their normal nav.
export const tallyNavItems = [{ id: 'tally-desk', label: 'Tally Desk', mobileLabel: 'Tally', icon: Landmark }];
export const TALLY_PAGE_IDS = tallyNavItems.map((item) => item.id);

// One /tally/access check per signed-in token, shared by every caller.
let cached = { token: null, promise: null, value: null };
const NO_ACCESS = { canAccess: false };

function loadAccess() {
  const token = localStorage.getItem('admin_access_token');
  if (!token) return Promise.resolve(NO_ACCESS);
  if (cached.token !== token) {
    cached = { token, value: null, promise: fetchTallyAccess().catch(() => NO_ACCESS) };
    cached.promise.then((value) => { if (cached.token === token) cached.value = value; });
  }
  return cached.promise;
}

// Same contract as useQuoteAccess: `enabled` false skips the request,
// `recheck` drops the cached answer first.
export function useTallyAccess(enabled = true, { recheck = false } = {}) {
  const token = localStorage.getItem('admin_access_token');
  const fresh = !recheck && cached.token === token ? cached.value : null;
  const [state, setState] = useState(() => fresh ? { ...fresh, loading: false } : { ...NO_ACCESS, loading: enabled });
  useEffect(() => {
    if (!enabled) { setState({ ...NO_ACCESS, loading: false }); return undefined; }
    if (recheck) cached = { token: null, promise: null, value: null };
    let alive = true;
    loadAccess().then((value) => { if (alive) setState({ ...value, loading: false }); });
    return () => { alive = false; };
  }, [enabled, token, recheck]);
  return state;
}

export const VOUCHER_KINDS = {
  sales_order: { label: 'Sales Order', short: 'SO', services: false, taxed: true, roundOff: false },
  proforma: { label: 'Proforma', short: 'PI', services: true, taxed: true, roundOff: true },
  delivery_note: { label: 'Delivery Note (DC)', short: 'DC', services: false, taxed: false, roundOff: false },
  invoice: { label: 'Sales Invoice', short: 'INV', services: true, taxed: true, roundOff: true }
};

export const VOUCHER_STATUS = {
  draft: { label: 'Draft', cls: 'bg-[#F2F4F7] text-[#344054] border-[#E4E7EC]', dot: 'bg-[#98A2B3]' },
  downloaded: { label: 'File downloaded', cls: 'bg-[#FFFAEB] text-[#B54708] border-[#FEDF89]', dot: 'bg-[#F79009]' },
  imported: { label: 'In Tally', cls: 'bg-[#ECFDF3] text-[#027A48] border-[#A6F4C5]', dot: 'bg-[#12B76A]' }
};

// First two digits of a GSTIN → state (GST state codes).
const GST_STATE_CODES = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand',
  '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', 10: 'Bihar', 11: 'Sikkim',
  12: 'Arunachal Pradesh', 13: 'Nagaland', 14: 'Manipur', 15: 'Mizoram', 16: 'Tripura', 17: 'Meghalaya', 18: 'Assam',
  19: 'West Bengal', 20: 'Jharkhand', 21: 'Odisha', 22: 'Chhattisgarh', 23: 'Madhya Pradesh', 24: 'Gujarat',
  25: 'Dadra and Nagar Haveli and Daman and Diu', 26: 'Dadra and Nagar Haveli and Daman and Diu', 27: 'Maharashtra', 29: 'Karnataka', 30: 'Goa', 31: 'Lakshadweep',
  32: 'Kerala', 33: 'Tamil Nadu', 34: 'Puducherry', 35: 'Andaman and Nicobar Islands', 36: 'Telangana',
  37: 'Andhra Pradesh', 38: 'Ladakh'
};
export const stateFromGstin = (gstin) => GST_STATE_CODES[String(gstin || '').trim().slice(0, 2)] || null;

const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const sameState = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

export function defaultVoucherType(kind, settings, lines = []) {
  if (kind === 'sales_order') return settings.vch_sales_order || null;
  if (kind === 'proforma') return settings.vch_proforma || null;
  if (kind === 'delivery_note') return settings.vch_delivery_note || null;
  const servicesOnly = lines.length > 0 && lines.every((l) => l.line_type === 'service');
  return (servicesOnly && settings.vch_invoice_services) || settings.vch_invoice_goods || null;
}

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

// Saves the XML the backend returns as a file.
export function saveXmlFile({ xml, filename }) {
  const url = URL.createObjectURL(new Blob([xml], { type: 'application/xml' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
