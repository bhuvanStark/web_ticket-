import { TASKTEL_LOGO_DATA_URI } from './reportLogo';

// Exports a Project's Activity History exactly as currently filtered on
// screen (date range already applied by the caller) — mirrors
// serviceHistoryExport.js's structure but with activity-specific columns.
// No separate export dataset: same rows, same filters.

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

const ROWS = (activities) => activities.map((a) => ({
  technician: a.technician?.full_name || '—',
  date: fmtDate(a.scheduled_date),
  scheduledTime: a.scheduled_time || '—',
  completedAt: fmtDateTime(a.completed_at),
  status: a.status,
  notes: a.completion_notes || '—'
}));

const HEADERS = ['Technician', 'Date', 'Scheduled Time', 'Actual Completion', 'Status', 'Notes'];

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

function rowValues(r) {
  return [r.technician, r.date, r.scheduledTime, r.completedAt, r.status, r.notes];
}

function exportCsv(activities, filename) {
  const rows = ROWS(activities);
  const csvEscape = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [HEADERS.map(csvEscape).join(','), ...rows.map((r) => rowValues(r).map(csvEscape).join(','))];
  downloadBlob(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' }), `${filename}.csv`);
}

function exportExcel(activities, filename) {
  const rows = ROWS(activities);
  const body = rows.map((r) => `<tr>${rowValues(r).map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('');
  const html = `
    <html xmlns:x="urn:schemas-microsoft-com:office:excel">
    <head><meta charset="UTF-8"></head>
    <body><table border="1"><thead><tr>${HEADERS.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></body>
    </html>`;
  downloadBlob(new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' }), `${filename}.xls`);
}

function exportDoc(activities, filename) {
  const rows = ROWS(activities);
  const body = rows.map((r) => `<tr>${rowValues(r).map((v) => `<td style="border:1px solid #ccc;padding:4px;">${esc(v)}</td>`).join('')}</tr>`).join('');
  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
    <head><meta charset="UTF-8"><title>Project Activity History</title></head>
    <body>
      <h2>Project Activity History</h2>
      <p>Exported ${esc(new Date().toLocaleString('en-GB'))} &middot; ${rows.length} record${rows.length === 1 ? '' : 's'}</p>
      <table style="border-collapse:collapse;width:100%;font-size:12px;">
        <thead><tr>${HEADERS.map((h) => `<th style="border:1px solid #ccc;padding:4px;text-align:left;">${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </body>
    </html>`;
  downloadBlob(new Blob([html], { type: 'application/msword;charset=utf-8;' }), `${filename}.doc`);
}

function exportPdf(activities) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups to export the PDF.');
    return;
  }
  const rows = ROWS(activities);
  const body = rows.map((r) => `<tr><td>${esc(r.technician)}</td><td>${esc(r.date)}</td><td>${esc(r.scheduledTime)}</td><td>${esc(r.completedAt)}</td><td>${esc(r.status)}</td><td>${esc(r.notes)}</td></tr>`).join('');
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Project Activity History</title>
      <style>
        body { font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; color: #0F172A; margin: 0; padding: 32px; background: #FFF; }
        .report-header { border-bottom: 3px solid #004898; padding-bottom: 16px; margin-bottom: 20px; }
        .logo-img { height: 30px; width: auto; display: block; margin-bottom: 6px; }
        .logo-sub { font-size: 12px; color: #64748B; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th, td { text-align: left; padding: 6px 8px; border: 1px solid #E2E8F0; vertical-align: top; word-break: break-word; }
        th { background: #F8FAFC; color: #475569; }
        .print-bar { display: flex; justify-content: flex-end; margin-bottom: 16px; }
        .btn { background: #004898; color: #FFF; border: none; padding: 10px 18px; border-radius: 8px; font-weight: 700; cursor: pointer; }
        @media print { .print-bar { display: none; } body { padding: 0; } }
      </style>
    </head>
    <body>
      <div class="print-bar"><button class="btn" onclick="window.print()">Print / Save as PDF</button></div>
      <div class="report-header">
        <img class="logo-img" src="${TASKTEL_LOGO_DATA_URI}" alt="TaskTel" />
        <div class="logo-sub">Project Activity History &middot; ${esc(new Date().toLocaleString('en-GB'))} &middot; ${rows.length} record${rows.length === 1 ? '' : 's'}</div>
      </div>
      <table>
        <thead><tr>${HEADERS.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>${body}</tbody>
      </table>
      <script>window.onload = function () { setTimeout(function () { window.print(); }, 400); };</script>
    </body>
    </html>`;
  printWindow.document.write(html);
  printWindow.document.close();
}

export function exportProjectActivityHistory(activities, format) {
  const filename = `project_activity_history_${new Date().toISOString().slice(0, 10)}`;
  switch (format) {
    case 'pdf': return exportPdf(activities);
    case 'excel': return exportExcel(activities, filename);
    case 'csv': return exportCsv(activities, filename);
    case 'doc': return exportDoc(activities, filename);
    default: return exportCsv(activities, filename);
  }
}
