// Quotation module — catalog (brands, categories, items), quote leads, and quotes
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
// One paragraph per line. The exports lay it out by its markers: "I." /
// "II." headings, "a)" sub-points, "•" bullets; any other line continues
// the point above it.
export const DEFAULT_TERMS = [
  'I. Commercial Terms & Conditions',
  'a) Price: Supply Scope - Prices are in Indian Rupees FOR - Site within city limits and Freight is extra - 2% by Road, 5% by Air for other states.',
  'Installation & commissioning charges - Does not include the cost for Electrical / Carpentry and civil works unless otherwise specifically mentioned.',
  'b) Taxes: Taxes are extra as per details mentioned below:',
  'Supply Items: GST extra as applicable at the time of billing @ rate of 18% as shown.',
  'Professional Services: GST is applicable @ 18%.',
  'Both tax rates mentioned above are as per the current applicable rates and in the event of any change in the statutory taxes as per GST Regulations, the same shall be borne by the customer or normalised as per GST Notification.',
  'c) Payment Terms: 50% Advance Payment along with clear PO and 45% against the Supply and balance on installation.',
  'Professional Service payment 50% Advance for work to Commence and balance after installation.',
  '"In the event of site not ready condition to start implementation even after 30 days from the materials delivery date at site, client should agree to release the pending payments. Tasktel is committed to take up the implementation once the client notifies / intimates the site readiness."',
  'd) Delivery: Upon receipt of the equipment at site and release of delivery payment, installation & commissioning will start, provided the site is ready.',
  'Special Note: Client to provide the permission for Service Lift operation to lift the Materials in high Rise Buildings. If such permission/facility is not available, then the incidental expenses towards porter services have to be paid by the Client to lift the Materials to upper floors.',
  'e) Jurisdiction: Courts of Bengaluru.',
  'f) Order Placement: The order is to be placed in favor of:',
  'Tasktel Technologees Pvt. Ltd.',
  '\'Tasktel House\', 169, 9th Cross, 5th Main, Indiranagar 1st Stage, Bengaluru – 560 038, Karnataka, India',
  'Tel: 41126243 / 41267725 | www.taskteltechnologees.com',
  'GST: 29AACCT8707G1Z3 | CIN: U72200KA2008PTC045083',
  'g) Validity: Our offered price is valid for 15 days from the offer date. After the validity period is over, we reserve the right to revalidate and revise part or all of our offer.',
  'II. General Terms & Conditions',
  'a) Warranty: All AV Electronics Equipment shall be warranted against defective design, material and our workmanship for 12 months from the date of Installation or 13 months from the date of delivery whichever is earlier as per OEM Standard Policy and all Pro / Commercial Display gets 3 Years Warranty from OEM. Please note, Consumables items like Projector Lamps, Batteries, Display Panels are not covered under warranty.',
  'b) Force Majeure: Tasktel shall be under no liability for failure to deliver goods within the time specified, if such failure is due to Act of God, war, fire, earthquakes, floods, strikes, lockout, transportation and other causes which are beyond control.',
  'c) Part Order: The prices are valid subject to placing order for all the equipment and services offered herewith. If part order is placed, the same shall be subject to specific confirmation.',
  'd) Alterations / Amendments: All items quoted are non-cancellable and non-returnable (NCNR). Any addition/deletion in scope of supply and consequent price variations in value shall be settled by mutual consent and necessary order amendment should be released subsequently. Such amendments would result changes in delivery schedule as well as prices. Goods once delivered will not be allowed to Return/Reverse as these goods are procured on your project specific. Customer has to accept and bear the cost for such materials.',
  'e) Packing: As per supplier\'s standard packing only.',
  'f) Storage Space: Client to provide storage space at the project site with Safety Lock and under the security surveillance to store and safe keeping of all the Equipment and tools.',
  'III. Containments for AV Spaces',
  'The following facilities and services are not under our scope and are to be provided by the client:',
  '• Site preparation including carpentry, civil masonry work, provision for stable UPS Power supply 230V AC with suitable socket etc.',
  '• Ply Back Support re-inforcement in the partition wall to mount Display/Camera & Necessary Electrical Power Points, Network Ports to be provided by client as per our Shop Drawings.',
  '• All necessary Conduiting / Raceway / Cable Tray for laying Professional AV Cables has to be provided by client before commencement of building the AV Infrastructure work.',
  '• AV Racks needs good Air Ventilation / proper cooling. Client to provide all necessary Air Vents / Louvers to maintain the Room Temperature.',
  '• If the AV Rack is placed in open space, then client to provide AC Vent to cool the AV Electronics inside the AV Rack at Room Temperature which is must for safety and proper operating condition of any Electronic Devices.',
  '• Scaffolding or Man Lift, if required at the site will be under Client\'s Scope.',
  '• All required PC / Server Hardware / Software to be provided by client as per our technical notes / datasheet.',
  '• Client to provide dedicated IP Backbone / Switched Ethernet Port and Copper cable infrastructure to all the user points captured as per our AV Shop Drawings.'
].join('\n');

