// TaskPro Sales Module V1 (TaskPro_Sales_RBAC_plan.md §3-9). Additive module:
// does not import from or touch serviceRequestService.js, projectService.js,
// attendanceService.js, or any ticket/project code — a bug here can never
// affect tickets or projects (mirrors attendanceService.js's own isolation
// note for the same reason).
import { EventEmitter } from 'node:events';
import { supabase } from '../config/supabaseClient.js';
import { query, withTransaction } from '../config/database.js';
import { indiaDateKey, isValidDateKey, addDaysToDateKey } from '../utils/indiaTime.js';

// ============================================
// REALTIME (Phase 7) — in-process pub/sub. No new dependency: routes/
// leads.js's SSE endpoint subscribes here and pushes events to connected
// browsers; every caller of this service that changes lead state emits
// through the same `emitter`, so there is exactly one place new event types
// get added.
// ============================================
export const emitter = new EventEmitter();
emitter.setMaxListeners(200); // one SSE connection per open browser tab

// `owners` = the Sales employees an event concerns (the lead's owner, before
// and after). The stream sends an event to a salesperson only if they are
// listed; Admins receive everything. Never sent to the browser itself.
const publish = (type, payload, owners = []) => emitter.emit('lead-event', {
  type, payload, at: new Date().toISOString(), owners: [...new Set(owners.filter(Boolean))]
});

// ============================================
// PHONE NORMALIZATION & VALIDATION (§3)
// ============================================

// Accepts reasonable formatting variations (9876543210, +91 98765 43210,
// 09876543210, dashes, dots, parentheses) without being strict about
// punctuation. Kept intentionally permissive per §3 ("Do not make the
// importer unnecessarily strict about formatting") — this only rejects
// values that plainly aren't a phone number at all.
//
// Audit fix P2-1 — this used to only strip non-digit characters, so
// 9876543210 / 09876543210 / +91 98765 43210 (the plan's own three example
// formats, §3) normalized to three *different* digit strings and were
// never recognized as the same number by duplicateKey() below, letting the
// exact scenario §4's duplicate check exists for slip through undetected.
// Canonicalizes to a bare 10-digit Indian mobile number wherever that's
// unambiguous: a 12-digit run starting with the "91" country code, or an
// 11-digit run starting with a trunk "0", both collapse to their trailing
// 10 digits. Any other length (already 10 digits, or a genuinely different
// country's number) passes through unchanged — this never invents digits,
// it only removes a recognized prefix.
export function normalizePhone(raw) {
  if (raw == null) return '';
  let digits = String(raw).replace(/[^\d]/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits;
}

export function isValidPhone(raw) {
  const digits = normalizePhone(raw);
  // A bare Indian mobile number is 10 digits; +91/0 prefixes add up to 3
  // more. 7-15 covers those plus other countries' numbers without pretending
  // to validate every possible international format.
  return digits.length >= 7 && digits.length <= 15;
}

// ============================================
// VALUE ESTIMATE VALIDATION — the one rule shared by create, update, and
// Excel import (and mirrored by the leads_value_estimate_valid CHECK
// constraint, migration 032). Without it, a text cell like "approx 5L" was
// stored as numeric 'NaN' (Number('approx 5L')), which turned every ₹ SUM
// it touched into NaN; negatives dragged totals below zero; and oversized
// or non-numeric input surfaced as a raw PostgreSQL 500.
// ============================================

// ₹1,000 crore. Well inside numeric(14,2)'s range; the DB constraint uses
// the same literal — keep the two in step.
export const MAX_VALUE_ESTIMATE = 10_000_000_000;
export const VALUE_ESTIMATE_ERROR = 'Value estimate must be a number from 0 to 10,00,00,00,000 (₹1,000 crore)';

// Returns { value } (a finite number, or null for "no estimate") or
// { error }. Blank means no estimate. Strings may carry ₹, commas, and
// spaces (e.g. "₹5,00,000") — the importer stays forgiving about
// formatting, but never about the value itself.
export function parseValueEstimate(raw) {
  if (raw === undefined || raw === null) return { value: null };
  let value;
  if (typeof raw === 'number') {
    value = raw;
  } else if (typeof raw === 'string') {
    const cleaned = raw.replace(/[₹,\s]/g, '');
    if (cleaned === '') return { value: null };
    if (!/^\d+(\.\d+)?$/.test(cleaned)) return { error: VALUE_ESTIMATE_ERROR };
    value = Number(cleaned);
  } else {
    return { error: VALUE_ESTIMATE_ERROR };
  }
  if (!Number.isFinite(value) || value < 0 || value > MAX_VALUE_ESTIMATE) return { error: VALUE_ESTIMATE_ERROR };
  return { value };
}

function requireValidValueEstimate(raw) {
  const { value, error } = parseValueEstimate(raw);
  if (error) throw Object.assign(new Error(error), { status: 400 });
  return value;
}

// ============================================
// WON READINESS — a lead can only be marked Won once every lead field is
// filled, Ref ID included, and the value is above ₹0. Checked in
// updateStatus (pre-check for a precise message, and again inside the
// atomic UPDATE via WON_COMPLETE_SQL), and the edits refuse to blank any of
// these (or zero the value) on a lead that is already Won.
// ============================================

export const WON_REQUIRED_FIELDS = {
  company: 'Company',
  phone: 'Phone',
  person_to_contact: 'Person to Contact',
  email: 'Email',
  value_estimate: 'Value Estimate',
  ref_id: 'Ref ID'
};

const isBlank = (v) => v === undefined || v === null || String(v).trim() === '';
const isZeroOrLess = (v) => !isBlank(v) && !(Number(v) > 0);

// Labels of the Won-required fields `lead` is missing, in form order. A
// value of ₹0 counts as missing — a win must be worth something.
export function missingWonFields(lead) {
  return Object.entries(WON_REQUIRED_FIELDS)
    .filter(([key]) => isBlank(lead?.[key]) || (key === 'value_estimate' && isZeroOrLess(lead?.[key])))
    .map(([key, label]) => (key === 'value_estimate' && !isBlank(lead?.[key]) ? 'Value Estimate (must be more than ₹0)' : label));
}

const WON_COMPLETE_SQL = `NULLIF(btrim(company), '') IS NOT NULL
       AND NULLIF(btrim(phone), '') IS NOT NULL
       AND NULLIF(btrim(person_to_contact), '') IS NOT NULL
       AND NULLIF(btrim(email), '') IS NOT NULL
       AND NULLIF(btrim(ref_id), '') IS NOT NULL
       AND value_estimate > 0`;

const wonFieldsError = (missing) =>
  Object.assign(new Error(`Fill in all lead details before marking it Won. Missing: ${missing.join(', ')}.`), { status: 400 });

// Remarks — free text, latest value stored on the lead (migration 033).
export const MAX_REMARKS_LENGTH = 5000;

function parseRemarks(raw) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') throw Object.assign(new Error('remarks must be text'), { status: 400 });
  const trimmed = raw.trim();
  if (trimmed.length > MAX_REMARKS_LENGTH) {
    throw Object.assign(new Error(`Remarks cannot exceed ${MAX_REMARKS_LENGTH} characters`), { status: 400 });
  }
  return trimmed || null;
}

// ============================================
// DUPLICATES — a duplicate is the same Company + Phone. Company is compared
// by lead_company_key() (migration 037): case, punctuation and common
// suffixes (Pvt, Private, Ltd, Limited, LLP, Inc, Co, P) are ignored, so
// "Acme Pvt. Ltd." and "ACME" match; phone is normalized. A lead whose phone
// matches a *different* company name gets a softer "same phone" warning.
// Warnings are informational: create/edit returns DUPLICATE_LEAD first and
// the caller may continue. Duplicates are worked independently until one is
// Won — at that moment every other *open* duplicate is closed as Lost
// (reason 'duplicate'; see autoCloseDuplicates). A lead created later for an
// already-Won customer (repeat business) is an ordinary lead. companyKey()
// mirrors the SQL function — keep the two in step.
// ============================================

const COMPANY_SUFFIX_RE = / (pvt|private|ltd|limited|llp|inc|co|p)(?= )/g;
export function companyKey(company) {
  const base = String(company ?? '').toLowerCase().replace(/[^a-z0-9\u0080-￿]+/g, ' ').trim();
  const key = ` ${base} `.replace(COMPANY_SUFFIX_RE, ' ').replace(/ +/g, ' ').trim();
  return key || base;
}
export const duplicateKey = (company, phone) => `${companyKey(company)}|${normalizePhone(phone)}`;

const companyKeySql = (ref) => `lead_company_key(${ref}.company)`;
const dupMatchSql = (a, b) => `${a}.phone = ${b}.phone AND ${companyKeySql(a)} = ${companyKeySql(b)}`;
const duplicateCountSql = (ref) => `(SELECT COUNT(*)::int FROM leads d WHERE d.id <> ${ref}.id
  AND d.archived_at IS NULL AND ${dupMatchSql('d', ref)})`;

// A lead's stage timer runs only while it is open and not waiting for an
// Admin decision on a Won request (the timer is paused meanwhile).
const timerRunningSql = (ref) => `${ref}.won_requested_at IS NULL`;

// Expired = assigned, active, timer running, past its stage deadline, and
// not yet dealt with by Admin for *this deadline* (Ignore / give back / give
// to another salesperson — see resolveExpiredLead). Compared with the
// deadline rather than status_changed_at because Follow-up ↔ Hold keeps the
// clock: an ignored Follow-up that moves to Hold must come back when the
// later Hold deadline passes too.
const expiredSql = (ref) => `(${ref}.assigned_to IS NOT NULL AND ${ref}.status IN ${OPEN_STATUSES_SQL}
  AND ${timerRunningSql(ref)}
  AND ${stageDeadlineSql(ref)} <= now()
  AND (${ref}.expiry_handled_at IS NULL OR ${ref}.expiry_handled_at < ${stageDeadlineSql(ref)}))`;

// Live leads with the same phone. `same_company` marks the true duplicates
// (same Company + Phone); the rest only share the phone.
export async function findDuplicates(company, phone, excludeId = null) {
  const { rows } = await query(
    `SELECT l.id, l.company, l.phone, l.status, l.assigned_to, s.full_name AS assigned_name,
            (${companyKeySql('l')} = lead_company_key($2)) AS same_company
     FROM leads l LEFT JOIN sales s ON s.id = l.assigned_to
     WHERE l.archived_at IS NULL AND l.phone = $1
       AND ($3::uuid IS NULL OR l.id <> $3)
     ORDER BY (${companyKeySql('l')} = lead_company_key($2)) DESC, l.created_at ASC LIMIT 20`,
    [normalizePhone(phone), String(company ?? ''), excludeId]
  );
  return rows;
}

// The 409 warning a create/edit returns until the caller confirms. Sales
// see whether a match is theirs, someone else's, or unassigned — not names.
function duplicateWarning(matches, actor) {
  const owner = (m) => {
    if (!m.assigned_to) return 'Unassigned';
    if (actor.type === 'sales') return m.assigned_to === actor.id ? 'You' : 'Another salesperson';
    return m.assigned_name || 'Salesperson';
  };
  const exact = matches.some((m) => m.same_company);
  return Object.assign(
    new Error(exact
      ? '⚠️ A lead for this customer already exists and may be being worked on by another salesperson.'
      : '⚠️ This phone number is already on a lead with a different company name. Check it isn’t the same customer.'),
    {
      status: 409,
      code: 'DUPLICATE_LEAD',
      duplicates: matches.map((m) => ({
        id: m.id, company: m.company, phone: m.phone, status: m.status, owner: owner(m),
        match: m.same_company ? 'company_phone' : 'phone'
      }))
    }
  );
}

