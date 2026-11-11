// Quotation exports — PDF (print window, same approach and TaskTel logo as
// the ticket/sales reports) and .xlsx (ExcelJS, loaded on demand).
// Client copy: selling prices, GST and totals only — never OSP, SM or margin.
// Internal copy: adds OSP / SM per line and one margin figure per room
// (Amount − OSP Total), never per-line margins.
// Layout: summary first, then the room-wise detail with a sub-total per room
// and the grand total once at the end, then Notes and Terms & Conditions.
import { TASKTEL_LOGO_DATA_URI } from './reportLogo';

const COMPANY = 'Tasktel Technologees Pvt Ltd';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const inr = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const money = (v) => inr.format(Number(v) || 0);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDate = (key) => {
  const [y, m, d] = String(key || '').slice(0, 10).split('-').map(Number);
  return y && m && d ? `${String(d).padStart(2, '0')}/${MONTHS[m - 1]}/${y}` : '';
};

const managerLine = (quote) => [quote.account_manager_name, quote.account_manager_phone].filter(Boolean).join(' · ');
const sectionLabel = (section) => section.name || (section.kind === 'ppm' ? 'Pre-Installation Planning & Migration Services' : 'Untitled solution');
const lineLabel = (line) => [line.model_name, line.series && `(${line.series})`].filter(Boolean).join(' ');
const fileBase = (quote, version) =>
  `Quotation_${(quote.customer || 'customer').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}_V${version.version_no}`;

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
  const totals = computed.totals;
  const ver = `${version.version_no}.0`;
  const cols = internal ? 10 : 9;

  const sectionTables = computed.sections.map((section, si) => {
    const lines = orderedLines(section);
    const firstService = lines.findIndex((l) => l.line_type === 'service');
    const hasSupply = lines.some((l) => l.line_type !== 'service');
    const rows = lines.map((line, i) => {
      const c = line.calc;
      const desc = line.line_type === 'service'
        ? `<div class="strong">${esc(line.description)}</div>`
        : `<div class="strong">${esc(lineLabel(line))}</div>${line.description ? `<div class="sub">${esc(line.description)}</div>` : ''}`;
      const divider = hasSupply && i === firstService ? `<tr class="group"><td colspan="${cols}">Installation &amp; Services</td></tr>` : '';
      return `${divider}<tr>
        <td class="c">${i + 1}</td><td>${desc}</td><td class="mono">${esc(line.hsn_code)}</td>
        <td class="r">${money(line.qty)}</td>
        ${internal ? `<td class="r osp">${money(line.osp_unit)}</td><td class="r osp">${line.price_override != null ? '—' : c.sm}</td>` : ''}
        <td class="r">${money(c.unit_price)}</td><td class="r">${money(c.amount)}</td>
        <td class="r">${money(line.gst_rate)}%</td>${internal ? '' : `<td class="r">${money(c.gst)}</td>`}
        <td class="r strong">${money(c.total)}</td>
      </tr>`;
    }).join('');
    const t = section.totals;
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
            <tr class="total"><td colspan="${internal ? 7 : 5}" class="r">Sub-total</td>
              <td class="r">${money(t.subtotal)}</td><td></td>${internal ? '' : `<td class="r">${money(t.gst_total)}</td>`}
              <td class="r">${money(t.grand_total)}</td></tr>
            ${internal ? `<tr class="sm"><td colspan="${cols - 1}" class="r">Room margin (Amount ${money(t.subtotal)} − OSP Total ${money(t.supply_osp + t.services_osp)})</td>
              <td class="r ${t.margin < 0 ? 'neg' : ''}">${money(t.margin)}</td></tr>` : ''}
            ${si === computed.sections.length - 1 ? `<tr class="grand"><td colspan="${cols - 1}" class="r">Grand Total (All Inclusive)</td><td class="r">₹ ${money(totals.grand_total)}</td></tr>` : ''}
          </tbody>
        </table>
      </div>`;
  }).join('');

  const summaryRows = computed.sections.map((s, i) => `<tr>
    <td class="c">${i + 1}</td><td class="strong">${esc(sectionLabel(s))}</td>
    ${internal ? `<td class="r osp">${money(s.totals.supply_osp)}</td>` : ''}
    <td class="r">${money(s.totals.supply_price)}</td>
    ${internal ? `<td class="r osp">${money(s.totals.services_osp)}</td>` : ''}
    <td class="r">${money(s.totals.services_price)}</td>
    <td class="r">${money(s.totals.gst_total)}</td>
    <td class="r strong">${money(s.totals.grand_total)}</td>
  </tr>`).join('');
  const summaryCols = internal ? 8 : 6;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>${esc(fileBase(quote, version))}${internal ? '_INTERNAL' : ''}</title>
  <style>
    @page { size: A4 ${internal ? 'landscape' : 'portrait'}; margin: 12mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; color: #0F172A; margin: 0; padding: 32px; background: #FFF; font-size: 11px; }
    .print-bar { display: flex; justify-content: flex-end; margin-bottom: 16px; }
    .btn { background: #004898; color: #FFF; border: none; padding: 10px 18px; border-radius: 8px; font-weight: 700; cursor: pointer; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #004898; padding-bottom: 14px; margin-bottom: 16px; }
    .logo-img { height: 34px; display: block; margin-bottom: 6px; }
    .company { font-size: 11px; color: #64748B; }
    .doc-title { text-align: right; }
    .doc-title .badge { display: inline-block; margin-top: 4px; font-size: 10px; font-weight: 800; letter-spacing: .08em; color: #B42318; background: #FEF3F2; border: 1px solid #FECDCA; padding: 2px 8px; border-radius: 999px; }
    .meta { display: grid; grid-template-columns: 1.3fr 1fr; gap: 14px; margin-bottom: 18px; }
    .box { border: 1px solid #E2E8F0; border-radius: 8px; padding: 10px 12px; }
    .box .label { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; color: #64748B; margin-bottom: 4px; }
    .kv { display: grid; grid-template-columns: 90px 1fr; row-gap: 3px; }
    .kv span:nth-child(odd) { color: #64748B; }
    .kv span:nth-child(even) { font-weight: 600; }
    .section { margin-bottom: 16px; page-break-inside: auto; }
    .section-title { background: #004898; color: #FFF; font-weight: 800; font-size: 12px; padding: 7px 10px; border-radius: 6px 6px 0 0; display: flex; align-items: center; gap: 8px; }
    .section-title .num { background: rgba(255,255,255,.2); border-radius: 4px; padding: 1px 7px; font-size: 11px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 6px 7px; border: 1px solid #E2E8F0; vertical-align: top; }
    th { background: #F1F5F9; color: #475569; font-size: 9px; text-transform: uppercase; letter-spacing: .04em; text-align: left; }
    tr { page-break-inside: avoid; }
    .total td { background: #F8FAFC; font-weight: 800; }
    .group td { background: #F8FAFC; color: #64748B; font-weight: 800; font-size: 9px; text-transform: uppercase; letter-spacing: .05em; }
    .r { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .c { text-align: center; }
    .mono { font-family: ui-monospace, Menlo, monospace; font-size: 10px; color: #475569; }
    .strong { font-weight: 700; }
    .sub { font-size: 9.5px; color: #64748B; margin-top: 1px; white-space: normal; }
    .muted { color: #94A3B8; }
    .osp { background: #F7FEE7; }
    th.osp { background: #ECFCCB; color: #3F6212; }
    .neg { color: #B42318; }
    .h2 { font-size: 12px; font-weight: 800; color: #004898; text-transform: uppercase; letter-spacing: .05em; margin: 22px 0 8px; page-break-after: avoid; }
    .grand td { background: #004898 !important; color: #FFF; font-size: 13px; }
    .sm td { background: #F7FEE7 !important; color: #3F6212; }
    .words { margin-top: 8px; font-size: 11px; } .words b { color: #004898; }
    .notes { page-break-inside: avoid; white-space: pre-wrap; line-height: 1.6; font-size: 10.5px; border: 1px solid #E2E8F0; border-radius: 8px; padding: 10px 12px; }
    .delivery { margin-bottom: 6px; font-size: 10.5px; } .delivery b { color: #004898; }
    .foot { margin-top: 24px; text-align: center; font-size: 9.5px; color: #94A3B8; border-top: 1px solid #E2E8F0; padding-top: 10px; }
    @media print { .print-bar { display: none; } body { padding: 0; } }
  </style></head><body>
    <div class="print-bar"><button class="btn" onclick="window.print()">Print / Save as PDF</button></div>
    <div class="head">
      <div><img class="logo-img" src="${TASKTEL_LOGO_DATA_URI}" alt="TaskTel" /><div class="company">${COMPANY}</div></div>
      <div class="doc-title">${internal ? '<div class="badge">INTERNAL · CONFIDENTIAL</div>' : ''}</div>
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
      <thead><tr>
        <th class="c" style="width:26px">Sl</th><th>Description</th>
        ${internal ? '<th class="r osp">OSP Supply</th>' : ''}<th class="r">Supply Price</th>
        ${internal ? '<th class="r osp">OSP Services</th>' : ''}<th class="r">Services Price</th>
        <th class="r">GST</th><th class="r">Total</th>
      </tr></thead>
      <tbody>${summaryRows}
        <tr class="total"><td colspan="2">Grand Total (Supply + Installation + PPM)</td>
          ${internal ? `<td class="r">${money(totals.supply_osp)}</td>` : ''}<td class="r">${money(totals.supply_price)}</td>
          ${internal ? `<td class="r">${money(totals.services_osp)}</td>` : ''}<td class="r">${money(totals.services_price)}</td>
          <td class="r">${money(totals.gst_total)}</td><td class="r">${money(totals.grand_total)}</td></tr>
        <tr class="grand"><td colspan="${summaryCols - 1}">Grand Total (All Inclusive)</td><td class="r">₹ ${money(totals.grand_total)}</td></tr>
        ${internal ? `<tr class="sm"><td colspan="${summaryCols - 1}">SM — margin over OSP (${totals.margin_pct}%)</td><td class="r">₹ ${money(totals.margin)}</td></tr>` : ''}
      </tbody>
    </table>
    <div class="words">Amount in words: <b>${esc(amountInWords(totals.grand_total))}</b></div>

    <div class="h2">Bill of Materials</div>
    ${sectionTables}

    ${version.notes ? `<div class="h2">Notes</div><div class="notes">${esc(version.notes)}</div>` : ''}
    ${version.terms || version.delivery_timeline ? `<div class="h2">Terms &amp; Conditions</div><div class="notes">${
      version.delivery_timeline ? `<div class="delivery"><b>Delivery:</b> ${esc(version.delivery_timeline)}</div>` : ''}${esc(version.terms || '')}</div>` : ''}
    <div class="foot">${COMPANY} · Quotation ${esc(version.project_ref || '')} · V${esc(ver)} · Generated ${esc(new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }))}</div>
    <script>window.onload = function () { setTimeout(function () { window.print(); }, 500); };</script>
  </body></html>`;

  win.document.write(html);
  win.document.close();
}

// ============================================
// EXCEL
// ============================================

const BLUE = 'FF004898';
const TINT = 'FFEFF5FC';
const OSP_FILL = 'FFF7FEE7';
const OSP_HEAD = 'FFECFCCB';
const BORDER = { style: 'thin', color: { argb: 'FFCBD5E1' } };
const BOX = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };
// Indian digit grouping (14,50,000), same format string as the funnel export.
const INR_FMT = '[>=10000000]##\\,##\\,##\\,##0;[>=100000]##\\,##\\,##0;##,##0';