export const DEFAULT_DELIVERY = '4 – 6 weeks from the date of receipt of technically and commercially clear order along with the advance.';

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

// Product links print as clickable links, so only http(s). A bare
// "www.lg.com" gets https:// rather than being refused mid-typing.
function link(value, label) {
  const s = text(value, label, 1000);
  if (!s) return null;
  const href = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
  let url;
  try { url = new URL(href); } catch { url = null; }
  if (!url || !['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.')) {
    throw fail(400, `${label} must be a web address (https://…)`);
  }
  return href;
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
// CATALOG: GROUPS (brands) > CATEGORIES > ITEMS
// ============================================
// Rules (migration 053): a group is a brand; categories are one shared list
// a group links to; an item is identified by group + model no. New and
// edited items need all three, plus an HSN (goods) or SAC (services) code. Items imported before 053 have no category
// or model no yet; the clean-up actions below exist to sort them.

const nameTaken = (what) => (error) => {
  if (error.code === '23505') throw fail(400, `A ${what} with this name already exists`);
  throw error;
};

// After items move, make sure each group links to the categories its items use.
async function linkUsedCategories(db, groupIds) {
  await db.query(
    `INSERT INTO quote_group_categories (group_id, category_id)
     SELECT DISTINCT group_id, category_id FROM quote_items
      WHERE group_id = ANY($1::uuid[]) AND category_id IS NOT NULL
     ON CONFLICT DO NOTHING`,
    [groupIds]
  );
}

// Model nos that would collide if `itemIds` moved into `groupId`.
async function modelNoClashes(db, itemIds, groupId) {
  const { rows } = await db.query(
    `SELECT DISTINCT m.model_no FROM quote_items m
       JOIN quote_items o ON o.group_id = $2 AND o.id <> m.id
                         AND lower(btrim(o.model_no)) = lower(btrim(m.model_no))
      WHERE m.id = ANY($1::uuid[]) AND m.model_no IS NOT NULL AND NOT (o.id = ANY($1::uuid[]))`,
    [itemIds, groupId]
  );
  // Two of the moving items (from different brands, or with none) may share one.
  const { rows: among } = await db.query(
    `SELECT min(model_no) AS model_no FROM quote_items
      WHERE id = ANY($1::uuid[]) AND model_no IS NOT NULL
      GROUP BY lower(btrim(model_no)) HAVING count(*) > 1`,
    [itemIds]
  );
  return [...new Set([...rows, ...among].map((r) => r.model_no))];
}

const clashError = (models) =>
  fail(400, `Model no ${models.slice(0, 5).join(', ')}${models.length > 5 ? '…' : ''} would then appear twice in the same brand. Change or delete the duplicate first.`);

export async function listGroups() {
  const { rows } = await query(`
    SELECT g.id, g.name, g.created_at, g.updated_at,
           (SELECT count(*)::int FROM quote_items i WHERE i.group_id = g.id) AS item_count,
           (SELECT count(*)::int FROM quote_items i
             WHERE i.group_id = g.id AND (i.category_id IS NULL OR i.model_no IS NULL OR i.hsn_code IS NULL)) AS to_fix_count,
           COALESCE((
             SELECT json_agg(json_build_object(
                      'id', c.id, 'name', c.name,
                      'item_count', (SELECT count(*) FROM quote_items i WHERE i.group_id = g.id AND i.category_id = c.id)
                    ) ORDER BY lower(c.name))
               FROM quote_group_categories gc JOIN quote_categories c ON c.id = gc.category_id
              WHERE gc.group_id = g.id), '[]') AS categories
      FROM quote_groups g
     ORDER BY lower(g.name)`);
  return rows;
}

export async function createGroup(body, userId) {
  const name = text(body.name, 'Brand name', 120, { required: true });
  const { rows } = await query(
    'INSERT INTO quote_groups (name, created_by) VALUES ($1, $2) RETURNING id, name, created_at, updated_at',
    [name, userId]
  ).catch(nameTaken('brand'));
  return { ...rows[0], item_count: 0, to_fix_count: 0, categories: [] };
}

export async function renameGroup(id, body) {
  const name = text(body.name, 'Brand name', 120, { required: true });
  const { rows } = await query(
    'UPDATE quote_groups SET name = $2 WHERE id = $1 RETURNING id, name, created_at, updated_at',
    [uuid(id, 'Brand'), name]
  ).catch(nameTaken('brand'));
  if (!rows[0]) throw fail(404, 'Brand not found');
  return rows[0];
}

export async function deleteGroup(id) {
  const { rows } = await query('SELECT count(*)::int AS n FROM quote_items WHERE group_id = $1', [uuid(id, 'Brand')]);
  if (rows[0].n > 0) throw fail(400, `This brand still has ${rows[0].n} item(s). Move them first.`);
  const { rowCount } = await query('DELETE FROM quote_groups WHERE id = $1', [id]).catch((error) => {
    if (error.code === '23503') throw fail(400, 'This brand still has items. Move them first.');
    throw error;
  });
  if (!rowCount) throw fail(404, 'Brand not found');
}

// Clean-up: move every item of one brand into another (e.g. "Krammer" →
// "Kramer"), keep its categories, and remove the now-empty brand.
export async function mergeGroup(id, body) {
  const from = uuid(id, 'Brand');
  const into = uuid(body.into_group_id, 'Target brand');
  if (from === into) throw fail(400, 'Pick a different brand to merge into');
  return withTransaction(async (client) => {
    const { rows: found } = await client.query('SELECT id FROM quote_groups WHERE id = ANY($1::uuid[]) FOR UPDATE', [[from, into]]);
    if (found.length !== 2) throw fail(404, 'Brand not found');
    const { rows: items } = await client.query('SELECT id FROM quote_items WHERE group_id = $1', [from]);
    const ids = items.map((r) => r.id);
    const clashes = await modelNoClashes(client, ids, into);
    if (clashes.length) throw clashError(clashes);
    await client.query('UPDATE quote_items SET group_id = $2 WHERE group_id = $1', [from, into]);
    await client.query(
      `INSERT INTO quote_group_categories (group_id, category_id)
       SELECT $2, category_id FROM quote_group_categories WHERE group_id = $1 ON CONFLICT DO NOTHING`,
      [from, into]
    );
    await client.query('DELETE FROM quote_groups WHERE id = $1', [from]);
    return { moved: ids.length };
  });
}

// Clean-up: a "brand" that is really a product type (e.g. "AV Switching").
// Its items get that category (unless already sorted) and move to the chosen
// brand, or to no brand for the team to set one by one. The brand is removed.
export async function groupToCategory(id, body, userId) {
  const from = uuid(id, 'Brand');
  const into = body.into_group_id ? uuid(body.into_group_id, 'Target brand') : null;
  if (into === from) throw fail(400, 'Pick a different brand for these items');
  return withTransaction(async (client) => {
    const { rows: groups } = await client.query('SELECT id, name FROM quote_groups WHERE id = $1 FOR UPDATE', [from]);
    if (!groups[0]) throw fail(404, 'Brand not found');
    if (into) {
      const { rows } = await client.query('SELECT id FROM quote_groups WHERE id = $1', [into]);
      if (!rows[0]) throw fail(404, 'Target brand not found');
    }
    const { rows: cat } = await client.query(
      `INSERT INTO quote_categories (name, created_by) VALUES ($1, $2)
       ON CONFLICT ((lower(btrim(name)))) DO UPDATE SET name = quote_categories.name
       RETURNING id, name`,
      [groups[0].name, userId]
    );
    const { rows: items } = await client.query('SELECT id FROM quote_items WHERE group_id = $1', [from]);
    const ids = items.map((r) => r.id);
    // Model nos are kept even with no brand (the unique rule only bites once
    // a brand is set, and setting one checks for clashes first).
    if (into) {
      const clashes = await modelNoClashes(client, ids, into);
      if (clashes.length) throw clashError(clashes);
    }
    await client.query(
      'UPDATE quote_items SET category_id = COALESCE(category_id, $2), group_id = $3 WHERE group_id = $1',
      [from, cat[0].id, into]
    );
    if (into) await linkUsedCategories(client, [into]);
    await client.query('DELETE FROM quote_groups WHERE id = $1', [from]);
    return { moved: ids.length, category: cat[0] };
  });
}

// ---- shared categories ----

export async function listCategories() {
  const { rows } = await query(`
    SELECT c.id, c.name, c.created_at, c.updated_at,
           (SELECT count(*)::int FROM quote_items i WHERE i.category_id = c.id) AS item_count,
           (SELECT count(*)::int FROM quote_group_categories gc WHERE gc.category_id = c.id) AS group_count
      FROM quote_categories c
     ORDER BY lower(c.name)`);
  return rows;
}

// Optionally linked straight into a brand (the usual way to add one).
export async function createCategory(body, userId) {
  const name = text(body.name, 'Category name', 120, { required: true });
  const groupId = body.group_id ? uuid(body.group_id, 'Brand') : null;
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      'INSERT INTO quote_categories (name, created_by) VALUES ($1, $2) RETURNING id, name, created_at, updated_at',
      [name, userId]
    ).catch(nameTaken('category'));
    if (groupId) {
      await client.query('INSERT INTO quote_group_categories (group_id, category_id) VALUES ($1, $2)', [groupId, rows[0].id])
        .catch((error) => { if (error.code === '23503') throw fail(404, 'Brand not found'); throw error; });
    }
    return { ...rows[0], item_count: 0, group_count: groupId ? 1 : 0 };
  });
}

