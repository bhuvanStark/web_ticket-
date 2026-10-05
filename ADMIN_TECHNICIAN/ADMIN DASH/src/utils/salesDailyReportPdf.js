import { TASKTEL_LOGO_DATA_URI } from './reportLogo';
import { STATUS_LABEL, stageTimer } from '../components/sales/leadPipeline';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// 'YYYY-MM-DD' → '03 Oct 2026' without any timezone shift.
export function formatReportDate(dateKey) {
  const [y, m, d] = String(dateKey || '').split('-').map(Number);
  return y && m && d ? `${String(d).padStart(2, '0')} ${MONTHS[m - 1]} ${y}` : '—';
}

// Sales Daily Report as a printable page (same print-window approach as
// pdfReportGenerator.js). Lead status and stage timer are frozen as of
// the report's last save.
export function generateSalesDailyReportPDF(report, salesName) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups to view & download the PDF report.');
    return;
  }

  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const name = esc(salesName || report.sales_name || '—');
  const date = formatReportDate(report.report_date);
  const generated = new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const rows = (report.items || []).map((item, i) => {
    let status = '—';
    let timer = '';
    if (item.is_potential) {
      status = '<span class="tag potential">Potential lead</span>';
    } else if (item.lead) {
      status = `<span class="tag">${esc(STATUS_LABEL[item.lead.status] || item.lead.status)}</span>`;
      const t = stageTimer(item.lead, Date.parse(item.lead.as_of));
      if (t) {
        const cells = t.overdue ? 0 : Math.max(1, Math.ceil(t.fraction * 4));
        const battery = [0, 1, 2, 3].map((c) => `<i class="${c < cells ? t.level : ''}"></i>`).join('');
        timer = `<span class="battery ${t.level}">${battery}</span> <span class="${t.level}-text">${esc(t.label)}</span>`;
      } else {
        timer = '<span class="muted">Final</span>';
      }
    } else {
      status = '<span class="muted">Lead removed</span>';
    }
    return `<tr>
      <td class="num">${i + 1}</td>
      <td><strong>${esc(item.company)}</strong></td>
      <td>${status}</td>
      <td>${timer}</td>
      <td class="comment">${esc(item.comment)}</td>
    </tr>`;
  }).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Sales Daily Report - ${name} - ${date}</title>
      <style>
        body { font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; color: #0F172A; margin: 0; padding: 40px; background: #FFF; }
        .report-header { border-bottom: 3px solid #004898; padding-bottom: 16px; margin-bottom: 24px; }
        .logo-img { height: 34px; width: auto; display: block; margin-bottom: 6px; }
        .logo-sub { font-size: 12px; color: #64748B; }
        .meta { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px; }
        .meta th, .meta td { text-align: left; padding: 8px 10px; border: 1px solid #E2E8F0; }
        .meta th { background: #F8FAFC; color: #475569; width: 160px; }
        .section-title { font-size: 13px; font-weight: 800; color: #004898; text-transform: uppercase; letter-spacing: .04em; margin: 22px 0 8px; }
        .items { width: 100%; border-collapse: collapse; font-size: 12px; }
        .items th { background: #F8FAFC; color: #475569; text-align: left; padding: 8px; border: 1px solid #E2E8F0; font-size: 11px; text-transform: uppercase; }
        .items td { padding: 8px; border: 1px solid #E2E8F0; vertical-align: top; }
        .num { width: 24px; color: #64748B; }
        .comment { white-space: pre-wrap; line-height: 1.5; }
        .tag { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #EFF5FC; color: #004898; font-weight: 700; font-size: 11px; }
        .tag.potential { background: #F4F3FF; color: #5925DC; }
        .muted { color: #94A3B8; }
        .battery { display: inline-flex; gap: 2px; padding: 2px; border: 2px solid #CBD5E1; border-radius: 4px; vertical-align: middle; }
        .battery i { display: block; width: 5px; height: 9px; border-radius: 1px; background: #F1F5F9; }
        .battery i.ok { background: #12B76A; } .battery.ok { border-color: #6CE9A6; }
        .battery i.soon { background: #F79009; } .battery.soon { border-color: #FEC84B; }
        .battery.overdue { border-color: #F04438; background: #FEF3F2; }
        .ok-text { color: #027A48; font-weight: 700; } .soon-text { color: #B54708; font-weight: 700; }
        .overdue-text { color: #B42318; font-weight: 700; }
        .print-bar { display: flex; justify-content: flex-end; margin-bottom: 16px; }
        .btn { background: #004898; color: #FFF; border: none; padding: 10px 18px; border-radius: 8px; font-weight: 700; cursor: pointer; }
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        @media print { .print-bar { display: none; } body { padding: 0; } }
      </style>
    </head>
    <body>
      <div class="print-bar"><button class="btn" onclick="window.print()">Print / Save as PDF</button></div>
      <div class="report-header">
        <img class="logo-img" src="${TASKTEL_LOGO_DATA_URI}" alt="TaskTel" />
        <div class="logo-sub">Sales Daily Report</div>
      </div>
      <table class="meta">
        <tr><th>Salesperson</th><td>${name}</td></tr>
        <tr><th>Report Date</th><td>${date}</td></tr>
        <tr><th>Entries</th><td>${(report.items || []).length}</td></tr>
      </table>
      <div class="section-title">Today's Work</div>
      <table class="items">
        <thead><tr><th>#</th><th>Company</th><th>Status</th><th>Stage Timer</th><th>Comment</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5" class="muted">No entries</td></tr>'}</tbody>
      </table>
      <div style="margin-top: 36px; text-align: center; font-size: 11px; color: #94A3B8; border-top: 1px solid #E2E8F0; padding-top: 14px;">
        TaskTel Sales · Status and timers as submitted (${esc(new Date(report.updated_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }))}) · Generated ${esc(generated)}
      </div>
      <script>
        window.onload = function () { setTimeout(function () { window.print(); }, 500); };
      </script>
    </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
}
