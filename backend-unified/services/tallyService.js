// Tally Desk, Phase 1 (tallyPlan.md). Tally Makers prepare Sales Order /
// Proforma / Delivery Note / Invoice vouchers from won quotations and
// download a TallyPrime XML import file. Quotation tables are only read —
// nothing here writes to them. Voucher math and XML live in tallyXml.js.
import { query, withTransaction } from '../config/database.js';
import { computeLine } from './quoteEngine.js';
import { VOUCHER_KINDS, computeVoucher, voucherProblems, buildVoucherXml, defaultVoucherType } from './tallyXml.js';

const fail = (status, message, details) => Object.assign(new Error(message), { status, details });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const GSTIN = /^[0-9]{2}[A-Z0-9]{13}$/;
export const MAX_VOUCHER_LINES = 1000;

function text(value, label, max, { required = false } = {}) {
  const s = value == null ? '' : String(value).trim();
  if (!s) {
    if (required) throw fail(400, `${label} is required`);
    return null;
  }
  if (s.length > max) throw fail(400, `${label} must be ${max} characters or fewer`);
  return s;
}

function number(value, label, { min = 0, max = 1e12 } = {}) {
  const raw = typeof value === 'string' ? Number(value.replace(/[,₹\s]/g, '')) : Number(value);
  if (value === '' || value == null || !Number.isFinite(raw)) throw fail(400, `${label} must be a number`);
  const n = Math.round((raw + Number.EPSILON) * 100) / 100;
  if (n < min || n > max) throw fail(400, `${label} must be between ${min} and ${max}`);
  return n;
}

function uuid(value, label) {
  if (!UUID.test(String(value || ''))) throw fail(400, `${label} is invalid`);
  return value;
}

function date(value, label, { required = false } = {}) {
  const s = String(value || '').slice(0, 10);
  if (!s) {
    if (required) throw fail(400, `${label} is required`);
    return null;
  }
  const parsed = DATE.test(s) ? new Date(`${s}T00:00:00Z`) : null;
  if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== s) {
    throw fail(400, `${label} must be a valid date`);
  }
  return s;
}

function gstin(value, label) {
  const s = text(value, label, 15);
  if (!s) return null;
  const upper = s.toUpperCase();
  if (!GSTIN.test(upper)) throw fail(400, `${label} must be 15 characters (e.g. 29ABCDE1234F1Z5)`);
  return upper;
}

const toNum = (row, fields) => {
  for (const f of fields) if (row[f] != null) row[f] = Number(row[f]);
  return row;
};
const dateKey = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  return String(value).slice(0, 10);
};

// ============================================
// TALLY MAKERS (Super Admin, from the Back-Office roster)
// ============================================

export async function listTallyMakerIds() {
  const { rows } = await query('SELECT back_office_id FROM tally_makers');
  return rows.map((row) => row.back_office_id);
}

export async function setTallyMaker(backOfficeId, enabled, adminId) {
  uuid(backOfficeId, 'Back-Office employee');
  if (enabled) {
    const { rows } = await query('SELECT is_active FROM back_office WHERE id = $1', [backOfficeId]);
    if (!rows[0]) throw fail(404, 'Back-Office employee not found');
    if (!rows[0].is_active) throw fail(400, 'This employee is no longer active');
    await query(
      'INSERT INTO tally_makers (back_office_id, granted_by) VALUES ($1, $2) ON CONFLICT (back_office_id) DO NOTHING',
      [backOfficeId, adminId]
    );
  } else {
    await query('DELETE FROM tally_makers WHERE back_office_id = $1', [backOfficeId]);
  }
  return { back_office_id: backOfficeId, is_tally_maker: Boolean(enabled) };
}

// ============================================
// SETTINGS
// ============================================

const SETTING_FIELDS = ['company_name', 'home_state', 'godown_name', 'ledger_sales_goods', 'ledger_sales_services',
  'ledger_cgst', 'ledger_sgst', 'ledger_igst', 'ledger_round_off', 'vch_sales_order', 'vch_proforma',
  'vch_delivery_note', 'vch_invoice_goods', 'vch_invoice_services'];

export async function getSettings(db = { query }) {
  const { rows } = await db.query(
    `SELECT s.*, b.full_name AS updated_by_name FROM tally_settings s
       LEFT JOIN back_office b ON b.id = s.updated_by WHERE s.id`
  );
  return rows[0];
}

