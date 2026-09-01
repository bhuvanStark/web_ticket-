export function generatePDF(ticket) {
  return generateServiceReportPDF({ ticket });
}

// Renders the signed field service report as a printable page. Everything comes
// from the real ticket + service_reports data — no fabricated content, and no
// signature images (only whether each party signed).
export function generateServiceReportPDF({ ticket, customerName } = {}) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups to view & download the PDF report.');
    return;
  }

  const r = ticket?.serviceReport || {};
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const ticketId = esc(ticket?.id || ticket?.ticketNumber || '—');
  const company = esc(customerName || ticket?.company || ticket?.companyName || '—');
  const location = esc(ticket?.locationName || ticket?.location || '—');
  const room = ticket?.roomName || ticket?.room;
  const supportLine = (ticket?.supportCategory === 'epabx') ? 'EPABX Support' : 'AV Support';
  const issue = esc(ticket?.issue || ticket?.title || '—');
  const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const row = (k, v) => `<tr><th>${k}</th><td>${esc(v || '—')}</td></tr>`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Field Service Report - ${ticketId}</title>
      <style>
        body { font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; color: #0F172A; margin: 0; padding: 40px; background: #FFF; }
        .report-header { border-bottom: 3px solid #004898; padding-bottom: 16px; margin-bottom: 24px; }
        .logo-title { font-size: 22px; font-weight: 800; color: #004898; }
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
        <div class="logo-title">TaskTel</div>
        <div class="logo-sub">Field Service Report</div>
      </div>

      <table>
        ${row('Service Ticket', ticketId)}
        ${row('Report Date', dateStr)}
        ${row('Company Account', company)}
        ${row('Support Line', supportLine)}
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
          <div style="margin-top:8px;" class="${r.techSigned ? 'ok' : 'no'}">${r.techSigned ? 'Signed' : 'Not signed'}</div>
        </div>
        <div class="sign-card">
          <div class="sign-label">Customer</div>
          <div class="sign-name">${esc(r.customerSignerName || '—')}</div>
          <div style="margin-top:8px;" class="${r.customerSigned ? 'ok' : 'no'}">${r.customerSigned ? 'Signed' : 'Not signed'}</div>
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

  printWindow.document.write(htmlContent);
  printWindow.document.close();
}
