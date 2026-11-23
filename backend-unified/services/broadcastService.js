import { query, withTransaction } from '../config/database.js';

// Broadcasts (migration 052): an admin's announcement popup for chosen
// employees. A broadcast is live for 24 hours from sending, or until an
// admin ends it. Each employee can be in at most one live broadcast — that
// rule is checked here under an advisory lock, since "live" depends on
// now() and so can't be a unique index.

export const TONES = ['info', 'nudge', 'kudos', 'important'];
export const EMPLOYEE_TYPES = ['technician', 'sales', 'back_office'];
const OWNER_COLUMN = { technician: 'technician_id', sales: 'sales_id', back_office: 'back_office_id' };
const LIMITS = { emoji: 16, headline: 120, highlight: 60, message: 600, step: 60, steps: 3 };

// Serializes every write that adds people to a broadcast, so two admins
// sending at the same moment can't both put one person in a live broadcast.
const RECIPIENT_LOCK = 52052052;

const LIVE = 'b.ended_at IS NULL AND b.expires_at > now()';

// Active employees of all three types, as (employee_type, id, full_name, location).
const STAFF_CTE = `staff AS (
  SELECT 'technician'::text AS employee_type, id, full_name, location FROM technicians WHERE is_active AND removed_at IS NULL
  UNION ALL
  SELECT 'sales', id, full_name, location FROM sales WHERE is_active AND removed_at IS NULL
  UNION ALL
  SELECT 'back_office', id, full_name, location FROM back_office WHERE is_active AND removed_at IS NULL
)`;

const RECIPIENT_TYPE = `CASE WHEN r.technician_id IS NOT NULL THEN 'technician'
  WHEN r.sales_id IS NOT NULL THEN 'sales' ELSE 'back_office' END`;
const RECIPIENT_ID = 'COALESCE(r.technician_id, r.sales_id, r.back_office_id)';

// Everyone currently in a live broadcast, with that broadcast's summary.
const LIVE_CTE = `live AS (
  SELECT ${RECIPIENT_TYPE} AS employee_type, ${RECIPIENT_ID} AS employee_id,
         b.id AS broadcast_id, b.emoji, b.headline, b.expires_at
    FROM broadcast_recipients r
    JOIN broadcasts b ON b.id = r.broadcast_id
   WHERE ${LIVE}
)`;

const fail = (status, message, extra = {}) => Object.assign(new Error(message), { status, ...extra });

const ownerColumn = (employeeType) => {
  const column = OWNER_COLUMN[employeeType];
  if (!column) throw fail(400, `Unknown employee type: ${employeeType}`);
  return column;
};

const cleanText = (value) => (typeof value === 'string' ? value.trim() : '');

// Checks and normalizes the admin's form. Pure, so it is unit-tested.
export function normalizeBroadcastInput(body = {}) {
  const tone = body.tone;
  if (!TONES.includes(tone)) throw fail(400, 'Pick a tone');

  const emoji = cleanText(body.emoji);
  if (!emoji || emoji.length > LIMITS.emoji) throw fail(400, 'Pick one emoji');

  const headline = cleanText(body.headline);
  if (!headline) throw fail(400, 'Headline is required');
  if (headline.length > LIMITS.headline) throw fail(400, `Headline must be ${LIMITS.headline} characters or fewer`);

  const highlight = cleanText(body.highlight) || null;
  if (highlight) {
    if (highlight.length > LIMITS.highlight) throw fail(400, `Highlight must be ${LIMITS.highlight} characters or fewer`);
    if (!headline.toLowerCase().includes(highlight.toLowerCase())) {
      throw fail(400, 'The highlight must be a word or phrase from the headline');
    }
  }

  const message = cleanText(body.message);
  if (!message) throw fail(400, 'Message is required');
  if (message.length > LIMITS.message) throw fail(400, `Message must be ${LIMITS.message} characters or fewer`);

  if (body.steps != null && !Array.isArray(body.steps)) throw fail(400, 'Steps must be a list');
  const steps = (body.steps || []).map(cleanText).filter(Boolean);
  if (steps.length > LIMITS.steps) throw fail(400, `Add at most ${LIMITS.steps} steps`);
  if (steps.some((step) => step.length > LIMITS.step)) throw fail(400, `Each step must be ${LIMITS.step} characters or fewer`);

  const audience = body.audience;
  if (audience !== 'everyone' && audience !== 'custom') throw fail(400, 'Choose Everyone or pick people');

  let recipients = [];
  if (audience === 'custom') {
    if (!Array.isArray(body.recipients) || body.recipients.length === 0) throw fail(400, 'Pick at least one person');
    const seen = new Set();
    for (const r of body.recipients) {
      if (!EMPLOYEE_TYPES.includes(r?.employee_type) || typeof r?.employee_id !== 'string') {
        throw fail(400, 'Invalid recipient');
      }
      const key = `${r.employee_type}:${r.employee_id}`;
      if (!seen.has(key)) {
        seen.add(key);
        recipients.push({ employee_type: r.employee_type, employee_id: r.employee_id });
      }
    }
  }

  return { tone, emoji, headline, highlight, message, steps, audience, recipients };
}