async function warnIfDuplicate(company, phone, actor, { confirmDuplicate, excludeId } = {}) {
  if (confirmDuplicate) return;
  const matches = await findDuplicates(company, phone, excludeId);
  if (matches.length) throw duplicateWarning(matches, actor);
}

// ============================================
// CLOSE REASONS — every move to Lost or Dead needs a reason from this list;
// 'other' also needs a note. Stored on the lead (lost_reason/lost_note) and
// in the status_changed history row; cleared when the lead is reopened.
// ============================================

export const LOST_REASONS = {
  price: 'Price too high',
  competitor: 'Went with a competitor',
  no_budget: 'No budget',
  no_response: 'No response',
  not_interested: 'Not interested',
  duplicate: 'Duplicate lead',
  other: 'Other'
};
export const MAX_LOST_NOTE_LENGTH = 1000;

export function parseCloseReason(reason, note) {
  if (!reason || !Object.hasOwn(LOST_REASONS, reason)) {
    throw Object.assign(new Error('Choose a reason for closing this lead.'), { status: 400 });
  }
  if (note != null && typeof note !== 'string') throw Object.assign(new Error('The note must be text'), { status: 400 });
  const trimmed = (note || '').trim();
  if (trimmed.length > MAX_LOST_NOTE_LENGTH) {
    throw Object.assign(new Error(`The note cannot exceed ${MAX_LOST_NOTE_LENGTH} characters`), { status: 400 });
  }
  if (reason === 'other' && !trimmed) throw Object.assign(new Error('Add a note explaining the reason.'), { status: 400 });
  return { reason, note: trimmed || null };
}

// ============================================
// PENDING WON — a Sales "Won" on a lead with duplicates waits for Admin
// (won_requested_at). Meanwhile Sales can't change its status, details, or
// release it (notes and remarks are still fine).
// ============================================

export const WON_PENDING_MESSAGE = 'This lead is waiting for an Admin to approve it as Won. It can’t be changed until then.';
const wonPendingError = () => Object.assign(new Error(WON_PENDING_MESSAGE), { status: 409, code: 'WON_PENDING' });

// ============================================
// HISTORY (§9)
// ============================================

async function logHistory(client, leadId, eventType, actor, details = {}) {
  const run = client ? client.query.bind(client) : query;
  await run(
    `INSERT INTO lead_history (lead_id, event_type, actor_type, actor_id, actor_name, details)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [leadId, eventType, actor.type, actor.id || null, actor.name || null, JSON.stringify(details || {})]
  );
}

export async function getHistory(leadId) {
  const { rows } = await query('SELECT * FROM lead_history WHERE lead_id = $1 ORDER BY created_at ASC', [leadId]);
  return rows;
}

// ============================================
// PIPELINE V2 (migration 034) — stages, timers, Proposal requirements.
//
// Flow: New → Meeting → Proposal → Follow-up / Hold → Won / Lost. Each
// active stage has a window counted from status_changed_at (the stage
// clock). The clock restarts when a lead enters a new stage and whenever it
// changes owner — except that moving between Follow-up and Hold keeps the
// running clock (audit fix: flipping the two used to hand out a fresh
// 10/20-day window every time). A missed deadline only makes the lead
// *overdue* — it is never moved, released or reassigned automatically. The
// clock is paused while a Won request waits for Admin (won_requested_at).
// The Admin Dashboard mirrors STAGE_DAYS/STAGE_TRANSITIONS/REF_ID_TEMPLATE
// in src/components/sales/leadPipeline.js — keep the two in step.
// ============================================

export const STAGE_DAYS = { new: 10, meeting: 7, proposal: 10, follow_up: 10, hold: 20 };
export const ACTIVE_STATUSES = Object.keys(STAGE_DAYS);

// Moves a Sales employee may make. Won only from Proposal onwards, so a win
// always carries a proposal (value + Ref ID). Admin may set any status
// (still subject to Won being final and the Won field requirements).
export const STAGE_TRANSITIONS = {
  new: ['meeting', 'lost'],
  meeting: ['proposal', 'lost'],
  proposal: ['follow_up', 'hold', 'won', 'lost'],
  follow_up: ['hold', 'won', 'lost'],
  hold: ['follow_up', 'won', 'lost']
};

// From Proposal onwards a lead must carry a value estimate and a Ref ID.
export const PROPOSAL_STAGES = ['proposal', 'follow_up', 'hold'];

// Moves between these keep the stage clock running.
export const SHARED_CLOCK_STAGES = ['follow_up', 'hold'];
export const keepsStageClock = (from, to) => SHARED_CLOCK_STAGES.includes(from) && SHARED_CLOCK_STAGES.includes(to);

const DAY_MS = 24 * 60 * 60 * 1000;

// { deadline, msRemaining, overdue } for an active lead whose timer is
// running; null for a closed lead or one waiting on a Won request.
export function stageTimer(lead, now = Date.now()) {
  const days = STAGE_DAYS[lead?.status];
  if (!days || !lead.status_changed_at || lead.won_requested_at) return null;
  const deadline = new Date(new Date(lead.status_changed_at).getTime() + days * DAY_MS);
  const msRemaining = deadline.getTime() - now;
  return { days, deadline: deadline.toISOString(), msRemaining, overdue: msRemaining <= 0 };
}

// SQL twin of stageTimer's deadline (NULL for closed statuses), built from
// STAGE_DAYS so the two can never disagree.
export const stageDeadlineSql = (alias = '') => {
  const p = alias ? `${alias}.` : '';
  const cases = Object.entries(STAGE_DAYS).map(([s, d]) => `WHEN '${s}' THEN ${d}`).join(' ');
  return `(${p}status_changed_at + (CASE ${p}status ${cases} END) * interval '1 day')`;
};

// Ref ID — free text, but the example shown in the form can't be submitted
// as-is. Compared ignoring case and spacing so "tttpl/blr/…" also fails.
export const REF_ID_TEMPLATE = 'TTTPL / BLR / 26-27 / BAL / CN / 2026-02-10 / A';
export const MAX_REF_ID_LENGTH = 120;
const squash = (s) => String(s).replace(/\s+/g, '').toLowerCase();
export const isRefIdTemplate = (value) => squash(value) === squash(REF_ID_TEMPLATE);

export function parseRefId(raw) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') throw Object.assign(new Error('Ref ID must be text'), { status: 400 });
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_REF_ID_LENGTH) {
    throw Object.assign(new Error(`Ref ID cannot exceed ${MAX_REF_ID_LENGTH} characters`), { status: 400 });
  }
  if (isRefIdTemplate(trimmed)) {
    throw Object.assign(new Error('Replace the example Ref ID with the real reference for this proposal.'), { status: 400 });
  }
  return trimmed;
}

export const MAX_DEMAND_LENGTH = 2000;

export function parseDemand(raw) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') throw Object.assign(new Error('Demand must be text'), { status: 400 });
  const trimmed = raw.trim();
  if (trimmed.length > MAX_DEMAND_LENGTH) {
    throw Object.assign(new Error(`Demand cannot exceed ${MAX_DEMAND_LENGTH} characters`), { status: 400 });
  }
  return trimmed || null;
}

// Labels of the Proposal-required fields `lead` is missing.
export function missingProposalFields(lead) {
  const missing = [];
  if (lead?.value_estimate === undefined || lead?.value_estimate === null || String(lead.value_estimate).trim() === '') missing.push('Value Estimate');
  if (!lead?.ref_id || !String(lead.ref_id).trim()) missing.push('Ref ID');
  return missing;
}

const proposalFieldsError = (missing) =>
  Object.assign(new Error(`Value Estimate and Ref ID are required from Proposal onwards. Missing: ${missing.join(', ')}.`), { status: 400 });

// Validates a status move for the given actor. Pure — no DB access — so the
// rules are unit-testable; updateStatus applies it to the stored lead.
export function checkStatusTransition(from, to, actorType) {
  if (from === to) return;
  if (from === 'won') {
    throw Object.assign(new Error('This lead is Won. A Won lead is final and cannot be changed.'), { status: 409 });
  }
  if (actorType === 'admin') return;
  if (to === 'dead') throw Object.assign(new Error('Only an Admin can mark a lead Dead'), { status: 403 });
  if (CLOSED_STATUSES.includes(from)) {
    throw Object.assign(new Error(`This lead is marked ${from} — only an Admin can change it further.`), { status: 403 });
  }
  if (!(STAGE_TRANSITIONS[from] || []).includes(to)) {
    const allowed = (STAGE_TRANSITIONS[from] || []).join(', ');
    throw Object.assign(new Error(`A lead in ${from} can only move to: ${allowed}.`), { status: 400 });
  }
}

// ============================================
// READ
// ============================================

const LEAD_FIELDS = [
  'id', 'company', 'person_to_contact', 'email', 'phone', 'value_estimate', 'remarks', 'ref_id', 'demand',
  'status', 'status_changed_at', 'next_follow_up_date', 'assigned_to', 'accepted_at', 'meeting_reached_at',
  'lost_reason', 'lost_note', 'won_requested_at', 'won_requested_by',
  'created_at', 'updated_at'
];
// Raw-SQL column list: the follow-up date comes back as 'YYYY-MM-DD' text —
// pg would otherwise turn a `date` into a timezone-shifted JS Date.
const leadColumnsSql = (alias = '') => LEAD_FIELDS
  .map((f) => (f === 'next_follow_up_date'
    ? `to_char(${alias ? `${alias}.` : ''}next_follow_up_date, 'YYYY-MM-DD') AS next_follow_up_date`
    : `${alias ? `${alias}.` : ''}${f}`))
  .join(', ');
const LEAD_RETURNING = leadColumnsSql();

// Lists are paged on the server: at most 200 rows per request, `offset`
// for the next page, and `count` is always the full total.
export const MAX_LIST_LIMIT = 200;
const clampLimit = (limit) => Math.min(Math.max(Math.trunc(Number(limit)) || 50, 1), MAX_LIST_LIMIT);
const clampOffset = (offset) => Math.max(Math.trunc(Number(offset)) || 0, 0);
const TODAY_IST_SQL = `(now() AT TIME ZONE 'Asia/Kolkata')::date`;

// Server-side search over company, Ref ID and phone, so it covers every
// lead and not just the page on screen. Adds its params to `params`.
export const MAX_SEARCH_LENGTH = 100;
function searchCondition(q, params) {
  const text = String(q ?? '').trim().slice(0, MAX_SEARCH_LENGTH);
  if (!text) return null;
  const like = `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  params.push(like);
  const textParam = `$${params.length}`;
  const parts = [`l.company ILIKE ${textParam}`, `l.ref_id ILIKE ${textParam}`, `l.person_to_contact ILIKE ${textParam}`];
  const digits = text.replace(/\D/g, '');
  if (digits.length >= 3) {
    params.push(`%${digits}%`);
    parts.push(`l.phone LIKE $${params.length}`);
  }
  return `(${parts.join(' OR ')})`;
}

async function selectLeads(conditions, params, { limit, offset, orderBy, archived = false }) {
  const where = [archived ? 'l.archived_at IS NOT NULL' : 'l.archived_at IS NULL', ...conditions].join(' AND ');
  const lim = clampLimit(limit);
  const off = clampOffset(offset);
  const [list, total] = await Promise.all([
    query(
      `SELECT ${leadColumnsSql('l')}, l.archived_at, ${duplicateCountSql('l')} AS duplicate_count,
              ${expiredSql('l')} AS expired
       FROM leads l WHERE ${where}
       ORDER BY ${orderBy}, l.id
       LIMIT ${lim} OFFSET ${off}`,
      params
    ),
    query(`SELECT COUNT(*)::int AS count FROM leads l WHERE ${where}`, params)
  ]);
  return { data: list.rows, count: total.rows[0].count };
}

// Admin list. `overdueOnly` = assigned, timer running, past its stage
// deadline (most overdue first); `expiredOnly` = the subset still waiting
// for an Admin decision (the Expired queue); `wonRequestsOnly` = Sales Won
// requests waiting for approval; `archivedOnly` = the read-only archive.
export async function listLeads({ status, assignedTo, unassignedOnly, overdueOnly, expiredOnly, wonRequestsOnly, archivedOnly, q, limit = 50, offset = 0 } = {}) {
  const conditions = [];
  const params = [];
  if (status) { params.push(status); conditions.push(`l.status = $${params.length}`); }
  if (unassignedOnly) conditions.push('l.assigned_to IS NULL');
  else if (assignedTo) { params.push(assignedTo); conditions.push(`l.assigned_to = $${params.length}`); }
  if (overdueOnly) conditions.push(`l.assigned_to IS NOT NULL AND l.status IN ${OPEN_STATUSES_SQL} AND ${timerRunningSql('l')} AND ${stageDeadlineSql('l')} <= now()`);
  if (expiredOnly) conditions.push(expiredSql('l'));
  if (wonRequestsOnly) conditions.push('l.won_requested_at IS NOT NULL');
  const search = searchCondition(q, params);
  if (search) conditions.push(search);
  const orderBy = wonRequestsOnly ? 'l.won_requested_at ASC'
    : overdueOnly || expiredOnly ? `${stageDeadlineSql('l')} ASC`
    : archivedOnly ? 'l.archived_at DESC'
    : 'l.created_at DESC';
  return selectLeads(conditions, params, { limit, offset, orderBy, archived: !!archivedOnly });
}

// A salesperson's own leads. scope: 'active' (default — open stages, most
// urgent first), 'closed' (Won/Lost/Dead, latest first), 'due' (active
// with a follow-up due today or earlier) or 'all'. `status` narrows to one
// stage; `q` searches. Unassigned leads are only visible to Admin.
export const MINE_SCOPES = ['active', 'closed', 'due', 'all'];
export async function listMine(salesId, { scope = 'active', status, q, limit = 50, offset = 0 } = {}) {
  if (!MINE_SCOPES.includes(scope)) throw Object.assign(new Error(`scope must be one of: ${MINE_SCOPES.join(', ')}`), { status: 400 });
  const params = [salesId];
  const conditions = ['l.assigned_to = $1'];
  let orderBy = 'l.created_at DESC';
  if (scope === 'active' || scope === 'due') {
    conditions.push(`l.status IN ${OPEN_STATUSES_SQL}`);
    // Paused (Won requested) leads sort after the running ones.
    orderBy = `(l.won_requested_at IS NOT NULL), ${stageDeadlineSql('l')} ASC`;
  }
  if (scope === 'due') {
    conditions.push(`l.next_follow_up_date <= ${TODAY_IST_SQL}`);
    orderBy = 'l.next_follow_up_date ASC';
  }
  if (scope === 'closed') {
    conditions.push("l.status IN ('won', 'lost', 'dead')");
    orderBy = 'l.updated_at DESC';
  }
  if (status) {
    if (!STATUSES.includes(status)) throw Object.assign(new Error('Unknown status'), { status: 400 });
    params.push(status);
    conditions.push(`l.status = $${params.length}`);
  }
  const search = searchCondition(q, params);
  if (search) conditions.push(search);
  return selectLeads(conditions, params, { limit, offset, orderBy });
}

export async function getLead(id) {
  const { rows } = await query(
    `SELECT ${leadColumnsSql('l')}, l.archived_at, ${duplicateCountSql('l')} AS duplicate_count,
            ${expiredSql('l')} AS expired
     FROM leads l WHERE l.id = $1`,
    [id]
  );
  return rows[0] || null;
}

// ============================================
// CREATE (manual, single lead — the Excel importer is separate, below)
// ============================================

// `ownerSalesId` set = a Sales employee creating their own lead: it is
// assigned to them in the same INSERT and its New-stage clock starts now.
// Admin-created leads (no ownerSalesId) start unassigned — visible only to
// Admin until assigned (no common pool). A Company + Phone (or phone-only)
// match is returned as a DUPLICATE_LEAD warning unless `confirmDuplicate`.
export async function createLead({ company, person_to_contact, email, phone, value_estimate, remarks, demand }, actor, { ownerSalesId, confirmDuplicate } = {}) {
  if (typeof company !== 'string' || !company.trim()) throw Object.assign(new Error('company is required'), { status: 400 });
  if (!isValidPhone(phone)) throw Object.assign(new Error('A valid phone number is required'), { status: 400 });
  const valueEstimate = requireValidValueEstimate(value_estimate);
  const remarksValue = parseRemarks(remarks);
  const demandValue = parseDemand(demand);
  const contact = parseOptionalText(person_to_contact, 'Person to Contact');
  const emailValue = parseOptionalText(email, 'Email');
  await warnIfDuplicate(company, phone, actor, { confirmDuplicate });
  const createdDetails = confirmDuplicate ? { duplicate_confirmed: true } : {};

  const data = await withTransaction(async (client) => {
    const inserted = await client.query(
      `INSERT INTO leads (company, person_to_contact, email, phone, value_estimate, remarks, demand, status, assigned_to, accepted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'new', $8, CASE WHEN $8::uuid IS NULL THEN NULL ELSE now() END)
       RETURNING ${LEAD_RETURNING}`,
      [company.trim(), contact, emailValue, normalizePhone(phone), valueEstimate, remarksValue, demandValue, ownerSalesId || null]
    );
    await logHistory(client, inserted.rows[0].id, 'created', actor, ownerSalesId
      ? { source: 'sales', assigned_to: ownerSalesId, ...createdDetails }
      : { source: 'manual', ...createdDetails });
    return inserted.rows[0];
  });
  publish('lead_created', { id: data.id, assignedTo: ownerSalesId || null }, [ownerSalesId]);
  return data;
}

// Short optional text fields (contact, email): text or blank only — never an
// object, which used to be stored as "[object Object]".
export const MAX_SHORT_TEXT_LENGTH = 254;
function parseOptionalText(raw, label) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') throw Object.assign(new Error(`${label} must be text`), { status: 400 });
  const trimmed = raw.trim();
  if (trimmed.length > MAX_SHORT_TEXT_LENGTH) throw Object.assign(new Error(`${label} cannot exceed ${MAX_SHORT_TEXT_LENGTH} characters`), { status: 400 });
  return trimmed || null;
}