// Renames it for every brand that uses it.
export async function renameCategory(id, body) {
  const name = text(body.name, 'Category name', 120, { required: true });
  const { rows } = await query(
    'UPDATE quote_categories SET name = $2 WHERE id = $1 RETURNING id, name, created_at, updated_at',
    [uuid(id, 'Category'), name]
  ).catch(nameTaken('category'));
  if (!rows[0]) throw fail(404, 'Category not found');
  return rows[0];
}

export async function deleteCategory(id) {
  const { rows } = await query(
    `SELECT (SELECT count(*)::int FROM quote_items WHERE category_id = $1) AS items,
            (SELECT count(*)::int FROM quote_group_categories WHERE category_id = $1) AS groups`,
    [uuid(id, 'Category')]
  );
  if (rows[0].items > 0) throw fail(400, `This category still has ${rows[0].items} item(s). Move them first.`);
  if (rows[0].groups > 0) throw fail(400, `${rows[0].groups} brand(s) still use this category. Remove it from them first.`);
  const { rowCount } = await query('DELETE FROM quote_categories WHERE id = $1', [id]).catch((error) => {
    if (error.code === '23503') throw fail(400, 'This category is still in use.');
    throw error;
  });
  if (!rowCount) throw fail(404, 'Category not found');
}

export async function linkCategory(groupId, categoryId) {
  await query(
    'INSERT INTO quote_group_categories (group_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [uuid(groupId, 'Brand'), uuid(categoryId, 'Category')]
  ).catch((error) => { if (error.code === '23503') throw fail(404, 'Brand or category not found'); throw error; });
}