const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

function styleRange(sheet, row, from, to, style) {
  for (let c = from; c <= to; c += 1) Object.assign(sheet.getRow(row).getCell(c), style);
}

// Logo top-left, quote details to the right (same block on both sheets).
function writeHeader(workbook, sheet, { quote, version }, lastCol, title) {
  const logo = workbook.addImage({ base64: TASKTEL_LOGO_DATA_URI, extension: 'png' });
  sheet.addImage(logo, { tl: { col: 0.2, row: 0.3 }, ext: { width: 190, height: 41 } });
  const labelCol = Math.max(3, lastCol - 3);
  const meta = [
    ['Project:', quote.project || title],
    ['Customer:', quote.customer],
    ['Date:', fmtDate(version.quote_date)],
    ['Ver:', `${version.version_no}.0`],
    ['Project Ref:', version.project_ref || ''],
    ...(quote.contact_person ? [['Contact:', quote.contact_person]] : []),
    ...(managerLine(quote) ? [['Account Manager:', managerLine(quote)]] : [])
  ];
  meta.forEach(([label, value], i) => {
    const row = sheet.getRow(i + 1);
    row.getCell(labelCol).value = label;
    row.getCell(labelCol).font = { bold: true, color: { argb: 'FF475569' } };
    row.getCell(labelCol).alignment = { horizontal: 'right' };
    row.getCell(labelCol + 1).value = value;
    row.getCell(labelCol + 1).font = { bold: i < 2 };
    sheet.mergeCells(i + 1, labelCol + 1, i + 1, lastCol);
  });
  return meta.length + 2;
}