// Validates and normalizes the editable lead fields — shared by the Admin
// edit (updateLead) and the Sales owner edit (updateLeadAsSales) so the two
// can never accept different input. Only keys present in `fields` are
// returned; undefined means "leave unchanged". Remarks, Demand and Ref ID
// are optional here (blank clears them); whether a blank is allowed for the
// lead's current stage is checked against the stored status in the UPDATE.
export function parseLeadEdits({ company, person_to_contact, email, phone, value_estimate, remarks, ref_id, demand }) {
  if (company !== undefined && (typeof company !== 'string' || !company.trim())) throw Object.assign(new Error('company cannot be empty'), { status: 400 });
  if (phone !== undefined && !isValidPhone(phone)) throw Object.assign(new Error('A valid phone number is required'), { status: 400 });
  const valueEstimate = value_estimate !== undefined ? requireValidValueEstimate(value_estimate) : undefined;
  const remarksValue = remarks !== undefined ? parseRemarks(remarks) : undefined;
  const refIdValue = ref_id !== undefined ? parseRefId(ref_id) : undefined;
  const demandValue = demand !== undefined ? parseDemand(demand) : undefined;

  const payload = {};
  if (company !== undefined) payload.company = company.trim();
  if (person_to_contact !== undefined) payload.person_to_contact = parseOptionalText(person_to_contact, 'Person to Contact');
  if (email !== undefined) payload.email = parseOptionalText(email, 'Email');
  if (phone !== undefined) payload.phone = normalizePhone(phone);
  if (value_estimate !== undefined) payload.value_estimate = valueEstimate;
  if (remarks !== undefined) payload.remarks = remarksValue;
  if (ref_id !== undefined) payload.ref_id = refIdValue;
  if (demand !== undefined) payload.demand = demandValue;
  return payload;
}

// Field-by-field diff of an edit against the row as it was (value compared
// as a number — pg returns numeric as text). Pure — unit-tested.
export function diffLeadEdit(before, payload) {
  const norm = (key, v) => (v === undefined || v === null ? null : key === 'value_estimate' ? Number(v) : v);
  const changes = {};
  for (const key of Object.keys(payload)) {
    if (key === 'remarks') continue;
    const from = norm(key, before?.[key]);
    const to = norm(key, payload[key]);
    if (from !== to) changes[key] = { from, to };
  }
  return changes;
}

// History for an edit: an 'edited' row listing each changed field with its
// old and new value (audit fix — it used to record field names only), plus
// a 'remarks_updated' row only when the remarks text actually changed.
async function logEditHistory(client, id, actor, payload, before) {
  const changes = diffLeadEdit(before, payload);
  if (Object.keys(changes).length) await logHistory(client, id, 'edited', actor, { fields: Object.keys(changes), changes });
  if ('remarks' in payload && (before?.remarks ?? null) !== payload.remarks) {
    await logHistory(client, id, 'remarks_updated', actor, { remarks: payload.remarks });
  }
}

// True when the edit blanks a field a Won lead must keep, or zeroes its value.
export const clearsWonField = (payload) => Object.keys(WON_REQUIRED_FIELDS).some((key) => key in payload
  && (isBlank(payload[key]) || (key === 'value_estimate' && !(Number(payload[key]) > 0))));
// True when the edit blanks a field required from Proposal onwards.
export const clearsProposalField = (payload) => ['value_estimate', 'ref_id'].some((key) => key in payload && isBlank(payload[key]));
// Ref ID and Demand stay editable only while the lead is active.
const ACTIVE_ONLY_FIELDS = ['ref_id', 'demand'];
const touchesActiveOnlyField = (payload) => ACTIVE_ONLY_FIELDS.some((key) => key in payload);
const sqlList = (values) => values.map((v) => `'${v}'`).join(', ');

// Why an edit's guarded UPDATE matched no row, as the most specific error.
function editRejection(existing, payload, salesId) {
  if (!existing) return Object.assign(new Error('Lead not found'), { status: 404 });
  if (salesId && existing.assigned_to !== salesId) return Object.assign(new Error('You do not own this lead'), { status: 403 });
  if (existing.archived_at) return Object.assign(new Error('This lead has been archived and can no longer be edited.'), { status: 409 });
  if (salesId && CLOSED_STATUSES.includes(existing.status)) {
    return Object.assign(new Error(`This lead is marked ${existing.status} and can no longer be edited.`), { status: 409 });
  }
  if (salesId && existing.won_requested_at) return wonPendingError();
  if (existing.status === 'won' && clearsWonField(payload)) {
    return Object.assign(new Error('This lead is Won — its company, phone, contact, email, Ref ID and value cannot be cleared, and the value must stay above ₹0.'), { status: 409 });
  }
  if (PROPOSAL_STAGES.includes(existing.status) && clearsProposalField(payload)) {
    return Object.assign(new Error('Value Estimate and Ref ID are required from Proposal onwards and cannot be cleared.'), { status: 400 });
  }
  if (CLOSED_STATUSES.includes(existing.status) && touchesActiveOnlyField(payload)) {
    return Object.assign(new Error(`Ref ID and Demand can no longer be changed — this lead is ${existing.status}.`), { status: 409 });
  }
  return Object.assign(new Error('This lead was just changed by someone else. Refresh and try again.'), { status: 409 });
}

