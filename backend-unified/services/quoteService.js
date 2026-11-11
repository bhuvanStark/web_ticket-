// Quotation module — catalog (categories + items), quote leads, and quotes
// with versions. Talks to Postgres directly through the pool; the module's
// tables are deliberately not in config/databaseClient.js's allowlist so
// nothing outside this module can reach them through the shared builder.
import { query, withTransaction } from '../config/database.js';
import { computeVersion, ROUNDING_STEPS } from './quoteEngine.js';

const fail = (status, message) => Object.assign(new Error(message), { status });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const QUOTE_STATUSES = ['draft', 'sent', 'won', 'lost'];
export const MAX_SECTIONS = 100;
export const MAX_LINES_PER_SECTION = 500;
export const MAX_IMPORT_ROWS = 5000;

export const DEFAULT_NOTES = [
  'Civil and electrical works are not included in the quotation and will be under the client\'s scope.',
  'False ceiling cutting and redoing work are not included and will be under the client\'s scope.',
  'Raceway, conduiting and capping are not included. If required, these will be charged extra at actuals.',
  'All IT-related infrastructure, including servers, thin clients and LAN cabling, will be under the client\'s scope.',
  'All cabling infrastructure will be charged at actuals based on site requirements.',
  'Equipment racks and enclosures are not included. The client must provide suitable enclosures for equipment installation.',
  'The client must provide the required power points and conduits/raceways for cable routing at the LED mounting locations.',
  'DTH connectivity will be under the client\'s scope.'
].map((line, i) => `${i + 1}. ${line}`).join('\n');

// Starting Terms & Conditions for a new quotation; editable per version.
export const DEFAULT_TERMS = [
  'Prices are in Indian Rupees (INR). GST is charged extra at the applicable rate as shown.',
  'This quotation is valid for 30 days from the date of issue.',
  'Payment terms: as agreed in the purchase order.',
  'Warranty: as per the manufacturer\'s standard warranty terms.',
  'Any work outside the quoted scope will be charged extra at actuals.'
].map((line, i) => `${i + 1}. ${line}`).join('\n');

// ---- field parsing ----

function text(value, label, max, { required = false } = {}) {
  const s = value == null ? '' : String(value).trim();
  if (!s) {
    if (required) throw fail(400, `${label} is required`);
    return null;
  }
  if (s.length > max) throw fail(400, `${label} must be ${max} characters or fewer`);
  return s;
}

// Rounded to the column's scale (numeric(…,2) / SM numeric(6,4)) before use,
// so totals cached on save are computed from exactly what gets stored.
function number(value, label, { min = 0, max = Infinity, required = false, fallback = null, decimals = 2 } = {}) {
  if (value === '' || value == null) {
    if (required) throw fail(400, `${label} is required`);
    return fallback;
  }
  const raw = typeof value === 'string' ? Number(value.replace(/[,₹\s]/g, '')) : Number(value);
  if (!Number.isFinite(raw)) throw fail(400, `${label} must be a number`);
  const factor = 10 ** decimals;
  const n = Math.round((raw + Number.EPSILON) * factor) / factor;
  if (n < min || n > max) throw fail(400, `${label} must be between ${min} and ${max}`);
  return n;
}

function uuid(value, label) {
  if (!UUID.test(String(value || ''))) throw fail(400, `${label} is invalid`);
  return value;
}

function date(value, label) {
  const s = String(value || '');
  // Round-trip: Date.parse accepts 2026-02-31 (rolls to 3 Mar), Postgres does not.
  const parsed = DATE.test(s) ? new Date(`${s}T00:00:00Z`) : null;
  if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== s) {
    throw fail(400, `${label} must be a valid date`);
  }
  return s;
}

const toNum = (row, fields) => {
  for (const f of fields) if (row[f] != null) row[f] = Number(row[f]);
  return row;
};

// ============================================
// CATEGORIES
// ============================================

export async function listCategories() {
  const { rows } = await query(`
    SELECT c.id, c.name, c.created_at, c.updated_at, count(i.id)::int AS item_count
      FROM quote_categories c
      LEFT JOIN quote_items i ON i.category_id = c.id
     GROUP BY c.id
     ORDER BY lower(c.name)`);
  return rows;
}

const categoryNameTaken = (error) => {
  if (error.code === '23505') throw fail(400, 'A category with this name already exists');
  throw error;
};

export async function createCategory(body, userId) {
  const name = text(body.name, 'Category name', 120, { required: true });
  const { rows } = await query(
    'INSERT INTO quote_categories (name, created_by) VALUES ($1, $2) RETURNING id, name, created_at, updated_at',
    [name, userId]
  ).catch(categoryNameTaken);
  return { ...rows[0], item_count: 0 };
}

export async function renameCategory(id, body) {
  const name = text(body.name, 'Category name', 120, { required: true });
  const { rows } = await query(
    'UPDATE quote_categories SET name = $2 WHERE id = $1 RETURNING id, name, created_at, updated_at',
    [uuid(id, 'Category'), name]
  ).catch(categoryNameTaken);
  if (!rows[0]) throw fail(404, 'Category not found');
  return rows[0];
}

export async function deleteCategory(id) {
  const { rows } = await query('SELECT count(*)::int AS n FROM quote_items WHERE category_id = $1', [uuid(id, 'Category')]);
  if (rows[0].n > 0) throw fail(400, `This category still has ${rows[0].n} item(s). Move or delete them first.`);
  // FK RESTRICT still guards an item added between the count and the delete.
  const { rowCount } = await query('DELETE FROM quote_categories WHERE id = $1', [id]).catch((error) => {
    if (error.code === '23503') throw fail(400, 'This category still has items. Move or delete them first.');
    throw error;
  });
  if (!rowCount) throw fail(404, 'Category not found');
}

// ============================================
// ITEMS
// ============================================

const ITEM_SELECT = `
  SELECT i.id, i.category_id, c.name AS category_name, i.series, i.model_name, i.hsn_code,
         i.price, i.gst_rate, i.remark, i.created_at, i.updated_at
    FROM quote_items i
    JOIN quote_categories c ON c.id = i.category_id`;