export async function saveSettings(body, userId) {
  const values = SETTING_FIELDS.map((f) => text(body[f], f.replace(/_/g, ' '), 200));
  const homeIndex = SETTING_FIELDS.indexOf('home_state');
  if (!values[homeIndex]) throw fail(400, 'Home state is required');
  await query(
    `UPDATE tally_settings SET ${SETTING_FIELDS.map((f, i) => `${f} = $${i + 1}`).join(', ')},
            updated_by = $${SETTING_FIELDS.length + 1} WHERE id`,
    [...values, userId]
  );
  return getSettings();
}

// ============================================
// WON QUOTATIONS
// ============================================

export async function listWonQuotes({ search } = {}) {
  const params = [];
  let where = "q.status = 'won' AND q.won_version_id IS NOT NULL";
  if (search && String(search).trim()) {
    params.push(`%${String(search).trim()}%`);
    where += ` AND (l.customer ILIKE $1 OR l.project ILIKE $1 OR q.project_ref ILIKE $1 OR q.po_number ILIKE $1)`;
  }
  const { rows } = await query(
    `SELECT q.id, q.project_ref, q.po_number, q.po_date, q.updated_at,
            l.customer, l.project, l.site_location,
            v.version_no, v.grand_total,
            count(tv.id)::int AS voucher_count,
            count(tv.id) FILTER (WHERE tv.status = 'imported')::int AS imported_count
       FROM quotes q
       JOIN quote_leads l ON l.id = q.lead_id
       JOIN quote_versions v ON v.id = q.won_version_id
       LEFT JOIN tally_vouchers tv ON tv.quote_id = q.id
      WHERE ${where}
      GROUP BY q.id, l.id, v.id
      ORDER BY q.updated_at DESC
      LIMIT 500`,
    params
  );
  return rows.map((row) => ({ ...toNum(row, ['grand_total']), po_date: dateKey(row.po_date) }));
}

async function loadWonQuote(quoteId, db = { query }) {
  const { rows } = await db.query(
    `SELECT q.id, q.status, q.won_version_id, q.project_ref, q.po_number, q.po_date,
            l.customer, l.project, l.site_location, quote_lead_key(l.customer) AS customer_key,
            v.version_no, v.sm, v.rounding_step, v.grand_total
       FROM quotes q
       JOIN quote_leads l ON l.id = q.lead_id
       LEFT JOIN quote_versions v ON v.id = q.won_version_id
      WHERE q.id = $1`,
    [uuid(quoteId, 'Quotation')]
  );
  const quote = rows[0];
  if (!quote) throw fail(404, 'Quotation not found');
  return { ...toNum(quote, ['grand_total', 'sm']), po_date: dateKey(quote.po_date) };
}

// The won version's lines at their selling price (never cost or margin),
// with the Tally stock item remembered for each catalog item and the qty
// already on other vouchers of each kind.
async function wonLines(quote, db = { query }) {
  if (!quote.won_version_id) return [];
  const { rows } = await db.query(
    `SELECT ln.id, ln.line_type, ln.item_id, ln.model_name, ln.series, ln.description, ln.hsn_code, ln.uom,
            ln.qty, ln.osp_unit, ln.sm_override, ln.price_override, ln.gst_rate,
            s.name AS section_name, s.kind AS section_kind,
            g.name AS brand, i.model_no, m.stock_item_name, m.unit_name
       FROM quote_lines ln
       JOIN quote_sections s ON s.id = ln.section_id
       LEFT JOIN quote_items i ON i.id = ln.item_id
       LEFT JOIN quote_groups g ON g.id = i.group_id
       LEFT JOIN tally_item_map m ON m.item_id = ln.item_id
      WHERE s.version_id = $1
      ORDER BY s.sort_order, ln.sort_order`,
    [quote.won_version_id]
  );
  const settings = { sm: quote.sm, rounding_step: quote.rounding_step };
  return rows.map((row) => {
    const calc = computeLine(toNum(row, ['qty', 'osp_unit', 'sm_override', 'price_override', 'gst_rate']), settings);
    const title = [row.model_name, row.series && `(${row.series})`].filter(Boolean).join(' ') || row.description || 'Untitled line';
    return {
      id: row.id,
      line_type: row.line_type,
      item_id: row.item_id,
      description: title,
      detail: row.model_name ? row.description : null,
      section_name: row.section_name,
      hsn_code: row.hsn_code,
      uom: row.uom,
      qty: row.qty,
      rate: calc.unit_price,
      gst_rate: row.gst_rate,
      brand: row.brand,
      model_no: row.model_no,
      stock_item_name: row.stock_item_name,
      unit_name: row.unit_name
    };
  });
}

