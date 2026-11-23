// Quotation exports — PDF (print window, same approach and TaskTel logo as
// the ticket/sales reports) and .xlsx (ExcelJS, loaded on demand).
// Client copy: selling prices, GST and totals only — never OSP, SM or margin
// (the columns are left out, not hidden). It also carries the GPTW / years
// badges on top and the partner logo strip on the last page.
// Internal copy: adds OSP / SM per line, OSP totals and SM (Amount − OSP).
// Layout: Investment Summary (rooms, sub-total, PMC block, grand total,
// taxes, all inclusive), then the room-wise Bill of Materials with a
// Supply / Service / Grand Total block per room and once at the end, then
// Notes, then Terms & Conditions on their own page / sheet.
// A line with Qty 0 still prints its Unit Price; its Amount, GST and Total
// are 0. Client scope is marked with the line's comment, not by hiding prices.
import { TASKTEL_LOGO_DATA_URI } from './reportLogo';
import GPTW_PNG from '../assets/quote/gptw.png?inline';
import LOGITECH_PNG from '../assets/quote/logitech.png?inline';
import NEAT_PNG from '../assets/quote/neat.png?inline';
import LG_PNG from '../assets/quote/lg.png?inline';
import SAMSUNG_PNG from '../assets/quote/samsung.png?inline';
import ABSEN_PNG from '../assets/quote/absen.png?inline';

const COMPANY = 'Tasktel Technologees Pvt. Ltd.';
const ADDRESS_LINES = [
  '\'Tasktel House\', 169, 9th Cross, 5th Main, Indiranagar 1st Stage,',
  'Bengaluru – 560 038, Karnataka, India',
  'Tel: 41126243 / 41267725 | www.taskteltechnologees.com',
  'GST: 29AACCT8707G1Z3 | CIN: U72200KA2008PTC045083'
];
// The "24 YEARS" badge counts from the founding year, so it moves on its own.
const FOUNDED = 2002;
const yearsInBusiness = () => new Date().getFullYear() - FOUNDED;
const PARTNER_LOGOS = [
  ['Logitech', LOGITECH_PNG], ['Neat', NEAT_PNG], ['LG', LG_PNG], ['Samsung', SAMSUNG_PNG], ['Absen', ABSEN_PNG]
];
const PMC_LABEL = 'Pre-Installation Planning & Migration Services';

// One palette for the PDF and the Excel copy (hex without '#').
const PALETTE = {
  brand: '004898',      // logo blue: page rules, titles, links
  head: '1F2A37',       // table header rows
  section: '0F5E63',    // solution headings (1, 2, 3 …)
  zebra: 'F7F9FA',      // alternate item rows
  border: 'DDE2E7',
  scope: 'FFF1C2',      // Client Scope rows
  qtyZero: 'FFF9E3',    // Qty 0 rows
  amber: '7A5600',      // text on the two highlights above
  subtotal: 'E6EAEE',   // Supply Total, Service Total
  total: 'D3DAE1',      // Grand Total (excl. GST)
  grand: '1E7B4F'       // Grand Total (All Inclusive)
};
const css = (key) => `#${PALETTE[key]}`;
const argb = (key) => `FF${PALETTE[key]}`;