// Warns (DUPLICATE_LEAD) when an edit changes Company/Phone so the lead now
// matches another live lead — same confirm-and-continue flow as create.
async function warnIfEditMakesDuplicate(existing, payload, actor, confirmDuplicate) {
  if (!('company' in payload) && !('phone' in payload)) return;
  const company = payload.company ?? existing.company;
  const phone = payload.phone ?? existing.phone;
  if (duplicateKey(company, phone) === duplicateKey(existing.company, existing.phone)) return;
  await warnIfDuplicate(company, phone, actor, { confirmDuplicate, excludeId: existing.id });
}

// Locks the row and returns it as it is now (the "before" of an edit).
async function lockLead(client, id) {
  const { rows } = await client.query(`SELECT ${LEAD_RETURNING}, archived_at FROM leads WHERE id = $1 FOR UPDATE`, [id]);
  return rows[0] || null;
}

// The single guarded UPDATE both edit paths use. `conditions` are extra
// WHERE clauses (ownership, stage guards); null when no row matched.
async function guardedEdit(client, id, payload, conditions) {
  const keys = Object.keys(payload);
  const sets = keys.map((key, i) => `${key} = $${i + 2}`);
  const { rows } = await client.query(
    `UPDATE leads SET ${sets.join(', ')}, updated_at = now()
     WHERE id = $1 AND ${conditions.join(' AND ')}
     RETURNING ${LEAD_RETURNING}`,
    [id, ...keys.map((key) => payload[key])]
  );
  return rows[0] || null;
}

// Admin edit. Archived leads are immutable, and the stage guards (Won keeps
// its required fields, Proposal-onwards keeps value + Ref ID, closed leads
// keep Ref ID/Demand) are part of the same atomic UPDATE. Every change is
// logged with its old and new value.
export async function updateLead(id, fields, actor, { confirmDuplicate } = {}) {
  const payload = parseLeadEdits(fields);
  const existing = await getLead(id);
  if (!existing) throw Object.assign(new Error('Lead not found'), { status: 404 });
  await warnIfEditMakesDuplicate(existing, payload, actor, confirmDuplicate);
  // The Admin form always sends every field, so on a closed lead a Ref ID /
  // Demand equal to the saved value is "unchanged", not an edit attempt.
  if (CLOSED_STATUSES.includes(existing.status)) {
    for (const key of ACTIVE_ONLY_FIELDS) {
      if (key in payload && (existing[key] ?? null) === payload[key]) delete payload[key];
    }
  }
  if (!Object.keys(payload).length) return existing;

  const conditions = ['archived_at IS NULL'];
  if (clearsWonField(payload)) conditions.push("status <> 'won'");
  if (clearsProposalField(payload)) conditions.push(`status NOT IN (${sqlList(PROPOSAL_STAGES)})`);
  if (touchesActiveOnlyField(payload)) conditions.push(`status NOT IN (${sqlList(CLOSED_STATUSES)})`);

  const data = await withTransaction(async (client) => {
    const before = await lockLead(client, id);
    if (!before) return null;
    const row = await guardedEdit(client, id, payload, conditions);
    if (!row) return null;
    await logEditHistory(client, id, actor, payload, before);
    return row;
  });
  if (!data) throw editRejection(await getLead(id), payload);

  publish('lead_updated', { id }, [data.assigned_to]);
  return data;
}

// A Sales employee editing a lead they own. Allowed only while the lead is
// open — Won/Lost/Dead are locked for Sales, same as their status — and not
// while a Won request waits for Admin. Ownership, open status, not-archived
// and the Proposal-stage guard are all part of the one atomic UPDATE, so a
// lead reassigned, closed, or archived a moment earlier can't be edited by
// its (former) owner. Changing Company/Phone into an existing lead's returns
// the DUPLICATE_LEAD warning first.
export async function updateLeadAsSales(id, salesId, fields, actor, { confirmDuplicate } = {}) {
  const payload = parseLeadEdits(fields);
  if (!Object.keys(payload).length) throw Object.assign(new Error('Nothing to update'), { status: 400 });
  const existing = await getLead(id);
  if (existing && existing.assigned_to === salesId) await warnIfEditMakesDuplicate(existing, payload, actor, confirmDuplicate);

  const conditions = ['assigned_to = $' + (Object.keys(payload).length + 2), 'archived_at IS NULL',
    `status NOT IN (${sqlList(CLOSED_STATUSES)})`, 'won_requested_at IS NULL'];
  if (clearsProposalField(payload)) conditions.push(`status NOT IN (${sqlList(PROPOSAL_STAGES)})`);

  const data = await withTransaction(async (client) => {
    const before = await lockLead(client, id);
    if (!before) return null;
    // guardedEdit binds $1 = id and $2.. = payload; the owner goes last.
    const keys = Object.keys(payload);
    const sets = keys.map((key, i) => `${key} = $${i + 2}`);
    const { rows } = await client.query(
      `UPDATE leads SET ${sets.join(', ')}, updated_at = now()
       WHERE id = $1 AND ${conditions.join(' AND ')}
       RETURNING ${LEAD_RETURNING}`,
      [id, ...keys.map((key) => payload[key]), salesId]
    );
    if (!rows.length) return null;
    await logEditHistory(client, id, actor, payload, before);
    return rows[0];
  });

  if (!data) throw editRejection(await getLead(id), payload, salesId);

  publish('lead_updated', { id }, [salesId]);
  return data;
}