async function usedQty(quoteId, db = { query }) {
  const { rows } = await db.query(
    `SELECT tl.source_line_id, tv.kind, tv.id AS voucher_id, sum(tl.qty) AS qty
       FROM tally_voucher_lines tl JOIN tally_vouchers tv ON tv.id = tl.voucher_id
      WHERE tv.quote_id = $1 AND tl.source_line_id IS NOT NULL
      GROUP BY tl.source_line_id, tv.kind, tv.id`,
    [quoteId]
  );
  return rows.map((row) => ({ ...row, qty: Number(row.qty) }));
}

export async function getWonQuote(quoteId) {
  const quote = await loadWonQuote(quoteId);
  const [lines, used, vouchers, party] = await Promise.all([
    wonLines(quote),
    usedQty(quote.id),
    listVouchers({ quote_id: quote.id }),
    query('SELECT * FROM tally_parties WHERE customer_key = $1', [quote.customer_key]).then((r) => r.rows[0] || null)
  ]);
  return { quote, lines, used, vouchers, party };
}

// ============================================
// VOUCHERS
// ============================================

const VOUCHER_SELECT = `
  SELECT tv.*, l.customer, l.project, q.project_ref, q.status AS quote_status,
         cb.full_name AS created_by_name, ub.full_name AS updated_by_name, db.full_name AS last_downloaded_by_name
    FROM tally_vouchers tv
    JOIN quotes q ON q.id = tv.quote_id
    JOIN quote_leads l ON l.id = q.lead_id
    LEFT JOIN back_office cb ON cb.id = tv.created_by
    LEFT JOIN back_office ub ON ub.id = tv.updated_by
    LEFT JOIN back_office db ON db.id = tv.last_downloaded_by`;

const voucherRow = (row) => ({ ...row, voucher_date: dateKey(row.voucher_date), po_date: dateKey(row.po_date) });

export async function listVouchers({ quote_id, status, kind } = {}) {
  const where = [];
  const params = [];
  if (quote_id) { params.push(uuid(quote_id, 'Quotation')); where.push(`tv.quote_id = $${params.length}`); }
  if (status) { params.push(String(status)); where.push(`tv.status = $${params.length}`); }
  if (kind) { params.push(String(kind)); where.push(`tv.kind = $${params.length}`); }
  const { rows } = await query(
    `${VOUCHER_SELECT}
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY tv.created_at DESC LIMIT 500`,
    params
  );
  if (!rows.length) return [];
  const settings = await getSettings();
  const lines = await query('SELECT * FROM tally_voucher_lines WHERE voucher_id = ANY($1::uuid[]) ORDER BY sort_order',
    [rows.map((r) => r.id)]);
  const byVoucher = new Map();
  for (const line of lines.rows) {
    const list = byVoucher.get(line.voucher_id) || [];
    list.push(toNum(line, ['qty', 'rate', 'gst_rate']));
    byVoucher.set(line.voucher_id, list);
  }
  return rows.map((row) => {
    const voucher = voucherRow(row);
    const own = byVoucher.get(row.id) || [];
    const calc = computeVoucher(voucher, own, settings);
    return { ...voucher, line_count: own.length, total: calc.total };
  });
}

async function loadVoucher(id, db = { query }) {
  const { rows } = await db.query(`${VOUCHER_SELECT} WHERE tv.id = $1`, [uuid(id, 'Voucher')]);
  if (!rows[0]) throw fail(404, 'Voucher not found');
  const lines = await db.query('SELECT * FROM tally_voucher_lines WHERE voucher_id = $1 ORDER BY sort_order', [id]);
  return { voucher: voucherRow(rows[0]), lines: lines.rows.map((l) => toNum(l, ['qty', 'rate', 'gst_rate'])) };
}

export async function getVoucher(id) {
  const { voucher, lines } = await loadVoucher(id);
  const settings = await getSettings();
  return {
    voucher,
    lines,
    calc: computeVoucher(voucher, lines, settings),
    problems: voucherProblems(voucher, lines, settings)
  };
}