const itemRow = (row) => toNum(row, ['price', 'gst_rate']);

export function parseItem(body) {
  return {
    category_id: uuid(body.category_id, 'Category'),
    series: text(body.series, 'Series', 200),
    model_name: text(body.model_name, 'Model name', 200, { required: true }),
    hsn_code: text(body.hsn_code, 'HSN code', 20),
    price: number(body.price, 'Price', { required: true, max: 1e11 }),
    gst_rate: number(body.gst_rate, 'GST %', { max: 100, fallback: 18 }),
    remark: text(body.remark, 'Remark', 1000)
  };
}

const modelTaken = (error) => {
  if (error.code === '23505') throw fail(400, 'An item with this model name already exists');
  if (error.code === '23503') throw fail(400, 'Category not found');
  throw error;
};

export async function listItems({ search, category_id, page = 1, limit = 50 } = {}) {
  const where = [];
  const values = [];
  if (category_id) {
    values.push(uuid(category_id, 'Category'));
    where.push(`i.category_id = $${values.length}`);
  }
  const term = String(search || '').trim();
  if (term) {
    values.push(`%${term.replace(/[%_\\]/g, '\\$&')}%`);
    const p = `$${values.length}`;
    where.push(`(i.model_name ILIKE ${p} OR i.series ILIKE ${p} OR i.hsn_code ILIKE ${p} OR i.remark ILIKE ${p} OR c.name ILIKE ${p})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const size = Math.min(Math.max(Number.parseInt(limit, 10) || 50, 1), 200);
  const offset = (Math.max(Number.parseInt(page, 10) || 1, 1) - 1) * size;

  const [{ rows }, { rows: countRows }] = await Promise.all([
    query(`${ITEM_SELECT} ${whereSql} ORDER BY lower(c.name), lower(i.series) NULLS FIRST, lower(i.model_name)
           LIMIT ${size} OFFSET ${offset}`, values),
    query(`SELECT count(*)::int AS n FROM quote_items i JOIN quote_categories c ON c.id = i.category_id ${whereSql}`, values)
  ]);
  return { rows: rows.map(itemRow), total: countRows[0].n, page: offset / size + 1, limit: size };
}

export async function createItem(body, userId) {
  const item = parseItem(body);
  const { rows } = await query(
    `INSERT INTO quote_items (category_id, series, model_name, hsn_code, price, gst_rate, remark, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8) RETURNING id`,
    [item.category_id, item.series, item.model_name, item.hsn_code, item.price, item.gst_rate, item.remark, userId]
  ).catch(modelTaken);
  return getItem(rows[0].id);
}

async function getItem(id) {
  const { rows } = await query(`${ITEM_SELECT} WHERE i.id = $1`, [id]);
  if (!rows[0]) throw fail(404, 'Item not found');
  return itemRow(rows[0]);
}

export async function updateItem(id, body, userId) {
  const item = parseItem(body);
  const { rowCount } = await query(
    `UPDATE quote_items SET category_id = $2, series = $3, model_name = $4, hsn_code = $5, price = $6,
            gst_rate = $7, remark = $8, updated_by = $9
      WHERE id = $1`,
    [uuid(id, 'Item'), item.category_id, item.series, item.model_name, item.hsn_code, item.price, item.gst_rate, item.remark, userId]
  ).catch(modelTaken);
  if (!rowCount) throw fail(404, 'Item not found');
  return getItem(id);
}

export async function deleteItems(ids) {
  if (!Array.isArray(ids) || ids.length === 0) throw fail(400, 'No items selected');
  if (ids.length > 1000) throw fail(400, 'Delete at most 1000 items at a time');
  ids.forEach((id) => uuid(id, 'Item'));
  // Saved quotes keep their copied item fields (quote_lines.item_id → NULL).
  const { rowCount } = await query('DELETE FROM quote_items WHERE id = ANY($1::uuid[])', [ids]);
  return { deleted: rowCount };
}

// Excel import: rows are { category, series, model_name, hsn_code, price,
// gst_rate, remark }. Missing categories are created; an existing model
// name is updated in place. All-or-nothing: any invalid row rejects the
// whole file with every row's error listed.
export function parseImportRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) throw fail(400, 'The file has no item rows');
  if (rows.length > MAX_IMPORT_ROWS) throw fail(400, `Import at most ${MAX_IMPORT_ROWS} rows at a time`);
  const parsed = [];
  const errors = [];
  rows.forEach((row, index) => {
    const rowNo = Number(row?.row) || index + 2;
    try {
      parsed.push({
        row: rowNo,
        category: text(row.category, 'Category', 120, { required: true }),
        series: text(row.series, 'Series', 200),
        model_name: text(row.model_name, 'Model name', 200, { required: true }),
        hsn_code: text(row.hsn_code, 'HSN code', 20),
        price: number(row.price, 'Price', { required: true, max: 1e11 }),
        gst_rate: number(row.gst_rate, 'GST %', { max: 100, fallback: 18 }),
        remark: text(row.remark, 'Remark', 1000)
      });
    } catch (error) {
      errors.push({ row: rowNo, error: error.message });
    }
  });
  if (errors.length) throw Object.assign(fail(400, `${errors.length} row(s) have errors`), { details: errors });
  // A model listed twice in one file: the later row wins (same as importing twice).
  const byModel = new Map();
  for (const row of parsed) byModel.set(row.model_name.toLowerCase(), row);
  return [...byModel.values()];
}

export async function importItems(rows, userId) {
  const parsed = parseImportRows(rows);
  return withTransaction(async (client) => {
    const categoryIds = new Map();
    let categoriesCreated = 0;
    let created = 0;
    let updated = 0;
    for (const row of parsed) {
      const key = row.category.toLowerCase();
      if (!categoryIds.has(key)) {
        // Upsert so a category created concurrently can't fail the import.
        const { rows: cat } = await client.query(
          `INSERT INTO quote_categories (name, created_by) VALUES ($1, $2)
           ON CONFLICT ((lower(btrim(name)))) DO UPDATE SET name = quote_categories.name
           RETURNING id, (xmax = 0) AS inserted`,
          [row.category, userId]
        );
        categoryIds.set(key, cat[0].id);
        if (cat[0].inserted) categoriesCreated += 1;
      }
      const { rows: result } = await client.query(
        `INSERT INTO quote_items (category_id, series, model_name, hsn_code, price, gst_rate, remark, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
         ON CONFLICT ((lower(btrim(model_name)))) DO UPDATE
            SET category_id = EXCLUDED.category_id, series = EXCLUDED.series, hsn_code = EXCLUDED.hsn_code,
                price = EXCLUDED.price, gst_rate = EXCLUDED.gst_rate, remark = EXCLUDED.remark,
                updated_by = EXCLUDED.updated_by
         RETURNING (xmax = 0) AS inserted`,
        [categoryIds.get(key), row.series, row.model_name, row.hsn_code, row.price, row.gst_rate, row.remark, userId]
      );
      if (result[0].inserted) created += 1;
      else updated += 1;
    }
    return { created, updated, categoriesCreated };
  });
}

// ============================================
// ACTIVITY LOG
// ============================================

// Autosave would log a "saved" every few seconds; consecutive saves of the
// same version by the same person within this window collapse into one row.
const SAVE_EVENT_WINDOW = '30 minutes';

// `admin` true when the actor is the Super Admin (admins table), else a
// Back-Office Quote Manager.
async function logEvent(db, quoteId, action, { by, admin = false, versionNo = null, detail = null } = {}) {
  const actor = `(SELECT full_name FROM ${admin ? 'admins' : 'back_office'} WHERE id = $2)`;
  if (action === 'saved') {
    const { rowCount } = await db.query(`
      UPDATE quote_events SET created_at = now()
       WHERE id = (SELECT max(id) FROM quote_events WHERE quote_id = $1)
         AND action = 'saved' AND version_no = $3 AND actor_name = ${actor}
         AND created_at > now() - interval '${SAVE_EVENT_WINDOW}'`, [quoteId, by, versionNo]);
    if (rowCount) return;
  }
  await db.query(
    `INSERT INTO quote_events (quote_id, version_no, action, actor_name, detail) VALUES ($1, $3, $4, ${actor}, $5)`,
    [quoteId, by, versionNo, action, detail]
  );
}

export async function listEvents(quoteId) {
  const { rows } = await query(
    `SELECT id, version_no, action, actor_name, detail, created_at FROM quote_events
      WHERE quote_id = $1 ORDER BY id DESC LIMIT 200`, [uuid(quoteId, 'Quote')]
  );
  return rows;
}

// ============================================
// QUOTE LEADS
// ============================================

// A lead is one customer + project (case and spacing ignored, see
// quote_lead_key() in migration 049); it holds at most one quotation.
export function parseLead(body) {
  return {
    customer: text(body.customer, 'Customer', 200, { required: true }),
    project: text(body.project, 'Project', 300, { required: true }),
    site_location: text(body.site_location, 'Location / Site', 300),
    contact_person: text(body.contact_person, 'Contact person', 200),
    account_manager_id: body.account_manager_id ? uuid(body.account_manager_id, 'Account manager') : null
  };
}

// Account managers are Sales employees; their phone prints on the quotation.
export async function listAccountManagers() {
  const { rows } = await query(
    'SELECT id, full_name, phone FROM sales WHERE is_active AND removed_at IS NULL ORDER BY full_name'
  );
  return rows;
}

// A lead may keep a manager who has since left, as long as it isn't changed.
async function assertAccountManager(id, leadId = null) {
  if (!id) return;
  const { rowCount } = await query(
    `SELECT 1 FROM sales WHERE id = $1
        AND ((is_active AND removed_at IS NULL) OR id = (SELECT account_manager_id FROM quote_leads WHERE id = $2))`,
    [id, leadId]
  );
  if (!rowCount) throw fail(400, 'Pick an active Sales employee as the account manager');
}

const duplicateLead = (row) => Object.assign(
  fail(409, `A lead for "${row.customer}" – "${row.project}" already exists. Open that one instead.`),
  { details: { code: 'DUPLICATE_LEAD', lead_id: row.id } }
);

async function assertLeadUnique(lead, excludeId = null) {
  const { rows } = await query(
    `SELECT id, customer, project FROM quote_leads
      WHERE quote_lead_key(customer) = quote_lead_key($1) AND quote_lead_key(project) = quote_lead_key($2)
        AND ($3::uuid IS NULL OR id <> $3)`,
    [lead.customer, lead.project, excludeId]
  );
  if (rows[0]) throw duplicateLead(rows[0]);
}

// The unique index is the backstop for two people saving the same lead at once.
const onLeadConflict = (lead) => async (error) => {
  if (error.code === '23505') { await assertLeadUnique(lead); throw duplicateLead({ ...lead, id: null }); }
  throw error;
};

export async function listLeads({ search } = {}) {
  const values = [];
  let where = '';
  const term = String(search || '').trim();
  if (term) {
    values.push(`%${term.replace(/[%_\\]/g, '\\$&')}%`);
    where = 'WHERE l.customer ILIKE $1 OR l.project ILIKE $1 OR l.site_location ILIKE $1';
  }
  const { rows } = await query(`
    SELECT l.id, l.customer, l.project, l.site_location, l.contact_person, l.account_manager_id,
           am.full_name AS account_manager_name, am.phone AS account_manager_phone, l.created_at, l.updated_at,
           b.full_name AS created_by_name,
           count(q.id)::int AS quote_count,
           count(q.id) FILTER (WHERE q.status = 'won')::int AS won_count,
           max(q.updated_at) AS last_quote_at,
           min(q.id::text)::uuid AS quote_id,
           min(q.status) AS quote_status
      FROM quote_leads l
      LEFT JOIN back_office b ON b.id = l.created_by
      LEFT JOIN sales am ON am.id = l.account_manager_id
      LEFT JOIN quotes q ON q.lead_id = l.id
      ${where}
     GROUP BY l.id, b.full_name, am.full_name, am.phone
     ORDER BY l.updated_at DESC`, values);
  return rows;
}

export async function createLead(body, userId) {
  const lead = parseLead(body);
  await assertLeadUnique(lead);
  await assertAccountManager(lead.account_manager_id);
  const { rows } = await query(
    `INSERT INTO quote_leads (customer, project, site_location, contact_person, account_manager_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, customer, project, site_location, contact_person, account_manager_id, created_at, updated_at`,
    [lead.customer, lead.project, lead.site_location, lead.contact_person, lead.account_manager_id, userId]
  ).catch(onLeadConflict(lead));
  return { ...rows[0], quote_count: 0, won_count: 0, quote_id: null };
}

// Editing a lead only changes drafts: issued versions keep the snapshot of
// customer / project / site they went out with.
export async function updateLead(id, body) {
  const lead = parseLead(body);
  await assertLeadUnique(lead, uuid(id, 'Lead'));
  await assertAccountManager(lead.account_manager_id, id);
  const { rows } = await query(
    `UPDATE quote_leads SET customer = $2, project = $3, site_location = $4, contact_person = $5, account_manager_id = $6
      WHERE id = $1
     RETURNING id, customer, project, site_location, contact_person, account_manager_id, created_at, updated_at`,
    [id, lead.customer, lead.project, lead.site_location, lead.contact_person, lead.account_manager_id]
  ).catch(onLeadConflict(lead));
  if (!rows[0]) throw fail(404, 'Lead not found');
  return rows[0];
}

export async function deleteLead(id) {
  const { rows } = await query('SELECT count(*)::int AS n FROM quotes WHERE lead_id = $1', [uuid(id, 'Lead')]);
  if (rows[0].n > 0) throw fail(400, `This lead has ${rows[0].n} quotation(s). Delete them first.`);
  const { rowCount } = await query('DELETE FROM quote_leads WHERE id = $1', [id]).catch((error) => {
    if (error.code === '23503') throw fail(400, 'This lead has quotations. Delete them first.');
    throw error;
  });
  if (!rowCount) throw fail(404, 'Lead not found');
}

// ============================================
// QUOTES
// ============================================

const VERSION_NUMS = ['sm', 'supply_osp', 'supply_price', 'services_osp', 'services_price', 'gst_total', 'grand_total'];
const LINE_NUMS = ['qty', 'osp_unit', 'sm_override', 'price_override', 'gst_rate'];

export async function listQuotes({ search, status } = {}) {
  const where = [];
  const values = [];
  if (status) {
    if (!QUOTE_STATUSES.includes(status)) throw fail(400, 'Unknown status');
    values.push(status);
    where.push(`q.status = $${values.length}`);
  }
  const term = String(search || '').trim();
  if (term) {
    values.push(`%${term.replace(/[%_\\]/g, '\\$&')}%`);
    const p = `$${values.length}`;
    where.push(`(l.customer ILIKE ${p} OR l.project ILIKE ${p} OR q.project_ref ILIKE ${p})`);
  }
  const { rows } = await query(`
    SELECT q.id, q.lead_id, q.project_ref, q.status, q.po_number, q.po_date::text AS po_date, q.lost_reason,
           q.created_at, q.updated_at, l.customer, l.project, l.site_location,
           b.full_name AS created_by_name,
           q.delete_requested_at, q.delete_reason, rb.full_name AS delete_requested_by_name,
           v.id AS version_id, v.version_no, v.quote_date::text AS quote_date, v.sm, v.supply_osp, v.supply_price,
           v.services_osp, v.services_price, v.gst_total, v.grand_total, v.updated_at AS version_updated_at,
           v.issued_at
      FROM quotes q
      JOIN quote_leads l ON l.id = q.lead_id
      LEFT JOIN back_office b ON b.id = q.created_by
      LEFT JOIN back_office rb ON rb.id = q.delete_requested_by
      JOIN LATERAL (
        SELECT * FROM quote_versions WHERE quote_id = q.id ORDER BY version_no DESC LIMIT 1
      ) v ON true
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY greatest(q.updated_at, v.updated_at) DESC`, values);
  return rows.map((row) => toNum(row, VERSION_NUMS));
}

const quoteExists = (quoteId) => Object.assign(
  fail(409, 'This lead already has a quotation. Open it and make a new version instead.'),
  { details: { code: 'QUOTE_EXISTS', quote_id: quoteId } }
);

// One quotation per lead (unique index quotes_lead_unique).
export async function createQuote(body, userId) {
  const leadId = uuid(body.lead_id, 'Lead');
  return withTransaction(async (client) => {
    const lead = await client.query('SELECT id FROM quote_leads WHERE id = $1 FOR UPDATE', [leadId]);
    if (!lead.rows[0]) throw fail(404, 'Lead not found');
    const existing = await client.query('SELECT id FROM quotes WHERE lead_id = $1', [leadId]);
    if (existing.rows[0]) throw quoteExists(existing.rows[0].id);
    const { rows } = await client.query(
      'INSERT INTO quotes (lead_id, project_ref, created_by) VALUES ($1, $2, $3) RETURNING id',
      [leadId, text(body.project_ref, 'Project Ref', 200), userId]
    );
    const quoteId = rows[0].id;
    const version = await client.query(
      `INSERT INTO quote_versions (quote_id, version_no, notes, terms, created_by, updated_by)
       VALUES ($1, 1, $2, $3, $4, $4) RETURNING id`,
      [quoteId, DEFAULT_NOTES, DEFAULT_TERMS, userId]
    );
    await client.query(
      `INSERT INTO quote_sections (version_id, kind, name, sort_order) VALUES ($1, 'solution', '', 0)`,
      [version.rows[0].id]
    );
    await logEvent(client, quoteId, 'created', { by: userId, versionNo: 1 });
    return { id: quoteId, version_id: version.rows[0].id };
  }).catch((error) => {
    if (error.code === '23505') throw quoteExists(null);
    throw error;
  });
}

// `editing` is the live edit lease (null when free or expired).
async function loadQuote(id, db = { query }) {
  const { rows } = await db.query(`
    SELECT q.id, q.lead_id, q.project_ref, q.status, q.po_number, q.po_date::text AS po_date, q.lost_reason,
           q.won_version_id, q.created_at, q.updated_at, l.customer, l.project, l.site_location, l.contact_person,
           am.full_name AS account_manager_name, am.phone AS account_manager_phone,
           b.full_name AS created_by_name,
           q.delete_requested_at, q.delete_reason, rb.full_name AS delete_requested_by_name,
           CASE WHEN k.expires_at > now() THEN
             json_build_object('back_office_id', k.back_office_id, 'name', kb.full_name, 'expires_at', k.expires_at)
           END AS editing
      FROM quotes q
      JOIN quote_leads l ON l.id = q.lead_id
      LEFT JOIN back_office b ON b.id = q.created_by
      LEFT JOIN back_office rb ON rb.id = q.delete_requested_by
      LEFT JOIN sales am ON am.id = l.account_manager_id
      LEFT JOIN quote_edit_locks k ON k.quote_id = q.id
      LEFT JOIN back_office kb ON kb.id = k.back_office_id
     WHERE q.id = $1`, [uuid(id, 'Quote')]);
  if (!rows[0]) throw fail(404, 'Quotation not found');
  return rows[0];
}

export async function getQuote(id) {
  const quote = await loadQuote(id);
  const { rows: versions } = await query(`
    SELECT v.id, v.version_no, v.quote_date::text AS quote_date, v.sm, v.supply_osp, v.supply_price, v.services_osp,
           v.services_price, v.gst_total, v.grand_total, v.created_at, v.updated_at, v.issued_at,
           b.full_name AS updated_by_name, ib.full_name AS issued_by_name
      FROM quote_versions v
      LEFT JOIN back_office b ON b.id = v.updated_by
      LEFT JOIN back_office ib ON ib.id = v.issued_by
     WHERE v.quote_id = $1
     ORDER BY v.version_no DESC`, [id]);
  return { ...quote, versions: versions.map((v) => toNum(v, VERSION_NUMS)) };
}

async function loadVersionContent(versionId, db = { query }) {
  const { rows: sections } = await db.query(
    'SELECT id, kind, name, sort_order FROM quote_sections WHERE version_id = $1 ORDER BY sort_order, id', [versionId]
  );
  const { rows: lines } = await db.query(`
    SELECT ln.id, ln.section_id, ln.line_type, ln.item_id, ln.category_name, ln.series, ln.model_name,
           ln.description, ln.hsn_code, ln.uom, ln.qty, ln.osp_unit, ln.sm_override, ln.price_override,
           ln.gst_rate, ln.sort_order
      FROM quote_lines ln
      JOIN quote_sections s ON s.id = ln.section_id
     WHERE s.version_id = $1
     ORDER BY ln.sort_order, ln.id`, [versionId]);
  return sections.map((section) => ({
    ...section,
    lines: lines.filter((line) => line.section_id === section.id).map((line) => toNum(line, LINE_NUMS))
  }));
}

export async function getVersion(quoteId, versionId) {
  const quote = await loadQuote(quoteId);
  const { rows } = await query(`
    -- quote_date as text: pg would map DATE to a local-midnight Date that
    -- serializes to the previous day in UTC.
    SELECT v.*, v.quote_date::text AS quote_date, ib.full_name AS issued_by_name,
           (v.version_no = (SELECT max(version_no) FROM quote_versions WHERE quote_id = v.quote_id)) AS is_latest
      FROM quote_versions v
      LEFT JOIN back_office ib ON ib.id = v.issued_by
     WHERE v.id = $1 AND v.quote_id = $2`, [uuid(versionId, 'Version'), quoteId]);
  if (!rows[0]) throw fail(404, 'Version not found');
  const version = toNum(rows[0], VERSION_NUMS);
  return { quote, version: { ...version, sections: await loadVersionContent(version.id) } };
}

// The builder posts the whole version; it replaces sections/lines wholesale.
export function parseVersionPayload(body) {
  const sm = number(body.sm, 'SM', { required: true, min: 0.01, max: 2, decimals: 4 });
  const roundingStep = Number(body.rounding_step);
  if (!ROUNDING_STEPS.includes(roundingStep)) throw fail(400, 'Rounding step must be 1, 10, 100 or 1000');
  const sections = Array.isArray(body.sections) ? body.sections : [];
  if (sections.length > MAX_SECTIONS) throw fail(400, `At most ${MAX_SECTIONS} solutions per quote`);

  return {
    // The version's updated_at the editor loaded; a mismatch means someone
    // else saved in between (see lockedCheck).
    base_updated_at: body.base_updated_at ? String(body.base_updated_at) : null,
    project_ref: text(body.project_ref, 'Project Ref', 200),
    quote_date: date(body.quote_date, 'Quote date'),
    sm,
    rounding_step: roundingStep,
    notes: text(body.notes, 'Notes', 10000),
    terms: text(body.terms, 'Terms & Conditions', 20000),
    delivery_timeline: text(body.delivery_timeline, 'Delivery timeline', 300),
    sections: sections.map((section, si) => {
      const label = `Solution ${si + 1}`;
      const kind = section.kind === 'ppm' ? 'ppm' : 'solution';
      const lines = Array.isArray(section.lines) ? section.lines : [];
      if (lines.length > MAX_LINES_PER_SECTION) throw fail(400, `${label}: at most ${MAX_LINES_PER_SECTION} lines`);
      return {
        kind,
        name: text(section.name, `${label} name`, 200) || '',
        lines: lines.map((line, li) => {
          const where = `${label}, line ${li + 1}`;
          const lineType = kind === 'ppm' || line.line_type === 'service' ? 'service' : 'supply';
          const smOverride = number(line.sm_override, `${where}: SM`, { min: 0.01, max: 2, decimals: 4 });
          const parsed = {
            line_type: lineType,
            item_id: line.item_id && UUID.test(line.item_id) ? line.item_id : null,
            category_name: text(line.category_name, `${where}: category`, 120),
            series: text(line.series, `${where}: series`, 200),
            model_name: text(line.model_name, `${where}: model`, 200),
            description: text(line.description, `${where}: description`, 2000),
            hsn_code: text(line.hsn_code, `${where}: HSN`, 20),
            uom: text(line.uom, `${where}: UOM`, 20) || 'Nos',
            qty: number(line.qty, `${where}: qty`, { max: 1e7, fallback: 0 }),
            osp_unit: number(line.osp_unit, `${where}: OSP`, { max: 1e11, fallback: 0 }),
            sm_override: smOverride,
            price_override: number(line.price_override, `${where}: price`, { max: 1e11 }),
            gst_rate: number(line.gst_rate, `${where}: GST %`, { max: 100, fallback: 18 })
          };
          if (!parsed.model_name && !parsed.description) throw fail(400, `${where}: pick an item or type a description`);
          return parsed;
        })
      };
    })
  };
}

// ---- edit lease: one editor per quotation ----

// The builder renews its lease every ~45s while the person is active; an
// abandoned tab frees the quotation once the lease runs out.
export const LOCK_SECONDS = 120;

const lockedBy = (name) => Object.assign(
  fail(409, `${name || 'Another Quote Manager'} is editing this quotation right now.`),
  { details: { code: 'LOCKED', editing_by_name: name || null } }
);

async function holdLock(client, quoteId, userId) {
  await client.query(
    `INSERT INTO quote_edit_locks (quote_id, back_office_id, expires_at)
     VALUES ($1, $2, now() + make_interval(secs => $3))
     ON CONFLICT (quote_id) DO UPDATE SET back_office_id = EXCLUDED.back_office_id, expires_at = EXCLUDED.expires_at`,
    [quoteId, userId, LOCK_SECONDS]
  );
}

// Every write to a quotation goes through here, inside a transaction: the
// quote row is locked, a pending delete freezes everything, and someone
// else's live lease blocks the write.
async function writeGuard(client, quoteId, userId) {
  await client.query('SELECT id FROM quotes WHERE id = $1 FOR UPDATE', [uuid(quoteId, 'Quote')]);
  const quote = await loadQuote(quoteId, client);
  if (quote.delete_requested_at) {
    throw fail(409, 'Deletion of this quotation is awaiting Super Admin approval. Cancel the request to make changes.');
  }
  if (quote.editing && quote.editing.back_office_id !== userId) throw lockedBy(quote.editing.name);
  return quote;
}

const assertOpen = (quote, what = 'make changes') => {
  if (quote.status === 'won' || quote.status === 'lost') {
    throw fail(409, `This quotation is marked ${quote.status.toUpperCase()}. Reopen it to ${what}.`);
  }
};

async function latestVersion(client, quoteId) {
  const { rows } = await client.query(
    'SELECT * FROM quote_versions WHERE quote_id = $1 ORDER BY version_no DESC LIMIT 1', [quoteId]
  );
  return rows[0];
}

async function lockedCheck(client, quoteId, versionId, baseUpdatedAt, userId) {
  const quote = await writeGuard(client, quoteId, userId);
  assertOpen(quote);
  const { rows } = await client.query(
    `SELECT version_no, updated_at, issued_at, (SELECT max(version_no) FROM quote_versions WHERE quote_id = $2) AS latest
       FROM quote_versions WHERE id = $1 AND quote_id = $2`,
    [uuid(versionId, 'Version'), quoteId]
  );
  if (!rows[0]) throw fail(404, 'Version not found');
  if (rows[0].version_no !== rows[0].latest) throw fail(409, 'Older versions are read-only. Edit the latest version.');
  if (rows[0].issued_at) {
    throw fail(409, `V${rows[0].version_no}.0 was issued to the client and is frozen. Start a new version to revise it.`);
  }
  // pg gives timestamptz at millisecond precision, same as the JSON the editor got.
  if (!baseUpdatedAt || rows[0].updated_at.getTime() !== Date.parse(baseUpdatedAt)) {
    throw fail(409, 'Someone else saved this quotation while you were editing. Reload to see their changes.');
  }
  return { quote, versionNo: rows[0].version_no };
}

// Freezes the latest version as sent to the client, snapshotting the lead.
// No-op when it is already issued.
async function issueLatest(client, quote, userId, detail) {
  const latest = await latestVersion(client, quote.id);
  if (latest.issued_at) return latest;
  await client.query(
    `UPDATE quote_versions SET issued_at = now(), issued_by = $2, issued_customer = $3, issued_project = $4,
            issued_site_location = $5, issued_contact_person = $6, issued_account_manager = $7,
            issued_account_manager_phone = $8 WHERE id = $1`,
    [latest.id, userId, quote.customer, quote.project, quote.site_location, quote.contact_person,
      quote.account_manager_name, quote.account_manager_phone]
  );
  await logEvent(client, quote.id, 'issued', { by: userId, versionNo: latest.version_no, detail });
  return latest;
}

async function insertContent(client, versionId, sections) {
  const itemIds = [...new Set(sections.flatMap((s) => s.lines.map((l) => l.item_id).filter(Boolean)))];
  const live = new Set();
  if (itemIds.length) {
    const { rows } = await client.query('SELECT id FROM quote_items WHERE id = ANY($1::uuid[])', [itemIds]);
    rows.forEach((row) => live.add(row.id));
  }
  for (const [si, section] of sections.entries()) {
    const { rows } = await client.query(
      'INSERT INTO quote_sections (version_id, kind, name, sort_order) VALUES ($1, $2, $3, $4) RETURNING id',
      [versionId, section.kind, section.name, si]
    );
    if (!section.lines.length) continue;
    const cols = ['section_id', 'line_type', 'item_id', 'category_name', 'series', 'model_name', 'description',
      'hsn_code', 'uom', 'qty', 'osp_unit', 'sm_override', 'price_override', 'gst_rate', 'sort_order'];
    const values = [];
    const tuples = section.lines.map((line, li) => {
      const row = [rows[0].id, line.line_type, live.has(line.item_id) ? line.item_id : null, line.category_name, line.series, line.model_name,
        line.description, line.hsn_code, line.uom, line.qty, line.osp_unit, line.sm_override, line.price_override,
        line.gst_rate, li];
      const start = values.length;
      values.push(...row);
      return `(${row.map((_, k) => `$${start + k + 1}`).join(', ')})`;
    });
    await client.query(`INSERT INTO quote_lines (${cols.join(', ')}) VALUES ${tuples.join(', ')}`, values);
  }
}

// numeric(16,2) tops out below 1e14; stop well short with a readable error.
const MAX_TOTAL = 1e13;
const totalsParams = (payload) => {
  const { totals } = computeVersion(payload);
  if (Object.values(totals).some((v) => Math.abs(v) >= MAX_TOTAL)) throw fail(400, 'Quotation amounts are too large');
  return [totals.supply_osp, totals.supply_price, totals.services_osp, totals.services_price, totals.gst_total, totals.grand_total];
};

export async function saveVersion(quoteId, versionId, body, userId) {
  const payload = parseVersionPayload(body);
  const totals = totalsParams(payload);
  await withTransaction(async (client) => {
    const { versionNo } = await lockedCheck(client, quoteId, versionId, payload.base_updated_at, userId);
    await client.query('UPDATE quotes SET project_ref = $2 WHERE id = $1', [quoteId, payload.project_ref]);
    await client.query(
      `UPDATE quote_versions SET quote_date = $2, sm = $3, rounding_step = $4, notes = $5, updated_by = $6,
              supply_osp = $7, supply_price = $8, services_osp = $9, services_price = $10, gst_total = $11, grand_total = $12,
              terms = $13, delivery_timeline = $14
        WHERE id = $1`,
      [versionId, payload.quote_date, payload.sm, payload.rounding_step, payload.notes, userId, ...totals,
        payload.terms, payload.delivery_timeline]
    );
    await client.query('DELETE FROM quote_sections WHERE version_id = $1', [versionId]);
    await insertContent(client, versionId, payload.sections);
    // Saving is editing: the saver holds (or renews) the lease.
    await holdLock(client, quoteId, userId);
    await logEvent(client, quoteId, 'saved', { by: userId, versionNo });
  });
  return getVersion(quoteId, versionId);
}

// Clones the latest version into V(n+1); the previous one becomes read-only.
// The quote keeps its status — a revision of a quote with the client is
// still Under Process.
export async function createNextVersion(quoteId, userId) {
  const newId = await withTransaction(async (client) => {
    const quote = await writeGuard(client, quoteId, userId);
    assertOpen(quote, 'make a new version');
    const latest = await latestVersion(client, quoteId);
    const sections = await loadVersionContent(latest.id, client);
    const inserted = await client.query(
      `INSERT INTO quote_versions (quote_id, version_no, sm, rounding_step, notes, supply_osp, supply_price,
              services_osp, services_price, gst_total, grand_total, created_by, updated_by, terms, delivery_timeline)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12, $13, $14) RETURNING id`,
      [quoteId, latest.version_no + 1, latest.sm, latest.rounding_step, latest.notes, latest.supply_osp,
        latest.supply_price, latest.services_osp, latest.services_price, latest.gst_total, latest.grand_total, userId,
        latest.terms, latest.delivery_timeline]
    );
    await insertContent(client, inserted.rows[0].id, sections);
    await client.query('UPDATE quotes SET updated_at = now() WHERE id = $1', [quoteId]);
    await holdLock(client, quoteId, userId);
    await logEvent(client, quoteId, 'version_created', {
      by: userId, versionNo: latest.version_no + 1, detail: `Copied from V${latest.version_no}.0`
    });
    return inserted.rows[0].id;
  });
  return { version_id: newId };
}

const EXPORT_LABELS = { pdf: 'PDF', xlsx: 'Excel' };

// Client export of the latest draft: freezes it as sent to the client.
export async function issueVersion(quoteId, versionId, body, userId) {
  const label = EXPORT_LABELS[body.format] ? `Client ${EXPORT_LABELS[body.format]}` : 'Issued to client';
  await withTransaction(async (client) => {
    const quote = await writeGuard(client, quoteId, userId);
    assertOpen(quote, 'issue it');
    const latest = await latestVersion(client, quoteId);
    if (latest.id !== uuid(versionId, 'Version')) throw fail(409, 'Only the latest version can be issued.');
    await issueLatest(client, quote, userId, label);
  });
  return getVersion(quoteId, versionId);
}

// Logged for the history; exporting never changes the quotation.
export async function recordExport(quoteId, versionId, body, { by, admin }) {
  const format = EXPORT_LABELS[body.format];
  if (!format) throw fail(400, 'Unknown export format');
  const { rows } = await query('SELECT version_no FROM quote_versions WHERE id = $1 AND quote_id = $2',
    [uuid(versionId, 'Version'), uuid(quoteId, 'Quote')]);
  if (!rows[0]) throw fail(404, 'Version not found');
  await logEvent({ query }, quoteId, 'exported', {
    by, admin, versionNo: rows[0].version_no, detail: `${body.internal ? 'Internal' : 'Client'} ${format}`
  });
}

export function parseStatus(body) {
  const status = String(body.status || '');
  if (!QUOTE_STATUSES.includes(status)) throw fail(400, 'Unknown status');
  if (status === 'won') {
    return {
      status,
      po_number: text(body.po_number, 'PO number', 100, { required: true }),
      po_date: date(body.po_date, 'PO date'),
      lost_reason: null
    };
  }
  if (status === 'lost') {
    return { status, po_number: null, po_date: null, lost_reason: text(body.lost_reason, 'Loss reason', 1000, { required: true }) };
  }
  return { status, po_number: null, po_date: null, lost_reason: null };
}

const STATUS_LABELS = { draft: 'Draft', sent: 'Under Process', won: 'Won', lost: 'Lost' };

// Under Process and Won mean the client has the latest version, so it is
// issued (frozen) on the way; Won also records which version won.
export async function setQuoteStatus(id, body, userId) {
  const next = parseStatus(body);
  await withTransaction(async (client) => {
    const quote = await writeGuard(client, id, userId);
    let wonVersionId = null;
    if (next.status === 'sent' || next.status === 'won') {
      const issued = await issueLatest(client, quote, userId, `Marked ${STATUS_LABELS[next.status]}`);
      if (next.status === 'won') wonVersionId = issued.id;
    }
    await client.query(
      'UPDATE quotes SET status = $2, po_number = $3, po_date = $4, lost_reason = $5, won_version_id = $6 WHERE id = $1',
      [id, next.status, next.po_number, next.po_date, next.lost_reason, wonVersionId]
    );
    const latest = await latestVersion(client, id);
    const detail = next.status === 'won' ? `PO ${next.po_number} · ${next.po_date}`
      : next.status === 'lost' ? next.lost_reason : null;
    await logEvent(client, id, `status_${next.status}`, { by: userId, versionNo: latest.version_no, detail });
  });
  return getQuote(id);
}

// ---- edit lease endpoints ----

// Takes (or renews) the lease when it is free, expired or already ours.
// Someone else's live lease is only replaced with `takeover`.
export async function acquireLock(quoteId, body, userId) {
  return withTransaction(async (client) => {
    await client.query('SELECT id FROM quotes WHERE id = $1 FOR UPDATE', [uuid(quoteId, 'Quote')]);
    const quote = await loadQuote(quoteId, client);
    const other = quote.editing && quote.editing.back_office_id !== userId ? quote.editing : null;
    if (other && body.takeover !== true) return { mine: false, editing: other };
    await holdLock(client, quoteId, userId);
    if (other) {
      const latest = await latestVersion(client, quoteId);
      await logEvent(client, quoteId, 'lock_taken_over', { by: userId, versionNo: latest.version_no, detail: `from ${other.name || 'another manager'}` });
    }
    const { editing } = await loadQuote(quoteId, client);
    return { mine: true, editing };
  });
}

export async function releaseLock(quoteId, userId) {
  await query('DELETE FROM quote_edit_locks WHERE quote_id = $1 AND back_office_id = $2', [uuid(quoteId, 'Quote'), userId]);
}

// ---- deletion: a Quote Manager asks, the Super Admin decides ----

export async function requestDelete(id, body, userId) {
  const reason = text(body.reason, 'Reason', 1000, { required: true });
  await withTransaction(async (client) => {
    await writeGuard(client, id, userId);
    await client.query(
      'UPDATE quotes SET delete_requested_by = $2, delete_requested_at = now(), delete_reason = $3 WHERE id = $1',
      [id, userId, reason]
    );
    await client.query('DELETE FROM quote_edit_locks WHERE quote_id = $1', [id]);
    await logEvent(client, id, 'delete_requested', { by: userId, detail: reason });
  });
  return getQuote(id);
}

async function pendingDelete(client, id) {
  await client.query('SELECT id FROM quotes WHERE id = $1 FOR UPDATE', [uuid(id, 'Quote')]);
  const quote = await loadQuote(id, client);
  if (!quote.delete_requested_at) throw fail(409, 'There is no pending delete request for this quotation.');
  return quote;
}

const clearDeleteRequest = (client, id) => client.query(
  'UPDATE quotes SET delete_requested_by = NULL, delete_requested_at = NULL, delete_reason = NULL WHERE id = $1', [id]
);

export async function cancelDeleteRequest(id, userId) {
  await withTransaction(async (client) => {
    await pendingDelete(client, id);
    await clearDeleteRequest(client, id);
    await logEvent(client, id, 'delete_cancelled', { by: userId });
  });
  return getQuote(id);
}

export async function rejectDelete(id, body, adminId) {
  const note = text(body.note, 'Note', 1000);
  await withTransaction(async (client) => {
    await pendingDelete(client, id);
    await clearDeleteRequest(client, id);
    await logEvent(client, id, 'delete_rejected', { by: adminId, admin: true, detail: note });
  });
  return getQuote(id);
}

// The lead stays, so a fresh quotation can be started from it afterwards.
export async function approveDelete(id, adminId) {
  await withTransaction(async (client) => {
    const quote = await pendingDelete(client, id);
    await logEvent(client, id, 'deleted', {
      by: adminId, admin: true, detail: `${quote.customer} – ${quote.project} (asked by ${quote.delete_requested_by_name || 'a Quote Manager'}: ${quote.delete_reason})`
    });
    await client.query('DELETE FROM quotes WHERE id = $1', [id]);
  });
}

// ============================================
// QUOTE MANAGERS (Super Admin, from the Back-Office roster)
// ============================================

export async function listQuoteManagerIds() {
  const { rows } = await query('SELECT back_office_id FROM quote_managers');
  return rows.map((row) => row.back_office_id);
}

export async function setQuoteManager(backOfficeId, enabled, adminId) {
  uuid(backOfficeId, 'Back-Office employee');
  if (enabled) {
    const { rows } = await query('SELECT is_active FROM back_office WHERE id = $1', [backOfficeId]);
    if (!rows[0]) throw fail(404, 'Back-Office employee not found');
    if (!rows[0].is_active) throw fail(400, 'This employee is no longer active');
    await query(
      'INSERT INTO quote_managers (back_office_id, granted_by) VALUES ($1, $2) ON CONFLICT (back_office_id) DO NOTHING',
      [backOfficeId, adminId]
    );
  } else {
    await query('DELETE FROM quote_managers WHERE back_office_id = $1', [backOfficeId]);
  }
  return { back_office_id: backOfficeId, is_quote_manager: Boolean(enabled) };
}