// Remarks are editable by the owning Sales employee (`ownerSalesId`, enforced
// in the UPDATE itself) or an authorised Admin (no ownerSalesId). Like
// follow-up notes, they stay editable on Won/Lost/Dead leads and while a Won
// request is pending; only archived leads are immutable. Saving the same
// text again is a no-op.
export async function updateRemarks(id, remarks, actor, { ownerSalesId } = {}) {
  const value = parseRemarks(remarks);
  const existing = await getLead(id);
  if (!existing) throw Object.assign(new Error('Lead not found'), { status: 404 });
  if (existing.archived_at) throw Object.assign(new Error('This lead has been archived and can no longer be changed.'), { status: 409 });
  if (ownerSalesId && existing.assigned_to !== ownerSalesId) throw Object.assign(new Error('You do not own this lead'), { status: 403 });
  if ((existing.remarks ?? null) === value) return existing;

  const data = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE leads SET remarks = $2, updated_at = now()
       WHERE id = $1 AND archived_at IS NULL AND ($3::uuid IS NULL OR assigned_to = $3)
       RETURNING ${LEAD_RETURNING}`,
      [id, value, ownerSalesId || null]
    );
    if (!rows.length) return null;
    await logHistory(client, id, 'remarks_updated', actor, { remarks: value });
    return rows[0];
  });
  if (!data) {
    throw Object.assign(new Error('This lead was just changed by someone else. Refresh and try again.'), { status: 409 });
  }

  publish('lead_updated', { id }, [data.assigned_to]);
  return data;
}

// ============================================
// ALLOCATION — Admin assigns leads directly (one or many at once). There is
// no common pool: an unassigned lead (new, released, or from a deactivated
// salesperson) is visible only to Admin until it is assigned.
// ============================================

// Leads a Sales employee may never pull back into circulation on their own
// — Dead is explicitly Admin-only to set (§6) and to *un*set (audit fix
// P1-1); Won/Lost are terminal outcomes a Sales employee shouldn't be able
// to silently reopen either (audit fix P1-3). An Admin may still reopen a
// Lost or Dead lead via assignLead/updateStatus below; Won is final for
// everyone (see updateStatus).
const CLOSED_STATUSES = ['dead', 'won', 'lost'];

export const MAX_BULK_ASSIGN = 500;

async function requireActiveSales(salesId) {
  const { data: sales } = await supabase.from('sales').select('id, is_active').eq('id', salesId).maybeSingle();
  if (!sales || !sales.is_active) throw Object.assign(new Error('Sales employee not found or inactive'), { status: 404 });
}

// Admin assigns only leads that are Unassigned or still New, and never a
// Won/Lost/Dead or archived one. A lead further along the pipeline stays
// with its salesperson (they release it first); a Lost/Dead lead is reopened
// by changing its status. Won stays credited to whoever closed it.
// `isAssignable` and ASSIGNABLE_SQL must agree (UI mirrors isAssignable).
export const isAssignable = (lead) => !!lead && !lead.archived_at
  && ACTIVE_STATUSES.includes(lead.status) && (!lead.assigned_to || lead.status === 'new');
const ASSIGNABLE_SQL = `archived_at IS NULL AND status IN (${ACTIVE_STATUSES.map((st) => `'${st}'`).join(', ')})
       AND (assigned_to IS NULL OR status = 'new')`;

// The one assignment write, shared by single and bulk assign. When a lead
// changes hands its stage clock restarts and the previous owner's next
// follow-up date is cleared, whatever stage it is in (audit fix: a
// Proposal/Follow-up lead returned by a deactivated salesperson used to keep
// its old clock and land on the new owner already overdue). Re-assigning to
// the same person changes nothing. The assignable guard lives in the UPDATE.
async function assignLeadIds(client, ids, salesId, actor) {
  const { rows } = await client.query(
    `WITH prev AS (
       SELECT id, assigned_to FROM leads
       WHERE id = ANY($1::uuid[]) AND ${ASSIGNABLE_SQL}
       FOR UPDATE
     )
     UPDATE leads l
     SET assigned_to = $2,
         accepted_at = now(),
         status_changed_at = CASE WHEN l.assigned_to IS DISTINCT FROM $2 THEN now() ELSE l.status_changed_at END,
         next_follow_up_date = CASE WHEN l.assigned_to IS DISTINCT FROM $2 THEN NULL ELSE l.next_follow_up_date END,
         updated_at = now()
     FROM prev
     WHERE l.id = prev.id
     RETURNING l.id, prev.assigned_to AS previous_owner, l.status_changed_at`,
    [ids, salesId]
  );
  for (const row of rows) {
    await logHistory(client, row.id, 'assigned', actor, {
      from: row.previous_owner, to: salesId, method: ids.length > 1 ? 'bulk' : 'direct', clock_started_at: row.status_changed_at
    });
  }
  return rows;
}

// Why a lead can't be assigned, or null when it can.
export function assignBlockReason(lead) {
  if (!lead) return 'Lead not found';
  if (lead.archived_at) return 'This lead has been archived and can no longer be assigned.';
  if (lead.status === 'won') return 'This lead is Won and can no longer be reassigned.';
  if (CLOSED_STATUSES.includes(lead.status)) return `This lead is ${lead.status === 'lost' ? 'Lost' : 'Dead'} — change its status first to reopen it.`;
  if (!isAssignable(lead)) return 'Only New or Unassigned leads can be assigned. This lead is further along the pipeline — its salesperson must release it first.';
  return null;
}

// Direct assignment of one lead by an admin (New/Unassigned only).
export async function assignLead(id, salesId, actor) {
  await requireActiveSales(salesId);

  const previous = await getLead(id);
  if (!previous) throw Object.assign(new Error('Lead not found'), { status: 404 });
  const blocked = assignBlockReason(previous);
  if (blocked) throw Object.assign(new Error(blocked), { status: 409 });

  const assigned = await withTransaction((client) => assignLeadIds(client, [id], salesId, actor));
  if (!assigned.length) throw Object.assign(new Error('This lead was just changed by someone else. Refresh and try again.'), { status: 409 });

  publish('lead_assigned', { id, assignedTo: salesId }, [salesId, assigned[0].previous_owner]);
  return getLead(id);
}

// Bulk assignment (Admin Leads tab multi-select). All-or-nothing per call
// for the leads that can be assigned; anything not assignable (see
// isAssignable) or missing is skipped and reported back.
export async function assignLeads(ids, salesId, actor) {
  if (!Array.isArray(ids) || !ids.length) throw Object.assign(new Error('Select at least one lead'), { status: 400 });
  const unique = [...new Set(ids.map(String))];
  if (unique.length > MAX_BULK_ASSIGN) {
    throw Object.assign(new Error(`You can assign at most ${MAX_BULK_ASSIGN} leads at once`), { status: 400 });
  }
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!unique.every((id) => uuidRe.test(id))) throw Object.assign(new Error('Invalid lead id'), { status: 400 });
  await requireActiveSales(salesId);

  const assigned = await withTransaction((client) => assignLeadIds(client, unique, salesId, actor));
  const assignedSet = new Set(assigned.map((r) => r.id));
  const skipped = unique.filter((id) => !assignedSet.has(id));
  if (assigned.length) {
    publish('leads_assigned', { ids: [...assignedSet], assignedTo: salesId }, [salesId, ...assigned.map((r) => r.previous_owner)]);
  }
  return { assigned: assigned.length, skipped: skipped.length, skippedIds: skipped };
}

// Self-service release ("leave lead"): the lead goes back to Admin as New +
// Unassigned, never to other salespeople. Its data and history (including
// the reason) are kept; the next follow-up date is cleared. Ownership,
// open status, not-archived and no pending Won request are re-checked in the
// same atomic UPDATE. The move back to New is also logged as a status change
// so history-based views (daily-report timers) stay exact.
export async function releaseLead(id, salesId, reason, actor) {
  if (!reason || !String(reason).trim()) throw Object.assign(new Error('A reason is required to release a lead'), { status: 400 });

  const data = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `WITH prev AS (
         SELECT id, status FROM leads
         WHERE id = $1 AND assigned_to = $2 AND archived_at IS NULL AND status NOT IN ('won', 'lost', 'dead')
           AND won_requested_at IS NULL
         FOR UPDATE
       )
       UPDATE leads l
       SET assigned_to = NULL, accepted_at = NULL, status = 'new', status_changed_at = now(),
           next_follow_up_date = NULL, updated_at = now()
       FROM prev WHERE l.id = prev.id
       RETURNING prev.status AS previous_status, ${leadColumnsSql('l')}`,
      [id, salesId]
    );
    if (!rows.length) return null;
    const { previous_status: previousStatus, ...lead } = rows[0];
    await logHistory(client, id, 'released', actor, { reason: String(reason).trim(), from_status: previousStatus });
    if (previousStatus !== 'new') await logHistory(client, id, 'status_changed', actor, { from: previousStatus, to: 'new', reason: 'released' });
    return lead;
  });

  if (!data) {
    const existing = await getLead(id);
    if (!existing || existing.assigned_to !== salesId) throw Object.assign(new Error('You do not own this lead'), { status: 403 });
    if (existing.archived_at) {
      throw Object.assign(new Error('This lead has been archived and can no longer be released.'), { status: 409 });
    }
    if (existing.won_requested_at) throw wonPendingError();
    throw Object.assign(new Error(`This lead is marked ${existing.status} and can no longer be released — ask an Admin to reassign it.`), { status: 409 });
  }

  publish('lead_released', { id }, [salesId]);
  return data;
}

// ============================================
// EXPIRED STAGES — Admin's decision on a lead that passed its stage
// deadline. The lead never leaves its salesperson automatically.
//   ignore   — drop it from the Expired queue (until a later stage expires).
//   restart  — give it back to the same salesperson: back to New, fresh timer.
//   reassign — give a *new* lead for the same customer to another
//              salesperson (customer details only, New, fresh timer). The
//              original stays with its salesperson; both are worked
//              independently. A Sales Won on either needs Admin approval
//              (they are duplicates), and the approved Won closes the other
//              as Lost (see autoCloseDuplicates). The new
//              lead's owner isn't told it came from an expired lead — only
//              history (copied_from) records it.
// ============================================

export const EXPIRY_ACTIONS = ['ignore', 'restart', 'reassign'];

export async function resolveExpiredLead(id, { action, salesId } = {}, actor) {
  if (!EXPIRY_ACTIONS.includes(action)) throw Object.assign(new Error(`action must be one of: ${EXPIRY_ACTIONS.join(', ')}`), { status: 400 });
  const lead = await getLead(id);
  if (!lead) throw Object.assign(new Error('Lead not found'), { status: 404 });
  if (!lead.expired) throw Object.assign(new Error('This lead is not waiting for an expiry decision any more. Refresh and try again.'), { status: 409 });
  if (action === 'reassign') {
    if (!salesId) throw Object.assign(new Error('Choose the salesperson to give this lead to'), { status: 400 });
    if (salesId === lead.assigned_to) throw Object.assign(new Error('To give it back to the same salesperson, use “Give back” instead.'), { status: 400 });
    await requireActiveSales(salesId);
  }

  const result = await withTransaction(async (client) => {
    // Re-check "still expired" under a row lock so two admins can't both act.
    const { rows } = await client.query(`SELECT l.status FROM leads l WHERE l.id = $1 AND ${expiredSql('l')} FOR UPDATE`, [id]);
    if (!rows.length) return null;

    if (action === 'ignore') {
      await client.query('UPDATE leads SET expiry_handled_at = now(), updated_at = now() WHERE id = $1', [id]);
      await logHistory(client, id, 'expiry_ignored', actor, { status: lead.status });
      return { action };
    }
    if (action === 'restart') {
      await client.query(
        // The fresh New stage starts un-reviewed, so if it expires too it
        // comes back to the queue.
        `UPDATE leads SET status = 'new', status_changed_at = now(), expiry_handled_at = NULL, updated_at = now() WHERE id = $1`,
        [id]
      );
      await logHistory(client, id, 'expiry_restarted', actor, { from_status: lead.status });
      if (lead.status !== 'new') await logHistory(client, id, 'status_changed', actor, { from: lead.status, to: 'new', reason: 'expiry_restart', clock_started_at: new Date().toISOString() });
      return { action };
    }
    // reassign — never give the same customer twice to one salesperson.
    const { rows: existing } = await client.query(
      `SELECT 1 FROM leads l WHERE l.archived_at IS NULL AND l.assigned_to = $1 AND l.phone = $2 AND ${companyKeySql('l')} = lead_company_key($3) LIMIT 1`,
      [salesId, lead.phone, lead.company]
    );
    if (existing.length) throw Object.assign(new Error('That salesperson already has a lead for this customer.'), { status: 409 });
    const { rows: inserted } = await client.query(
      `INSERT INTO leads (company, person_to_contact, email, phone, demand, status, assigned_to, accepted_at)
       VALUES ($1, $2, $3, $4, $5, 'new', $6, now()) RETURNING id`,
      [lead.company, lead.person_to_contact, lead.email, lead.phone, lead.demand, salesId]
    );
    const newId = inserted[0].id;
    await logHistory(client, newId, 'created', actor, { source: 'expiry_reassign', copied_from: id, assigned_to: salesId });
    await client.query('UPDATE leads SET expiry_handled_at = now(), updated_at = now() WHERE id = $1', [id]);
    await logHistory(client, id, 'expiry_reassigned', actor, { to: salesId, new_lead_id: newId, status: lead.status });
    return { action, newLeadId: newId };
  });

  if (!result) throw Object.assign(new Error('This lead is not waiting for an expiry decision any more. Refresh and try again.'), { status: 409 });
  publish('lead_expiry_resolved', { id, ...result }, [lead.assigned_to, salesId]);
  return result;
}

// §6 salesperson deactivation: their active/unclosed leads become
// Unassigned for Admin to reassign. Called from routes/sales.js's
// deactivate/delete handlers. Closed leads (won/lost/dead) are left exactly
// as they are. Their follow-up dates and any pending Won request go too —
// there is no owner left to credit; the next owner starts a fresh clock
// when assigned (assignLeadIds).
export async function reassignLeadsForDeactivatedSales(salesId, actor) {
  const { rows } = await query(
    `WITH prev AS (
       SELECT id, won_requested_at FROM leads
       WHERE assigned_to = $1 AND status NOT IN ('won', 'lost', 'dead') AND archived_at IS NULL
       FOR UPDATE
     )
     UPDATE leads l
     SET assigned_to = NULL, accepted_at = NULL, next_follow_up_date = NULL,
         won_requested_at = NULL, won_requested_by = NULL, updated_at = now()
     FROM prev WHERE l.id = prev.id
     RETURNING l.id, prev.won_requested_at`,
    [salesId]
  );
  for (const lead of rows) {
    await logHistory(null, lead.id, 'deactivation_reassigned', actor, {
      previous_owner: salesId, ...(lead.won_requested_at ? { won_request_cleared: true } : {})
    });
  }
  if (rows.length) publish('leads_deactivation_reassigned', { ids: rows.map((r) => r.id), salesId }, [salesId]);
  return rows;
}

// ============================================
// PIPELINE / STATUS (§7)
// ============================================

const STATUSES = ['new', 'meeting', 'proposal', 'follow_up', 'hold', 'won', 'lost', 'dead'];
const SYSTEM_ACTOR = { type: 'system', id: null, name: 'Auto-close' };

// Serializes every Won for one customer (phone + company key) until the
// transaction ends, so two duplicates can never both be Won at once — the
// second waits, then finds the first one already Won and its own lead closed.
async function lockCustomer(client, id) {
  await client.query(
    `SELECT pg_advisory_xact_lock(hashtext(l.phone || '|' || ${companyKeySql('l')})) FROM leads l WHERE l.id = $1`,
    [id]
  );
}

// Other live leads for the same customer that are open or Won.
async function liveDuplicates(client, id) {
  const { rows } = await client.query(
    `SELECT d.id, d.company, d.phone, d.status, d.assigned_to, s.full_name AS assigned_name
     FROM leads w
     JOIN leads d ON d.id <> w.id AND d.archived_at IS NULL AND ${dupMatchSql('d', 'w')}
     LEFT JOIN sales s ON s.id = d.assigned_to
     WHERE w.id = $1 AND d.status IN (${sqlList([...ACTIVE_STATUSES, 'won'])})
     ORDER BY d.created_at`,
    [id]
  );
  return rows;
}

// When a lead is Won, every other *open* lead for the same customer is
// closed as Lost (reason 'duplicate'), and any Won request on them is
// dropped. Runs inside the Won's transaction, under lockCustomer.
async function autoCloseDuplicates(client, wonId, wonCompany) {
  const { rows } = await client.query(
    `WITH prev AS (
       SELECT d.id, d.status, d.assigned_to, d.won_requested_at
       FROM leads w
       JOIN leads d ON d.id <> w.id AND d.archived_at IS NULL AND ${dupMatchSql('d', 'w')}
       WHERE w.id = $1 AND d.status IN ${OPEN_STATUSES_SQL}
       FOR UPDATE OF d
     )
     UPDATE leads l
     SET status = 'lost', lost_reason = 'duplicate', lost_note = $2, status_changed_at = now(),
         next_follow_up_date = NULL, won_requested_at = NULL, won_requested_by = NULL, updated_at = now()
     FROM prev WHERE l.id = prev.id
     RETURNING l.id, prev.status AS previous_status, prev.assigned_to, prev.won_requested_at`,
    [wonId, `Closed automatically: another lead for this customer (${wonCompany}) was Won.`]
  );
  for (const r of rows) {
    await logHistory(client, r.id, 'status_changed', SYSTEM_ACTOR, {
      from: r.previous_status, to: 'lost', reason: 'duplicate_won', lost_reason: 'duplicate', won_lead_id: wonId,
      ...(r.won_requested_at ? { won_request_cleared: true } : {})
    });
  }
  return rows;
}

// The one write that makes a lead Won (direct Won, or an approved request),
// guarded by the Won field rules, then closes its open duplicates.
async function applyWon(client, id, fromStatus, actor, details = {}) {
  const ownerGuard = actor.type === 'sales' ? 'AND assigned_to = $3 AND won_requested_at IS NULL' : '';
  const { rows } = await client.query(
    `UPDATE leads
     SET status = 'won', status_changed_at = now(), next_follow_up_date = NULL, lost_reason = NULL, lost_note = NULL,
         won_requested_at = NULL, won_requested_by = NULL, updated_at = now()
     WHERE id = $1 AND status = $2 AND archived_at IS NULL AND assigned_to IS NOT NULL AND ${WON_COMPLETE_SQL}
       ${ownerGuard}
     RETURNING ${LEAD_RETURNING}`,
    actor.type === 'sales' ? [id, fromStatus, actor.id] : [id, fromStatus]
  );
  if (!rows.length) return null;
  await logHistory(client, id, 'status_changed', actor, { from: fromStatus, to: 'won', clock_started_at: rows[0].status_changed_at, ...details });
  const closed = await autoCloseDuplicates(client, id, rows[0].company);
  return { lead: rows[0], closed };
}

const duplicateWonError = (wonDuplicates) => Object.assign(
  new Error('This customer already has a Won lead. Mark this one Won too only if it is separate (repeat) business.'),
  {
    status: 409,
    code: 'DUPLICATE_WON',
    duplicates: wonDuplicates.map((d) => ({ id: d.id, company: d.company, phone: d.phone, status: d.status, owner: d.assigned_name || 'Salesperson', match: 'company_phone' }))
  }
);

// Why a guarded status write matched no row, as the most specific error.
async function statusRejection(id, actor, newStatus, extra = {}) {
  const current = await getLead(id);
  if (!current) return Object.assign(new Error('Lead not found'), { status: 404 });
  if (actor.type === 'sales' && current.assigned_to !== actor.id) return Object.assign(new Error('You do not own this lead'), { status: 403 });
  if (current.won_requested_at) return wonPendingError();
  if (newStatus === 'won') {
    const missing = missingWonFields(current);
    if (missing.length) return wonFieldsError(missing);
  }
  if (PROPOSAL_STAGES.includes(newStatus)) {
    const missing = missingProposalFields({ ...current, ...extra });
    if (missing.length) return proposalFieldsError(missing);
  }
  return Object.assign(new Error('This lead was just changed by someone else. Refresh and try again.'), { status: 409 });
}

// A move to Won. Admin: Won at once (with a confirm if the customer is
// already Won). Sales: Won at once when the lead has no open or Won
// duplicates; otherwise it becomes a Won request for Admin to approve.
async function winLead(existing, actor, { confirmDuplicate }) {
  const result = await withTransaction(async (client) => {
    await lockCustomer(client, existing.id);
    const dups = await liveDuplicates(client, existing.id);
    if (actor.type === 'sales' && dups.length) {
      const { rows } = await client.query(
        `UPDATE leads SET won_requested_at = now(), won_requested_by = $3, updated_at = now()
         WHERE id = $1 AND status = $2 AND assigned_to = $3 AND archived_at IS NULL AND won_requested_at IS NULL
           AND ${WON_COMPLETE_SQL}
         RETURNING ${LEAD_RETURNING}`,
        [existing.id, existing.status, actor.id]
      );
      if (!rows.length) return null;
      await logHistory(client, existing.id, 'won_requested', actor, { from: existing.status, duplicates: dups.map((d) => d.id) });
      return { lead: rows[0], closed: [], pending: true };
    }
    const wonDups = dups.filter((d) => d.status === 'won');
    if (actor.type === 'admin' && wonDups.length && !confirmDuplicate) throw duplicateWonError(wonDups);
    const won = await applyWon(client, existing.id, existing.status, actor, wonDups.length ? { duplicate_won_confirmed: true } : {});
    return won && { ...won, pending: false };
  });
  if (!result) throw await statusRejection(existing.id, actor, 'won');

  publish(result.pending ? 'lead_won_requested' : 'lead_status_changed',
    { id: existing.id, from: existing.status, to: result.pending ? existing.status : 'won' },
    [result.lead.assigned_to, ...result.closed.map((c) => c.assigned_to)]);
  return { ...result.lead, won_request_pending: result.pending, auto_closed: result.closed.length };
}

// `actor` = { type: 'admin'|'sales', id, name, isSuperAdmin? }. Authorization
// (who is allowed to call this at all) lives in routes/leads.js — this
// function enforces the rules that hold regardless of caller identity:
// checkStatusTransition (Sales follow the pipeline; Dead and reopening are
// Admin-only; Won is final for everyone), Won needs every lead field and a
// value above ₹0, Proposal/Follow-up/Hold need a value estimate + Ref ID,
// and Lost/Dead need a reason. `fields` may carry { value_estimate, ref_id }
// (Proposal-onwards moves), { lost_reason, lost_note } (Lost/Dead) and
// { confirm_duplicate } (Admin Won on an already-Won customer).
export async function updateStatus(id, newStatus, actor, fields = {}) {
  if (!STATUSES.includes(newStatus)) throw Object.assign(new Error(`status must be one of: ${STATUSES.join(', ')}`), { status: 400 });

  const existing = await getLead(id);
  if (!existing) throw Object.assign(new Error('Lead not found'), { status: 404 });

  // Audit fix P1-2 — an archived lead is a permanent historical record;
  // nobody, including Admin, may change it further.
  if (existing.archived_at) {
    throw Object.assign(new Error('This lead has been archived and can no longer be changed.'), { status: 409 });
  }

  // A pending Won request is settled through approve/reject only.
  if (existing.won_requested_at && existing.status !== newStatus) {
    if (actor.type === 'sales') throw wonPendingError();
    throw Object.assign(new Error('A Won request is waiting for your decision on this lead — approve or reject it first.'), { status: 409, code: 'WON_PENDING' });
  }

  // Setting the status a lead already has is a no-op: no write, no history
  // row, no event (re-marking Won used to move its win date).
  if (existing.status === newStatus) return existing;

  checkStatusTransition(existing.status, newStatus, actor.type);

  // A win must belong to someone — an unassigned Won lead could never be
  // assigned afterwards and would never appear on the leaderboard.
  if (newStatus === 'won' && !existing.assigned_to) {
    throw Object.assign(new Error('Assign this lead to a Sales employee before marking it Won.'), { status: 409 });
  }

  // Proposal fields supplied with the move (only for Proposal-onwards moves).
  const extra = {};
  if (PROPOSAL_STAGES.includes(newStatus)) {
    if (fields.value_estimate !== undefined) extra.value_estimate = requireValidValueEstimate(fields.value_estimate);
    if (fields.ref_id !== undefined) extra.ref_id = parseRefId(fields.ref_id);
    const missing = missingProposalFields({ ...existing, ...extra });
    if (missing.length) throw proposalFieldsError(missing);
  }
  if (newStatus === 'won') {
    const missing = missingWonFields(existing);
    if (missing.length) throw wonFieldsError(missing);
    return winLead(existing, actor, { confirmDuplicate: fields.confirm_duplicate === true });
  }
  const close = CLOSED_STATUSES.includes(newStatus) ? parseCloseReason(fields.lost_reason, fields.lost_note) : null;

  // Compare-and-set on the status validated above (plus the archived/owner/
  // pending/field-completeness guards), so a concurrent change can't slip
  // between those checks and this write. Entering a stage restarts the
  // clock — except Follow-up ↔ Hold, which keeps it; the meeting timestamp
  // is permanent once set. Reopening clears the close reason.
  const keepClock = keepsStageClock(existing.status, newStatus);
  const extraKeys = Object.keys(extra);
  const params = [id, newStatus, existing.status, close?.reason ?? null, close?.note ?? null, ...extraKeys.map((key) => extra[key])];
  const extraSets = extraKeys.map((key, i) => `, ${key} = $${i + 6}`).join('');
  let ownerGuard = '';
  if (actor.type === 'sales') {
    params.push(actor.id);
    ownerGuard = `AND assigned_to = $${params.length}`;
  }
  const proposalGuard = PROPOSAL_STAGES.includes(newStatus)
    ? `AND ${'value_estimate' in extra ? 'true' : 'value_estimate IS NOT NULL'}
       AND ${'ref_id' in extra ? 'true' : "NULLIF(btrim(ref_id), '') IS NOT NULL"}`
    : '';
  const { rows } = await query(
    `UPDATE leads
     SET status = $2,
         status_changed_at = ${keepClock ? 'status_changed_at' : 'now()'},
         meeting_reached_at = CASE WHEN $2 = 'meeting' THEN COALESCE(meeting_reached_at, now()) ELSE meeting_reached_at END,
         next_follow_up_date = CASE WHEN $2 IN ('lost', 'dead') THEN NULL ELSE next_follow_up_date END,
         lost_reason = $4::text, lost_note = $5::text,
         updated_at = now()${extraSets}
     WHERE id = $1 AND status = $3 AND archived_at IS NULL AND won_requested_at IS NULL
       ${proposalGuard}
       ${ownerGuard}
     RETURNING ${LEAD_RETURNING}`,
    params
  );
  if (!rows.length) throw await statusRejection(id, actor, newStatus, extra);

  await logHistory(null, id, 'status_changed', actor, {
    from: existing.status,
    to: newStatus,
    clock_started_at: rows[0].status_changed_at,
    ...(keepClock ? { clock_kept: true } : {}),
    ...(close ? { lost_reason: close.reason, ...(close.note ? { lost_note: close.note } : {}) } : {}),
    ...(extraKeys.length ? { fields: extraKeys } : {})
  });
  publish('lead_status_changed', { id, from: existing.status, to: newStatus }, [rows[0].assigned_to]);
  return rows[0];
}

// Admin decision on a Sales Won request. approve — the lead becomes Won
// (credited to its owner) and its open duplicates are closed as Lost.
// reject — the request is cleared with a reason and the stage timer resumes
// with the time it had left when the request was made.
export const WON_REQUEST_ACTIONS = ['approve', 'reject'];
export async function resolveWonRequest(id, { action, reason } = {}, actor) {
  if (!WON_REQUEST_ACTIONS.includes(action)) throw Object.assign(new Error(`action must be one of: ${WON_REQUEST_ACTIONS.join(', ')}`), { status: 400 });
  const rejectReason = typeof reason === 'string' ? reason.trim() : '';
  if (action === 'reject' && !rejectReason) throw Object.assign(new Error('Give a reason for rejecting the Won request.'), { status: 400 });
  if (rejectReason.length > MAX_LOST_NOTE_LENGTH) throw Object.assign(new Error(`The reason cannot exceed ${MAX_LOST_NOTE_LENGTH} characters`), { status: 400 });

  const result = await withTransaction(async (client) => {
    await lockCustomer(client, id);
    const { rows } = await client.query(
      `SELECT ${LEAD_RETURNING} FROM leads WHERE id = $1 AND won_requested_at IS NOT NULL AND archived_at IS NULL FOR UPDATE`,
      [id]
    );
    if (!rows.length) return null;
    const lead = rows[0];
    if (action === 'approve') {
      const missing = missingWonFields(lead);
      if (missing.length) throw wonFieldsError(missing);
      const won = await applyWon(client, id, lead.status, actor, { approved_request: true, requested_by: lead.won_requested_by });
      if (!won) throw Object.assign(new Error('This lead can no longer be marked Won. Refresh and try again.'), { status: 409 });
      return { action, lead: won.lead, closed: won.closed, owner: lead.assigned_to };
    }
    const { rows: updated } = await client.query(
      `UPDATE leads
       SET status_changed_at = status_changed_at + (now() - won_requested_at),
           won_requested_at = NULL, won_requested_by = NULL, updated_at = now()
       WHERE id = $1
       RETURNING ${LEAD_RETURNING}`,
      [id]
    );
    await logHistory(client, id, 'won_request_rejected', actor, { reason: rejectReason, clock_started_at: updated[0].status_changed_at });
    return { action, lead: updated[0], closed: [], owner: lead.assigned_to };
  });

  if (!result) throw Object.assign(new Error('This lead has no pending Won request any more. Refresh and try again.'), { status: 409 });
  publish('lead_won_request_resolved', { id, action }, [result.owner, ...result.closed.map((c) => c.assigned_to)]);
  return { action: result.action, lead: result.lead, autoClosed: result.closed.length };
}

// Next follow-up date: an India calendar date from today up to a year
// ahead. undefined = leave unchanged; null/'' = clear. Pure — unit-tested.
export const MAX_FOLLOW_UP_DAYS = 365;
export function parseFollowUpDate(raw, today = indiaDateKey()) {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  if (!isValidDateKey(raw)) throw Object.assign(new Error('Next follow-up date must be a valid date (YYYY-MM-DD)'), { status: 400 });
  if (raw < today) throw Object.assign(new Error('Next follow-up date cannot be in the past'), { status: 400 });
  if (raw > addDaysToDateKey(today, MAX_FOLLOW_UP_DAYS)) {
    throw Object.assign(new Error('Next follow-up date must be within the next 12 months'), { status: 400 });
  }
  return raw;
}

// Logs a follow-up note and/or sets the next follow-up date (drives "Due
// today" in My Leads). Notes stay allowed on closed (not archived) leads;
// a follow-up *date* only makes sense while the lead is active. For Sales,
// ownership is re-checked under a row lock in the same transaction as the
// write, so a lead reassigned a moment earlier can't be touched.
export async function addFollowUp(id, note, nextActionDate, actor) {
  const text = note == null ? '' : String(note).trim();
  const nextDate = parseFollowUpDate(nextActionDate);
  if (!text && nextDate === undefined) throw Object.assign(new Error('Add a note or a next follow-up date'), { status: 400 });

  const owner = await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT status, assigned_to, archived_at FROM leads WHERE id = $1 FOR UPDATE', [id]);
    const lead = rows[0];
    if (!lead) throw Object.assign(new Error('Lead not found'), { status: 404 });
    // Audit fix P1-2 — archived leads are immutable; a closed-but-not-yet-
    // archived (won/lost/dead) lead may still legitimately get a note.
    if (lead.archived_at) throw Object.assign(new Error('This lead has been archived and can no longer be changed.'), { status: 409 });
    if (actor.type === 'sales' && lead.assigned_to !== actor.id) throw Object.assign(new Error('You do not own this lead'), { status: 403 });
    if (nextDate && CLOSED_STATUSES.includes(lead.status)) {
      throw Object.assign(new Error(`This lead is ${lead.status} — a next follow-up date can only be set on an active lead.`), { status: 400 });
    }
    if (nextDate !== undefined) {
      await client.query('UPDATE leads SET next_follow_up_date = $2, updated_at = now() WHERE id = $1', [id, nextDate]);
    }
    await logHistory(client, id, 'follow_up', actor, {
      ...(text ? { note: text } : {}),
      ...(nextDate !== undefined ? { next_action_date: nextDate } : {})
    });
    return lead.assigned_to;
  });
  publish('lead_follow_up', { id }, [owner]);
  return getHistory(id);
}

// ============================================
// DELETE (§9 — hard delete only with no dependent history; else archive)
// ============================================

// A lead is hard-deleted only if it was never owned and has no activity
// beyond its 'created' row; anything else is archived so its history
// survives. Won leads are allowed too (Admin decision) — they always have
// history, so they are archived, which drops them out of Analytics; the
// Admin confirmation warns about that.
export async function deleteOrArchiveLead(id, actor) {
  const lead = await getLead(id);
  if (!lead) throw Object.assign(new Error('Lead not found'), { status: 404 });
  if (lead.archived_at) throw Object.assign(new Error('This lead is already archived.'), { status: 409 });
  const { rows } = await query('SELECT event_type FROM lead_history WHERE lead_id = $1', [id]);
  const canHardDelete = !lead.assigned_to && rows.every((r) => r.event_type === 'created');

  if (canHardDelete) {
    const { rowCount } = await query(
      "DELETE FROM leads WHERE id = $1 AND assigned_to IS NULL AND archived_at IS NULL",
      [id]
    );
    if (!rowCount) throw Object.assign(new Error('This lead was just changed by someone else. Refresh and try again.'), { status: 409 });
    publish('lead_deleted', { id });
    return { archived: false };
  }

  const archived = await withTransaction(async (client) => {
    const { rows: updated } = await client.query(
      `UPDATE leads SET archived_at = now(), won_requested_at = NULL, won_requested_by = NULL, updated_at = now()
       WHERE id = $1 AND archived_at IS NULL
       RETURNING assigned_to`,
      [id]
    );
    if (!updated.length) return null;
    await logHistory(client, id, 'archived', actor, {});
    return updated[0];
  });
  if (!archived) throw Object.assign(new Error('This lead was just changed by someone else. Refresh and try again.'), { status: 409 });

  publish('lead_archived', { id }, [archived.assigned_to]);
  return { archived: true };
}

// Bulk delete from the Admin Leads tab's multi-select. Each lead goes
// through deleteOrArchiveLead on its own, so the hard-delete-vs-archive rule
// is decided per lead; a lead that can't be removed (already archived,
// gone, changed concurrently) is skipped and reported back, not fatal.
export async function deleteOrArchiveLeads(ids, actor) {
  if (!Array.isArray(ids) || !ids.length) throw Object.assign(new Error('Select at least one lead'), { status: 400 });
  const unique = [...new Set(ids.map(String))];
  if (unique.length > MAX_BULK_ASSIGN) {
    throw Object.assign(new Error(`You can delete at most ${MAX_BULK_ASSIGN} leads at once`), { status: 400 });
  }
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!unique.every((id) => uuidRe.test(id))) throw Object.assign(new Error('Invalid lead id'), { status: 400 });

  let deleted = 0;
  let archived = 0;
  const skippedIds = [];
  for (const id of unique) {
    try {
      const result = await deleteOrArchiveLead(id, actor);
      if (result.archived) archived++; else deleted++;
    } catch (err) {
      if (!err.status) throw err;
      skippedIds.push(id);
    }
  }
  return { deleted, archived, skipped: skippedIds.length, skippedIds };
}

// ============================================
// EXCEL IMPORT (§8) — Upload/parsing happens client-side (see
// AdminSalesLeadsPage.jsx); this only ever receives already-parsed rows.
// `mode: 'validate'` never writes; `mode: 'confirm'` writes inside a single
// DB transaction so a failure partway through rolls back the whole batch
// (§8 "Use a database transaction so a failed confirmed batch rolls back
// rather than leaving a partial import").
// ============================================

const MAX_IMPORT_ROWS = 2000; // "reasonable V1 file/row limit" (§8)

// ExcelJS hands some cells over as objects — rich text ({ richText }),
// hyperlinks ({ text, hyperlink } — Excel links typed emails automatically),
// formulas ({ result }). String() turned those into "[object Object]"; this
// reads the text the spreadsheet actually shows. Pure — unit-tested.
export function cellText(value) {
  if (value === undefined || value === null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map((part) => part?.text ?? '').join('').trim();
    if ('text' in value) return cellText(value.text);
    if ('result' in value) return cellText(value.result);
    return '';
  }
  return String(value).trim();
}

// The numeric value of a value-estimate cell (formulas use their result).
const cellValue = (value) => (value && typeof value === 'object' && !(value instanceof Date)
  ? ('result' in value ? cellValue(value.result) : cellText(value))
  : value);

function validateRow(row, index, seenKeys, seenPhones) {
  const errors = [];
  const company = cellText(row.company).slice(0, MAX_SHORT_TEXT_LENGTH);
  const rawPhone = cellText(row.phone);
  const phone = normalizePhone(rawPhone);

  if (!company) errors.push('Company is required');
  if (!rawPhone || !isValidPhone(rawPhone)) errors.push('A valid phone number is required');
  const { value: valueEstimate, error: valueError } = parseValueEstimate(cellValue(row.value_estimate));
  if (valueError) errors.push(valueError);
  const demand = cellText(row.demand).slice(0, MAX_DEMAND_LENGTH) || null;

  // Possible duplicate = same Company + Phone (see DUPLICATES above), or the
  // same phone under a different company name.
  let duplicateOf = null;
  if (phone && company) {
    const key = duplicateKey(company, phone);
    if (seenKeys.has(key)) duplicateOf = 'this file';
    else if (seenPhones.has(phone)) duplicateOf = 'this file (same phone, different company)';
    seenKeys.add(key);
    seenPhones.add(phone);
  }

  return {
    row: index + 1,
    company,
    person_to_contact: cellText(row.person_to_contact).slice(0, MAX_SHORT_TEXT_LENGTH) || null,
    email: cellText(row.email).slice(0, MAX_SHORT_TEXT_LENGTH) || null,
    phone,
    value_estimate: valueError ? null : valueEstimate,
    demand,
    errors,
    duplicateOf
  };
}

// Shared by both validate (dry run) and confirm (write) so the rules can
// never drift between what the admin previewed and what actually gets
// imported.
export async function checkImportRows(rows) {
  if (!Array.isArray(rows) || !rows.length) throw Object.assign(new Error('No rows to import'), { status: 400 });
  if (rows.length > MAX_IMPORT_ROWS) {
    throw Object.assign(new Error(`A single import is limited to ${MAX_IMPORT_ROWS} rows`), { status: 400 });
  }

  const seenKeys = new Set();
  const seenPhones = new Set();
  const parsed = rows.map((row, index) => validateRow(row && typeof row === 'object' ? row : {}, index, seenKeys, seenPhones));

  // Duplicate check against the DB — one query for the whole batch. Keys
  // come from the same SQL function the rest of the module uses.
  const candidatePhones = [...new Set(parsed.filter((r) => r.phone && !r.errors.length).map((r) => r.phone))];
  const existingKeys = new Set();
  const existingPhones = new Set();
  if (candidatePhones.length) {
    const { rows: existing } = await query(
      'SELECT phone, lead_company_key(company) AS key FROM leads WHERE phone = ANY($1::text[]) AND archived_at IS NULL',
      [candidatePhones]
    );
    for (const r of existing) {
      existingKeys.add(`${r.key}|${r.phone}`);
      existingPhones.add(r.phone);
    }
  }

  for (const r of parsed) {
    if (r.duplicateOf || !r.phone) continue;
    if (existingKeys.has(duplicateKey(r.company, r.phone))) r.duplicateOf = 'existing lead';
    else if (existingPhones.has(r.phone)) r.duplicateOf = 'existing lead (same phone, different company)';
  }

  const valid = parsed.filter((r) => !r.errors.length && !r.duplicateOf);
  const failed = parsed.filter((r) => r.errors.length);
  const duplicates = parsed.filter((r) => !r.errors.length && r.duplicateOf);

  return { rows: parsed, valid, failed, duplicates, total: parsed.length };
}

// Possible duplicates are skipped unless `includeDuplicates` (the preview's
// "Also import N possible duplicates" tick-box) — duplicates are allowed,
// just never imported by accident.
export async function importLeads(rows, actor, { includeDuplicates = false } = {}) {
  const result = await checkImportRows(rows);
  const toImport = includeDuplicates ? [...result.valid, ...result.duplicates] : result.valid;
  if (!toImport.length) return { ...result, imported: 0 };

  await withTransaction(async (client) => {
    for (const r of toImport) {
      const inserted = await client.query(
        `INSERT INTO leads (company, person_to_contact, email, phone, value_estimate, demand, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'new') RETURNING id`,
        [r.company, r.person_to_contact, r.email, r.phone, r.value_estimate, r.demand]
      );
      await logHistory(client, inserted.rows[0].id, 'created', actor, {
        source: 'excel_import', row: r.row, ...(r.duplicateOf ? { duplicate_confirmed: true } : {})
      });
    }
  });

  publish('leads_imported', { count: toImport.length });
  return { ...result, imported: toImport.length };
}

// ============================================
// STATS & ANALYTICS — summary cards (Admin Leads tab, Sales dashboard) and
// the Admin Analytics tab. Read-only aggregates computed in SQL, never from
// the paginated list endpoints (those cap at 200 rows).
//
// Definitions (all exclude archived leads):
//   * Unassigned — no owner and still open (not won/lost/dead); waiting for
//              Admin to assign it.
//   * Taken  — assigned and still open (new/meeting/proposal/follow_up/hold).
//   * Won    — current status is won. The win date is the latest
//              status_changed -> won history row (there is no won_at column).
//   * Overdue / Due soon — assigned open leads whose stage deadline
//              (stageDeadlineSql) has passed / falls within the next 24h.
//   * Conversion rate — Won / (Won + Lost) over leads *closed* in the
//              period, by the date they reached that status. null when
//              nothing was closed (the UI shows "—", never 0% or NaN).
// Leads with no value_estimate still count toward `count`; they add ₹0 to
// `value` and are reported separately as `missingValue`.
// ============================================

const OPEN_STATUSES_SQL = `(${ACTIVE_STATUSES.map((st) => `'${st}'`).join(', ')})`;
const UNASSIGNED_SQL = `assigned_to IS NULL AND status NOT IN ('won', 'lost', 'dead')`;
const TAKEN_SQL = `assigned_to IS NOT NULL AND status IN ${OPEN_STATUSES_SQL}`;
const WON_SQL = `status = 'won'`;
// Overdue / due soon count only running timers (a lead waiting on a Won
// request is paused, never overdue).
const RUNNING_SQL = 'won_requested_at IS NULL';
const OVERDUE_SQL = `${TAKEN_SQL} AND ${RUNNING_SQL} AND ${stageDeadlineSql()} <= now()`;
const DUE_SOON_SQL = `${TAKEN_SQL} AND ${RUNNING_SQL} AND ${stageDeadlineSql()} > now() AND ${stageDeadlineSql()} <= now() + interval '24 hours'`;

// Period starts in India time — the database runs in UTC, so a bare
// date_trunc would put week/month boundaries at 05:30 IST. Weeks start on
// Monday (Postgres ISO weeks). Whitelisted: callers pass a key, never SQL.
const PERIOD_START_SQL = {
  all: 'NULL::timestamptz',
  month: `date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'`,
  week: `date_trunc('week', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'`
};
export const ANALYTICS_PERIODS = Object.keys(PERIOD_START_SQL);