function parseVoucher(body) {
  const kind = String(body.kind || '');
  if (!VOUCHER_KINDS[kind]) throw fail(400, 'Pick a voucher kind');
  const lines = Array.isArray(body.lines) ? body.lines : [];
  if (lines.length > MAX_VOUCHER_LINES) throw fail(400, `At most ${MAX_VOUCHER_LINES} lines per voucher`);
  return {
    kind,
    voucher_type: text(body.voucher_type, 'Voucher type', 200),
    voucher_date: date(body.voucher_date, 'Voucher date', { required: true }),
    po_number: text(body.po_number, 'PO number', 100),
    po_date: date(body.po_date, 'PO date'),
    party_ledger: text(body.party_ledger, 'Party ledger', 200),
    bill_name: text(body.bill_name, 'Bill-to name', 200),
    bill_address: text(body.bill_address, 'Bill-to address', 1000),
    bill_gstin: gstin(body.bill_gstin, 'Bill-to GSTIN'),
    bill_state: text(body.bill_state, 'Bill-to state', 100),
    ship_name: text(body.ship_name, 'Ship-to name', 200),
    ship_address: text(body.ship_address, 'Ship-to address', 1000),
    ship_gstin: gstin(body.ship_gstin, 'Ship-to GSTIN'),
    ship_state: text(body.ship_state, 'Ship-to state', 100),
    place_of_supply: text(body.place_of_supply, 'Place of supply', 100),
    narration: text(body.narration, 'Narration', 1000),
    lines: lines.map((line, i) => {
      const where = `Line ${i + 1}`;
      const type = line?.line_type === 'service' ? 'service' : 'supply';
      return {
        source_line_id: line?.source_line_id ? uuid(line.source_line_id, `${where}: source`) : null,
        item_id: line?.item_id ? uuid(line.item_id, `${where}: item`) : null,
        line_type: type,
        description: text(line?.description, `${where}: description`, 1000, { required: true }),
        hsn_code: text(line?.hsn_code, `${where}: HSN/SAC`, 20),
        stock_item_name: type === 'supply' ? text(line?.stock_item_name, `${where}: Tally stock item`, 200) : null,
        unit_name: type === 'supply' ? text(line?.unit_name, `${where}: Tally unit`, 50) : null,
        qty: number(line?.qty, `${where}: qty`, { min: 0.01, max: 1e9 }),
        rate: number(line?.rate, `${where}: rate`, { min: 0, max: 1e11 }),
        gst_rate: number(line?.gst_rate ?? 18, `${where}: GST %`, { min: 0, max: 100 })
      };
    })
  };
}

const VOUCHER_COLS = ['voucher_type', 'voucher_date', 'po_number', 'po_date', 'party_ledger', 'bill_name', 'bill_address',
  'bill_gstin', 'bill_state', 'ship_name', 'ship_address', 'ship_gstin', 'ship_state', 'place_of_supply', 'narration'];

async function writeLines(client, voucherId, lines) {
  await client.query('DELETE FROM tally_voucher_lines WHERE voucher_id = $1', [voucherId]);
  if (!lines.length) return;
  // A catalog item deleted since the quote was won just loses its link.
  const itemIds = [...new Set(lines.map((l) => l.item_id).filter(Boolean))];
  const live = new Set();
  if (itemIds.length) {
    const { rows } = await client.query('SELECT id FROM quote_items WHERE id = ANY($1::uuid[])', [itemIds]);
    rows.forEach((row) => live.add(row.id));
  }
  const cols = ['voucher_id', 'source_line_id', 'item_id', 'line_type', 'description', 'hsn_code', 'stock_item_name',
    'unit_name', 'qty', 'rate', 'gst_rate', 'sort_order'];
  const values = [];
  const tuples = lines.map((line, i) => {
    const row = [voucherId, line.source_line_id, live.has(line.item_id) ? line.item_id : null, line.line_type,
      line.description, line.hsn_code, line.stock_item_name, line.unit_name, line.qty, line.rate, line.gst_rate, i];
    const start = values.length;
    values.push(...row);
    return `(${row.map((_, k) => `$${start + k + 1}`).join(', ')})`;
  });
  await client.query(`INSERT INTO tally_voucher_lines (${cols.join(', ')}) VALUES ${tuples.join(', ')}`, values);
}

