// Sales Funnel → .xlsx. The first six columns match the pipeline sheet the
// Funnel replaces (Company Name, Product, Value, Backup, Order Closed,
// Remark); every other lead field follows. Rows are exactly what the Funnel
// filters returned (fetched with export=true), plus a totals row. ExcelJS is
// loaded only when someone exports.
import { STATUS_LABEL, lostReasonLabel } from '../components/sales/leadPipeline';

const amount = (v) => (v == null || v === '' ? null : Number(v));
const date = (v) => (v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '');

const COLUMNS = [
  ['Company Name', 'company', 28],
  ['Product', 'product', 12],
  ['Value', 'value', 14],
  ['Backup', 'backup', 14],
  ['Order Closed', 'orderClosed', 14],
  ['Remark', 'remark', 32],
  ['Status', 'status', 12],
  ['Salesperson', 'sales', 20],
  ['Location', 'location', 18],
  ['Person to Contact', 'contact', 20],
  ['Phone', 'phone', 14],
  ['Email', 'email', 26],
  ['Ref ID', 'refId', 30],
  ['Demand', 'demand', 32],
  ['Next Follow-up', 'followUp', 14],
  ['Lost / Dead Reason', 'lostReason', 26],
  ['Lead Remarks', 'remarks', 32],
  ['In Funnel Since', 'starred', 14],
  ['Lead Created', 'created', 14]
];
const MONEY_KEYS = ['value', 'backup', 'orderClosed'];

const toRow = (l) => ({
  company: l.company,
  product: l.product || '',
  value: amount(l.value_estimate),
  backup: amount(l.funnel_backup_value),
  orderClosed: amount(l.funnel_order_closed_value),
  remark: l.funnel_remark || '',
  status: STATUS_LABEL[l.status] || l.status,
  sales: l.sales_name || 'Unassigned',
  location: l.sales_location || '',
  contact: l.person_to_contact || '',
  phone: l.phone || '',
  email: l.email || '',
  refId: l.ref_id || '',
  demand: l.demand || '',
  followUp: l.next_follow_up_date ? date(`${l.next_follow_up_date}T00:00:00`) : '',
  lostReason: lostReasonLabel(l) || '',
  remarks: l.remarks || '',
  starred: date(l.funnel_starred_at),
  created: date(l.created_at)
});

export async function exportFunnelXlsx(leads, totals, filename = 'sales-funnel') {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Funnel', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = COLUMNS.map(([header, key, width]) => ({ header, key, width }));
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF5FC' } };

  for (const lead of leads) sheet.addRow(toRow(lead));
  const total = sheet.addRow({ company: `Total (${leads.length})`, value: totals.value, backup: totals.backup, orderClosed: totals.orderClosed });
  total.font = { bold: true };

  // Indian digit grouping (14,50,000), as in the original sheet.
  for (const key of MONEY_KEYS) sheet.getColumn(key).numFmt = '[>=10000000]##\\,##\\,##\\,##0;[>=100000]##\\,##\\,##0;##,##0';
  for (const key of ['remark', 'demand', 'remarks']) sheet.getColumn(key).alignment = { wrapText: true, vertical: 'top' };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