export async function unlinkCategory(groupId, categoryId) {
  const { rows } = await query(
    'SELECT count(*)::int AS n FROM quote_items WHERE group_id = $1 AND category_id = $2',
    [uuid(groupId, 'Brand'), uuid(categoryId, 'Category')]
  );
  if (rows[0].n > 0) throw fail(400, `${rows[0].n} item(s) of this brand are in this category. Move them first.`);
  await query('DELETE FROM quote_group_categories WHERE group_id = $1 AND category_id = $2', [groupId, categoryId]);
}

// ============================================
// ITEMS
// ============================================

const ITEM_SELECT = `
  SELECT i.id, i.group_id, g.name AS group_name, i.category_id, c.name AS category_name, i.model_no,
         i.series, i.model_name, i.hsn_code, i.price, i.gst_rate, i.remark, i.product_link,
         (i.group_id IS NULL OR i.category_id IS NULL OR i.model_no IS NULL OR i.hsn_code IS NULL) AS needs_fix,
         i.created_at, i.updated_at
    FROM quote_items i
    LEFT JOIN quote_groups g ON g.id = i.group_id
    LEFT JOIN quote_categories c ON c.id = i.category_id`;

const itemRow = (row) => toNum(row, ['price', 'gst_rate']);

export function parseItem(body) {
  return {
    group_id: uuid(body.group_id, 'Brand'),
    category_id: uuid(body.category_id, 'Category'),
    model_no: text(body.model_no, 'Model no', 100, { required: true }),
    series: text(body.series, 'Series', 200),
    model_name: text(body.model_name, 'Description', 200, { required: true }),
    hsn_code: text(body.hsn_code, 'HSN/SAC code', 20, { required: true }),
    price: number(body.price, 'Price', { required: true, max: 1e11 }),
    gst_rate: number(body.gst_rate, 'GST %', { max: 100, fallback: 18 }),
    remark: text(body.remark, 'Model name / make', 1000),
    product_link: link(body.product_link, 'Product link')
  };
}