// ============================================
// ADMIN
// ============================================

// Every active employee, for the audience picker. `live_broadcast` is set
// when they're already in one (the picker greys them out).
export async function listEmployeesForPicker() {
  const { rows } = await query(
    `WITH ${STAFF_CTE}, ${LIVE_CTE}
     SELECT s.employee_type, s.id, s.full_name, s.location,
            l.broadcast_id, l.emoji, l.headline, l.expires_at
       FROM staff s
       LEFT JOIN live l ON l.employee_type = s.employee_type AND l.employee_id = s.id
      ORDER BY lower(s.full_name)`
  );
  return rows.map((row) => ({
    employee_type: row.employee_type,
    id: row.id,
    full_name: row.full_name,
    location: row.location,
    live_broadcast: row.broadcast_id
      ? { id: row.broadcast_id, emoji: row.emoji, headline: row.headline, expires_at: row.expires_at }
      : null
  }));
}

export async function createBroadcast(body, adminId) {
  const input = normalizeBroadcastInput(body);

  return withTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1)', [RECIPIENT_LOCK]);

    // Resolve the audience against active employees only.
    let staff;
    if (input.audience === 'everyone') {
      ({ rows: staff } = await client.query(`WITH ${STAFF_CTE} SELECT employee_type, id, full_name FROM staff`));
      if (staff.length === 0) throw fail(400, 'There are no active employees to send to');
    } else {
      ({ rows: staff } = await client.query(
        `WITH ${STAFF_CTE}, wanted AS (
           SELECT * FROM unnest($1::text[], $2::text[]) AS w(employee_type, employee_id)
         )
         SELECT s.employee_type, s.id, s.full_name
           FROM staff s JOIN wanted w ON w.employee_type = s.employee_type AND w.employee_id = s.id::text`,
        [input.recipients.map((r) => r.employee_type), input.recipients.map((r) => r.employee_id)]
      ));
      if (staff.length !== input.recipients.length) {
        throw fail(400, 'Some of the people you picked are no longer active. Refresh the list and try again.');
      }
    }

    // One live broadcast per person.
    const { rows: busy } = await client.query(
      `WITH ${LIVE_CTE}
       SELECT l.employee_type, l.employee_id, l.headline
         FROM live l
         JOIN unnest($1::text[], $2::uuid[]) AS w(employee_type, employee_id)
           ON w.employee_type = l.employee_type AND w.employee_id = l.employee_id`,
      [staff.map((s) => s.employee_type), staff.map((s) => s.id)]
    );
    if (busy.length) {
      const who = busy.length === 1
        ? `${staff.find((s) => s.id === busy[0].employee_id)?.full_name || '1 person'} is`
        : `${busy.length} people are`;
      throw fail(409, `${who} already in a live broadcast. Remove them from it or wait until it ends.`, { busy });
    }

    const { rows: [broadcast] } = await client.query(
      `INSERT INTO broadcasts (tone, emoji, headline, highlight, message, steps, audience, created_by, created_by_name)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, (SELECT full_name FROM admins WHERE id = $8))
       RETURNING *`,
      [input.tone, input.emoji, input.headline, input.highlight, input.message,
        JSON.stringify(input.steps), input.audience, adminId]
    );

    await client.query(
      `INSERT INTO broadcast_recipients (broadcast_id, technician_id, sales_id, back_office_id)
       SELECT $1,
              CASE WHEN t = 'technician' THEN id END,
              CASE WHEN t = 'sales' THEN id END,
              CASE WHEN t = 'back_office' THEN id END
         FROM unnest($2::text[], $3::uuid[]) AS x(t, id)`,
      [broadcast.id, staff.map((s) => s.employee_type), staff.map((s) => s.id)]
    );

    return { ...broadcast, recipient_count: staff.length, seen_count: 0, acknowledged_count: 0, is_live: true };
  });
}

// All broadcasts, newest first, with read-receipt counts. The page splits
// them into Active (is_live) and History.
export async function listBroadcasts() {
  const { rows } = await query(
    `SELECT b.*,
            (${LIVE}) AS is_live,
            COUNT(r.id)::int AS recipient_count,
            COUNT(r.seen_at)::int AS seen_count,
            COUNT(r.acknowledged_at)::int AS acknowledged_count
       FROM broadcasts b
       LEFT JOIN broadcast_recipients r ON r.broadcast_id = b.id
      GROUP BY b.id
      ORDER BY b.created_at DESC
      LIMIT 200`
  );
  return rows;
}