// COUNT / SUM / missing-estimate triple for one condition, as FILTERed
// aggregates so several buckets come back from a single scan.
const bucketSql = (name, condition) => `
  COUNT(*) FILTER (WHERE ${condition})::int AS ${name}_count,
  COALESCE(SUM(value_estimate) FILTER (WHERE ${condition}), 0) AS ${name}_value,
  COUNT(*) FILTER (WHERE (${condition}) AND value_estimate IS NULL)::int AS ${name}_missing`;

// pg returns numeric as a string — convert once here.
const bucket = (row, name) => ({
  count: row[`${name}_count`] || 0,
  value: Number(row[`${name}_value`] || 0),
  missingValue: row[`${name}_missing`] || 0
});

export async function getAdminSummary() {
  const { rows } = await query(
    `SELECT ${bucketSql('unassigned', UNASSIGNED_SQL)}, ${bucketSql('taken', TAKEN_SQL)}, ${bucketSql('won', WON_SQL)},
            COUNT(*) FILTER (WHERE ${expiredSql('l')})::int AS expired_count,
            COUNT(*) FILTER (WHERE won_requested_at IS NOT NULL)::int AS won_requests_count
     FROM leads l WHERE archived_at IS NULL`
  );
  return {
    unassigned: bucket(rows[0], 'unassigned'),
    taken: bucket(rows[0], 'taken'),
    won: bucket(rows[0], 'won'),
    expired: rows[0].expired_count,
    wonRequests: rows[0].won_requests_count
  };
}

