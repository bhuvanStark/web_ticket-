import { TASKTEL_LOGO_DATA_URI } from './reportLogo';

// Exports the Service History table exactly as currently filtered on screen —
// same records the admin/tech is looking at (search, date, company,
// technician, status and AV/EPABX all already applied by the caller). No
// separate dataset, no re-querying.

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const ROWS = (records) => records.map(t => ({
  ticket: t.id || t.ticketNumber || '—',
  customer: t.customer || '—',
  location: [t.location, t.room].filter(Boolean).join(' • ') || '—',
  serviceType: t.serviceType || (t.supportCategory === 'epabx' ? 'EPABX' : 'AV'),
  title: t.title || '—',
  workDone: t.serviceReport?.workDone || '—',
  technician: t.assignedTo || '—',
  date: t.completedAt ? new Date(t.completedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ((t.createdDate || '').split(',')[0] || '—'),
  status: t.status || '—'
}));

const HEADERS = ['Ticket', 'Customer', 'Location', 'Service Type', 'Issue', 'Work Done', 'Technician', 'Date', 'Status'];

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

function exportCsv(records, filename) {
  const rows = ROWS(records);
  const csvEscape = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [
    HEADERS.map(csvEscape).join(','),
    ...rows.map(r => [r.ticket, r.customer, r.location, r.serviceType, r.title, r.workDone, r.technician, r.date, r.status].map(csvEscape).join(','))
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `${filename}.csv`);
}

// A .xls file that is really an HTML table — Excel opens this natively, and
// it needs no extra dependency to build.
function exportExcel(records, filename) {
  const rows = ROWS(records);
  const tableRows = rows.map(r => `<tr>${[r.ticket, r.customer, r.location, r.serviceType, r.title, r.workDone, r.technician, r.date, r.status].map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('');
  const html = `
    <html xmlns:x="urn:schemas-microsoft-com:office:excel">
    <head><meta charset="UTF-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Service History</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head>
    <body>
      <table border="1">
        <thead><tr>${HEADERS.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </body>
    </html>`;
  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  downloadBlob(blob, `${filename}.xls`);
}

// A .doc file that is really an HTML document — Word opens this natively.
function exportDoc(records, filename) {
  const rows = ROWS(records);
  const tableRows = rows.map(r => `<tr>${[r.ticket, r.customer, r.location, r.serviceType, r.title, r.workDone, r.technician, r.date, r.status].map(v => `<td style="border:1px solid #ccc;padding:4px;">${esc(v)}</td>`).join('')}</tr>`).join('');
  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
    <head><meta charset="UTF-8"><title>Service History Export</title></head>
    <body>
      <h2>TaskTel Service History</h2>
      <p>Exported ${esc(new Date().toLocaleString('en-GB'))} &middot; ${rows.length} record${rows.length === 1 ? '' : 's'}</p>
      <table style="border-collapse:collapse;width:100%;font-size:12px;">
        <thead><tr>${HEADERS.map(h => `<th style="border:1px solid #ccc;padding:4px;text-align:left;">${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </body>
    </html>`;
  const blob = new Blob([html], { type: 'application/msword;charset=utf-8;' });
  downloadBlob(blob, `${filename}.doc`);
}

// PDF via the browser's own print-to-PDF, same pattern as the field service
// report generator elsewhere in the app.
function exportPdf(records) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups to export the PDF.');
    return;
  }
  const rows = ROWS(records);
  const tableRows = rows.map(r => `<tr><td>${esc(r.ticket)}</td><td>${esc(r.customer)}</td><td>${esc(r.location)}</td><td>${esc(r.serviceType)}</td><td>${esc(r.title)}</td><td>${esc(r.workDone)}</td><td>${esc(r.technician)}</td><td>${esc(r.date)}</td><td>${esc(r.status)}</td></tr>`).join('');
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Service History Export</title>
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
        <div class="logo-sub">Service History Export &middot; ${esc(new Date().toLocaleString('en-GB'))} &middot; ${rows.length} record${rows.length === 1 ? '' : 's'}</div>
      </div>
      <table>
        <thead><tr>${HEADERS.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
      <script>window.onload = function () { setTimeout(function () { window.print(); }, 400); };</script>
    </body>
    </html>`;
  printWindow.document.write(html);
  printWindow.document.close();
}

export function exportServiceHistory(records, format) {
  const filename = `service_history_${new Date().toISOString().slice(0, 10)}`;
  switch (format) {
    case 'pdf': return exportPdf(records);
    case 'excel': return exportExcel(records, filename);
    case 'csv': return exportCsv(records, filename);
    case 'doc': return exportDoc(records, filename);
    default: return exportCsv(records, filename);
  }
}
