// Quotation Items catalog ⇄ Excel. Columns: Category, Series, Model Name,
// HSN Code, Price, GST %, Remark. Headers are matched by name (any order,
// case/spacing ignored). ExcelJS is loaded only when used.

export const ITEM_COLUMNS = [
  { key: 'category', header: 'Category', width: 22, aliases: ['category', 'basket', 'categoryname'] },
  { key: 'series', header: 'Series', width: 18, aliases: ['series'] },
  { key: 'model_name', header: 'Model Name', width: 26, aliases: ['modelname', 'model', 'item', 'itemname', 'product'] },
  { key: 'hsn_code', header: 'HSN Code', width: 14, aliases: ['hsncode', 'hsn', 'hsnsac', 'sac'] },
  { key: 'price', header: 'Price', width: 14, aliases: ['price', 'osp', 'cost', 'unitprice', 'ospunit'] },
  { key: 'gst_rate', header: 'GST %', width: 9, aliases: ['gst', 'gstrate', 'gstpercent', 'tax'] },
  { key: 'remark', header: 'Remark', width: 32, aliases: ['remark', 'remarks', 'notes', 'note'] }
];

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

function cellValue(value) {
  if (value == null) return '';
  if (typeof value === 'object') {
    if ('result' in value) return value.result ?? '';
    if (Array.isArray(value.richText)) return value.richText.map((t) => t.text).join('');
    if ('text' in value) return value.text;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
  }
  return value;
}

const download = (buffer, filename) => {
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

function styleHeader(sheet) {
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF004898' } };
  header.alignment = { vertical: 'middle' };
  header.height = 22;
}

// Returns [{ row, category, series, model_name, hsn_code, price, gst_rate, remark }].
export async function parseItemsWorkbook(file) {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('No sheet found in this file');

  // The header is the first row that names a Model column (lets a title row sit above it).
  let headerRowNo = 0;
  const colFor = {};
  for (let r = 1; r <= Math.min(sheet.rowCount, 10) && !headerRowNo; r += 1) {
    const names = {};
    sheet.getRow(r).eachCell((cell, col) => { names[norm(cellValue(cell.value))] = col; });
    if (ITEM_COLUMNS[2].aliases.some((a) => names[a])) {
      headerRowNo = r;
      for (const column of ITEM_COLUMNS) {
        const hit = column.aliases.find((a) => names[a]);
        if (hit) colFor[column.key] = names[hit];
      }
    }
  }
  if (!headerRowNo) throw new Error('Could not find the header row. Use the template: Category, Series, Model Name, HSN Code, Price, GST %, Remark.');
  for (const key of ['category', 'price']) {
    if (!colFor[key]) throw new Error(`The "${ITEM_COLUMNS.find((c) => c.key === key).header}" column is missing.`);
  }

  const rows = [];
  for (let r = headerRowNo + 1; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r);
    const get = (key) => (colFor[key] ? cellValue(row.getCell(colFor[key]).value) : '');
    const record = { row: r };
    for (const column of ITEM_COLUMNS) {
      const v = get(column.key);
      record[column.key] = typeof v === 'string' ? v.trim() : v;
    }
    if (ITEM_COLUMNS.every((c) => record[c.key] === '' || record[c.key] == null)) continue;
    rows.push(record);
  }
  if (!rows.length) throw new Error('No item rows found under the header.');
  return rows;
}

// Same rules the backend applies, so the preview can flag rows up front.
export function validateItemRow(row) {
  const problems = [];
  if (!String(row.category ?? '').trim()) problems.push('Category missing');
  if (!String(row.model_name ?? '').trim()) problems.push('Model name missing');
  const price = typeof row.price === 'number' ? row.price : Number(String(row.price ?? '').replace(/[,₹\s]/g, ''));
  if (row.price === '' || row.price == null || !Number.isFinite(price) || price < 0) problems.push('Price invalid');
  if (row.gst_rate !== '' && row.gst_rate != null) {
    const gst = Number(row.gst_rate);
    if (!Number.isFinite(gst) || gst < 0 || gst > 100) problems.push('GST % invalid');
  }
  return problems;
}

export async function downloadItemsTemplate() {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Items', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = ITEM_COLUMNS.map(({ header, key, width }) => ({ header, key, width }));
  styleHeader(sheet);
  sheet.addRow({ category: 'LG Displays', series: 'UL Series', model_name: '55UL5Q', hsn_code: '85287219', price: 42000, gst_rate: 18, remark: '55" UHD, 24/7' });
  sheet.addRow({ category: 'Installation', series: '', model_name: 'SVC-INSTALL', hsn_code: '998739', price: 10000, gst_rate: 18, remark: 'On-site installation & handover' });
  sheet.getColumn('price').numFmt = '#,##0.00';
  download(await workbook.xlsx.writeBuffer(), 'quote-items-template.xlsx');
}

export async function exportItemsWorkbook(items) {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Items', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = ITEM_COLUMNS.map(({ header, key, width }) => ({ header, key, width }));
  styleHeader(sheet);
  for (const item of items) {
    sheet.addRow({
      category: item.category_name, series: item.series || '', model_name: item.model_name, hsn_code: item.hsn_code || '',
      price: Number(item.price), gst_rate: Number(item.gst_rate), remark: item.remark || ''
    });
  }
  sheet.getColumn('price').numFmt = '#,##0.00';
  download(await workbook.xlsx.writeBuffer(), `quote-items-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