// Remember what this voucher taught us: the stock item for each catalog
// item, and the customer's party ledger and billing details.
async function remember(client, voucher, lines, customerKey, userId) {
  const items = new Map();
  for (const line of lines) {
    if (line.item_id && line.stock_item_name && line.unit_name) items.set(line.item_id, line);
  }
  for (const [itemId, line] of items) {
    await client.query(
      `INSERT INTO tally_item_map (item_id, stock_item_name, unit_name, updated_by)
       SELECT id, $2, $3, $4 FROM quote_items WHERE id = $1
       ON CONFLICT (item_id) DO UPDATE SET stock_item_name = EXCLUDED.stock_item_name,
             unit_name = EXCLUDED.unit_name, updated_by = EXCLUDED.updated_by`,
      [itemId, line.stock_item_name, line.unit_name, userId]
    );
  }
  if (voucher.party_ledger && customerKey) {
    await client.query(
      `INSERT INTO tally_parties (customer_key, party_ledger, bill_name, bill_address, bill_gstin, bill_state, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (customer_key) DO UPDATE SET party_ledger = EXCLUDED.party_ledger, bill_name = EXCLUDED.bill_name,
             bill_address = EXCLUDED.bill_address, bill_gstin = EXCLUDED.bill_gstin, bill_state = EXCLUDED.bill_state,
             updated_by = EXCLUDED.updated_by`,
      [customerKey, voucher.party_ledger, voucher.bill_name, voucher.bill_address, voucher.bill_gstin, voucher.bill_state, userId]
    );
  }
}

export async function createVoucher(body, userId) {
  const quoteId = uuid(body.quote_id, 'Quotation');
  const parsed = parseVoucher(body);
  const id = await withTransaction(async (client) => {
    await client.query('SELECT id FROM quotes WHERE id = $1 FOR SHARE', [quoteId]);
    const quote = await loadWonQuote(quoteId, client);
    if (quote.status !== 'won' || !quote.won_version_id) throw fail(400, 'Only won quotations can be sent to Tally');
    parsed.voucher_type ||= defaultVoucherType(parsed.kind, await getSettings(client), parsed.lines);
    const { rows } = await client.query(
      `INSERT INTO tally_vouchers (quote_id, version_id, kind, ${VOUCHER_COLS.join(', ')}, created_by, updated_by)
       VALUES ($1, $2, $3, ${VOUCHER_COLS.map((_, i) => `$${i + 4}`).join(', ')}, $${VOUCHER_COLS.length + 4}, $${VOUCHER_COLS.length + 4})
       RETURNING id`,
      [quoteId, quote.won_version_id, parsed.kind, ...VOUCHER_COLS.map((c) => parsed[c]), userId]
    );
    await writeLines(client, rows[0].id, parsed.lines);
    await remember(client, parsed, parsed.lines, quote.customer_key, userId);
    return rows[0].id;
  });
  return getVoucher(id);
}

export async function updateVoucher(id, body, userId) {
  const parsed = parseVoucher(body);
  await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM tally_vouchers WHERE id = $1 FOR UPDATE', [uuid(id, 'Voucher')]);
    const current = rows[0];
    if (!current) throw fail(404, 'Voucher not found');
    if (current.status === 'imported') throw fail(400, 'This voucher is marked as imported into Tally. Undo that first to change it.');
    if (current.kind !== parsed.kind) throw fail(400, 'A voucher\'s kind cannot change. Make a new voucher instead.');
    parsed.voucher_type ||= defaultVoucherType(parsed.kind, await getSettings(client), parsed.lines);
    await client.query(
      `UPDATE tally_vouchers SET ${VOUCHER_COLS.map((c, i) => `${c} = $${i + 2}`).join(', ')}, updated_by = $${VOUCHER_COLS.length + 2}
        WHERE id = $1`,
      [id, ...VOUCHER_COLS.map((c) => parsed[c]), userId]
    );
    await writeLines(client, id, parsed.lines);
    const quote = await loadWonQuote(current.quote_id, client);
    await remember(client, parsed, parsed.lines, quote.customer_key, userId);
  });
  return getVoucher(id);
}

export async function deleteVoucher(id) {
  const { rows } = await query('SELECT status FROM tally_vouchers WHERE id = $1', [uuid(id, 'Voucher')]);
  if (!rows[0]) throw fail(404, 'Voucher not found');
  if (rows[0].status === 'imported') throw fail(400, 'An imported voucher cannot be deleted. Undo "imported" first if it was a mistake.');
  await query('DELETE FROM tally_vouchers WHERE id = $1', [id]);
  return { id };
}

