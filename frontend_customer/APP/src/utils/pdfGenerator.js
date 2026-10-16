import { TASKTEL_LOGO_DATA_URI } from './reportLogo';
import { signatureSvg } from './signaturePath';
import unifiedClient from '../api/unifiedClient';

export function generatePDF(ticket) {
  return generateServiceReportPDF({ ticket });
}

// Renders the signed field service report as a printable page. Everything comes
// from the real ticket + service_reports data — no fabricated content. Drawn
// signatures (vector paths) are fetched separately and drawn inline.
export function generateServiceReportPDF({ ticket, customerName } = {}) {
  // Open the window synchronously, inside the click, so popup blockers allow
  // it; the report is written once the signatures have loaded.
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups to view & download the PDF report.');
    return;
  }
  printWindow.document.write('<p style="font-family: system-ui, sans-serif; padding: 40px; color: #64748B;">Loading report…</p>');

  const r = ticket?.serviceReport || {};
  const needsSignatures = ticket?.dbId && (r.techSigned || r.customerSigned);
  (needsSignatures ? unifiedClient.getReportSignatures(ticket.dbId).then((res) => res?.data || []) : Promise.resolve([]))
    .catch((err) => {
      console.warn('Could not load report signatures:', err.message);
      return null; // null = unknown, render the plain "Signed" labels
    })
    .then((signatures) => writeServiceReport(printWindow, { ticket, customerName }, signatures));
}

function writeServiceReport(printWindow, { ticket, customerName }, signatures) {
  const r = ticket?.serviceReport || {};
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const ticketId = esc(ticket?.id || ticket?.ticketNumber || '—');
  const company = esc(customerName || ticket?.company || ticket?.companyName || '—');
  const location = esc(ticket?.locationName || ticket?.location || '—');
  const room = ticket?.roomName || ticket?.room;
  const supportLine = (ticket?.supportCategory === 'epabx') ? 'EPABX Support' : 'AV Support';
  const serviceMode = (ticket?.serviceMode === 'Remote' || ticket?.serviceType === 'Remote Support') ? 'Remote' : 'On-site';
  const issue = esc(ticket?.issue || ticket?.title || '—');
  // Never stamp the report with "now" — the job's actual completion time
  // (same rule as the admin PDF), falling back to the technician's sign-off
  // time; '—' for a job that isn't completed.
  const completionSource = ticket?.completedAt || r.techSignedAt;
  const dateStr = ticket?.isCompleted && completionSource
    ? new Date(completionSource).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

  const row = (k, v) => `<tr><th>${k}</th><td>${esc(v || '—')}</td></tr>`;

  // Per party: drawing on file -> inline SVG; signed but no drawing (a report
  // from before drawings were stored) -> "signature not on file"; customer
  // never signed on a filed report -> "Not present".
  const signStatus = (party, signed) => {
    if (!signed) {
      const notPresent = party === 'customer' && r.techSigned;
      return `<div style="margin-top:8px;" class="no">${notPresent ? 'Not present' : 'Not signed'}</div>`;
    }
    if (!signatures) return '<div style="margin-top:8px;" class="ok">Signed</div>';
    const svg = signatureSvg(signatures.find((s) => s.party === party));
    return svg
      ? `<div class="sign-drawing">${svg}</div><div style="margin-top:6px;" class="ok">Signed</div>`
      : '<div style="margin-top:8px;" class="ok">Signed (signature not on file)</div>';
  };

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Field Service Report - ${ticketId}</title>
      <style>
        body { font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; color: #0F172A; margin: 0; padding: 40px; background: #FFF; }
        .report-header { border-bottom: 3px solid #004898; padding-bottom: 16px; margin-bottom: 24px; }
        .logo-img { height: 34px; width: auto; display: block; margin-bottom: 6px; }
        .logo-sub { font-size: 12px; color: #64748B; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px; }
        th, td { text-align: left; padding: 8px 10px; border: 1px solid #E2E8F0; vertical-align: top; }
        th { background: #F8FAFC; color: #475569; width: 190px; }
        .section-title { font-size: 13px; font-weight: 800; color: #004898; text-transform: uppercase; letter-spacing: .04em; margin: 22px 0 8px; }
        .box { font-size: 13px; line-height: 1.6; background: #F8FAFC; border: 1px solid #E2E8F0; padding: 12px; border-radius: 8px; white-space: pre-wrap; }
        .sign-grid { display: flex; gap: 16px; margin-top: 10px; }
        .sign-card { flex: 1; border: 1px solid #E2E8F0; border-radius: 8px; padding: 14px; }
        .sign-label { font-size: 11px; color: #64748B; font-weight: 700; text-transform: uppercase; }
        .sign-name { font-size: 14px; font-weight: 800; margin-top: 4px; }
        .sign-drawing { margin-top: 10px; border-bottom: 1px solid #CBD5E1; padding-bottom: 4px; }
        .ok { color: #047857; font-weight: 700; }
        .no { color: #B42318; font-weight: 700; }
        .print-bar { display: flex; justify-content: flex-end; margin-bottom: 16px; }
        .btn { background: #004898; color: #FFF; border: none; padding: 10px 18px; border-radius: 8px; font-weight: 700; cursor: pointer; }
        @media print { .print-bar { display: none; } body { padding: 0; } }
      </style>
    </head>
    <body>
      <div class="print-bar"><button class="btn" onclick="window.print()">Print / Save as PDF</button></div>

      <div class="report-header">
        <img class="logo-img" src="${TASKTEL_LOGO_DATA_URI}" alt="TaskTel" />
        <div class="logo-sub">Field Service Report</div>
      </div>

      <table>
        ${row('Service Ticket', ticketId)}
        ${row('Report Date', dateStr)}
        ${row('Company Account', company)}
        ${row('Support Line', supportLine)}
        ${row('Service Mode', serviceMode)}
        ${row('Location', location)}
        ${room ? row('Room', room) : ''}
        ${row('Reported Issue', issue)}
      </table>

      <div class="section-title">Service Report</div>
      <table>
        ${row('System', r.system)}
        ${row('Nature of Complaint', r.natureOfComplaint)}
      </table>
      <div class="section-title">Work Done</div>
      <div class="box">${esc(r.workDone || '—')}</div>
      <div class="section-title">Part / Material</div>
      <div class="box">${esc(r.partsMaterial || '—')}</div>

      <div class="section-title">Sign-off</div>
      <div class="sign-grid">
        <div class="sign-card">
          <div class="sign-label">Technician</div>
          <div class="sign-name">${esc(r.techSignerName || '—')}</div>
          ${signStatus('technician', r.techSigned)}
        </div>
        <div class="sign-card">
          <div class="sign-label">Customer</div>
          <div class="sign-name">${esc(r.customerSignerName || '—')}</div>
          ${signStatus('customer', r.customerSigned)}
        </div>
      </div>

      <div style="margin-top: 36px; text-align: center; font-size: 11px; color: #94A3B8; border-top: 1px solid #E2E8F0; padding-top: 14px;">
        TaskTel Support · Ticket ${ticketId}
      </div>

      <script>
        window.onload = function () { setTimeout(function () { window.print(); }, 500); };
      </script>
    </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(htmlContent);
  printWindow.document.close();
}