// The salesperson's own numbers over *all* their leads (never just the
// page on screen): dashboard cards plus the My Leads pipeline strip
// (per-stage count/overdue, Won/Lost, follow-ups due today or earlier).
export async function getSalesSummary(salesId) {
  const stageCols = ACTIVE_STATUSES.map((st) => `
    COUNT(*) FILTER (WHERE status = '${st}')::int AS stage_${st},
    COUNT(*) FILTER (WHERE status = '${st}' AND ${RUNNING_SQL} AND ${stageDeadlineSql()} <= now())::int AS stage_${st}_overdue`).join(',');
  const { rows } = await query(
    `SELECT ${bucketSql('taken', TAKEN_SQL)}, ${bucketSql('won', WON_SQL)},
            ${bucketSql('due_soon', DUE_SOON_SQL)}, ${bucketSql('overdue', OVERDUE_SQL)},
            COUNT(*) FILTER (WHERE status = 'lost')::int AS lost_count,
            COUNT(*) FILTER (WHERE status IN ${OPEN_STATUSES_SQL} AND next_follow_up_date <= ${TODAY_IST_SQL})::int AS due_today,
            ${stageCols}
     FROM leads WHERE archived_at IS NULL AND assigned_to = $1`,
    [salesId]
  );
  const r = rows[0];
  return {
    taken: bucket(r, 'taken'),
    won: bucket(r, 'won'),
    dueSoon: bucket(r, 'due_soon'),
    overdue: bucket(r, 'overdue'),
    lost: r.lost_count,
    dueToday: r.due_today,
    stages: Object.fromEntries(ACTIVE_STATUSES.map((st) => [st, { count: r[`stage_${st}`], overdue: r[`stage_${st}_overdue`] }]))
  };
}

