// Sales Daily Report (pipeline V2, migration 034). One report per Sales
// employee per India-time day; each line is either one of their own leads
// (attached by id, with a comment on today's work) or a "potential lead"
// (typed company name + comment, no lead record). Only today's report can be
// edited. Isolated module: reads leads/sales but never writes to them, and
// nothing outside the Sales module imports it.
import { query, withTransaction } from '../config/database.js';
import { indiaDateKey, isValidDateKey } from '../utils/indiaTime.js';

export const MAX_REPORT_ITEMS = 50;
export const MAX_COMMENT_LENGTH = 2000;
export const MAX_COMPANY_LENGTH = 200;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const badRequest = (message) => Object.assign(new Error(message), { status: 400 });

// Validates and normalizes report lines. Pure — unit-tested.
export function parseReportItems(items) {
  if (!Array.isArray(items) || !items.length) throw badRequest('Add at least one lead or potential lead to the report.');
  if (items.length > MAX_REPORT_ITEMS) throw badRequest(`A report can have at most ${MAX_REPORT_ITEMS} entries.`);

  const seenLeads = new Set();
  return items.map((item, index) => {
    const line = `Entry ${index + 1}`;
    if (!item || typeof item !== 'object') throw badRequest(`${line} is invalid.`);
    const comment = typeof item.comment === 'string' ? item.comment.trim() : '';
    if (!comment) throw badRequest(`${line}: describe today's work in the comment.`);
    if (comment.length > MAX_COMMENT_LENGTH) throw badRequest(`${line}: comment cannot exceed ${MAX_COMMENT_LENGTH} characters.`);

    if (item.is_potential === true) {
      const company = typeof item.company === 'string' ? item.company.trim() : '';
      if (!company) throw badRequest(`${line}: enter the potential lead's company name.`);
      if (company.length > MAX_COMPANY_LENGTH) throw badRequest(`${line}: company cannot exceed ${MAX_COMPANY_LENGTH} characters.`);
      return { is_potential: true, lead_id: null, company, comment };
    }

    const leadId = typeof item.lead_id === 'string' ? item.lead_id : '';
    if (!UUID_RE.test(leadId)) throw badRequest(`${line}: select a lead.`);
    if (seenLeads.has(leadId)) throw badRequest(`${line}: this lead is already in the report.`);
    seenLeads.add(leadId);
    return { is_potential: false, lead_id: leadId, company: null, comment };
  });
}

// An attached lead must be one the salesperson can report on: currently
// theirs (and not archived), already on this report, or one they acted on
// today (India time) — so working a lead and then releasing it, or having it
// reassigned, never blocks today's report (audit fix). Fills in each line's
// company snapshot from the lead.
async function resolveLeadCompanies(client, salesId, items, { reportId = null, reportDate } = {}) {
  const ids = items.filter((i) => !i.is_potential).map((i) => i.lead_id);
  if (!ids.length) return items;
  const { rows } = await client.query(
    `SELECT l.id, l.company FROM leads l
     WHERE l.id = ANY($1::uuid[]) AND (
       (l.assigned_to = $2 AND l.archived_at IS NULL)
       OR EXISTS (SELECT 1 FROM sales_daily_report_items i WHERE i.report_id = $3 AND i.lead_id = l.id)
       OR EXISTS (SELECT 1 FROM lead_history h
                  WHERE h.lead_id = l.id AND h.actor_type = 'sales' AND h.actor_id = $2
                    AND (h.created_at AT TIME ZONE 'Asia/Kolkata')::date = $4::date)
     )`,
    [ids, salesId, reportId, reportDate]
  );
  const companies = new Map(rows.map((r) => [r.id, r.company]));
  if (companies.size !== ids.length) throw badRequest('One or more selected leads are no longer yours and you didn’t work on them today. Remove them and try again.');
  return items.map((i) => (i.is_potential ? i : { ...i, company: companies.get(i.lead_id) }));
}