// Client scope has no flag of its own: the line's comment says so.
const isClientScope = (line) => /client['’]?s?\s*scope/i.test(line.comment || '');
const lineTone = (line) => (isClientScope(line) ? 'scope' : Number(line.qty) === 0 ? 'zero' : '');

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const inr = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const money = (v) => inr.format(Number(v) || 0);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dateParts = (key) => String(key || '').slice(0, 10).split('-').map(Number);
const fmtDate = (key) => {
  const [y, m, d] = dateParts(key);
  return y && m && d ? `${String(d).padStart(2, '0')}/${MONTHS[m - 1]}/${y}` : '';
};

const verLabel = (version) => `${version.version_no}.0`;
const managerLine = (quote) => [quote.account_manager_name, quote.account_manager_phone].filter(Boolean).join(' · ');
const sectionLabel = (section) => section.name || (section.kind === 'ppm' ? PMC_LABEL : 'Untitled solution');
const lineLabel = (line) => [line.model_name, line.series && `(${line.series})`].filter(Boolean).join(' ');
const slug = (s) => String(s || '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
// Tasktel_<Customer>_<Project>_Proposal_v<Version>_<DD-MM-YY> (quote date).
const fileBase = (quote, version) => {
  const [y, m, d] = dateParts(version.quote_date);
  const date = y && m && d ? `${String(d).padStart(2, '0')}-${String(m).padStart(2, '0')}-${String(y).slice(-2)}` : '';
  return ['Tasktel', slug(quote.customer) || 'Customer', slug(quote.project), 'Proposal', `v${verLabel(version)}`, date]
    .filter(Boolean).join('_');
};

// Same rule the backend saves with; the on-screen draft may not be saved yet.
const productHref = (value) => {
  const s = String(value || '').trim();
  if (!s) return null;
  const href = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
  return /^https?:\/\/[^\s/]+\.[^\s]+/i.test(href) ? href : null;
};

// Indian-system amount in words, e.g. "Seventy Nine Lakh Fifty Seven Thousand Nine Hundred Twenty Rupees Only".
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen',
  'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const twoDigits = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]} ${ONES[n % 10]}`.trim());
const threeDigits = (n) => [n >= 100 ? `${ONES[Math.floor(n / 100)]} Hundred` : '', twoDigits(n % 100)].filter(Boolean).join(' ');
export function amountInWords(value) {
  const total = Math.round((Number(value) || 0) * 100);
  let rupees = Math.floor(total / 100);
  const paise = total % 100;
  if (rupees === 0 && paise === 0) return 'Zero Rupees Only';
  const parts = [];
  const crore = Math.floor(rupees / 1e7); rupees %= 1e7;
  const lakh = Math.floor(rupees / 1e5); rupees %= 1e5;
  const thousand = Math.floor(rupees / 1e3); rupees %= 1e3;
  if (crore) parts.push(`${crore >= 100 ? threeDigits(crore) : twoDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (rupees) parts.push(threeDigits(rupees));
  let words = parts.length ? `${parts.join(' ')} Rupees` : '';
  if (paise) words += `${words ? ' and ' : ''}${twoDigits(paise)} Paise`;
  return `${words} Only`;
}

// Supply lines first, then services — the order the builder shows them.
const orderedLines = (section) => [
  ...section.lines.filter((l) => l.line_type !== 'service'),
  ...section.lines.filter((l) => l.line_type === 'service')
];

// The engine's totals hold one GST figure; the summary splits it.
const r2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
function sectionFigures(section) {
  let supplyGst = 0;
  let servicesGst = 0;
  for (const line of section.lines) {
    if (line.line_type === 'service') servicesGst += line.calc.gst;
    else supplyGst += line.calc.gst;
  }
  const t = section.totals;
  return {
    supply_osp: t.supply_osp, supply_price: t.supply_price, supply_gst: r2(supplyGst),
    services_osp: t.services_osp, services_price: t.services_price, services_gst: r2(servicesGst),
    subtotal: t.subtotal, gst_total: t.gst_total, grand_total: t.grand_total, margin: t.margin, margin_pct: t.margin_pct
  };
}
function sumFigures(list) {
  const keys = ['supply_osp', 'supply_price', 'supply_gst', 'services_osp', 'services_price', 'services_gst', 'subtotal', 'gst_total', 'grand_total', 'margin'];
  const out = Object.fromEntries(keys.map((k) => [k, r2(list.reduce((sum, f) => sum + f[k], 0))]));
  out.margin_pct = out.subtotal > 0 ? r2((out.margin / out.subtotal) * 100) : 0;
  return out;
}

// The 7-line totals block (point 5); internal adds OSP totals and SM.
const totalsBlock = (f, { internal, supply = true }) => [
  ...(supply ? [['Supply Total', f.supply_price, 'key'], ['Supply GST', f.supply_gst]] : []),
  ['Service Total', f.services_price, 'key'],
  ['Service GST', f.services_gst],
  ['Grand Total (excl. GST)', f.subtotal, 'subtotal'],
  ['Total GST', f.gst_total],
  ['Grand Total (All Inclusive)', f.grand_total, 'grand'],
  ...(internal ? [
    ...(supply ? [['OSP Supply Total', f.supply_osp, 'osp']] : []),
    ['OSP Service Total', f.services_osp, 'osp'],
    [`SM (Price − OSP) · ${f.margin_pct}%`, f.margin, 'osp']
  ] : [])
];

// Terms & Conditions text → rows by its markers: "I." heading, "a)" point,
// "1." numbered point (older quotes), "•" bullet; any other line continues
// the point above it.
export function parseTerms(text) {
  const rows = [];
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    let m;
    if ((m = line.match(/^([IVX]{1,5})[.)]\s+(.+)$/))) rows.push({ kind: 'heading', mark: m[1], text: m[2] });
    else if ((m = line.match(/^([a-z])\)\s*(.+)$/))) rows.push({ kind: 'point', mark: `${m[1]})`, text: m[2] });
    else if ((m = line.match(/^(\d{1,2})[.)]\s+(.+)$/))) rows.push({ kind: 'point', mark: `${m[1]}.`, text: m[2] });
    else if ((m = line.match(/^(?:[•·▪]\s*|[-*]\s+)(.+)$/))) rows.push({ kind: 'bullet', mark: '•', text: m[1] });
    else rows.push({ kind: 'para', mark: '', text: line });
  }
  return rows;
}
// "Price: Supply Scope …" → bold "Price:" lead-in.
const splitLead = (text) => {
  const m = text.match(/^([^:]{2,40}:)(\s.*)?$/);
  return m ? [m[1], m[2] || ''] : ['', text];
};

// ============================================
// PDF
// ============================================

// `win`: a window the caller opened during the click, for exports that await
// a request first (popup blockers refuse window.open after an await).
export function exportQuotePdf({ quote, version, computed }, { internal = false, win: opened = null } = {}) {
  const win = opened || window.open('', '_blank');
  if (!win) {
    alert('Please allow popups to view & download the PDF.');
    return;
  }
  const ver = verLabel(version);
  const cols = internal ? 10 : 9;
  const figures = computed.sections.map(sectionFigures);
  const grand = sumFigures(figures);

  const blockRows = (f, opts) => totalsBlock(f, { internal, ...opts }).map(([label, value, tone]) =>
    `<tr class="tot ${tone || ''}"><td colspan="${cols - 1}" class="r">${esc(label)}</td><td class="r">${tone === 'grand' ? '₹ ' : ''}${money(value)}</td></tr>`
  ).join('');

  const highlighted = new Set();
  const sectionTables = computed.sections.map((section, si) => {
    const lines = orderedLines(section);
    const firstService = lines.findIndex((l) => l.line_type === 'service');
    const hasSupply = lines.some((l) => l.line_type !== 'service');
    const rows = lines.map((line, i) => {
      const c = line.calc;
      const href = productHref(line.product_link);
      const desc = (line.line_type === 'service'
        ? `<div class="strong">${esc(line.description)}</div>`
        : `<div class="strong">${esc(lineLabel(line))}</div>${line.description ? `<div class="sub">${esc(line.description)}</div>` : ''}`)
        + (line.comment ? `<div class="comment">${esc(line.comment)}</div>` : '')
        + (href ? `<a class="plink" href="${esc(href)}" target="_blank" rel="noopener">View product ↗</a>` : '');
      const divider = hasSupply && i === firstService ? `<tr class="group"><td colspan="${cols}">Installation &amp; Services</td></tr>` : '';
      const tone = lineTone(line);
      if (tone) highlighted.add(tone);
      return `${divider}<tr class="${tone || (i % 2 ? 'z' : '')}">
        <td class="c">${i + 1}</td><td>${desc}</td><td class="mono">${esc(line.hsn_code)}</td>
        <td class="r qty">${money(line.qty)}</td>
        ${internal ? `<td class="r osp">${money(line.osp_unit)}</td><td class="r osp">${line.price_override != null ? '—' : c.sm}</td>` : ''}
        <td class="r">${money(c.unit_price)}</td><td class="r">${money(c.amount)}</td>
        <td class="r">${money(line.gst_rate)}%</td>${internal ? '' : `<td class="r">${money(c.gst)}</td>`}
        <td class="r strong">${money(c.total)}</td>
      </tr>`;
    }).join('');
    return `
      <div class="section">
        <div class="section-title"><span class="num">${si + 1}</span>${esc(sectionLabel(section))}</div>
        <table class="lines">
          <thead><tr>
            <th class="c" style="width:26px">Sl</th><th>Description</th><th style="width:70px">HSN/SAC</th><th class="r" style="width:44px">Qty</th>
            ${internal ? '<th class="r osp" style="width:76px">OSP Unit</th><th class="r osp" style="width:40px">SM</th>' : ''}
            <th class="r" style="width:84px">Unit Price</th><th class="r" style="width:90px">Amount</th><th class="r" style="width:44px">GST</th>
            ${internal ? '' : '<th class="r" style="width:76px">GST Amt</th>'}
            <th class="r" style="width:96px">Total</th>
          </tr></thead>
          <tbody>${rows || `<tr><td colspan="${cols}" class="c muted">No lines</td></tr>`}
            ${blockRows(figures[si], { supply: section.kind !== 'ppm' })}
          </tbody>
        </table>
      </div>`;
  }).join('');

  // ---- Investment Summary (Col_ref layout) ----
  const summaryCols = internal ? 13 : 9;
  const solutionIdx = computed.sections.map((s, i) => (s.kind === 'ppm' ? -1 : i)).filter((i) => i >= 0);
  const ppmIdx = computed.sections.map((s, i) => (s.kind === 'ppm' ? i : -1)).filter((i) => i >= 0);
  const cell = (v, cls = '') => `<td class="r ${cls}">${v === '' ? '' : money(v)}</td>`;
  const summaryRow = (i, sl, label, ppm) => {
    const f = figures[i];
    const supply = (v) => (ppm ? '' : v);
    return `<tr>
      <td class="c">${sl}</td><td class="strong">${esc(label)}</td><td class="c">1</td>
      ${internal ? `${cell(supply(f.supply_osp), 'osp')}${cell(supply(f.supply_osp), 'osp')}` : ''}
      ${cell(supply(f.supply_price))}${cell(supply(f.supply_price))}${cell(supply(f.supply_gst))}
      ${internal ? `${cell(f.services_osp, 'osp')}${cell(f.services_osp, 'osp')}` : ''}
      ${cell(f.services_price)}${cell(f.services_price)}${cell(f.services_gst)}
    </tr>`;
  };
  let sl = 0;
  const solutionRows = solutionIdx.map((i) => summaryRow(i, ++sl, sectionLabel(computed.sections[i]), false)).join('');
  const rooms = sumFigures(solutionIdx.map((i) => figures[i]));
  const roomsSubtotal = solutionIdx.length ? `<tr class="total">
      <td colspan="3"></td>
      ${internal ? `<td class="osp"></td>${cell(rooms.supply_osp, 'osp')}` : ''}
      <td></td>${cell(rooms.supply_price)}${cell(rooms.supply_gst)}
      ${internal ? `<td class="osp"></td>${cell(rooms.services_osp, 'osp')}` : ''}
      <td></td>${cell(rooms.services_price)}${cell(rooms.services_gst)}
    </tr>` : '';
  const ppmRows = ppmIdx.map((i) => {
    const section = computed.sections[i];
    const what = section.lines.map((l) => l.description).filter(Boolean).join(', ') || sectionLabel(section);
    return `<tr class="group"><td></td><td colspan="${summaryCols - 1}">${esc(sectionLabel(section))}</td></tr>${summaryRow(i, ++sl, what, true)}`;
  }).join('');
  const ospAll = r2(grand.supply_osp + grand.services_osp);
  const leftSpan = 3 + (internal ? 2 : 0) + 3 + (internal ? 2 : 0);

  const partners = !internal ? `<div class="partners">${PARTNER_LOGOS.map(([name, src]) => `<img src="${src}" alt="${esc(name)}" />`).join('')}</div>` : '';
  const terms = parseTerms(version.terms);
  const termsRows = terms.map((t) => {
    if (t.kind === 'heading') return `<tr class="th"><td class="m1">${esc(t.mark)}</td><td colspan="2">${esc(t.text)}</td></tr>`;
    const [lead, rest] = t.kind === 'point' ? splitLead(t.text) : ['', t.text];
    return `<tr><td class="m1"></td><td class="m2">${esc(t.mark)}</td><td>${lead ? `<b>${esc(lead)}</b>` : ''}${esc(rest)}</td></tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>${esc(fileBase(quote, version))}${internal ? '_INTERNAL' : ''}</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; color: #0F172A; margin: 0; padding: 32px; background: #FFF; font-size: 11px; }
    .print-bar { display: flex; justify-content: flex-end; margin-bottom: 16px; }
    .btn { background: #004898; color: #FFF; border: none; padding: 10px 18px; border-radius: 8px; font-weight: 700; cursor: pointer; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #004898; padding-bottom: 12px; margin-bottom: 16px; }
    .logo-img { height: 34px; display: block; margin-bottom: 6px; }
    .company { font-size: 11px; font-weight: 700; color: #0F172A; }
    .address { font-size: 9.5px; color: #64748B; line-height: 1.45; }
    .doc-title { text-align: right; }
    .doc-title .badge { display: inline-block; margin-top: 4px; font-size: 10px; font-weight: 800; letter-spacing: .08em; color: #B42318; background: #FEF3F2; border: 1px solid #FECDCA; padding: 2px 8px; border-radius: 999px; }
    .badges { display: flex; align-items: center; gap: 12px; }
    .badges img { height: 72px; display: block; }
    .years { border: 2.5px solid #004898; border-radius: 10px; color: #004898; text-align: center; padding: 6px 12px 5px; line-height: 1; }
    .years b { display: block; font-size: 26px; font-weight: 900; }
    .years span { display: block; font-size: 10px; font-weight: 800; letter-spacing: .14em; margin-top: 3px; }
    .meta { display: grid; grid-template-columns: 1.3fr 1fr; gap: 14px; margin-bottom: 18px; }
    .box { border: 1px solid #E2E8F0; border-radius: 8px; padding: 10px 12px; }
    .box .label { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; color: #64748B; margin-bottom: 4px; }
    .kv { display: grid; grid-template-columns: 90px 1fr; row-gap: 3px; }
    .kv span:nth-child(odd) { color: #64748B; }
    .kv span:nth-child(even) { font-weight: 600; }
    .section { margin-bottom: 16px; page-break-inside: auto; }
    .section-title { background: ${css('section')}; color: #FFF; font-weight: 800; font-size: 12px; padding: 7px 10px; border-radius: 6px 6px 0 0; display: flex; align-items: center; gap: 8px; }
    .section-title .num { background: rgba(255,255,255,.2); border-radius: 4px; padding: 1px 7px; font-size: 11px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 6px 7px; border: 1px solid ${css('border')}; vertical-align: top; }
    th { background: ${css('head')}; color: #FFF; border-color: ${css('head')}; font-size: 9px; text-transform: uppercase; letter-spacing: .05em; text-align: left; }
    .summary th { text-align: center; vertical-align: middle; }
    tr { page-break-inside: avoid; }
    .total td { background: ${css('subtotal')}; font-weight: 800; }
    .total.grand-ex td { background: ${css('total')}; }
    tr.z td { background: ${css('zebra')}; }
    tr.scope td { background: ${css('scope')}; }
    tr.zero td { background: ${css('qtyZero')}; }
    tr.scope .comment { color: ${css('amber')}; font-weight: 700; }
    tr.zero .qty { color: ${css('amber')}; font-weight: 800; }
    .legend { display: flex; gap: 18px; justify-content: flex-end; margin-top: 8px; font-size: 9.5px; color: #475569; }
    .legend span { display: inline-flex; align-items: center; gap: 6px; }
    .legend .sw { display: inline-block; width: 14px; height: 10px; border: 1px solid ${css('border')}; border-radius: 2px; }
    .legend .sw.scope { background: ${css('scope')}; } .legend .sw.zero { background: ${css('qtyZero')}; }
    .group td { background: #F8FAFC; color: #64748B; font-weight: 800; font-size: 9px; text-transform: uppercase; letter-spacing: .05em; }
    .r { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .c { text-align: center; }
    .mono { font-family: ui-monospace, Menlo, monospace; font-size: 10px; color: #475569; }
    .strong { font-weight: 700; }
    .sub { font-size: 9.5px; color: #64748B; margin-top: 1px; white-space: normal; }
    .comment { font-size: 9px; font-style: italic; color: #64748B; margin-top: 2px; white-space: normal; }
    .plink { display: inline-block; margin-top: 2px; font-size: 9px; color: #004898; text-decoration: none; }
    .muted { color: #94A3B8; }
    .osp { background: #F7FEE7; }
    th.osp { background: #ECFCCB; color: #3F6212; }
    .neg { color: #B42318; }
    .h2 { font-size: 12px; font-weight: 800; color: #004898; text-transform: uppercase; letter-spacing: .05em; margin: 22px 0 8px; page-break-after: avoid; }
    .grand td, .tot.grand td { background: ${css('grand')} !important; color: #FFF; border-color: ${css('grand')}; font-size: 13px; font-weight: 800; padding-top: 8px; padding-bottom: 8px; }
    .tot td { background: #FFF; }
    .tot.key td { background: ${css('subtotal')}; font-weight: 800; }
    .tot.subtotal td { background: ${css('total')}; font-weight: 800; }
    .tot.osp td, .sm td { background: #F7FEE7 !important; color: #3F6212; font-weight: 700; }
    .words { margin-top: 8px; font-size: 11px; } .words b { color: #004898; }
    .notes { page-break-inside: avoid; white-space: pre-wrap; line-height: 1.6; font-size: 10.5px; border: 1px solid #E2E8F0; border-radius: 8px; padding: 10px 12px; }
    .grand-block { width: 46%; margin-left: auto; margin-top: 4px; page-break-inside: avoid; }
    .terms-page { page-break-before: always; }
    .terms-head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #004898; padding-bottom: 6px; margin-bottom: 10px; }
    .terms-head .h2 { margin: 0; }
    .terms-ref { text-align: right; font-size: 10.5px; line-height: 1.5; } .terms-ref span { color: #64748B; }
    .delivery { margin-bottom: 10px; font-size: 10.5px; } .delivery b { color: #004898; }
    table.terms td { border: none; padding: 2.5px 4px; font-size: 10.5px; line-height: 1.5; text-align: left; white-space: normal; }
    table.terms td.m1 { width: 30px; font-weight: 800; color: #004898; }
    table.terms td.m2 { width: 24px; }
    table.terms tr.th td { font-weight: 800; color: #004898; text-transform: uppercase; letter-spacing: .03em; padding-top: 10px; }
    .partners { display: flex; justify-content: space-evenly; align-items: center; gap: 18px; margin-top: 28px; padding: 14px 0; background: #FFF; border-top: 1px solid #E2E8F0; page-break-inside: avoid; }
    .partners img { height: 40px; width: auto; display: block; }
    .foot { margin-top: 16px; text-align: center; font-size: 9.5px; color: #94A3B8; border-top: 1px solid #E2E8F0; padding-top: 10px; }
    @media print { .print-bar { display: none; } body { padding: 0; } }
  </style></head><body>
    <div class="print-bar"><button class="btn" onclick="window.print()">Print / Save as PDF</button></div>
    <div class="head">
      <div><img class="logo-img" src="${TASKTEL_LOGO_DATA_URI}" alt="TaskTel" />
        <div class="company">${COMPANY}</div>
        <div class="address">${ADDRESS_LINES.map(esc).join('<br>')}</div></div>
      <div class="doc-title">${internal ? '<div class="badge">INTERNAL · CONFIDENTIAL</div>'
        : `<div class="badges"><img src="${GPTW_PNG}" alt="Great Place To Work Certified" /><div class="years"><b>${yearsInBusiness()}</b><span>YEARS</span></div></div>`}</div>
    </div>
    <div class="meta">
      <div class="box"><div class="label">Customer</div><div class="kv">
        <span>Customer</span><span>${esc(quote.customer)}</span>
        ${quote.contact_person ? `<span>Contact</span><span>${esc(quote.contact_person)}</span>` : ''}
        <span>Project</span><span>${esc(quote.project || '—')}</span>
        <span>Site</span><span>${esc(quote.site_location || '—')}</span>
      </div></div>
      <div class="box"><div class="label">Quotation</div><div class="kv">
        <span>Project Ref</span><span>${esc(version.project_ref || '—')}</span>
        <span>Date</span><span>${esc(fmtDate(version.quote_date))}</span>
        <span>Version</span><span>${esc(ver)}</span>
        ${managerLine(quote) ? `<span>Account Mgr</span><span>${esc(managerLine(quote))}</span>` : ''}
        ${internal ? `<span>SM</span><span>${esc(version.sm)} · round to ₹${esc(version.rounding_step)}</span>` : ''}
      </div></div>
    </div>

    <div class="h2">Investment Summary</div>
    <table class="summary">
      <thead>
        <tr>
          <th rowspan="2" style="width:30px">SL No</th><th rowspan="2">Rooms Description for AV Application</th><th rowspan="2" style="width:46px">Total count</th>
          ${internal ? '<th colspan="2" class="osp">OSP Supply</th>' : ''}<th colspan="3">Supply Price Schedule</th>
          ${internal ? '<th colspan="2" class="osp">OSP Services</th>' : ''}<th colspan="3">Professional Service</th>
        </tr>
        <tr>
          ${internal ? '<th class="osp">Unit</th><th class="osp">Total</th>' : ''}<th>Room Unit Price</th><th>Room Total Price</th><th>Total GST</th>
          ${internal ? '<th class="osp">Unit</th><th class="osp">Total</th>' : ''}<th>Unit</th><th>Total</th><th>Total GST</th>
        </tr>
      </thead>
      <tbody>${solutionRows}${roomsSubtotal}${ppmRows}
        <tr class="total grand-ex"><td colspan="3">Grand Total (Supply + Installation + PMC)</td>
          ${internal ? `<td colspan="2" class="r osp">${money(ospAll)}</td>` : ''}
          <td colspan="3" class="r">${money(grand.subtotal)}</td>
          ${internal ? '<td colspan="2" class="osp"></td>' : ''}
          <td>Taxes</td><td colspan="2" class="r">${money(grand.gst_total)}</td></tr>
        <tr class="grand"><td colspan="${leftSpan}">Grand Total (All Inclusive)</td><td colspan="3" class="r">₹ ${money(grand.grand_total)}</td></tr>
        ${internal ? `<tr class="sm"><td colspan="3">SM — margin over OSP (${grand.margin_pct}%)</td><td colspan="2" class="r ${grand.margin < 0 ? 'neg' : ''}">${money(grand.margin)}</td><td colspan="${summaryCols - 5}"></td></tr>` : ''}
      </tbody>
    </table>
    <div class="words">Amount in words: <b>${esc(amountInWords(grand.grand_total))}</b></div>

    <div class="h2">Bill of Materials</div>
    ${sectionTables}
    <table class="lines grand-block"><tbody>${totalsBlock(grand, { internal }).map(([label, value, tone]) =>
      `<tr class="tot ${tone || ''}"><td class="r">${esc(label)}</td><td class="r" style="width:120px">${tone === 'grand' ? '₹ ' : ''}${money(value)}</td></tr>`).join('')}
    </tbody></table>
    ${highlighted.size ? `<div class="legend">${highlighted.has('scope') ? '<span><i class="sw scope"></i>Client Scope — to be provided by the client</span>' : ''}${highlighted.has('zero') ? '<span><i class="sw zero"></i>Qty 0 — shown for reference, not included in the total</span>' : ''}</div>` : ''}

    ${version.notes ? `<div class="h2">Notes</div><div class="notes">${esc(version.notes)}</div>` : ''}
    ${terms.length || version.delivery_timeline ? `<div class="terms-page">
      <div class="terms-head"><div class="h2">Terms &amp; Conditions</div>
        <div class="terms-ref"><span>Ref:</span> ${esc(version.project_ref || '—')}<br><span>Date:</span> ${esc(fmtDate(version.quote_date))}</div></div>
      ${version.delivery_timeline ? `<div class="delivery"><b>Delivery:</b> ${esc(version.delivery_timeline)}</div>` : ''}
      <table class="terms"><tbody>${termsRows}</tbody></table>
    </div>` : ''}
    ${partners}
    <div class="foot">${COMPANY} · Quotation ${esc(version.project_ref || '')} · V${esc(ver)} · Generated ${esc(new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }))}</div>
    <script>window.onload = function () { setTimeout(function () { window.print(); }, 500); };</script>
  </body></html>`;

  win.document.write(html);
  win.document.close();
}

// ============================================
// EXCEL
// ============================================

const BLUE = argb('brand');
const HEAD = argb('head');
const SECTION = { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: argb('section') } } };
const OSP_FILL = 'FFF7FEE7';
const OSP_HEAD = 'FFECFCCB';
const BORDER = { style: 'thin', color: { argb: argb('border') } };
const BOX = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };
// Indian digit grouping (14,50,000), same format string as the funnel export.
const INR_FMT = '[>=10000000]##\\,##\\,##\\,##0;[>=100000]##\\,##\\,##0;##,##0';
const SUMMARY_SHEET = 'Investment Summary';
const BOM_SHEET = 'Bill of Materials';
const TERMS_SHEET = 'Terms & Conditions';
const ref = (sheet, addr) => `'${sheet}'!${addr}`;

const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
// Live formula plus the value it evaluates to, for viewers that don't recalc.
const fx = (formula, result) => ({ formula, result });

function styleRange(sheet, row, from, to, style) {
  for (let c = from; c <= to; c += 1) Object.assign(sheet.getRow(row).getCell(c), style);
}

// Totals-block rows by tone (totalsBlock).
const totalStyle = (tone, grandSize) => {
  if (tone === 'grand') return { font: { bold: true, ...(grandSize ? { size: grandSize } : {}), color: { argb: 'FFFFFFFF' } }, fill: fill(argb('grand')), border: BOX };
  if (tone === 'osp') return { font: { bold: true, color: { argb: 'FF3F6212' } }, fill: fill(OSP_FILL), border: BOX };
  if (tone === 'key') return { font: { bold: true }, fill: fill(argb('subtotal')), border: BOX };
  if (tone === 'subtotal') return { font: { bold: true }, fill: fill(argb('total')), border: BOX };
  return { font: {}, fill: fill('FFFFFFFF'), border: BOX };
};

// "24 YEARS" badge as a PNG (Excel can't draw it), 2× for print.
function yearsBadgePng() {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 140;
  const g = canvas.getContext('2d');
  g.fillStyle = '#FFFFFF';
  g.fillRect(0, 0, 200, 140);
  const [x, y, w, h, rad] = [6, 6, 188, 128, 20];
  g.beginPath();
  g.moveTo(x + rad, y);
  g.arcTo(x + w, y, x + w, y + h, rad);
  g.arcTo(x + w, y + h, x, y + h, rad);
  g.arcTo(x, y + h, x, y, rad);
  g.arcTo(x, y, x + w, y, rad);
  g.closePath();
  g.lineWidth = 7;
  g.strokeStyle = '#004898';
  g.stroke();
  g.fillStyle = '#004898';
  g.textAlign = 'center';
  g.font = '900 64px Arial, sans-serif';
  g.fillText(String(yearsInBusiness()), 100, 78);
  g.font = 'bold 26px Arial, sans-serif';
  g.fillText('Y E A R S', 100, 116);
  return canvas.toDataURL('image/png');
}

// The five partner logos, equal height and evenly spaced on white, as one
// PNG: Excel can't space images inside a single wide column reliably.
async function partnerStripPng() {
  const images = await Promise.all(PARTNER_LOGOS.map(([, src]) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  })));
  const [W, H, LOGO_H] = [1520, 140, 100];
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  g.fillStyle = '#FFFFFF';
  g.fillRect(0, 0, W, H);
  const slot = W / images.length;
  images.forEach((img, i) => {
    const w = (img.width / img.height) * LOGO_H;
    g.drawImage(img, slot * i + (slot - w) / 2, (H - LOGO_H) / 2, w, LOGO_H);
  });
  return canvas.toDataURL('image/png');
}

// ExcelJS leaves the font name out unless told, and some viewers then fall
// back to a serif face: give every cell / rich-text run Calibri.
function normalizeFonts(sheet) {
  sheet.eachRow({ includeEmpty: true }, (row) => row.eachCell({ includeEmpty: true }, (cell) => {
    if (cell.isMerged && cell.master !== cell) return;
    cell.font = { name: 'Calibri', size: 11, ...cell.font };
    const v = cell.value;
    if (v && Array.isArray(v.richText)) {
      cell.value = { richText: v.richText.map((run) => ({ ...run, font: { name: 'Calibri', size: 11, ...run.font } })) };
    }
  }));
}

// Logo + address top-left, quote details to the right. `link` points the
// detail values at the summary sheet's cells so they follow its edits.
function writeHeader(workbook, sheet, { quote, version }, { labelCol, valueEnd, title, link }) {
  const logo = workbook.addImage({ base64: TASKTEL_LOGO_DATA_URI, extension: 'png' });
  sheet.addImage(logo, { tl: { col: 0.2, row: 0.3 }, ext: { width: 190, height: 41 } });
  [COMPANY, ...ADDRESS_LINES].forEach((text, i) => {
    const r = i + 3;
    sheet.mergeCells(r, 1, r, 2);
    const cell = sheet.getRow(r).getCell(1);
    cell.value = text;
    cell.font = { size: 8, bold: i === 0, color: { argb: i === 0 ? 'FF0F172A' : 'FF64748B' } };
  });
  const meta = [
    ['Project:', quote.project || title],
    ['Customer:', quote.customer],
    ['Date:', fmtDate(version.quote_date)],
    ['Ver:', verLabel(version)],
    ['Project Ref:', version.project_ref || ''],
    ...(quote.contact_person ? [['Contact:', quote.contact_person]] : []),
    ...(managerLine(quote) ? [['Account Manager:', managerLine(quote)]] : [])
  ];
  const valueCells = meta.map(([label, value], i) => {
    const row = sheet.getRow(i + 1);
    row.getCell(labelCol).value = label;
    row.getCell(labelCol).font = { bold: true, color: { argb: 'FF475569' } };
    row.getCell(labelCol).alignment = { horizontal: 'right' };
    const cell = row.getCell(labelCol + 1);
    cell.value = link ? fx(ref(link.sheet, link.cells[i]), value) : value;
    cell.font = { bold: i < 2 };
    cell.alignment = { horizontal: 'left' };
    if (valueEnd > labelCol + 1) sheet.mergeCells(i + 1, labelCol + 1, i + 1, valueEnd);
    return cell.address;
  });
  return { nextRow: Math.max(meta.length, 2 + 1 + ADDRESS_LINES.length) + 2, valueCells };
}

function headerCells(sheet, rowNo, headers, ospCols = []) {
  const row = sheet.getRow(rowNo);
  headers.forEach((h, i) => {
    const cell = row.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: ospCols.includes(i + 1) ? 'FF3F6212' : 'FFFFFFFF' } };
    cell.fill = fill(ospCols.includes(i + 1) ? OSP_HEAD : HEAD);
    cell.alignment = { vertical: 'middle', horizontal: i < 2 ? 'left' : 'center', wrapText: true };
    cell.border = BOX;
  });
  row.height = 30;
}

// Item name bold, model / make below, comment small italic.
function descriptionRich(line, tone) {
  const runs = line.line_type === 'service'
    ? [{ text: line.description || '', font: { bold: true } }]
    : [{ text: lineLabel(line), font: { bold: true } },
      ...(line.description ? [{ text: `\n${line.description}`, font: { size: 9, color: { argb: 'FF475467' } } }] : [])];
  if (line.comment) {
    const font = tone === 'scope' ? { bold: true, color: { argb: argb('amber') } } : { color: { argb: 'FF667085' } };
    runs.push({ text: `\n${line.comment}`, font: { size: 8, italic: true, ...font } });
  }
  return { richText: runs };
}

// Writes the BOM and returns, per section, the BOM cells holding its totals
// (the summary links to them) plus the header's value cells.
function writeBomSheet(workbook, sheet, data, internal, summaryHeaderCells) {
  const { computed, version } = data;
  const headers = internal
    ? ['Sl', 'Description', 'HSN/SAC', 'UOM', 'Qty', 'OSP Unit', 'OSP Total', 'SM', 'Unit Price', 'Amount', 'GST %', 'GST', 'Total', 'Product Link']
    : ['Sl', 'Description', 'HSN/SAC', 'UOM', 'Qty', 'Unit Price', 'Amount', 'GST %', 'GST', 'Total', 'Product Link'];
  const widths = internal ? [6, 46, 12, 7, 8, 14, 15, 8, 14, 15, 8, 13, 15, 16] : [6, 52, 12, 7, 8, 15, 16, 8, 14, 17, 16];
  sheet.columns = widths.map((width) => ({ width }));
  const col = (name) => headers.indexOf(name) + 1;
  const L = (name) => sheet.getColumn(col(name)).letter;
  const ospCols = internal ? [col('OSP Unit'), col('OSP Total'), col('SM')] : [];
  const last = headers.length;
  const totalCol = col('Total');
  const { nextRow } = writeHeader(workbook, sheet, data, {
    labelCol: Math.max(3, last - 4), valueEnd: last, title: BOM_SHEET,
    link: { sheet: SUMMARY_SHEET, cells: summaryHeaderCells }
  });
  let r = nextRow;
  headerCells(sheet, r, headers, ospCols);
  sheet.views = [{ showGridLines: false, state: 'frozen', ySplit: r }];

  const highlighted = new Set();
  const sectionRefs = computed.sections.map((section, si) => {
    r += 1;
    sheet.mergeCells(r, 1, r, last);
    sheet.getRow(r).getCell(1).value = `${si + 1}.  ${sectionLabel(section)}`;
    styleRange(sheet, r, 1, last, { ...SECTION, border: BOX });

    const ranges = { supply: [], service: [] };
    orderedLines(section).forEach((line, li) => {
      r += 1;
      const c = line.calc;
      const row = sheet.getRow(r);
      const set = (name, value, numFmt) => {
        const cell = row.getCell(col(name));
        cell.value = value;
        if (numFmt) cell.numFmt = numFmt;
      };
      ranges[line.line_type === 'service' ? 'service' : 'supply'].push(r);
      set('Sl', li + 1);
      const tone = lineTone(line);
      if (tone) highlighted.add(tone);
      set('Description', descriptionRich(line, tone));
      set('HSN/SAC', line.hsn_code || '');
      set('UOM', line.uom || 'Nos');
      set('Qty', line.qty);
      const qty = `${L('Qty')}${r}`;
      if (internal) {
        set('OSP Unit', line.osp_unit, INR_FMT);
        set('OSP Total', fx(`ROUND(${qty}*${L('OSP Unit')}${r},2)`, c.osp_total), INR_FMT);
        if (line.price_override != null) {
          set('SM', '—');
          set('Unit Price', c.unit_price, INR_FMT);
        } else {
          set('SM', c.sm);
          // OSP ÷ SM rounded up to the quote's step (quoteEngine.js); the
          // ROUND drops float noise so 850 ÷ 0.85 stays 1000.
          const sm = `${L('SM')}${r}`;
          set('Unit Price', fx(`IF(${sm}>0,CEILING(ROUND(${L('OSP Unit')}${r}/${sm},6),${version.rounding_step}),0)`, c.unit_price), INR_FMT);
        }
      } else {
        set('Unit Price', c.unit_price, INR_FMT);
      }
      set('Amount', fx(`ROUND(${qty}*${L('Unit Price')}${r},2)`, c.amount), INR_FMT);
      set('GST %', line.gst_rate / 100, '0.##%');
      set('GST', fx(`ROUND(${L('Amount')}${r}*${L('GST %')}${r},2)`, c.gst), INR_FMT);
      set('Total', fx(`${L('Amount')}${r}+${L('GST')}${r}`, c.total), INR_FMT);
      const href = productHref(line.product_link);
      if (href) {
        const cell = row.getCell(col('Product Link'));
        cell.value = { text: 'View product', hyperlink: href };
        cell.font = { color: { argb: 'FF004898' }, underline: true };
      }
      for (let ci = 1; ci <= last; ci += 1) {
        const cell = row.getCell(ci);
        cell.border = BOX;
        cell.alignment = { vertical: 'top', wrapText: ci === col('Description'), horizontal: ci === 1 || ci === col('UOM') ? 'center' : undefined };
        const rowFill = tone === 'scope' ? argb('scope') : tone === 'zero' ? argb('qtyZero') : li % 2 ? argb('zebra') : null;
        if (tone) cell.fill = fill(rowFill);
        else if (ospCols.includes(ci)) cell.fill = fill(OSP_FILL);
        else if (rowFill) cell.fill = fill(rowFill);
      }
      if (tone === 'zero') row.getCell(col('Qty')).font = { bold: true, color: { argb: argb('amber') } };
    });

    // Supply / Service / Grand Total block (point 5), all live formulas.
    const f = sectionFigures(section);
    const sumOf = (letter, rows) => (rows.length ? `SUM(${letter}${rows[0]}:${letter}${rows[rows.length - 1]})` : '0');
    const refs = {};
    const block = (key, label, formula, result, tone) => {
      r += 1;
      const row = sheet.getRow(r);
      row.getCell(2).value = label;
      row.getCell(totalCol).value = fx(formula, result);
      row.getCell(totalCol).numFmt = INR_FMT;
      const style = totalStyle(tone);
      styleRange(sheet, r, 1, last, style);
      refs[key] = `${sheet.getColumn(totalCol).letter}${r}`;
    };
    const supply = section.kind !== 'ppm';
    if (supply) {
      block('supply', 'Supply Total', sumOf(L('Amount'), ranges.supply), f.supply_price, 'key');
      block('supplyGst', 'Supply GST', sumOf(L('GST'), ranges.supply), f.supply_gst);
    }
    block('service', 'Service Total', sumOf(L('Amount'), ranges.service), f.services_price, 'key');
    block('serviceGst', 'Service GST', sumOf(L('GST'), ranges.service), f.services_gst);
    const plus = (...keys) => keys.filter((k) => refs[k]).map((k) => refs[k]).join('+') || '0';
    block('subtotal', 'Grand Total (excl. GST)', plus('supply', 'service'), f.subtotal, 'subtotal');
    block('gst', 'Total GST', plus('supplyGst', 'serviceGst'), f.gst_total);
    block('grand', 'Grand Total (All Inclusive)', plus('subtotal', 'gst'), f.grand_total, 'grand');
    if (internal) {
      if (supply) block('ospSupply', 'OSP Supply Total', sumOf(L('OSP Total'), ranges.supply), f.supply_osp, 'osp');
      block('ospService', 'OSP Service Total', sumOf(L('OSP Total'), ranges.service), f.services_osp, 'osp');
      block('margin', 'SM (Price − OSP)', `${refs.subtotal}-(${plus('ospSupply', 'ospService')})`, f.margin, 'osp');
    }
    return refs;
  });

  // Whole quotation, once at the end: the same block summing every room's.
  r += 1;
  const grand = sumFigures(computed.sections.map(sectionFigures));
  const letter = sheet.getColumn(totalCol).letter;
  const sumRefs = (key) => {
    const cells = sectionRefs.map((refs) => refs[key]).filter(Boolean);
    return cells.length ? `SUM(${cells.join(',')})` : '0';
  };
  r += 1;
  sheet.mergeCells(r, 1, r, last);
  sheet.getRow(r).getCell(1).value = 'QUOTATION TOTAL';
  styleRange(sheet, r, 1, last, { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: fill(HEAD), border: BOX });
  const totals = {};
  const rows = totalsBlock(grand, { internal }).map(([label, value, tone], i) => [
    ['supply', 'supplyGst', 'service', 'serviceGst', 'subtotal', 'gst', 'grand', 'ospSupply', 'ospService', 'margin'][i], label, value, tone]);
  for (const [key, label, value, tone] of rows) {
    r += 1;
    const row = sheet.getRow(r);
    row.getCell(2).value = label;
    const formula = key === 'subtotal' ? `${totals.supply}+${totals.service}`
      : key === 'gst' ? `${totals.supplyGst}+${totals.serviceGst}`
      : key === 'grand' ? `${totals.subtotal}+${totals.gst}`
      : key === 'margin' ? `${totals.subtotal}-(${totals.ospSupply}+${totals.ospService})`
      : sumRefs(key);
    row.getCell(totalCol).value = fx(formula, value);
    row.getCell(totalCol).numFmt = INR_FMT;
    totals[key] = `${letter}${r}`;
    const style = totalStyle(tone, 12);
    styleRange(sheet, r, 1, last, style);
  }
  if (highlighted.size) r += 1;
  for (const [tone, text] of [['scope', 'Client Scope — to be provided by the client'], ['zero', 'Qty 0 — shown for reference, not included in the total']]) {
    if (!highlighted.has(tone)) continue;
    r += 1;
    Object.assign(sheet.getRow(r).getCell(1), { fill: fill(argb(tone === 'scope' ? 'scope' : 'qtyZero')), border: BOX });
    Object.assign(sheet.getRow(r).getCell(2), { value: text, font: { size: 9, color: { argb: 'FF475569' } } });
  }
  sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  return sectionRefs;
}

// Col_ref layout. Every figure links to the room's totals on the BOM sheet;
// "Total count" multiplies the room's unit figures into its totals.
function writeSummarySheet(workbook, sheet, data, internal, sectionRefs, headerCellsOut) {
  const { computed, version } = data;
  const figures = computed.sections.map(sectionFigures);
  const grand = sumFigures(figures);
  // Column map (1-based).
  const C = internal
    ? { sl: 1, desc: 2, count: 3, ospSU: 4, ospST: 5, sU: 6, sT: 7, sG: 8, ospVU: 9, ospVT: 10, vU: 11, vT: 12, vG: 13 }
    : { sl: 1, desc: 2, count: 3, sU: 4, sT: 5, sG: 6, vU: 7, vT: 8, vG: 9 };
  const last = internal ? 13 : 9;
  const ospCols = internal ? [C.ospSU, C.ospST, C.ospVU, C.ospVT] : [];
  sheet.columns = Array.from({ length: last }, (_, i) => ({ width: i === 0 ? 8 : i === 1 ? 46 : i === 2 ? 10 : 15 }));
  const letter = (c) => sheet.getColumn(c).letter;

  // Client: badges top-right (GPTW + years), so the details sit left of them.
  const header = writeHeader(workbook, sheet, data, internal
    ? { labelCol: last - 3, valueEnd: last, title: 'Audio - Visual Solutions - Investment Summary Sheet' }
    : { labelCol: C.sU, valueEnd: C.vU, title: 'Audio - Visual Solutions - Investment Summary Sheet' });
  headerCellsOut.push(...header.valueCells);
  if (!internal) {
    const gptw = workbook.addImage({ base64: GPTW_PNG, extension: 'png' });
    sheet.addImage(gptw, { tl: { col: C.vT - 1 + 0.15, row: 0.2 }, ext: { width: 50, height: 85 } });
    const years = workbook.addImage({ base64: yearsBadgePng(), extension: 'png' });
    sheet.addImage(years, { tl: { col: C.vG - 1 + 0.1, row: 0.8 }, ext: { width: 86, height: 60 } });
  }
  let r = header.nextRow;

  // Two header rows: groups, then Unit / Total / GST.
  const groups = [
    [C.sl, C.sl, 'SL No'], [C.desc, C.desc, 'Rooms Description for AV Application'], [C.count, C.count, 'Total count'],
    ...(internal ? [[C.ospSU, C.ospST, 'OSP Supply']] : []), [C.sU, C.sG, 'Supply Price Schedule'],
    ...(internal ? [[C.ospVU, C.ospVT, 'OSP Services']] : []), [C.vU, C.vG, 'Professional Service']
  ];
  const sub = {
    [C.sU]: 'Room Unit Price', [C.sT]: 'Room Total Price', [C.sG]: 'Total GST', [C.vU]: 'Unit', [C.vT]: 'Total', [C.vG]: 'Total GST',
    ...(internal ? { [C.ospSU]: 'Unit', [C.ospST]: 'Total', [C.ospVU]: 'Unit', [C.ospVT]: 'Total' } : {})
  };
  for (const [from, to, label] of groups) {
    if (from === to) sheet.mergeCells(r, from, r + 1, to);
    else sheet.mergeCells(r, from, r, to);
    sheet.getRow(r).getCell(from).value = label;
  }
  for (const [c, label] of Object.entries(sub)) sheet.getRow(r + 1).getCell(Number(c)).value = label;
  for (const rr of [r, r + 1]) {
    for (let c = 1; c <= last; c += 1) {
      const cell = sheet.getRow(rr).getCell(c);
      const osp = ospCols.includes(c);
      cell.font = { bold: true, color: { argb: osp ? 'FF3F6212' : 'FFFFFFFF' } };
      cell.fill = fill(osp ? OSP_HEAD : HEAD);
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = BOX;
    }
    sheet.getRow(rr).height = rr === r ? 20 : 30;
  }
  r += 1;

  const bom = (addr) => ref(BOM_SHEET, addr);
  const styleRow = (rowNo, extra = {}) => {
    for (let c = 1; c <= last; c += 1) {
      const cell = sheet.getRow(rowNo).getCell(c);
      cell.border = BOX;
      if (c > C.count) cell.numFmt = INR_FMT;
      if (ospCols.includes(c)) cell.fill = fill(OSP_FILL);
      cell.alignment = { vertical: 'middle' };
      Object.assign(cell, extra);
    }
  };
  const dataRows = { rooms: [], all: [] };
  let sl = 0;
  const writeRow = (i, label, ppm) => {
    r += 1;
    const f = figures[i];
    const refs = sectionRefs[i];
    const row = sheet.getRow(r);
    const n = `${letter(C.count)}${r}`;
    const pair = (unitCol, totalCol, refKey, value) => {
      if (!refs[refKey]) return;
      row.getCell(unitCol).value = fx(bom(refs[refKey]), value);
      row.getCell(totalCol).value = fx(`${letter(unitCol)}${r}*${n}`, value);
    };
    row.getCell(C.sl).value = ++sl;
    row.getCell(C.desc).value = label;
    row.getCell(C.count).value = 1;
    if (!ppm) {
      if (internal) pair(C.ospSU, C.ospST, 'ospSupply', f.supply_osp);
      pair(C.sU, C.sT, 'supply', f.supply_price);
      row.getCell(C.sG).value = fx(`${bom(refs.supplyGst)}*${n}`, f.supply_gst);
    }
    if (internal) pair(C.ospVU, C.ospVT, 'ospService', f.services_osp);
    pair(C.vU, C.vT, 'service', f.services_price);
    row.getCell(C.vG).value = fx(`${bom(refs.serviceGst)}*${n}`, f.services_gst);
    styleRow(r);
    row.getCell(C.sl).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(C.count).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(C.desc).alignment = { vertical: 'middle', wrapText: true };
    if (!ppm) dataRows.rooms.push(r);
    dataRows.all.push(r);
  };

  computed.sections.forEach((s, i) => { if (s.kind !== 'ppm') writeRow(i, sectionLabel(s), false); });
  const sumCol = (c, rows) => (rows.length ? `SUM(${rows.map((x) => `${letter(c)}${x}`).join(',')})` : '0');
  if (dataRows.rooms.length) {
    r += 1;
    const rooms = sumFigures(figures.filter((_, i) => computed.sections[i].kind !== 'ppm'));
    const cells = [[C.sT, rooms.supply_price], [C.sG, rooms.supply_gst], [C.vT, rooms.services_price], [C.vG, rooms.services_gst],
      ...(internal ? [[C.ospST, rooms.supply_osp], [C.ospVT, rooms.services_osp]] : [])];
    for (const [c, value] of cells) sheet.getRow(r).getCell(c).value = fx(sumCol(c, dataRows.rooms), value);
    styleRow(r, { font: { bold: true }, fill: fill(argb('subtotal')) });
  }
  computed.sections.forEach((s, i) => {
    if (s.kind !== 'ppm') return;
    r += 2;
    sheet.mergeCells(r, C.desc, r, last);
    sheet.getRow(r).getCell(C.desc).value = sectionLabel(s);
    styleRange(sheet, r, 1, last, { ...SECTION, border: BOX });
    writeRow(i, s.lines.map((l) => l.description).filter(Boolean).join(', ') || sectionLabel(s), true);
  });

  // Grand total, taxes, all inclusive (Col_ref rows).
  r += 2;
  const priceTotal = `${sumCol(C.sT, dataRows.all)}+${sumCol(C.vT, dataRows.all)}`;
  const taxes = `${sumCol(C.sG, dataRows.all)}+${sumCol(C.vG, dataRows.all)}`;
  const g = sheet.getRow(r);
  sheet.mergeCells(r, 1, r, C.count);
  g.getCell(1).value = 'GRAND TOTAL (Supply + Installation + PMC)';
  if (internal) {
    sheet.mergeCells(r, C.ospSU, r, C.ospST);
    g.getCell(C.ospSU).value = fx(`${sumCol(C.ospST, dataRows.all)}+${sumCol(C.ospVT, dataRows.all)}`, r2(grand.supply_osp + grand.services_osp));
    sheet.mergeCells(r, C.ospVU, r, C.ospVT);
  }
  sheet.mergeCells(r, C.sU, r, C.sG);
  g.getCell(C.sU).value = fx(priceTotal, grand.subtotal);
  g.getCell(C.vU).value = 'Taxes';
  sheet.mergeCells(r, C.vT, r, C.vG);
  g.getCell(C.vT).value = fx(taxes, grand.gst_total);
  styleRow(r, { font: { bold: true }, fill: fill(argb('total')) });
  if (internal) for (const c of ospCols) Object.assign(g.getCell(c), { fill: fill(OSP_FILL), font: { bold: true, color: { argb: 'FF3F6212' } } });
  const grandRow = r;
  g.height = 22;

  r += 2;
  const a = sheet.getRow(r);
  sheet.mergeCells(r, 1, r, C.vU);
  a.getCell(1).value = 'GRAND TOTAL (All Inclusive)';
  a.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.mergeCells(r, C.vT, r, C.vG);
  a.getCell(C.vT).value = fx(`${letter(C.sU)}${grandRow}+${letter(C.vT)}${grandRow}`, grand.grand_total);
  styleRow(r, { font: { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }, fill: fill(argb('grand')) });
  a.height = 24;

  r += 1;
  sheet.mergeCells(r, 1, r, last);
  sheet.getRow(r).getCell(1).value = `Amount in words: ${amountInWords(grand.grand_total)}`;
  sheet.getRow(r).getCell(1).font = { italic: true, color: { argb: 'FF475569' } };

  if (internal) {
    r += 2;
    const row = sheet.getRow(r);
    row.getCell(C.desc).value = `SM (margin over OSP) · universal SM ${version.sm}`;
    sheet.mergeCells(r, C.ospSU, r, C.ospST);
    row.getCell(C.ospSU).value = fx(`${letter(C.sU)}${grandRow}-${letter(C.ospSU)}${grandRow}`, grand.margin);
    row.getCell(C.ospSU).numFmt = INR_FMT;
    row.getCell(C.sU).value = grand.margin_pct / 100;
    row.getCell(C.sU).numFmt = '0.00%';
    styleRange(sheet, r, C.desc, C.sU, { font: { bold: true, color: { argb: 'FF3F6212' } }, fill: fill(OSP_FILL), border: BOX });
  }

  if (version.notes) {
    r += 2;
    sheet.getRow(r).getCell(1).value = 'NOTE :';
    sheet.getRow(r).getCell(1).font = { bold: true };
    for (const line of String(version.notes).split('\n')) {
      r += 1;
      sheet.mergeCells(r, 1, r, last);
      sheet.getRow(r).getCell(1).value = line;
      sheet.getRow(r).getCell(1).alignment = { wrapText: true };
    }
  }
  sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
}

// I / II headings and a) points in their own fixed columns, text wrapped.
function writeTermsSheet(workbook, sheet, data, strip) {
  const { version } = data;
  const TEXT_WIDTH = 110;
  sheet.columns = [{ width: 6 }, { width: 5 }, { width: TEXT_WIDTH }];
  const right = (rowNo, label, value) => {
    const cell = sheet.getRow(rowNo).getCell(3);
    cell.value = { richText: [{ text: `${label} `, font: { color: { argb: 'FF64748B' } } }, { text: value, font: { bold: true } }] };
    cell.alignment = { horizontal: 'right' };
  };
  right(1, 'Ref:', version.project_ref || '—');
  right(2, 'Date:', fmtDate(version.quote_date));
  let r = 3;
  if (version.delivery_timeline) {
    r += 1;
    sheet.mergeCells(r, 1, r, 3);
    const cell = sheet.getRow(r).getCell(1);
    cell.value = { richText: [{ text: 'Delivery: ', font: { bold: true, color: { argb: BLUE } } }, { text: version.delivery_timeline }] };
    cell.alignment = { wrapText: true, vertical: 'top' };
  }
  r += 2;
  sheet.mergeCells(r, 1, r, 3);
  sheet.getRow(r).getCell(1).value = 'TERMS & CONDITIONS';
  sheet.getRow(r).getCell(1).font = { bold: true, size: 12, color: { argb: BLUE } };
  sheet.getRow(r).getCell(1).border = { bottom: { style: 'medium', color: { argb: BLUE } } };

  for (const t of parseTerms(version.terms)) {
    r += 1;
    const row = sheet.getRow(r);
    const top = { vertical: 'top' };
    if (t.kind === 'heading') {
      row.getCell(1).value = t.mark;
      row.getCell(2).value = t.text.toUpperCase();
      sheet.mergeCells(r, 2, r, 3);
      for (const c of [1, 2]) row.getCell(c).font = { bold: true, color: { argb: BLUE } };
      row.height = 22;
      row.getCell(1).alignment = { vertical: 'bottom' };
      row.getCell(2).alignment = { vertical: 'bottom' };
      continue;
    }
    row.getCell(2).value = t.mark;
    row.getCell(2).alignment = top;
    const [lead, rest] = t.kind === 'point' ? splitLead(t.text) : ['', t.text];
    row.getCell(3).value = lead ? { richText: [{ text: lead, font: { bold: true } }, { text: rest }] } : rest;
    row.getCell(3).alignment = { ...top, wrapText: true };
    // Excel won't grow a wrapped row on its own: ~1.1 chars per width unit.
    row.height = Math.max(1, Math.ceil(t.text.length / (TEXT_WIDTH * 1.1))) * 15;
  }

  // Partner logo strip on the last page of the client copy.
  if (strip) {
    r += 2;
    const img = workbook.addImage({ base64: strip, extension: 'png' });
    sheet.addImage(img, { tl: { col: 1, row: r }, ext: { width: 760, height: 70 } });
    for (const rr of [r + 1, r + 2, r + 3]) sheet.getRow(rr).height = 18;
  }
  sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
}

export async function exportQuoteXlsx(data, { internal = false } = {}) {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = COMPANY;
  // Tab order: summary, BOM, T&C. The BOM is written first because the
  // summary's formulas point at its totals cells.
  const summary = workbook.addWorksheet(SUMMARY_SHEET, { views: [{ showGridLines: false }] });
  const bomSheet = workbook.addWorksheet(BOM_SHEET, { views: [{ showGridLines: false }] });
  const termsSheet = workbook.addWorksheet(TERMS_SHEET, { views: [{ showGridLines: false }] });
  // The summary header cells are fixed by the layout (rows 1… of the value
  // column), so the BOM can link to them before the summary is written.
  const summaryValueCol = internal ? 11 : 5;
  const metaCount = 5 + (data.quote.contact_person ? 1 : 0) + (managerLine(data.quote) ? 1 : 0);
  const summaryHeaderCells = Array.from({ length: metaCount }, (_, i) => `${summary.getColumn(summaryValueCol).letter}${i + 1}`);
  const sectionRefs = writeBomSheet(workbook, bomSheet, data, internal, summaryHeaderCells);
  const written = [];
  writeSummarySheet(workbook, summary, data, internal, sectionRefs, written);
  if (written.join() !== summaryHeaderCells.join()) throw new Error('Summary header layout changed — update summaryValueCol');
  writeTermsSheet(workbook, termsSheet, data, internal ? null : await partnerStripPng());
  for (const sheet of [summary, bomSheet, termsSheet]) normalizeFonts(sheet);
  workbook.calcProperties = { fullCalcOnLoad: true };
  await downloadWorkbook(workbook, `${fileBase(data.quote, data.version)}${internal ? '_INTERNAL' : ''}.xlsx`);
}

// Accounting copy (trial): goods only — Sl, Category, Model name / make and
// Qty, grouped by room. No prices; service lines are left out.
export async function exportQuoteAccountingXlsx(data) {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = COMPANY;
  const sheet = workbook.addWorksheet('Accounting', { views: [{ showGridLines: false }] });
  const headers = ['Sl', 'Category', 'Model Name / Make', 'Qty'];
  sheet.columns = [6, 44, 44, 10].map((width) => ({ width }));
  const last = headers.length;
  let r = writeHeader(workbook, sheet, data, { labelCol: 3, valueEnd: last, title: 'Accounting' }).nextRow;
  headerCells(sheet, r, headers);
  sheet.views = [{ showGridLines: false, state: 'frozen', ySplit: r }];

  data.computed.sections.forEach((section, si) => {
    const goods = orderedLines(section).filter((line) => line.line_type !== 'service');
    if (!goods.length) return;
    r += 1;
    sheet.mergeCells(r, 1, r, last);
    sheet.getRow(r).getCell(1).value = `${si + 1}.  ${sectionLabel(section)}`;
    styleRange(sheet, r, 1, last, { ...SECTION, border: BOX });
    goods.forEach((line, li) => {
      r += 1;
      const row = sheet.getRow(r);
      [li + 1, line.category_name || '', line.description || '', line.qty].forEach((value, ci) => {
        const cell = row.getCell(ci + 1);
        cell.value = value;
        cell.border = BOX;
        cell.alignment = { vertical: 'top', wrapText: ci === 1 || ci === 2, horizontal: ci === 0 || ci === 3 ? 'center' : undefined };
      });
    });
  });
  normalizeFonts(sheet);
  sheet.pageSetup = { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  await downloadWorkbook(workbook, `${fileBase(data.quote, data.version)}_ACCOUNTING.xlsx`);
}

async function downloadWorkbook(workbook, filename) {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
