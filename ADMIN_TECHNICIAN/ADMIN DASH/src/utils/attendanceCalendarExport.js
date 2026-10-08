import { TASKTEL_LOGO_DATA_URI } from './reportLogo';

// Calendar-style attendance export for multi-day ranges (Week / Month /
// Custom): one row per employee, one column per day, each cell just the
// day's status as a colored code, plus Present / Absent / Other totals.
// Takes the same rows the detailed export uses (the range export endpoint's
// one-row-per-employee-per-day shape, see attendanceService.listForAdminRange)
// and only reshapes them — no attendance logic lives here. The detailed
// per-day log stays in attendanceExport.js, unchanged.

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// bucket -> cell. Came in (even if not checked out yet) counts as Present;
// no record that day counts as Absent, same as the page's Absent card.
const CELL = {
  checked_out: 'P',
  admin_present: 'P',
  checked_in: 'P',
  absent: 'A',
  unmarked: 'A',
  emergency_holiday: 'EH'
};
const TONE = {
  P: { bg: '#DCFCE7', fg: '#166534' },
  A: { bg: '#FEE2E2', fg: '#B91C1C' },
  other: { bg: '#DBEAFE', fg: '#1D4ED8' },
  none: { bg: '#F8FAFC', fg: '#98A2B3' }
};
const toneFor = (code) => (code === 'P' || code === 'A' ? TONE[code] : code ? TONE.other : TONE.none);
const NO_DATA = '–';