// Who a broadcast went to and how far each person got.
export async function listRecipients(broadcastId) {
  const { rows: found } = await query('SELECT id FROM broadcasts WHERE id = $1', [broadcastId]);
  if (!found.length) throw fail(404, 'Broadcast not found');
  const { rows } = await query(
    `SELECT ${RECIPIENT_TYPE} AS employee_type, ${RECIPIENT_ID} AS employee_id,
            COALESCE(t.full_name, s.full_name, bo.full_name) AS full_name,
            r.seen_at, r.acknowledged_at
       FROM broadcast_recipients r
       LEFT JOIN technicians t ON t.id = r.technician_id
       LEFT JOIN sales s ON s.id = r.sales_id
       LEFT JOIN back_office bo ON bo.id = r.back_office_id
      WHERE r.broadcast_id = $1
      ORDER BY lower(COALESCE(t.full_name, s.full_name, bo.full_name))`,
    [broadcastId]
  );
  return rows;
}

// Ends a live broadcast now. Everyone in it is free for a new one, and
// anyone who hadn't tapped "Got it" stops seeing it.
export async function endBroadcast(broadcastId, adminId) {
  const { rows } = await query(
    `UPDATE broadcasts b SET ended_at = now(), ended_by_name = (SELECT full_name FROM admins WHERE id = $2)
      WHERE b.id = $1 AND ${LIVE}
      RETURNING b.id`,
    [broadcastId, adminId]
  );
  if (!rows.length) await assertExists(broadcastId, 'This broadcast has already ended');
  return { id: broadcastId };
}

export async function deleteBroadcast(broadcastId) {
  const { rowCount } = await query('DELETE FROM broadcasts WHERE id = $1', [broadcastId]);
  if (!rowCount) throw fail(404, 'Broadcast not found');
  return { id: broadcastId };
}

// Takes one person out of a live broadcast so they can be added to another.
// A broadcast left with nobody in it is ended.
export async function removeRecipient(broadcastId, employeeType, employeeId, adminId) {
  const column = ownerColumn(employeeType);
  return withTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1)', [RECIPIENT_LOCK]);
    const { rows: [broadcast] } = await client.query(
      `SELECT b.id, (${LIVE}) AS is_live FROM broadcasts b WHERE b.id = $1 FOR UPDATE`,
      [broadcastId]
    );
    if (!broadcast) throw fail(404, 'Broadcast not found');
    if (!broadcast.is_live) throw fail(409, 'This broadcast has already ended');

    const { rowCount } = await client.query(
      `DELETE FROM broadcast_recipients WHERE broadcast_id = $1 AND ${column} = $2`,
      [broadcastId, employeeId]
    );
    if (!rowCount) throw fail(404, 'That person is not in this broadcast');

    const { rows: [{ left }] } = await client.query(
      'SELECT COUNT(*)::int AS left FROM broadcast_recipients WHERE broadcast_id = $1', [broadcastId]
    );
    if (left === 0) {
      await client.query(
        'UPDATE broadcasts SET ended_at = now(), ended_by_name = (SELECT full_name FROM admins WHERE id = $2) WHERE id = $1',
        [broadcastId, adminId]
      );
    }
    return { id: broadcastId, remaining: left };
  });
}

async function assertExists(broadcastId, conflictMessage) {
  const { rows } = await query('SELECT id FROM broadcasts WHERE id = $1', [broadcastId]);
  if (!rows.length) throw fail(404, 'Broadcast not found');
  throw fail(409, conflictMessage);
}

// ============================================
// EMPLOYEE (identity always from the verified JWT)
// ============================================

// The employee's live broadcast they haven't tapped "Got it" on yet, or null.
export async function getPendingForEmployee(employeeType, employeeId) {
  const column = ownerColumn(employeeType);
  const { rows } = await query(
    `SELECT b.id, b.tone, b.emoji, b.headline, b.highlight, b.message, b.steps,
            b.created_at, b.expires_at, r.seen_at
       FROM broadcast_recipients r
       JOIN broadcasts b ON b.id = r.broadcast_id
      WHERE r.${column} = $1 AND r.acknowledged_at IS NULL AND ${LIVE}
      ORDER BY b.created_at DESC
      LIMIT 1`,
    [employeeId]
  );
  return rows[0] || null;
}

export async function markSeen(broadcastId, employeeType, employeeId) {
  const column = ownerColumn(employeeType);
  const { rows } = await query(
    `UPDATE broadcast_recipients SET seen_at = COALESCE(seen_at, now())
      WHERE broadcast_id = $1 AND ${column} = $2
      RETURNING seen_at`,
    [broadcastId, employeeId]
  );
  if (!rows.length) throw fail(404, 'Broadcast not found');
  return rows[0];
}

// "Got it". Not limited to live broadcasts: if it expired while the popup
// was open, the tap still counts.
export async function acknowledge(broadcastId, employeeType, employeeId) {
  const column = ownerColumn(employeeType);
  const { rows } = await query(
    `UPDATE broadcast_recipients
        SET seen_at = COALESCE(seen_at, now()), acknowledged_at = COALESCE(acknowledged_at, now())
      WHERE broadcast_id = $1 AND ${column} = $2
      RETURNING seen_at, acknowledged_at`,
    [broadcastId, employeeId]
  );
  if (!rows.length) throw fail(404, 'Broadcast not found');
  return rows[0];
}
