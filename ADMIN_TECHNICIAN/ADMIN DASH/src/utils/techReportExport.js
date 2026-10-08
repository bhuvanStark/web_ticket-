import { TASKTEL_LOGO_DATA_URI } from './reportLogo';

// Reports page (technician performance) exports — the leaderboard exactly as
// sorted on screen, plus the period KPIs. Only ReportsPage imports this.

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const dash = (v) => (v == null ? '—' : v);

const HEADERS = [
  'Technician', 'Branch', 'Tickets Owned', 'Tickets Assisted', 'Remote', 'Reassigned', 'Open Now',
  'Avg Resolution (h)', 'Avg Rating', 'Ratings', 'Project Done', 'Project Scheduled', 'On-time %', 'Overdue Now'
];
const values = (r) => [
  r.name, r.location || '—', r.tickets.owned, r.tickets.assisted, r.tickets.remote, r.tickets.reassigned, r.tickets.openNow,
  dash(r.tickets.avgResolutionHours), dash(r.tickets.avgRating), r.tickets.ratingCount,
  r.projects.completed, r.projects.scheduled, r.projects.onTimeRate == null ? '—' : `${r.projects.onTimeRate}%`, r.projects.overdueNow
];

const kpiLines = (k) => [
  ['Tickets completed', k.ticketsCompleted],
  ['Avg resolution (h)', dash(k.avgResolutionHours)],
  ['Avg rating', k.avgRating == null ? '—' : `${k.avgRating} (${k.ratingCount} ratings)`],
  ['Open tickets now', `${k.openNow} (${k.unassignedNow} unassigned)`],
  ['Project activities completed', k.activitiesCompleted],
  ['Project on-time %', k.activitiesOnTimeRate == null ? '—' : `${k.activitiesOnTimeRate}%`],
  ['Project activities overdue now', k.activitiesOverdueNow]
];

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

function exportCsv({ rows, kpis, range, rangeLabel }, filename) {
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [
    [q('Technician Performance'), q(rangeLabel), q(`${range.from} to ${range.to}`)].join(','),
    ...kpiLines(kpis).map(([k, v]) => [q(k), q(v)].join(',')),
    '',
    HEADERS.map(q).join(','),
    ...rows.map((r) => values(r).map(q).join(','))
  ];
  downloadBlob(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' }), `${filename}.csv`);
}

function exportExcel({ rows, kpis, rangeLabel }, filename) {
  const cell = 'border:1px solid #CBD5E1;padding:4px 8px;';
  const html = `
    <html xmlns:x="urn:schemas-microsoft-com:office:excel">
    <head><meta charset="UTF-8"></head>
    <body><table>
      <tr><td colspan="${HEADERS.length}" style="font-size:14pt;font-weight:bold;">Technician Performance · ${esc(rangeLabel)}</td></tr>
      ${kpiLines(kpis).map(([k, v]) => `<tr><td style="color:#475569;">${esc(k)}</td><td style="font-weight:bold;">${esc(v)}</td></tr>`).join('')}
      <tr><td></td></tr>
      <tr>${HEADERS.map((h) => `<th style="${cell}background:#F1F5F9;text-align:left;">${esc(h)}</th>`).join('')}</tr>
      ${rows.map((r) => `<tr>${values(r).map((v, i) => `<td style="${cell}${i === 0 ? 'font-weight:bold;' : ''}">${esc(v)}</td>`).join('')}</tr>`).join('')}
    </table></body>
    </html>`;
  downloadBlob(new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' }), `${filename}.xls`);
}

function exportPdf({ rows, kpis, rangeLabel }) {
  const w = window.open('', '_blank');
  if (!w) {
    alert('Please allow popups to export the PDF.');
    return;
  }
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Technician Performance · ${esc(rangeLabel)}</title>
      <style>
        @page { size: A4 landscape; margin: 12mm; }
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        body { font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; color: #0F172A; margin: 0; padding: 28px; }
        .head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #004898; padding-bottom: 12px; margin-bottom: 16px; }
        .logo { height: 28px; display: block; margin-bottom: 6px; }
        .title { font-size: 17px; font-weight: 800; }
        .meta { font-size: 11px; color: #64748B; text-align: right; }
        .kpis { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; margin-bottom: 16px; }
        .kpi { border: 1px solid #E2E8F0; border-radius: 8px; padding: 8px; }
        .kpi b { display: block; font-size: 15px; }
        .kpi span { font-size: 9px; color: #64748B; text-transform: uppercase; letter-spacing: .04em; }
        table { width: 100%; border-collapse: collapse; font-size: 10px; }
        th, td { border: 1px solid #E2E8F0; padding: 5px 6px; text-align: right; }
        th { background: #F8FAFC; color: #475569; }
        th:nth-child(-n+2), td:nth-child(-n+2) { text-align: left; }
        td:first-child { font-weight: 700; }
        tr { page-break-inside: avoid; }
        .bar { display: flex; justify-content: flex-end; margin-bottom: 14px; }
        .btn { background: #004898; color: #fff; border: 0; padding: 10px 18px; border-radius: 8px; font-weight: 700; cursor: pointer; }
        @media print { .bar { display: none; } body { padding: 0; } }
      </style>
    </head>
    <body>
      <div class="bar"><button class="btn" onclick="window.print()">Print / Save as PDF</button></div>
      <div class="head">
        <div><img class="logo" src="${TASKTEL_LOGO_DATA_URI}" alt="TaskTel" /><div class="title">Technician Performance · ${esc(rangeLabel)}</div></div>
        <div class="meta">${rows.length} technician${rows.length === 1 ? '' : 's'}<br>Exported ${esc(new Date().toLocaleString('en-GB'))}</div>
      </div>
      <div class="kpis">${kpiLines(kpis).map(([k, v]) => `<div class="kpi"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>
      <table>
        <thead><tr>${HEADERS.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>${rows.map((r) => `<tr>${values(r).map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
      <script>window.onload = function () { setTimeout(function () { window.print(); }, 400); };</script>
    </body>
    </html>`;
  w.document.write(html);
  w.document.close();
}

// payload: { rows (sorted as on screen), kpis, range: {from,to}, rangeLabel }
export function exportTechReport(payload, format) {
  const filename = `technician_performance_${payload.range.from}_to_${payload.range.to}`;
  if (format === 'pdf') return exportPdf(payload);
  if (format === 'excel') return exportExcel(payload, filename);
  return exportCsv(payload, filename);
}
