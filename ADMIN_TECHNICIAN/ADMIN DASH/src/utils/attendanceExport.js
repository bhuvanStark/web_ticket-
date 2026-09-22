import { TASKTEL_LOGO_DATA_URI } from './reportLogo';

// Exports the Admin Attendance page's list exactly as currently filtered on
// screen (date + employee-name filter already applied by the caller) —
// mirrors projectActivityExport.js's structure (itself modeled on
// serviceHistoryExport.js), with attendance-specific columns. Attendance
// data only — never tickets or projects. Sales & Back-Office Roles V1
// generalized the underlying rows from technician-only to any of the three
// employee types (row.employee, not row.technician — see
// attendanceService.buildRowsForDate on the backend) and added the
// Employee Type column.

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

const STATUS_LABELS = {
  checked_in: 'Not Yet Checked Out',
  checked_out: 'Present',
  absent: 'Absent',
  unmarked: 'No Check-In'
};

const LOCATION_LABELS = {
  gps_captured: 'Location captured',
  permission_denied: 'Permission Denied',
  device_unsupported: 'Device Unsupported',
  unavailable_error: 'Unavailable/Error',
  no_location: 'No location'
};

const fmtDuration = (minutes) => {
  if (minutes == null) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const EMPLOYEE_TYPE_LABELS = { technician: 'Technician', sales: 'Sales', back_office: 'Back-Office' };

// `pageDate` is the Admin Attendance page's currently-selected single day —
// used as the date fallback only for rows that don't already carry their
// own `date` (the single-day list's shape, pre-dating the Export Range
// selector). A range export's rows each carry their own `date` (one
// employee-day per row across possibly many days), so that always wins
// when present — see attendanceService.buildRowsForDate on the backend.
const ROWS = (rows, pageDate) => rows.map((r) => ({
  employee: r.employee?.full_name || '—',
  employeeType: EMPLOYEE_TYPE_LABELS[r.employee?.employee_type] || '—',
  branch: r.employee?.location || '—',
  date: r.date || r.record?.attendance_date || pageDate || '—',
  checkIn: fmtDateTime(r.record?.check_in_time),
  checkOut: fmtDateTime(r.record?.check_out_time),
  duration: fmtDuration(r.record?.duration_minutes),
  location: LOCATION_LABELS[r.record?.location_status] || 'No location',
  status: STATUS_LABELS[r.bucket] || r.bucket
}));

const HEADERS = ['Employee', 'Employee Type', 'Branch', 'Date', 'Check-In', 'Check-Out', 'Duration', 'Location', 'Attendance Status'];

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
  return [r.employee, r.employeeType, r.branch, r.date, r.checkIn, r.checkOut, r.duration, r.location, r.status];
}

function exportCsv(rows, pageDate, filename) {
  const data = ROWS(rows, pageDate);
  const csvEscape = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [HEADERS.map(csvEscape).join(','), ...data.map((r) => rowValues(r).map(csvEscape).join(','))];
  downloadBlob(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' }), `${filename}.csv`);
}

function exportExcel(rows, pageDate, filename) {
  const data = ROWS(rows, pageDate);
  const body = data.map((r) => `<tr>${rowValues(r).map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('');
  const html = `
    <html xmlns:x="urn:schemas-microsoft-com:office:excel">
    <head><meta charset="UTF-8"></head>
    <body><table border="1"><thead><tr>${HEADERS.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></body>
    </html>`;
  downloadBlob(new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' }), `${filename}.xls`);
}

function exportDoc(rows, pageDate, filename) {
  const data = ROWS(rows, pageDate);
  const body = data.map((r) => `<tr>${rowValues(r).map((v) => `<td style="border:1px solid #ccc;padding:4px;">${esc(v)}</td>`).join('')}</tr>`).join('');
  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
    <head><meta charset="UTF-8"><title>Attendance</title></head>
    <body>
      <h2>Attendance</h2>
      <p>Exported ${esc(new Date().toLocaleString('en-GB'))} &middot; ${data.length} record${data.length === 1 ? '' : 's'}</p>
      <table style="border-collapse:collapse;width:100%;font-size:12px;">
        <thead><tr>${HEADERS.map((h) => `<th style="border:1px solid #ccc;padding:4px;text-align:left;">${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </body>
    </html>`;
  downloadBlob(new Blob([html], { type: 'application/msword;charset=utf-8;' }), `${filename}.doc`);
}

function exportPdf(rows, pageDate) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups to export the PDF.');
    return;
  }
  const data = ROWS(rows, pageDate);
  const body = data.map((r) => `<tr><td>${esc(r.employee)}</td><td>${esc(r.employeeType)}</td><td>${esc(r.branch)}</td><td>${esc(r.date)}</td><td>${esc(r.checkIn)}</td><td>${esc(r.checkOut)}</td><td>${esc(r.duration)}</td><td>${esc(r.location)}</td><td>${esc(r.status)}</td></tr>`).join('');
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Attendance</title>
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
        <div class="logo-sub">Attendance &middot; ${esc(new Date().toLocaleString('en-GB'))} &middot; ${data.length} record${data.length === 1 ? '' : 's'}</div>
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

export function exportAttendance(rows, pageDate, format) {
  const filename = `attendance_${new Date().toISOString().slice(0, 10)}`;
  switch (format) {
    case 'pdf': return exportPdf(rows, pageDate);
    case 'excel': return exportExcel(rows, pageDate, filename);
    case 'csv': return exportCsv(rows, pageDate, filename);
    case 'doc': return exportDoc(rows, pageDate, filename);
    default: return exportCsv(rows, pageDate, filename);
  }
}