function headerCells(sheet, rowNo, headers, ospCols = []) {
  const row = sheet.getRow(rowNo);
  headers.forEach((h, i) => {
    const cell = row.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: ospCols.includes(i + 1) ? 'FF3F6212' : 'FFFFFFFF' } };
    cell.fill = fill(ospCols.includes(i + 1) ? OSP_HEAD : BLUE);
    cell.alignment = { vertical: 'middle', horizontal: i < 2 ? 'left' : 'center', wrapText: true };
    cell.border = BOX;
  });
  row.height = 30;
}

function writeSummarySheet(workbook, data, internal) {
  const { computed, version } = data;
  const totals = computed.totals;
  const sheet = workbook.addWorksheet('Investment Summary', { views: [{ showGridLines: false }] });
  const headers = internal
    ? ['SL No', 'Rooms Description for AV Application', 'OSP Supply', 'Supply Price', 'Total GST', 'OSP Services', 'Services Price', 'Total (incl. GST)']
    : ['SL No', 'Description', 'Supply Price', 'Services Price', 'Total GST', 'Total (incl. GST)'];
  const ospCols = internal ? [3, 6] : [];
  sheet.columns = headers.map((_, i) => ({ width: i === 0 ? 8 : i === 1 ? 46 : 18 }));
  const last = headers.length;
  let r = writeHeader(workbook, sheet, data, last, 'Audio - Visual Solutions - Investment Summary Sheet');
  headerCells(sheet, r, headers, ospCols);

  computed.sections.forEach((s, i) => {
    r += 1;
    const t = s.totals;
    const values = internal
      ? [i + 1, sectionLabel(s), t.supply_osp, t.supply_price, t.gst_total, t.services_osp, t.services_price, t.grand_total]
      : [i + 1, sectionLabel(s), t.supply_price, t.services_price, t.gst_total, t.grand_total];
    const row = sheet.getRow(r);
    values.forEach((v, c) => {
      const cell = row.getCell(c + 1);
      cell.value = v;
      cell.border = BOX;
      if (c >= 2) cell.numFmt = INR_FMT;
      if (ospCols.includes(c + 1)) cell.fill = fill(OSP_FILL);
      cell.alignment = { vertical: 'middle', horizontal: c === 0 ? 'center' : undefined, wrapText: c === 1 };
    });
  });

  r += 1;
  const sumValues = internal
    ? ['', 'GRAND TOTAL (Supply + Installation + PPM)', totals.supply_osp, totals.supply_price, totals.gst_total, totals.services_osp, totals.services_price, totals.grand_total]
    : ['', 'GRAND TOTAL (Supply + Installation + PPM)', totals.supply_price, totals.services_price, totals.gst_total, totals.grand_total];
  sumValues.forEach((v, c) => {
    const cell = sheet.getRow(r).getCell(c + 1);
    cell.value = v;
    cell.font = { bold: true };
    cell.fill = fill(TINT);
    cell.border = BOX;
    if (c >= 2) cell.numFmt = INR_FMT;
  });

  r += 2;
  sheet.mergeCells(r, 1, r, last - 1);
  sheet.getRow(r).getCell(1).value = 'GRAND TOTAL (All Inclusive)';
  sheet.getRow(r).getCell(last).value = totals.grand_total;
  sheet.getRow(r).getCell(last).numFmt = INR_FMT;
  styleRange(sheet, r, 1, last, { font: { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }, fill: fill(BLUE), border: BOX });
  sheet.getRow(r).height = 24;

  r += 1;
  sheet.mergeCells(r, 1, r, last);
  sheet.getRow(r).getCell(1).value = `Amount in words: ${amountInWords(totals.grand_total)}`;
  sheet.getRow(r).getCell(1).font = { italic: true, color: { argb: 'FF475569' } };

  if (internal) {
    r += 2;
    sheet.getRow(r).getCell(2).value = `SM (margin over OSP) · universal SM ${version.sm}`;
    sheet.getRow(r).getCell(3).value = totals.margin;
    sheet.getRow(r).getCell(4).value = totals.margin_pct / 100;
    sheet.getRow(r).getCell(3).numFmt = INR_FMT;
    sheet.getRow(r).getCell(4).numFmt = '0.00%';
    styleRange(sheet, r, 2, 4, { font: { bold: true, color: { argb: 'FF3F6212' } }, fill: fill(OSP_FILL), border: BOX });
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
  if (version.terms || version.delivery_timeline) {
    r += 2;
    sheet.getRow(r).getCell(1).value = 'TERMS & CONDITIONS :';
    sheet.getRow(r).getCell(1).font = { bold: true };
    const lines = [version.delivery_timeline && `Delivery: ${version.delivery_timeline}`, ...String(version.terms || '').split('\n')];
    for (const line of lines.filter((l) => l != null && l !== false)) {
      r += 1;
      sheet.mergeCells(r, 1, r, last);
      sheet.getRow(r).getCell(1).value = line;
      sheet.getRow(r).getCell(1).alignment = { wrapText: true };
    }
  }
  sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
}

function writeBomSheet(workbook, data, internal) {
  const { computed } = data;
  const sheet = workbook.addWorksheet('Bill of Materials', { views: [{ showGridLines: false }] });
  const headers = internal
    ? ['Sl', 'Description', 'HSN/SAC', 'UOM', 'Qty', 'OSP Unit', 'OSP Total', 'SM', 'Unit Price', 'Amount', 'GST %', 'GST', 'Total']
    : ['Sl', 'Description', 'HSN/SAC', 'UOM', 'Qty', 'Unit Price', 'Amount', 'GST %', 'GST', 'Total'];
  const widths = internal ? [6, 46, 12, 7, 8, 14, 15, 8, 14, 15, 8, 13, 15] : [6, 52, 12, 7, 8, 15, 16, 8, 14, 17];
  sheet.columns = widths.map((width) => ({ width }));
  const ospCols = internal ? [6, 7, 8] : [];
  const moneyCols = internal ? [6, 7, 9, 10, 12, 13] : [6, 7, 9, 10];
  const last = headers.length;
  let r = writeHeader(workbook, sheet, data, last, 'Bill of Materials');
  headerCells(sheet, r, headers, ospCols);
  sheet.views = [{ showGridLines: false, state: 'frozen', ySplit: r }];

  computed.sections.forEach((section, si) => {
    r += 1;
    sheet.mergeCells(r, 1, r, last);
    sheet.getRow(r).getCell(1).value = `${si + 1}.  ${sectionLabel(section)}`;
    styleRange(sheet, r, 1, last, { font: { bold: true, color: { argb: 'FF004898' } }, fill: fill(TINT), border: BOX });

    orderedLines(section).forEach((line, li) => {
      r += 1;
      const c = line.calc;
      const desc = line.line_type === 'service'
        ? line.description
        : [lineLabel(line), line.description].filter(Boolean).join('\n');
      const values = internal
        ? [li + 1, desc, line.hsn_code || '', line.uom || 'Nos', line.qty, line.osp_unit, c.osp_total, line.price_override != null ? '—' : c.sm, c.unit_price, c.amount, line.gst_rate / 100, c.gst, c.total]
        : [li + 1, desc, line.hsn_code || '', line.uom || 'Nos', line.qty, c.unit_price, c.amount, line.gst_rate / 100, c.gst, c.total];
      const row = sheet.getRow(r);
      values.forEach((v, ci) => {
        const cell = row.getCell(ci + 1);
        cell.value = v;
        cell.border = BOX;
        cell.alignment = { vertical: 'top', wrapText: ci === 1, horizontal: ci === 0 || ci === 3 ? 'center' : undefined };
        if (moneyCols.includes(ci + 1)) cell.numFmt = INR_FMT;
        if (headers[ci] === 'GST %') cell.numFmt = '0.##%';
        if (ospCols.includes(ci + 1)) cell.fill = fill(OSP_FILL);
      });
    });

    r += 1;
    const t = section.totals;
    const amountCol = internal ? 10 : 7;
    const totalCol = internal ? 13 : 10;
    sheet.getRow(r).getCell(2).value = 'Sub-total';
    sheet.getRow(r).getCell(amountCol).value = t.subtotal;
    sheet.getRow(r).getCell(totalCol - 1).value = t.gst_total;
    sheet.getRow(r).getCell(totalCol).value = t.grand_total;
    if (internal) sheet.getRow(r).getCell(7).value = t.supply_osp + t.services_osp;
    styleRange(sheet, r, 1, last, { font: { bold: true }, fill: fill('FFF8FAFC'), border: BOX });
    for (const col of moneyCols) sheet.getRow(r).getCell(col).numFmt = INR_FMT;

    if (internal) {
      r += 1;
      sheet.getRow(r).getCell(2).value = 'Room margin (Amount − OSP Total)';
      sheet.getRow(r).getCell(amountCol).value = t.margin;
      sheet.getRow(r).getCell(amountCol).numFmt = INR_FMT;
      styleRange(sheet, r, 1, last, { font: { bold: true, color: { argb: 'FF3F6212' } }, fill: fill(OSP_FILL), border: BOX });
    }
  });

  r += 1;
  sheet.mergeCells(r, 1, r, last - 1);
  sheet.getRow(r).getCell(1).value = 'GRAND TOTAL (All Inclusive)';
  sheet.getRow(r).getCell(last).value = computed.totals.grand_total;
  styleRange(sheet, r, 1, last, { font: { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }, fill: fill(BLUE), border: BOX });
  sheet.getRow(r).getCell(last).numFmt = INR_FMT;
  sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
}

export async function exportQuoteXlsx(data, { internal = false } = {}) {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = COMPANY;
  writeSummarySheet(workbook, data, internal);
  writeBomSheet(workbook, data, internal);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileBase(data.quote, data.version)}${internal ? '_INTERNAL' : ''}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