const LEGEND = [
  { code: 'P', label: 'Present' },
  { code: 'A', label: 'Absent' },
  { code: 'EH', label: 'Emergency Holiday' },
  { code: NO_DATA, label: 'No data for that day', none: true }
];

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Calendar-date-key arithmetic in UTC, like AttendancePage's range helpers,
// so a column never shifts a day with the browser's timezone.
const parseKey = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const toKey = (dt) => `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
const fmtKey = (key) => { const dt = parseKey(key); return `${String(dt.getUTCDate()).padStart(2, '0')} ${MONTHS[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`; };

const daysBetween = (start, end) => {
  const days = [];
  for (let dt = parseKey(start); toKey(dt) <= end; dt = new Date(dt.getTime() + 86400000)) {
    days.push({ key: toKey(dt), day: dt.getUTCDate(), weekday: WEEKDAYS[dt.getUTCDay()], isSunday: dt.getUTCDay() === 0, month: `${MONTHS[dt.getUTCMonth()]} ${dt.getUTCFullYear()}` });
  }
  return days;
};

// rows -> [{ name, cells: { dateKey: code }, present, absent, other }], by name.
const buildMatrix = (rows, days) => {
  const inRange = new Set(days.map((d) => d.key));
  const people = new Map();
  for (const r of rows) {
    if (!r.employee || !inRange.has(r.date)) continue;
    const id = `${r.employee.employee_type}:${r.employee.id}`;
    if (!people.has(id)) people.set(id, { name: r.employee.full_name || '—', cells: {} });
    people.get(id).cells[r.date] = CELL[r.bucket] || 'EH';
  }
  return [...people.values()]
    .map((p) => {
      const codes = Object.values(p.cells);
      const present = codes.filter((c) => c === 'P').length;
      const absent = codes.filter((c) => c === 'A').length;
      return { ...p, present, absent, other: codes.length - present - absent };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
};

// PDF/DOC: one table per calendar month, so a long custom range stays
// readable on a landscape page instead of squeezing 60+ columns together.
const chunkByMonth = (days) => {
  const chunks = [];
  for (const d of days) {
    if (!chunks.length || chunks[chunks.length - 1].month !== d.month) chunks.push({ month: d.month, days: [] });
    chunks[chunks.length - 1].days.push(d);
  }
  return chunks;
};

const rangeLabel = (start, end) => (start === end ? fmtKey(start) : `${fmtKey(start)} – ${fmtKey(end)}`);

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ---- shared HTML table (PDF, DOC, Excel) ---------------------------------

const cellStyle = (code) => { const t = toneFor(code); return `background:${t.bg};color:${t.fg};`; };

const tableHtml = (people, days, { showTotals = true } = {}) => {
  const head = `<tr>
      <th class="name">Employee</th>
      ${days.map((d) => `<th class="day${d.isSunday ? ' sun' : ''}">${String(d.day).padStart(2, '0')}<br><span>${d.weekday.slice(0, 2)}</span></th>`).join('')}
      ${showTotals ? '<th class="tot">P</th><th class="tot">A</th><th class="tot">Oth</th>' : ''}
    </tr>`;
  const body = people.map((p) => {
    const present = days.filter((d) => p.cells[d.key] === 'P').length;
    const absent = days.filter((d) => p.cells[d.key] === 'A').length;
    const other = days.filter((d) => p.cells[d.key] && p.cells[d.key] !== 'P' && p.cells[d.key] !== 'A').length;
    return `<tr>
      <td class="name">${esc(p.name)}</td>
      ${days.map((d) => { const code = p.cells[d.key]; return `<td class="c" style="${cellStyle(code)}">${code || NO_DATA}</td>`; }).join('')}
      ${showTotals ? `<td class="tot p">${present}</td><td class="tot a">${absent}</td><td class="tot o">${other}</td>` : ''}
    </tr>`;
  }).join('');
  return `<table class="grid"><thead>${head}</thead><tbody>${body}</tbody></table>`;
};

const legendHtml = () => `<div class="legend">${LEGEND.map((l) => {
  const t = l.none ? TONE.none : toneFor(l.code);
  return `<span class="lg"><span class="chip" style="background:${t.bg};color:${t.fg};">${esc(l.code)}</span>${esc(l.label)}</span>`;
}).join('')}</div>`;

const GRID_CSS = `
  .grid { border-collapse: collapse; width: 100%; table-layout: fixed; font-size: 9px; }
  .grid th, .grid td { border: 1px solid #E2E8F0; text-align: center; padding: 3px 0; }
  .grid th { background: #F8FAFC; color: #475569; font-weight: 700; line-height: 1.15; }
  .grid th span { font-weight: 500; color: #94A3B8; font-size: 8px; }
  .grid th.sun { background: #EEF2F6; }
  .grid .name { text-align: left; padding: 3px 6px; width: 130px; font-weight: 600; color: #0F172A; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .grid th.name { color: #475569; }
  .grid td.c { font-weight: 700; }
  .grid .tot { width: 26px; font-weight: 800; background: #F8FAFC; }
  .grid td.p { color: #166534; } .grid td.a { color: #B91C1C; } .grid td.o { color: #1D4ED8; }
  .grid tr { page-break-inside: avoid; }
  .legend { display: flex; flex-wrap: wrap; gap: 14px; font-size: 10px; color: #475569; margin: 0 0 10px; }
  .lg { display: inline-flex; align-items: center; gap: 5px; }
  .chip { display: inline-block; min-width: 18px; padding: 1px 4px; border-radius: 3px; font-weight: 700; text-align: center; font-size: 9px; }
  .month { font-size: 12px; font-weight: 800; color: #0F172A; margin: 14px 0 6px; }
`;

// ---- formats -------------------------------------------------------------

function exportPdf(people, days, start, end) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups to export the PDF.');
    return;
  }
  const chunks = chunkByMonth(days);
  const sections = chunks.map((c, i) => `
      <section${i > 0 ? ' class="break"' : ''}>
        ${chunks.length > 1 ? `<div class="month">${esc(c.month)}</div>` : ''}
        ${tableHtml(people, c.days)}
      </section>`).join('');
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Attendance ${esc(rangeLabel(start, end))}</title>
      <style>
        @page { size: A4 landscape; margin: 10mm; }
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        body { font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; color: #0F172A; margin: 0; padding: 24px; background: #FFF; }
        .report-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; border-bottom: 3px solid #004898; padding-bottom: 12px; margin-bottom: 12px; }
        .logo-img { height: 28px; width: auto; display: block; margin-bottom: 6px; }
        .title { font-size: 16px; font-weight: 800; }
        .meta { font-size: 11px; color: #64748B; text-align: right; }
        .print-bar { display: flex; justify-content: flex-end; margin-bottom: 16px; }
        .btn { background: #004898; color: #FFF; border: none; padding: 10px 18px; border-radius: 8px; font-weight: 700; cursor: pointer; }
        .break { page-break-before: always; }
        ${GRID_CSS}
        @media print { .print-bar { display: none; } body { padding: 0; } }
      </style>
    </head>
    <body>
      <div class="print-bar"><button class="btn" onclick="window.print()">Print / Save as PDF</button></div>
      <div class="report-header">
        <div>
          <img class="logo-img" src="${TASKTEL_LOGO_DATA_URI}" alt="TaskTel" />
          <div class="title">Attendance · ${esc(rangeLabel(start, end))}</div>
        </div>
        <div class="meta">${people.length} employee${people.length === 1 ? '' : 's'} · ${days.length} day${days.length === 1 ? '' : 's'}<br>Exported ${esc(new Date().toLocaleString('en-GB'))}</div>
      </div>
      ${legendHtml()}
      ${people.length ? sections : '<p style="font-size:12px;color:#64748B;">No attendance for this range and filter.</p>'}
      <script>window.onload = function () { setTimeout(function () { window.print(); }, 400); };</script>
    </body>
    </html>`;
  printWindow.document.write(html);
  printWindow.document.close();
}

function exportDoc(people, days, start, end, filename) {
  const sections = chunkByMonth(days).map((c, i, all) => `
      ${i > 0 ? '<br style="page-break-before:always" clear="all">' : ''}
      ${all.length > 1 ? `<p class="month">${esc(c.month)}</p>` : ''}
      ${tableHtml(people, c.days)}`).join('');
  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
    <head><meta charset="UTF-8"><title>Attendance</title>
      <style>
        @page Section1 { size: 841.9pt 595.3pt; mso-page-orientation: landscape; margin: 28pt; }
        div.Section1 { page: Section1; }
        body { font-family: Calibri, Arial, sans-serif; }
        h2 { margin: 0 0 2px; font-size: 16pt; }
        .sub { color: #64748B; font-size: 9pt; margin: 0 0 8pt; }
        ${GRID_CSS}
      </style>
    </head>
    <body><div class="Section1">
      <h2>Attendance · ${esc(rangeLabel(start, end))}</h2>
      <p class="sub">${people.length} employee${people.length === 1 ? '' : 's'} · Exported ${esc(new Date().toLocaleString('en-GB'))}</p>
      <p class="sub">${LEGEND.map((l) => `${esc(l.code)} = ${esc(l.label)}`).join(' &nbsp;·&nbsp; ')}</p>
      ${sections}
    </div></body>
    </html>`;
  downloadBlob(new Blob([html], { type: 'application/msword;charset=utf-8;' }), `${filename}.doc`);
}

// Same HTML-table .xls the detailed export produces; Excel keeps the inline
// cell colors. One wide sheet for the whole range.
function exportExcel(people, days, start, end, filename) {
  const span = days.length + 4;
  const th = (v, extra = '') => `<th style="background:#F1F5F9;color:#334155;border:1px solid #CBD5E1;font-weight:bold;text-align:center;${extra}">${v}</th>`;
  const head = `<tr>${th('Employee', 'text-align:left;width:180px;')}${days.map((d) => th(`${String(d.day).padStart(2, '0')} ${d.weekday}`, d.isSunday ? 'background:#E2E8F0;' : '')).join('')}${th('Present')}${th('Absent')}${th('Other')}</tr>`;
  const body = people.map((p) => `<tr>
      <td style="border:1px solid #CBD5E1;font-weight:bold;">${esc(p.name)}</td>
      ${days.map((d) => { const code = p.cells[d.key]; return `<td style="border:1px solid #CBD5E1;text-align:center;font-weight:bold;${cellStyle(code)}">${code || NO_DATA}</td>`; }).join('')}
      <td style="border:1px solid #CBD5E1;text-align:center;font-weight:bold;color:#166534;">${p.present}</td>
      <td style="border:1px solid #CBD5E1;text-align:center;font-weight:bold;color:#B91C1C;">${p.absent}</td>
      <td style="border:1px solid #CBD5E1;text-align:center;font-weight:bold;color:#1D4ED8;">${p.other}</td>
    </tr>`).join('');
  const html = `
    <html xmlns:x="urn:schemas-microsoft-com:office:excel">
    <head><meta charset="UTF-8"></head>
    <body><table>
      <tr><td colspan="${span}" style="font-size:14pt;font-weight:bold;">Attendance · ${esc(rangeLabel(start, end))}</td></tr>
      <tr><td colspan="${span}" style="color:#64748B;">${LEGEND.map((l) => `${esc(l.code)} = ${esc(l.label)}`).join('   ·   ')}</td></tr>
      <tr><td colspan="${span}"></td></tr>
      ${head}${body}
    </table></body>
    </html>`;
  downloadBlob(new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' }), `${filename}.xls`);
}

// CSV has no colors — just the codes, same grid, machine-friendly.
function exportCsv(people, days, filename) {
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [
    ['Employee', ...days.map((d) => `${d.key} ${d.weekday}`), 'Present', 'Absent', 'Other'].map(q).join(','),
    ...people.map((p) => [p.name, ...days.map((d) => p.cells[d.key] || ''), p.present, p.absent, p.other].map(q).join(','))
  ];
  downloadBlob(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' }), `${filename}.csv`);
}

// `start`/`end` are the selected range's date keys (inclusive) — every day
// in between gets a column, even one nobody has a row for.
export function exportAttendanceCalendar(rows, { start, end }, format) {
  const days = daysBetween(start, end);
  const people = buildMatrix(rows, days);
  const filename = `attendance_${start}_to_${end}`;
  switch (format) {
    case 'pdf': return exportPdf(people, days, start, end);
    case 'excel': return exportExcel(people, days, start, end, filename);
    case 'doc': return exportDoc(people, days, start, end, filename);
    case 'csv':
    default: return exportCsv(people, days, filename);
  }
}
