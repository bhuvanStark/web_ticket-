// Quotation Items catalog ⇄ Excel. Columns: Brand, Category, Model No,
// Description, Series, HSN/SAC, Price, GST %, Model Name / Make, Product Link.
// Headers are matched by name (any order, case/spacing ignored). ExcelJS is
// loaded only when used. An export can be filled in and imported back: rows
// match on Brand + Model No, else on Description.

export const ITEM_COLUMNS = [
  { key: 'group', header: 'Brand', width: 18, aliases: ['brand', 'group', 'make', 'oem'] },
  { key: 'category', header: 'Category', width: 20, aliases: ['category', 'categoryname', 'type'] },
  { key: 'model_no', header: 'Model No', width: 18, aliases: ['modelno', 'modelnumber', 'partno', 'sku'] },
  { key: 'model_name', header: 'Description', width: 40, aliases: ['description', 'modelname', 'item', 'itemname', 'product'] },
  { key: 'series', header: 'Series', width: 18, aliases: ['series'] },
  { key: 'hsn_code', header: 'HSN/SAC', width: 14, aliases: ['hsncode', 'hsn', 'hsnsac', 'sac'] },
  { key: 'price', header: 'Price', width: 14, aliases: ['price', 'osp', 'cost', 'unitprice', 'ospunit'] },
  { key: 'gst_rate', header: 'GST %', width: 9, aliases: ['gst', 'gstrate', 'gstpercent', 'tax'] },
  { key: 'remark', header: 'Model Name / Make', width: 28, aliases: ['modelnamemake', 'remark', 'remarks', 'notes', 'note'] },
  { key: 'product_link', header: 'Product Link', width: 36, aliases: ['productlink', 'link', 'url', 'producturl', 'website'] }
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

// Returns [{ row, group, category, model_no, model_name, series, hsn_code, price, gst_rate, remark, product_link }].
export async function parseItemsWorkbook(file) {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('No sheet found in this file');

  // The header is the first row that names a Description column (lets a title row sit above it).
  let headerRowNo = 0;
  const colFor = {};
  for (let r = 1; r <= Math.min(sheet.rowCount, 10) && !headerRowNo; r += 1) {
    const names = {};
    sheet.getRow(r).eachCell((cell, col) => { names[norm(cellValue(cell.value))] = col; });
    if (ITEM_COLUMNS.find((c) => c.key === 'model_name').aliases.some((a) => names[a])) {
      headerRowNo = r;
      for (const column of ITEM_COLUMNS) {
        const hit = column.aliases.find((a) => names[a]);
        if (hit) colFor[column.key] = names[hit];
      }
    }
  }
  if (!headerRowNo) throw new Error('Could not find the header row. Use the template: Brand, Category, Model No, Description, Series, HSN/SAC, Price, GST %, Model Name / Make, Product Link.');
  for (const key of ['group', 'category', 'model_no', 'hsn_code', 'price']) {
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
  if (!String(row.group ?? '').trim()) problems.push('Brand missing');
  if (!String(row.category ?? '').trim()) problems.push('Category missing');
  if (!String(row.model_no ?? '').trim()) problems.push('Model No missing');
  if (!String(row.model_name ?? '').trim()) problems.push('Description missing');
  if (!String(row.hsn_code ?? '').trim()) problems.push('HSN/SAC missing');
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
  sheet.addRow({ group: 'LG', category: 'Display', model_no: '55UL5Q', model_name: '55-inch 4K UHD Commercial Display', series: 'UL Series', hsn_code: '85287219', price: 42000, gst_rate: 18, remark: 'LG 55UL5Q', product_link: 'https://www.lg.com/' });
  sheet.addRow({ group: 'Samsung', category: 'Display', model_no: 'QM55C', model_name: '55-inch 4K UHD Smart Signage', series: 'QMC Series', hsn_code: '85287219', price: 45000, gst_rate: 18, remark: 'Samsung QM55C' });
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
      group: item.group_name || '', category: item.category_name || '', model_no: item.model_no || '',
      model_name: item.model_name, series: item.series || '', hsn_code: item.hsn_code || '',
      price: Number(item.price), gst_rate: Number(item.gst_rate), remark: item.remark || '', product_link: item.product_link || ''
    });
  }
  sheet.getColumn('price').numFmt = '#,##0.00';
  download(await workbook.xlsx.writeBuffer(), `quote-items-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