// Won/lost leads with the date they reached their current status, limited
// to the period. The LATERAL MAX always yields one row, so a lead with no
// matching history row (not produced by any current code path) still
// counts for "All Time".
const closedInPeriodSql = (periodStart) => `
  SELECT l.id, l.assigned_to, l.status, l.value_estimate
  FROM leads l
  JOIN LATERAL (
    SELECT MAX(h.created_at) AS closed_at FROM lead_history h
    WHERE h.lead_id = l.id AND h.event_type = 'status_changed' AND h.details->>'to' = l.status
  ) c ON true
  WHERE l.archived_at IS NULL AND l.status IN ('won', 'lost')
    AND (${periodStart} IS NULL OR c.closed_at >= ${periodStart})`;

const conversionRate = (won, lost) => (won + lost > 0 ? won / (won + lost) : null);

const emptyPipeline = () => Object.fromEntries(ACTIVE_STATUSES.map((st) => [st, { count: 0, overdue: 0, dueSoon: 0 }]));

// Leaderboard order: Won count only (most first); ties share a rank
// (1, 1, 3) and are listed by name. Value and conversion rate are
// deliberately not part of the ranking.
export function rankLeaderboard(entries) {
  const sorted = [...entries].sort((a, b) => b.wonCount - a.wonCount || (a.name || '').localeCompare(b.name || ''));
  let rank = 0;
  return sorted.map((entry, i) => {
    if (i === 0 || sorted[i - 1].wonCount !== entry.wonCount) rank = i + 1;
    return { ...entry, rank };
  });
}

export async function getAnalytics(period = 'all') {
  if (!ANALYTICS_PERIODS.includes(period)) {
    throw Object.assign(new Error(`period must be one of: ${ANALYTICS_PERIODS.join(', ')}`), { status: 400 });
  }
  const periodStart = PERIOD_START_SQL[period];
  const deadline = stageDeadlineSql();

  // Pipeline + Needs Attention are always "right now" — not affected by the
  // period filter, which only applies to outcomes (conversion + leaderboard).
  const pipelineQ = query(
    `SELECT assigned_to, status, COUNT(*)::int AS count,
            COUNT(*) FILTER (WHERE ${RUNNING_SQL} AND ${deadline} <= now())::int AS overdue,
            COUNT(*) FILTER (WHERE ${RUNNING_SQL} AND ${deadline} > now() AND ${deadline} <= now() + interval '24 hours')::int AS due_soon
     FROM leads WHERE archived_at IS NULL AND ${TAKEN_SQL}
     GROUP BY assigned_to, status`
  );
  const attentionQ = query(
    `SELECT l.id, l.company, l.status, l.assigned_to, s.full_name AS assigned_name, ${stageDeadlineSql('l')} AS deadline
     FROM leads l
     LEFT JOIN sales s ON s.id = l.assigned_to
     WHERE l.archived_at IS NULL AND l.assigned_to IS NOT NULL AND l.status IN ${OPEN_STATUSES_SQL}
       AND l.won_requested_at IS NULL
       AND ${stageDeadlineSql('l')} <= now() + interval '24 hours'
     ORDER BY deadline ASC
     LIMIT 200`
  );
  const overallQ = query(
    `SELECT COUNT(*) FILTER (WHERE status = 'won')::int AS won_count,
            COALESCE(SUM(value_estimate) FILTER (WHERE status = 'won'), 0) AS won_value,
            COUNT(*) FILTER (WHERE status = 'lost')::int AS lost_count
     FROM (${closedInPeriodSql(periodStart)}) closed`
  );
  // Credit goes to the lead's current owner. Won leads can't be reassigned
  // (assignLead) and Lost leads can't be released by Sales, so that owner is
  // the one who closed it unless an Admin reopened and reassigned a Lost
  // lead. Only active employees are ranked.
  const leaderboardQ = query(
    `SELECT s.id, s.full_name, s.location,
            COUNT(c.status) FILTER (WHERE c.status = 'won')::int AS won_count,
            COUNT(c.status) FILTER (WHERE c.status = 'lost')::int AS lost_count
     FROM sales s
     LEFT JOIN (${closedInPeriodSql(periodStart)}) c ON c.assigned_to = s.id
     WHERE s.is_active = true
     GROUP BY s.id, s.full_name, s.location`
  );

  const [pipelineRes, attention, overall, leaderboard] = await Promise.all([pipelineQ, attentionQ, overallQ, leaderboardQ]);

  const stages = emptyPipeline();
  const bySales = new Map();
  for (const r of pipelineRes.rows) {
    if (!stages[r.status]) continue;
    if (!bySales.has(r.assigned_to)) bySales.set(r.assigned_to, emptyPipeline());
    for (const target of [stages, bySales.get(r.assigned_to)]) {
      target[r.status].count += r.count;
      target[r.status].overdue += r.overdue;
      target[r.status].dueSoon += r.due_soon;
    }
  }
  const sum = (key) => Object.values(stages).reduce((total, st) => total + st[key], 0);

  const now = Date.now();
  const items = attention.rows.map((r) => ({ ...r, deadline: new Date(r.deadline).toISOString() }));
  const overdueItems = items.filter((r) => new Date(r.deadline).getTime() <= now);
  const dueSoonItems = items.filter((r) => new Date(r.deadline).getTime() > now);

  const o = overall.rows[0];
  const ranked = rankLeaderboard(leaderboard.rows.map((r) => ({
    salesId: r.id,
    name: r.full_name,
    location: r.location,
    wonCount: r.won_count,
    lostCount: r.lost_count,
    pipeline: bySales.get(r.id) || emptyPipeline()
  })));

  return {
    period,
    pipeline: { stages, active: sum('count'), overdue: sum('overdue'), dueSoon: sum('dueSoon') },
    needsAttention: {
      overdue: { count: sum('overdue'), items: overdueItems },
      dueSoon: { count: sum('dueSoon'), items: dueSoonItems }
    },
    overall: {
      wonCount: o.won_count,
      wonValue: Number(o.won_value),
      lostCount: o.lost_count,
      conversionRate: conversionRate(o.won_count, o.lost_count)
    },
    leaderboard: ranked
  };
}