// The XML for Tally. Refused with the list of problems while anything
// Tally would reject is still missing. Each download is counted.
export async function downloadVoucher(id, userId) {
  return withTransaction(async (client) => {
    await client.query('SELECT id FROM tally_vouchers WHERE id = $1 FOR UPDATE', [uuid(id, 'Voucher')]);
    const { voucher, lines } = await loadVoucher(id, client);
    const settings = await getSettings(client);
    const problems = voucherProblems(voucher, lines, settings);
    if (problems.length) throw fail(400, 'This voucher is not ready for Tally yet', problems);
    const xml = buildVoucherXml(voucher, lines, settings);
    await client.query(
      `UPDATE tally_vouchers SET download_count = download_count + 1, last_downloaded_at = now(), last_downloaded_by = $2,
              status = CASE WHEN status = 'draft' THEN 'downloaded' ELSE status END
        WHERE id = $1`,
      [id, userId]
    );
    const kind = VOUCHER_KINDS[voucher.kind].label.replace(/[^A-Za-z]+/g, '-').replace(/-+$/, '');
    const customer = String(voucher.customer || '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    return { xml, filename: `TD-${voucher.ref_no}-${kind}-${customer || 'voucher'}.xml` };
  });
}

// Accounts confirms the import (optionally with Tally's voucher no), which
// locks the voucher. Undo is allowed in case it was marked by mistake.
export async function setImported(id, body, userId) {
  const imported = body.imported === true;
  const voucherNo = text(body.tally_voucher_no, 'Tally voucher no', 100);
  const { rows } = await query('SELECT status FROM tally_vouchers WHERE id = $1', [uuid(id, 'Voucher')]);
  if (!rows[0]) throw fail(404, 'Voucher not found');
  if (imported && rows[0].status === 'draft') throw fail(400, 'Download the file and import it into Tally first');
  await query(
    `UPDATE tally_vouchers SET status = $2, tally_voucher_no = $3, updated_by = $4 WHERE id = $1`,
    [id, imported ? 'imported' : 'downloaded', imported ? voucherNo : null, userId]
  );
  return getVoucher(id);
}

// ============================================
// ITEM NAMES (catalog item → Tally stock item)
// ============================================

export async function listItemNames({ search, linked, page = 1, limit = 50 } = {}) {
  const where = [];
  const params = [];
  if (search && String(search).trim()) {
    params.push(`%${String(search).trim()}%`);
    where.push(`(i.model_name ILIKE $${params.length} OR i.model_no ILIKE $${params.length} OR g.name ILIKE $${params.length}
                 OR m.stock_item_name ILIKE $${params.length})`);
  }
  if (linked === 'yes') where.push('m.item_id IS NOT NULL');
  if (linked === 'no') where.push('m.item_id IS NULL');
  const size = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * size;
  const filter = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const from = `FROM quote_items i LEFT JOIN quote_groups g ON g.id = i.group_id LEFT JOIN tally_item_map m ON m.item_id = i.id`;
  const [rows, count] = await Promise.all([
    query(
      `SELECT i.id, i.model_name, i.model_no, i.hsn_code, g.name AS brand, m.stock_item_name, m.unit_name, m.updated_at AS linked_at
         ${from} ${filter}
        ORDER BY g.name NULLS LAST, i.model_no NULLS LAST, i.model_name
        LIMIT ${size} OFFSET ${offset}`,
      params
    ),
    query(`SELECT count(*)::int AS n, count(m.item_id)::int AS linked ${from} ${filter}`, params)
  ]);
  return { rows: rows.rows, total: count.rows[0].n, page: Math.max(Number(page) || 1, 1), limit: size };
}

export async function setItemName(itemId, body, userId) {
  uuid(itemId, 'Item');
  const stock = text(body.stock_item_name, 'Tally stock item', 200);
  if (!stock) {
    await query('DELETE FROM tally_item_map WHERE item_id = $1', [itemId]);
    return { item_id: itemId, stock_item_name: null, unit_name: null };
  }
  const unit = text(body.unit_name, 'Tally unit', 50, { required: true });
  const { rowCount } = await query(
    `INSERT INTO tally_item_map (item_id, stock_item_name, unit_name, updated_by)
     SELECT id, $2, $3, $4 FROM quote_items WHERE id = $1
     ON CONFLICT (item_id) DO UPDATE SET stock_item_name = EXCLUDED.stock_item_name,
           unit_name = EXCLUDED.unit_name, updated_by = EXCLUDED.updated_by`,
    [itemId, stock, unit, userId]
  );
  if (!rowCount) throw fail(404, 'Item not found');
  return { item_id: itemId, stock_item_name: stock, unit_name: unit };
}