async function insertItems(client, reportId, items) {
  for (const [position, i] of items.entries()) {
    await client.query(
      `INSERT INTO sales_daily_report_items (report_id, position, is_potential, lead_id, company, comment)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [reportId, position, i.is_potential, i.lead_id, i.company, i.comment]
    );
  }
}

// Reports (newest first) with their lines. Each existing-lead line carries
// the lead's status and stage clock *as of the report's last save*
// (`as_of`), so the battery timer is frozen at submission. If the lead's
// status has changed since, the earlier status comes from lead_history and
// its clock start from that row's clock_started_at (Follow-up ↔ Hold keeps
// the clock, so the row's own time isn't always the start); a New lead's
// clock also restarts on assignment.
async function loadReports(where, params, limit = 200) {
  const { rows: reports } = await query(
    `SELECT r.id, r.sales_id, s.full_name AS sales_name, to_char(r.report_date, 'YYYY-MM-DD') AS report_date,
            r.created_at, r.updated_at
     FROM sales_daily_reports r
     LEFT JOIN sales s ON s.id = r.sales_id
     WHERE ${where}
     ORDER BY r.report_date DESC, s.full_name ASC
     LIMIT ${Number(limit)}`,
    params
  );
  if (!reports.length) return [];

  const { rows: items } = await query(
    `SELECT i.id, i.report_id, i.is_potential, i.lead_id, i.company, i.comment,
            r.updated_at AS as_of, l.archived_at AS lead_archived_at,
            CASE WHEN later.changed THEN COALESCE(h.to_status, 'new') ELSE l.status END AS lead_status,
            CASE WHEN NOT later.changed AND l.status_changed_at <= r.updated_at THEN l.status_changed_at
                 WHEN h.to_status IS NOT NULL AND h.to_status <> 'new' THEN h.clock_start
                 ELSE GREATEST(h.changed_at, l.created_at, a.assigned_at) END AS lead_status_changed_at
     FROM sales_daily_report_items i
     JOIN sales_daily_reports r ON r.id = i.report_id
     LEFT JOIN leads l ON l.id = i.lead_id
     LEFT JOIN LATERAL (
       SELECT details->>'to' AS to_status, created_at AS changed_at,
              COALESCE((details->>'clock_started_at')::timestamptz, created_at) AS clock_start
       FROM lead_history
       WHERE lead_id = l.id AND event_type = 'status_changed' AND created_at <= r.updated_at
       ORDER BY created_at DESC LIMIT 1
     ) h ON true
     LEFT JOIN LATERAL (
       SELECT EXISTS (SELECT 1 FROM lead_history
                      WHERE lead_id = l.id AND event_type = 'status_changed' AND created_at > r.updated_at) AS changed
     ) later ON true
     LEFT JOIN LATERAL (
       SELECT MAX(created_at) AS assigned_at FROM lead_history
       WHERE lead_id = l.id AND event_type = 'assigned' AND created_at <= r.updated_at
     ) a ON true
     WHERE i.report_id = ANY($1::uuid[])
     ORDER BY i.position ASC`,
    [reports.map((r) => r.id)]
  );

  const today = indiaDateKey();
  const byReport = new Map(reports.map((r) => [r.id, []]));
  for (const i of items) {
    byReport.get(i.report_id).push({
      id: i.id,
      is_potential: i.is_potential,
      lead_id: i.lead_id,
      company: i.company,
      comment: i.comment,
      lead: i.lead_id && i.lead_status
        ? { status: i.lead_status, status_changed_at: i.lead_status_changed_at, as_of: i.as_of, archived: !!i.lead_archived_at }
        : null
    });
  }
  return reports.map((r) => ({ ...r, editable: r.report_date === today, items: byReport.get(r.id) }));
}

export const listForSales = (salesId) => loadReports('r.sales_id = $1', [salesId], 400);

// Admin list. Optional filters: salesId (uuid), from/to (YYYY-MM-DD, inclusive).
export function listAll({ salesId, from, to } = {}) {
  const clauses = ['true'];
  const params = [];
  if (salesId) {
    if (!UUID_RE.test(salesId)) throw badRequest('Invalid salesperson');
    params.push(salesId);
    clauses.push(`r.sales_id = $${params.length}`);
  }
  for (const [value, op] of [[from, '>='], [to, '<=']]) {
    if (!value) continue;
    if (!isValidDateKey(value)) throw badRequest('Dates must be YYYY-MM-DD');
    params.push(value);
    clauses.push(`r.report_date ${op} $${params.length}::date`);
  }
  return loadReports(clauses.join(' AND '), params, 500);
}

async function loadOne(id) {
  const [report] = await loadReports('r.id = $1', [id], 1);
  return report || null;
}

// Creates today's report. A second one for the same day is refused (the
// UNIQUE (sales_id, report_date) constraint is the backstop).
export async function createTodayReport(salesId, rawItems) {
  const items = parseReportItems(rawItems);
  const today = indiaDateKey();
  const id = await withTransaction(async (client) => {
    const resolved = await resolveLeadCompanies(client, salesId, items, { reportDate: today });
    const { rows } = await client.query(
      `INSERT INTO sales_daily_reports (sales_id, report_date) VALUES ($1, $2::date)
       ON CONFLICT (sales_id, report_date) DO NOTHING RETURNING id`,
      [salesId, today]
    );
    if (!rows.length) throw Object.assign(new Error("You already have a report for today — edit it instead."), { status: 409 });
    await insertItems(client, rows[0].id, resolved);
    return rows[0].id;
  });
  return loadOne(id);
}

// Replaces the lines of the caller's own report — today's only.
export async function updateReport(id, salesId, rawItems) {
  const items = parseReportItems(rawItems);
  await withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT to_char(report_date, 'YYYY-MM-DD') AS report_date FROM sales_daily_reports
       WHERE id = $1 AND sales_id = $2 FOR UPDATE`,
      [id, salesId]
    );
    if (!rows.length) throw Object.assign(new Error('Report not found'), { status: 404 });
    if (rows[0].report_date !== indiaDateKey()) {
      throw Object.assign(new Error("Only today's report can be edited."), { status: 409 });
    }
    const resolved = await resolveLeadCompanies(client, salesId, items, { reportId: id, reportDate: rows[0].report_date });
    await client.query('DELETE FROM sales_daily_report_items WHERE report_id = $1', [id]);
    await insertItems(client, id, resolved);
    await client.query('UPDATE sales_daily_reports SET updated_at = now() WHERE id = $1', [id]);
  });
  return loadOne(id);
}

// Admin accountability view: who has submitted a report for `dateKey`
// (India date, default today). Expected = active salespeople who already
// existed that day (audit fix: someone hired later no longer shows as
// "missing" for earlier days); anyone who did submit is always listed.
export async function getSubmissionStatus(dateKey = indiaDateKey()) {
  if (!isValidDateKey(dateKey)) throw badRequest('Dates must be YYYY-MM-DD');
  const { rows } = await query(
    `SELECT s.id AS sales_id, s.full_name, r.id AS report_id, r.updated_at
     FROM sales s
     LEFT JOIN sales_daily_reports r ON r.sales_id = s.id AND r.report_date = $1::date
     WHERE r.id IS NOT NULL
        OR (s.is_active = true AND (s.created_at AT TIME ZONE 'Asia/Kolkata')::date <= $1::date)
     ORDER BY (r.id IS NULL) DESC, s.full_name ASC`,
    [dateKey]
  );
  const people = rows.map((r) => ({ salesId: r.sales_id, name: r.full_name, submitted: !!r.report_id, reportId: r.report_id, submittedAt: r.updated_at }));
  return {
    date: dateKey,
    submitted: people.filter((p) => p.submitted),
    missing: people.filter((p) => !p.submitted)
  };
}