const itemTaken = (error) => {
  if (error.code === '23505') {
    if (error.constraint === 'quote_items_group_model_no_unique') throw fail(400, 'This brand already has an item with this model no');
    throw fail(400, 'An item with this description already exists');
  }
  if (error.code === '23503') throw fail(400, 'Brand or category not found');
  throw error;
};

const NEEDS = {
  any: '(i.group_id IS NULL OR i.category_id IS NULL OR i.model_no IS NULL OR i.hsn_code IS NULL)',
  group: 'i.group_id IS NULL',
  category: 'i.category_id IS NULL',
  model_no: 'i.model_no IS NULL',
  hsn: 'i.hsn_code IS NULL',
  done: '(i.group_id IS NOT NULL AND i.category_id IS NOT NULL AND i.model_no IS NOT NULL AND i.hsn_code IS NOT NULL)'
};

// group_id may be 'none' (items with no brand). needs_fix: any | group |
// category | model_no | hsn | done.
export async function listItems({ search, group_id, category_id, needs_fix, page = 1, limit = 50 } = {}) {
  const where = [];
  const values = [];
  if (group_id === 'none') where.push('i.group_id IS NULL');
  else if (group_id) {
    values.push(uuid(group_id, 'Brand'));
    where.push(`i.group_id = $${values.length}`);
  }
  if (category_id) {
    values.push(uuid(category_id, 'Category'));
    where.push(`i.category_id = $${values.length}`);
  }
  if (needs_fix) {
    if (!NEEDS[needs_fix]) throw fail(400, 'Unknown clean-up filter');
    where.push(NEEDS[needs_fix]);
  }
  const term = String(search || '').trim();
  if (term) {
    values.push(`%${term.replace(/[%_\\]/g, '\\$&')}%`);
    const p = `$${values.length}`;
    where.push(`(i.model_name ILIKE ${p} OR i.model_no ILIKE ${p} OR i.series ILIKE ${p} OR i.hsn_code ILIKE ${p}
                 OR i.remark ILIKE ${p} OR g.name ILIKE ${p} OR c.name ILIKE ${p})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const size = Math.min(Math.max(Number.parseInt(limit, 10) || 50, 1), 200);
  const offset = (Math.max(Number.parseInt(page, 10) || 1, 1) - 1) * size;

  const [{ rows }, { rows: countRows }] = await Promise.all([
    query(`${ITEM_SELECT} ${whereSql}
           ORDER BY lower(g.name) NULLS FIRST, lower(c.name) NULLS FIRST, lower(i.series) NULLS FIRST, lower(i.model_name)
           LIMIT ${size} OFFSET ${offset}`, values),
    query(`SELECT count(*)::int AS n FROM quote_items i
             LEFT JOIN quote_groups g ON g.id = i.group_id
             LEFT JOIN quote_categories c ON c.id = i.category_id ${whereSql}`, values)
  ]);
  return { rows: rows.map(itemRow), total: countRows[0].n, page: offset / size + 1, limit: size };
}

export async function catalogSummary() {
  const { rows } = await query(`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE ${NEEDS.any})::int AS to_fix,
           count(*) FILTER (WHERE ${NEEDS.group})::int AS no_group,
           count(*) FILTER (WHERE ${NEEDS.category})::int AS no_category,
           count(*) FILTER (WHERE ${NEEDS.model_no})::int AS no_model_no,
           count(*) FILTER (WHERE ${NEEDS.hsn})::int AS no_hsn
      FROM quote_items i`);
  return rows[0];
}

async function getItem(id) {
  const { rows } = await query(`${ITEM_SELECT} WHERE i.id = $1`, [id]);
  if (!rows[0]) throw fail(404, 'Item not found');
  return itemRow(rows[0]);
}

export async function createItem(body, userId) {
  const item = parseItem(body);
  const id = await withTransaction(async (client) => {
    await client.query('INSERT INTO quote_group_categories (group_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [item.group_id, item.category_id]).catch(itemTaken);
    const { rows } = await client.query(
      `INSERT INTO quote_items (group_id, category_id, model_no, series, model_name, hsn_code, price, gst_rate, remark,
                                product_link, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11) RETURNING id`,
      [item.group_id, item.category_id, item.model_no, item.series, item.model_name, item.hsn_code, item.price,
        item.gst_rate, item.remark, item.product_link, userId]
    ).catch(itemTaken);
    return rows[0].id;
  });
  return getItem(id);
}

export async function updateItem(id, body, userId) {
  const item = parseItem(body);
  await withTransaction(async (client) => {
    await client.query('INSERT INTO quote_group_categories (group_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [item.group_id, item.category_id]).catch(itemTaken);
    const { rowCount } = await client.query(
      `UPDATE quote_items SET group_id = $2, category_id = $3, model_no = $4, series = $5, model_name = $6, hsn_code = $7,
              price = $8, gst_rate = $9, remark = $10, product_link = $11, updated_by = $12
        WHERE id = $1`,
      [uuid(id, 'Item'), item.group_id, item.category_id, item.model_no, item.series, item.model_name, item.hsn_code,
        item.price, item.gst_rate, item.remark, item.product_link, userId]
    ).catch(itemTaken);
    if (!rowCount) throw fail(404, 'Item not found');
  });
  return getItem(id);
}

// Clean-up: set brand and/or category on many items at once. Only the keys
// present in the body change.
export async function bulkSetItems(body, userId) {
  const ids = Array.isArray(body.ids) ? body.ids : [];
  if (!ids.length) throw fail(400, 'No items selected');
  if (ids.length > 1000) throw fail(400, 'Change at most 1000 items at a time');
  ids.forEach((id) => uuid(id, 'Item'));
  const groupId = body.group_id ? uuid(body.group_id, 'Brand') : null;
  const categoryId = body.category_id ? uuid(body.category_id, 'Category') : null;
  if (!groupId && !categoryId) throw fail(400, 'Choose a brand or a category');
  return withTransaction(async (client) => {
    if (groupId) {
      const clashes = await modelNoClashes(client, ids, groupId);
      if (clashes.length) throw clashError(clashes);
    }
    const { rowCount } = await client.query(
      `UPDATE quote_items SET group_id = COALESCE($2, group_id), category_id = COALESCE($3, category_id), updated_by = $4
        WHERE id = ANY($1::uuid[])`,
      [ids, groupId, categoryId, userId]
    ).catch(itemTaken);
    const { rows } = await client.query(
      'SELECT DISTINCT group_id FROM quote_items WHERE id = ANY($1::uuid[]) AND group_id IS NOT NULL', [ids]);
    await linkUsedCategories(client, rows.map((r) => r.group_id));
    return { updated: rowCount };
  });
}

// Clean-up: set model nos ([{ id, model_no }]). One already used in the same
// brand is skipped and reported, the rest are saved.
export async function setModelNos(body, userId) {
  const list = Array.isArray(body.items) ? body.items : [];
  if (!list.length) throw fail(400, 'Nothing to save');
  if (list.length > 1000) throw fail(400, 'Save at most 1000 at a time');
  const parsed = list.map((row) => ({ id: uuid(row?.id, 'Item'), model_no: text(row.model_no, 'Model no', 100) }));
  return withTransaction(async (client) => {
    let updated = 0;
    const skipped = [];
    for (const row of parsed) {
      const { rowCount } = await client.query(
        `UPDATE quote_items i SET model_no = $2, updated_by = $3
          WHERE i.id = $1 AND ($2::text IS NULL OR NOT EXISTS (
                SELECT 1 FROM quote_items o
                 WHERE o.id <> i.id AND o.group_id = i.group_id AND lower(btrim(o.model_no)) = lower(btrim($2))))`,
        [row.id, row.model_no, userId]
      );
      if (rowCount) updated += 1;
      else skipped.push({ id: row.id, model_no: row.model_no });
    }
    return { updated, skipped };
  });
}

// Clean-up: fill in HSN/SAC codes ([{ id, hsn_code }]).
export async function setHsnCodes(body, userId) {
  const list = Array.isArray(body.items) ? body.items : [];
  if (!list.length) throw fail(400, 'Nothing to save');
  if (list.length > 1000) throw fail(400, 'Save at most 1000 at a time');
  const parsed = list.map((row) => ({ id: uuid(row?.id, 'Item'), hsn_code: text(row.hsn_code, 'HSN/SAC code', 20) }));
  return withTransaction(async (client) => {
    let updated = 0;
    for (const row of parsed) {
      const { rowCount } = await client.query('UPDATE quote_items SET hsn_code = $2, updated_by = $3 WHERE id = $1',
        [row.id, row.hsn_code, userId]);
      updated += rowCount;
    }
    return { updated };
  });
}

export async function deleteItems(ids) {
  if (!Array.isArray(ids) || ids.length === 0) throw fail(400, 'No items selected');
  if (ids.length > 1000) throw fail(400, 'Delete at most 1000 items at a time');
  ids.forEach((id) => uuid(id, 'Item'));
  // Saved quotes keep their copied item fields (quote_lines.item_id → NULL).
  const { rowCount } = await query('DELETE FROM quote_items WHERE id = ANY($1::uuid[])', [ids]);
  return { deleted: rowCount };
}

// Excel import: rows are { group, category, model_no, model_name, series,
// hsn_code, price, gst_rate, remark, product_link }. Missing brands and
// categories are created. A row updates the item with the same brand + model
// no, else the item with the same description (this is how an exported,
// filled-in clean-up sheet is read back), else adds a new item.
// All-or-nothing: any invalid row rejects the whole file with every row's
// error listed.
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
        group: text(row.group, 'Brand', 120, { required: true }),
        category: text(row.category, 'Category', 120, { required: true }),
        model_no: text(row.model_no, 'Model no', 100, { required: true }),
        series: text(row.series, 'Series', 200),
        model_name: text(row.model_name, 'Description', 200, { required: true }),
        hsn_code: text(row.hsn_code, 'HSN/SAC code', 20, { required: true }),
        price: number(row.price, 'Price', { required: true, max: 1e11 }),
        gst_rate: number(row.gst_rate, 'GST %', { max: 100, fallback: 18 }),
        remark: text(row.remark, 'Remark', 1000),
        product_link: link(row.product_link, 'Product link')
      });
    } catch (error) {
      errors.push({ row: rowNo, error: error.message });
    }
  });
  if (errors.length) throw Object.assign(fail(400, `${errors.length} row(s) have errors`), { details: errors });
  // Brand + model no listed twice in one file: the later row wins.
  const byKey = new Map();
  for (const row of parsed) byKey.set(`${row.group.toLowerCase()}\u0000${row.model_no.toLowerCase()}`, row);
  return [...byKey.values()];
}

export async function importItems(rows, userId) {
  const parsed = parseImportRows(rows);
  return withTransaction(async (client) => {
    const ensure = async (table, name, cache) => {
      const key = name.toLowerCase();
      if (!cache.ids.has(key)) {
        // Upsert so one created concurrently can't fail the import.
        const { rows: found } = await client.query(
          `INSERT INTO ${table} (name, created_by) VALUES ($1, $2)
           ON CONFLICT ((lower(btrim(name)))) DO UPDATE SET name = ${table}.name
           RETURNING id, (xmax = 0) AS inserted`,
          [name, userId]
        );
        cache.ids.set(key, found[0].id);
        if (found[0].inserted) cache.created += 1;
      }
      return cache.ids.get(key);
    };
    const groups = { ids: new Map(), created: 0 };
    const categories = { ids: new Map(), created: 0 };
    let created = 0;
    let updated = 0;
    for (const row of parsed) {
      const fail400 = (error) => {
        if (error.code === '23505') throw fail(400, `Row ${row.row}: ${error.constraint === 'quote_items_group_model_no_unique'
          ? 'this brand already has another item with this model no' : 'another item already has this description'}`);
        throw error;
      };
      const groupId = await ensure('quote_groups', row.group, groups);
      const categoryId = await ensure('quote_categories', row.category, categories);
      await client.query('INSERT INTO quote_group_categories (group_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [groupId, categoryId]);
      const { rows: match } = await client.query(
        `SELECT id FROM quote_items
          WHERE (group_id = $1 AND lower(btrim(model_no)) = lower($2)) OR lower(btrim(model_name)) = lower($3)
          ORDER BY (group_id = $1 AND lower(btrim(model_no)) = lower($2)) DESC NULLS LAST
          LIMIT 1`,
        [groupId, row.model_no, row.model_name]
      );
      const values = [groupId, categoryId, row.model_no, row.series, row.model_name, row.hsn_code, row.price, row.gst_rate,
        row.remark, row.product_link, userId];
      if (match[0]) {
        await client.query(
          `UPDATE quote_items SET group_id = $1, category_id = $2, model_no = $3, series = $4, model_name = $5, hsn_code = $6,
                  price = $7, gst_rate = $8, remark = $9, product_link = $10, updated_by = $11
            WHERE id = $12`,
          [...values, match[0].id]
        ).catch(fail400);
        updated += 1;
      } else {
        await client.query(
          `INSERT INTO quote_items (group_id, category_id, model_no, series, model_name, hsn_code, price, gst_rate, remark,
                                    product_link, created_by, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)`,
          values
        ).catch(fail400);
        created += 1;
      }
    }
    return { created, updated, groupsCreated: groups.created, categoriesCreated: categories.created };
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
      `INSERT INTO quote_versions (quote_id, version_no, notes, terms, delivery_timeline, created_by, updated_by)
       VALUES ($1, 1, $2, $3, $4, $5, $5) RETURNING id`,
      [quoteId, DEFAULT_NOTES, DEFAULT_TERMS, DEFAULT_DELIVERY, userId]
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
           ln.gst_rate, ln.comment, ln.product_link, ln.sort_order
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
            gst_rate: number(line.gst_rate, `${where}: GST %`, { max: 100, fallback: 18 }),
            comment: text(line.comment, `${where}: comment`, 500),
            product_link: link(line.product_link, `${where}: product link`)
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

// A version that is being superseded keeps the customer / project / contact
// it was made for, so a later lead edit doesn't change how it prints.
// Versions issued before manual versioning already carry this snapshot.
async function snapshotLead(client, quote, versionId) {
  await client.query(
    `UPDATE quote_versions SET issued_customer = $2, issued_project = $3, issued_site_location = $4,
            issued_contact_person = $5, issued_account_manager = $6, issued_account_manager_phone = $7
      WHERE id = $1 AND issued_customer IS NULL`,
    [versionId, quote.customer, quote.project, quote.site_location, quote.contact_person,
      quote.account_manager_name, quote.account_manager_phone]
  );
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
      'hsn_code', 'uom', 'qty', 'osp_unit', 'sm_override', 'price_override', 'gst_rate', 'comment', 'product_link', 'sort_order'];
    const values = [];
    const tuples = section.lines.map((line, li) => {
      const row = [rows[0].id, line.line_type, live.has(line.item_id) ? line.item_id : null, line.category_name, line.series, line.model_name,
        line.description, line.hsn_code, line.uom, line.qty, line.osp_unit, line.sm_override, line.price_override,
        line.gst_rate, line.comment ?? null, line.product_link ?? null, li];
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
// This is the only thing that locks a version (besides Won / Lost on the
// whole quote). The quote keeps its status — a revision of a quote with the
// client is still Under Process.
export async function createNextVersion(quoteId, userId) {
  const newId = await withTransaction(async (client) => {
    const quote = await writeGuard(client, quoteId, userId);
    assertOpen(quote, 'make a new version');
    const latest = await latestVersion(client, quoteId);
    await snapshotLead(client, quote, latest.id);
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

// Logged for the history; exporting never changes the quotation.
export async function recordExport(quoteId, versionId, body, { by, admin }) {
  const format = EXPORT_LABELS[body.format];
  if (!format) throw fail(400, 'Unknown export format');
  const { rows } = await query('SELECT version_no FROM quote_versions WHERE id = $1 AND quote_id = $2',
    [uuid(versionId, 'Version'), uuid(quoteId, 'Quote')]);
  if (!rows[0]) throw fail(404, 'Version not found');
  await logEvent({ query }, quoteId, 'exported', {
    by, admin, versionNo: rows[0].version_no, detail: `${body.accounting ? 'Accounting' : body.internal ? 'Internal' : 'Client'} ${format}`
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

// Won / Lost lock the whole quotation (assertOpen) until it is reopened;
// Won also records which version won. Status never freezes a version.
// Issuing (Draft → Under Process) and Won need HSN (goods) or SAC (services)
// on every line of the latest version: Tally and the DC print it per item.
// Reopening a Won / Lost quote is never blocked, so it can be fixed.
export async function setQuoteStatus(id, body, userId) {
  const next = parseStatus(body);
  await withTransaction(async (client) => {
    const quote = await writeGuard(client, id, userId);
    const latest = await latestVersion(client, id);
    if (next.status === 'won' || (next.status === 'sent' && quote.status === 'draft')) {
      const { rows } = await client.query(
        `SELECT count(*)::int AS n FROM quote_lines ln JOIN quote_sections s ON s.id = ln.section_id
          WHERE s.version_id = $1 AND (ln.hsn_code IS NULL OR btrim(ln.hsn_code) = '')`,
        [latest.id]
      );
      if (rows[0].n > 0) throw fail(400, `${rows[0].n} line(s) have no HSN/SAC code. Fill them in and save first.`);
    }
    await client.query(
      'UPDATE quotes SET status = $2, po_number = $3, po_date = $4, lost_reason = $5, won_version_id = $6 WHERE id = $1',
      [id, next.status, next.po_number, next.po_date, next.lost_reason, next.status === 'won' ? latest.id : null]
    );
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
