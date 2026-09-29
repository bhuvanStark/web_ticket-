// TaskPro Sales Module V1 (TaskPro_Sales_RBAC_plan.md §3-9). Additive module:
// does not import from or touch serviceRequestService.js, projectService.js,
// attendanceService.js, or any ticket/project code — a bug here can never
// affect tickets or projects (mirrors attendanceService.js's own isolation
// note for the same reason).
import { EventEmitter } from 'node:events';
import { supabase } from '../config/supabaseClient.js';
import { query, withTransaction } from '../config/database.js';

// ============================================
// REALTIME (Phase 7) — in-process pub/sub. No new dependency: routes/
// leads.js's SSE endpoint subscribes here and pushes events to connected
// browsers; every caller of this service that changes lead state emits
// through the same `emitter`, so there is exactly one place new event types
// get added.
// ============================================
export const emitter = new EventEmitter();
emitter.setMaxListeners(200); // one SSE connection per open browser tab

const publish = (type, payload) => emitter.emit('lead-event', { type, payload, at: new Date().toISOString() });

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

// The identifier duplicate detection compares on. §4 requires phone-only for
// V1 but "keep duplicate-validation logic modular so additional identifiers
// can be added later" — every duplicate check in this file goes through this
// one function so a future identifier (email, company) is a one-place change.
function duplicateKey(phone) {
  return normalizePhone(phone);
}

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
// FIVE-DAY RULE (§6) — lazy sweep, run at the top of every lead-listing/
// accept call so it's always server-side and never depends on a browser
// being open (also driven by a standalone interval in server.js for when
// nothing is actively hitting the API — see startLeadSweepInterval below).
// A lead is swept when: still assigned, was accepted, has never reached
// Meeting, more than 5 days have passed since acceptance, and it isn't
// already a closed/dead lead.
// ============================================

// The acceptance timer's eligibility test, minus the deadline itself — one
// definition shared by the sweep below and the "returning to pool soon"
// stats further down, so the two can never disagree about which leads the
// 5-day rule applies to.
const AUTO_RELEASE_ELIGIBLE_SQL = `assigned_to IS NOT NULL
       AND accepted_at IS NOT NULL
       AND meeting_reached_at IS NULL
       AND status NOT IN ('won', 'lost', 'dead')
       AND archived_at IS NULL`;

export async function releaseOverdueLeads() {
  const { rows } = await query(
    `UPDATE leads
     SET assigned_to = NULL, accepted_at = NULL, updated_at = now()
     WHERE ${AUTO_RELEASE_ELIGIBLE_SQL}
       AND accepted_at < now() - interval '5 days'
     RETURNING id, company, phone`
  );
  for (const lead of rows) {
    await logHistory(null, lead.id, 'auto_released', { type: 'system' }, {
      reason: 'No Meeting reached within 5 days of acceptance'
    });
  }
  if (rows.length) publish('leads_auto_released', { ids: rows.map((r) => r.id) });
  return rows;
}

let sweepIntervalHandle = null;
// Self-healing fallback for when no one is actively browsing the Sales
// pages — without this, a lead accepted right before everyone stops using
// the app for a while would only get swept the next time someone happens to
// hit a leads endpoint. 30 minutes is frequent enough that the 5-day
// deadline is never meaningfully late, and cheap enough to run unconditionally.
export function startLeadSweepInterval(intervalMs = 30 * 60 * 1000) {
  if (sweepIntervalHandle) return sweepIntervalHandle;
  sweepIntervalHandle = setInterval(() => {
    releaseOverdueLeads().catch((error) => console.error('Lead sweep failed:', error.message));
  }, intervalMs);
  sweepIntervalHandle.unref?.();
  return sweepIntervalHandle;
}

// ============================================
// READ
// ============================================

const LEAD_COLUMNS = 'id, company, person_to_contact, email, phone, value_estimate, status, assigned_to, accepted_at, meeting_reached_at, created_at, updated_at';

export async function listLeads({ status, assignedTo, unassignedOnly, limit = 50, offset = 0 } = {}) {
  await releaseOverdueLeads();
  let q = supabase.from('leads').select(LEAD_COLUMNS, { count: 'exact' }).is('archived_at', null);
  if (status) q = q.eq('status', status);
  if (unassignedOnly) q = q.is('assigned_to', null);
  else if (assignedTo) q = q.eq('assigned_to', assignedTo);
  q = q.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
  const { data, error, count } = await q;
  if (error) throw new Error(error.message);
  return { data: data || [], count };
}

// The common pool: unassigned, not archived, not dead (a Dead lead is
// explicitly out of circulation — §6 "Only an Admin explicitly marks a lead
// Dead").
export async function listPool({ limit = 50, offset = 0 } = {}) {
  await releaseOverdueLeads();
  const { data, error, count } = await supabase
    .from('leads')
    .select(LEAD_COLUMNS, { count: 'exact' })
    .is('assigned_to', null)
    .is('archived_at', null)
    .neq('status', 'dead')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  return { data: data || [], count };
}

export async function listMine(salesId, { limit = 50, offset = 0 } = {}) {
  await releaseOverdueLeads();
  const { data, error, count } = await supabase
    .from('leads')
    .select(LEAD_COLUMNS, { count: 'exact' })
    .eq('assigned_to', salesId)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  return { data: data || [], count };
}

export async function getLead(id) {
  const { data, error } = await supabase.from('leads').select(LEAD_COLUMNS + ', archived_at').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

// ============================================
// CREATE (manual, single lead — the Excel importer is separate, below)
// ============================================

export async function createLead({ company, person_to_contact, email, phone, value_estimate }, actor) {
  if (!company || !String(company).trim()) throw Object.assign(new Error('company is required'), { status: 400 });
  if (!isValidPhone(phone)) throw Object.assign(new Error('A valid phone number is required'), { status: 400 });
  const valueEstimate = requireValidValueEstimate(value_estimate);

  const { data, error } = await supabase
    .from('leads')
    .insert([{
      company: String(company).trim(),
      person_to_contact: person_to_contact || null,
      email: email || null,
      phone: normalizePhone(phone),
      value_estimate: valueEstimate,
      status: 'new'
    }])
    .select(LEAD_COLUMNS)
    .single();
  if (error) throw new Error(error.message);

  await logHistory(null, data.id, 'created', actor, { source: 'manual' });
  publish('lead_created', { id: data.id });
  return data;
}

export async function updateLead(id, { company, person_to_contact, email, phone, value_estimate }, actor) {
  if (company !== undefined && !String(company).trim()) throw Object.assign(new Error('company cannot be empty'), { status: 400 });
  if (phone !== undefined && !isValidPhone(phone)) throw Object.assign(new Error('A valid phone number is required'), { status: 400 });
  const valueEstimate = value_estimate !== undefined ? requireValidValueEstimate(value_estimate) : undefined;

  const payload = {};
  if (company !== undefined) payload.company = String(company).trim();
  if (person_to_contact !== undefined) payload.person_to_contact = person_to_contact || null;
  if (email !== undefined) payload.email = email || null;
  if (phone !== undefined) payload.phone = normalizePhone(phone);
  if (value_estimate !== undefined) payload.value_estimate = valueEstimate;

  // Audit fix P1-2 — archived leads are immutable; enforced in the same
  // atomic UPDATE (not a separate pre-check) so a concurrent archive can't
  // slip in between a check and this write.
  const { data, error } = await supabase.from('leads').update(payload).eq('id', id).is('archived_at', null).select(LEAD_COLUMNS).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    const existing = await getLead(id);
    if (!existing) throw Object.assign(new Error('Lead not found'), { status: 404 });
    throw Object.assign(new Error('This lead has been archived and can no longer be edited.'), { status: 409 });
  }

  await logHistory(null, id, 'edited', actor, { fields: Object.keys(payload) });
  publish('lead_updated', { id });
  return data;
}

// ============================================
// ALLOCATION (§5)
// ============================================

// Direct assignment by an admin — always allowed regardless of current
// assignment (reassignment included). Starts the acceptance timer
// immediately, same as a self-service Accept, so the 5-day rule applies
// uniformly regardless of how a lead was allocated.
export async function assignLead(id, salesId, actor) {
  const { data: sales } = await supabase.from('sales').select('id, is_active').eq('id', salesId).maybeSingle();
  if (!sales || !sales.is_active) throw Object.assign(new Error('Sales employee not found or inactive'), { status: 404 });

  const { data: previous } = await supabase.from('leads').select('assigned_to, archived_at, status').eq('id', id).maybeSingle();
  if (!previous) throw Object.assign(new Error('Lead not found'), { status: 404 });
  // Audit fix P1-2 — archived leads are immutable even for Admin. Lost/Dead
  // leads are deliberately NOT blocked here — direct (re)assignment is
  // exactly how an Admin explicitly reopens one.
  if (previous.archived_at) {
    throw Object.assign(new Error('This lead has been archived and can no longer be assigned.'), { status: 409 });
  }
  // A Won lead's owner is who the win is credited to (Analytics
  // leaderboard), so it can never be reassigned — not even by an Admin.
  if (previous.status === 'won') {
    throw Object.assign(new Error('This lead is Won and can no longer be reassigned.'), { status: 409 });
  }

  // The won guard is repeated in the UPDATE itself so a lead marked Won
  // between the check above and this write still can't be reassigned.
  const { data, error } = await supabase
    .from('leads')
    .update({ assigned_to: salesId, accepted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id)
    .neq('status', 'won')
    .select(LEAD_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw Object.assign(new Error('This lead is Won and can no longer be reassigned.'), { status: 409 });

  await logHistory(null, id, 'assigned', actor, { from: previous.assigned_to, to: salesId, method: 'direct' });
  publish('lead_assigned', { id, assignedTo: salesId });
  return data;
}

// Leads a Sales employee may never pull back into circulation on their own
// — Dead is explicitly Admin-only to set (§6) and to *un*set (audit fix
// P1-1); Won/Lost are terminal outcomes a Sales employee shouldn't be able
// to silently reopen either (audit fix P1-3). An Admin may still reopen a
// Lost or Dead lead via assignLead/updateStatus below; Won is final for
// everyone (see updateStatus).
const CLOSED_STATUSES = ['dead', 'won', 'lost'];

// Common-pool self-claim. Atomic: the WHERE assigned_to IS NULL guard (plus,
// per audit fix P1-1/P1-2, the archived/closed-status guards) is evaluated
// by Postgres as part of the single UPDATE statement, so two concurrent
// Accept calls for the same lead can never both succeed — the loser's
// UPDATE simply matches zero rows (§5 "Use an atomic backend/database
// claim. Never rely on frontend availability checks.").
export async function acceptLead(id, salesId, actor) {
  let q = supabase
    .from('leads')
    .update({ assigned_to: salesId, accepted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id)
    .is('assigned_to', null)
    .is('archived_at', null);
  for (const status of CLOSED_STATUSES) q = q.neq('status', status);
  const { data, error } = await q.select(LEAD_COLUMNS).maybeSingle();
  if (error) throw new Error(error.message);

  if (!data) {
    // Distinguish "someone else got it first" from "no such lead" / "this
    // lead is archived or closed" so the frontend can show a precise
    // message rather than always assuming a lost race.
    const existing = await getLead(id);
    if (!existing) throw Object.assign(new Error('Lead not found'), { status: 404 });
    if (existing.archived_at) {
      throw Object.assign(new Error('This lead has been archived and can no longer be accepted.'), { status: 409 });
    }
    if (CLOSED_STATUSES.includes(existing.status)) {
      throw Object.assign(new Error(`This lead is marked ${existing.status} and can no longer be accepted from the pool — ask an Admin to reopen it.`), { status: 409 });
    }
    throw Object.assign(new Error('This lead was just accepted by another salesperson.'), { status: 409 });
  }

  await logHistory(null, id, 'accepted', actor, { method: 'pool' });
  publish('lead_accepted', { id, assignedTo: salesId });
  return data;
}

// Self-service release. Ownership is re-checked in the same atomic UPDATE
// (WHERE assigned_to = salesId) as defense in depth beyond the route's own
// check — a lead that was reassigned a moment earlier can't be released by
// its former owner. Audit fix P1-2/P1-3 adds the same archived/closed-status
// guards as acceptLead — releasing a Won/Lost/Dead lead back into the pool
// made it indistinguishable from a fresh new lead to every other Sales
// employee.
export async function releaseLead(id, salesId, reason, actor) {
  if (!reason || !String(reason).trim()) throw Object.assign(new Error('A reason is required to release a lead'), { status: 400 });

  let q = supabase
    .from('leads')
    .update({ assigned_to: null, accepted_at: null, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('assigned_to', salesId)
    .is('archived_at', null);
  for (const status of CLOSED_STATUSES) q = q.neq('status', status);
  const { data, error } = await q.select(LEAD_COLUMNS).maybeSingle();
  if (error) throw new Error(error.message);

  if (!data) {
    const existing = await getLead(id);
    if (!existing || existing.assigned_to !== salesId) throw Object.assign(new Error('You do not own this lead'), { status: 403 });
    if (existing.archived_at) {
      throw Object.assign(new Error('This lead has been archived and can no longer be released.'), { status: 409 });
    }
    throw Object.assign(new Error(`This lead is marked ${existing.status} and can no longer be released — ask an Admin to reassign it.`), { status: 409 });
  }

  await logHistory(null, id, 'released', actor, { reason: String(reason).trim() });
  publish('lead_released', { id });
  return data;
}

// §6 "Salesperson deactivation: their active/unclosed leads return to the
// common pool." Called from routes/sales.js's deactivate/delete handlers.
// Closed leads (won/lost/dead) are left exactly as they are — they aren't
// "active" and reassigning them to the pool would be meaningless.
export async function reassignLeadsForDeactivatedSales(salesId, actor) {
  const { rows } = await query(
    `UPDATE leads
     SET assigned_to = NULL, accepted_at = NULL, updated_at = now()
     WHERE assigned_to = $1 AND status NOT IN ('won', 'lost', 'dead') AND archived_at IS NULL
     RETURNING id`,
    [salesId]
  );
  for (const lead of rows) {
    await logHistory(null, lead.id, 'deactivation_reassigned', actor, { previous_owner: salesId });
  }
  if (rows.length) publish('leads_deactivation_reassigned', { ids: rows.map((r) => r.id), salesId });
  return rows;
}

// ============================================
// PIPELINE / STATUS (§7)
// ============================================

const STATUSES = ['new', 'meeting', 'proposal', 'follow_up', 'won', 'lost', 'dead'];

// `actor` = { type: 'admin'|'sales', id, name, isSuperAdmin? }. Authorization
// (who is allowed to call this at all) lives in routes/leads.js — this
// function only enforces the rules that hold regardless of caller identity:
// a known status, and Dead being Admin-only (§6 "Only an Admin explicitly
// marks a lead Dead").
export async function updateStatus(id, newStatus, actor) {
  if (!STATUSES.includes(newStatus)) throw Object.assign(new Error(`status must be one of: ${STATUSES.join(', ')}`), { status: 400 });
  if (newStatus === 'dead' && actor.type !== 'admin') {
    throw Object.assign(new Error('Only an Admin can mark a lead Dead'), { status: 403 });
  }

  const existing = await getLead(id);
  if (!existing) throw Object.assign(new Error('Lead not found'), { status: 404 });

  // Audit fix P1-2 — an archived lead is a permanent historical record
  // (§9's "archive instead of delete" only means something if archived
  // actually means immutable); nobody, including Admin, may change it
  // further.
  if (existing.archived_at) {
    throw Object.assign(new Error('This lead has been archived and can no longer be changed.'), { status: 409 });
  }
  // Audit fix P1-1/P1-3 — only an Admin may move a lead OUT of a closed
  // state (Lost/Dead); a Sales employee — even the lead's own former owner —
  // cannot revive or reopen a closed lead on their own.
  if (actor.type !== 'admin' && CLOSED_STATUSES.includes(existing.status)) {
    throw Object.assign(new Error(`This lead is marked ${existing.status} — only an Admin can change it further.`), { status: 403 });
  }

  // Setting the status a lead already has is a no-op: no write, no history
  // row, no event. Re-marking a Won lead Won used to append a second
  // status_changed -> won row, moving its win date (analytics read the
  // latest one) into the current week/month.
  if (existing.status === newStatus) return existing;

  // Won is final — for everyone, Admin included. A Won lead can't be moved
  // to any other status, so it also can't be reopened and then reassigned
  // (assignLead/releaseLead already refuse Won leads), which keeps the win
  // credited to the salesperson who closed it.
  if (existing.status === 'won') {
    throw Object.assign(new Error('This lead is Won. A Won lead is final and cannot be changed.'), { status: 409 });
  }
  // A win must belong to someone — an unassigned Won lead could never be
  // assigned afterwards and would never appear on the leaderboard.
  if (newStatus === 'won' && !existing.assigned_to) {
    throw Object.assign(new Error('Assign this lead to a Sales employee before marking it Won.'), { status: 409 });
  }

  // Compare-and-set on the status validated above (plus the owner/archived
  // guards), so a concurrent change — another status update, an archive, an
  // unassignment — can't slip between those checks and this write. The
  // meeting timer stop is permanent once set, never overwritten.
  const { rows } = await query(
    `UPDATE leads
     SET status = $2,
         meeting_reached_at = CASE WHEN $2 = 'meeting' THEN COALESCE(meeting_reached_at, now()) ELSE meeting_reached_at END,
         updated_at = now()
     WHERE id = $1 AND status = $3 AND archived_at IS NULL
       AND ($2 <> 'won' OR assigned_to IS NOT NULL)
     RETURNING ${LEAD_COLUMNS}`,
    [id, newStatus, existing.status]
  );
  if (!rows.length) {
    throw Object.assign(new Error('This lead was just changed by someone else. Refresh and try again.'), { status: 409 });
  }

  await logHistory(null, id, 'status_changed', actor, { from: existing.status, to: newStatus });
  publish('lead_status_changed', { id, from: existing.status, to: newStatus });
  return rows[0];
}

export async function addFollowUp(id, note, nextActionDate, actor) {
  if (!note || !String(note).trim()) throw Object.assign(new Error('A note is required'), { status: 400 });
  const existing = await getLead(id);
  if (!existing) throw Object.assign(new Error('Lead not found'), { status: 404 });
  // Audit fix P1-2 — archived leads are immutable; a closed-but-not-yet-
  // archived (won/lost/dead) lead may still legitimately get a note (e.g.
  // "customer said price was the issue"), so only archived_at blocks here.
  if (existing.archived_at) {
    throw Object.assign(new Error('This lead has been archived and can no longer be changed.'), { status: 409 });
  }

  await logHistory(null, id, 'follow_up', actor, { note: String(note).trim(), next_action_date: nextActionDate || null });
  publish('lead_follow_up', { id });
  return getHistory(id);
}

// ============================================
// DELETE (§9 — hard delete only with no dependent history; else archive)
// ============================================

export async function deleteOrArchiveLead(id, actor) {
  const { rows } = await query('SELECT event_type FROM lead_history WHERE lead_id = $1', [id]);
  const hasRealActivity = rows.some((r) => r.event_type !== 'created');

  if (!hasRealActivity) {
    const { error } = await supabase.from('leads').delete().eq('id', id);
    if (error) throw new Error(error.message);
    publish('lead_deleted', { id });
    return { archived: false };
  }

  const { data, error } = await supabase
    .from('leads')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw Object.assign(new Error('Lead not found'), { status: 404 });

  await logHistory(null, id, 'archived', actor, {});
  publish('lead_archived', { id });
  return { archived: true };
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

function validateRow(row, index, seenPhones) {
  const errors = [];
  const company = (row.company || '').toString().trim();
  const phone = normalizePhone(row.phone);

  if (!company) errors.push('Company is required');
  if (!row.phone || !isValidPhone(row.phone)) errors.push('A valid phone number is required');
  // ExcelJS hands formula cells over as { formula, result } — judge the
  // computed result, same as what the spreadsheet displays.
  const rawValue = row.value_estimate && typeof row.value_estimate === 'object' && 'result' in row.value_estimate
    ? row.value_estimate.result
    : row.value_estimate;
  const { value: valueEstimate, error: valueError } = parseValueEstimate(rawValue);
  if (valueError) errors.push(valueError);

  let duplicateOf = null;
  if (phone) {
    if (seenPhones.has(phone)) duplicateOf = 'this file';
    seenPhones.add(phone);
  }

  return {
    row: index + 1,
    company,
    person_to_contact: (row.person_to_contact || '').toString().trim() || null,
    email: (row.email || '').toString().trim() || null,
    phone,
    value_estimate: valueError ? null : valueEstimate,
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

  const seenPhones = new Set();
  const parsed = rows.map((row, index) => validateRow(row, index, seenPhones));

  // Duplicate check against the DB, phone-only (§4) — one query for the
  // whole batch rather than one per row.
  const candidatePhones = [...new Set(parsed.filter((r) => r.phone && !r.errors.length).map((r) => duplicateKey(r.phone)))];
  let existingPhones = new Set();
  if (candidatePhones.length) {
    const { data, error } = await supabase.from('leads').select('phone').in('phone', candidatePhones).is('archived_at', null);
    if (error) throw new Error(error.message);
    existingPhones = new Set((data || []).map((r) => duplicateKey(r.phone)));
  }

  for (const r of parsed) {
    if (!r.duplicateOf && r.phone && existingPhones.has(duplicateKey(r.phone))) r.duplicateOf = 'existing lead';
  }

  const valid = parsed.filter((r) => !r.errors.length && !r.duplicateOf);
  const failed = parsed.filter((r) => r.errors.length);
  const duplicates = parsed.filter((r) => !r.errors.length && r.duplicateOf);

  return { rows: parsed, valid, failed, duplicates, total: parsed.length };
}

export async function importLeads(rows, actor) {
  const result = await checkImportRows(rows);
  if (!result.valid.length) return { ...result, imported: 0 };

  await withTransaction(async (client) => {
    for (const r of result.valid) {
      const inserted = await client.query(
        `INSERT INTO leads (company, person_to_contact, email, phone, value_estimate, status)
         VALUES ($1, $2, $3, $4, $5, 'new') RETURNING id`,
        [r.company, r.person_to_contact, r.email, r.phone, r.value_estimate]
      );
      await logHistory(client, inserted.rows[0].id, 'created', actor, { source: 'excel_import', row: r.row });
    }
  });

  publish('leads_imported', { count: result.valid.length });
  return { ...result, imported: result.valid.length };
}

// ============================================
// STATS & ANALYTICS — summary cards (Admin Leads tab, Sales dashboard) and
// the Admin Analytics tab. Read-only aggregates computed in SQL, never from
// the paginated list endpoints (those cap at 200 rows). Each entry point
// runs the lazy 5-day sweep first, same as the list endpoints, so the cards
// always agree with the tables shown next to them.
//
// Definitions (all exclude archived leads):
//   * Pool   — unassigned and still open (not won/lost/dead). Stricter than
//              listPool(), which also shows unassigned won/lost leads that
//              acceptLead() would refuse anyway.
//   * Taken  — assigned and still open (new/meeting/proposal/follow_up).
//   * Won    — current status is won. The win date is the latest
//              status_changed -> won history row (there is no won_at column).
//   * Conversion rate — Won / (Won + Lost) over leads *closed* in the
//              period, by the date they reached that status. Open leads are
//              undecided and Dead is an Admin disqualification, not a sales
//              outcome, so neither is in the denominator. null when nothing
//              was closed (the UI shows "—", never 0% or NaN).
// Leads with no value_estimate still count toward `count`; they add ₹0 to
// `value` and are reported separately as `missingValue`.
// ============================================

const OPEN_STATUSES_SQL = `('new', 'meeting', 'proposal', 'follow_up')`;
const POOL_SQL = `assigned_to IS NULL AND status NOT IN ('won', 'lost', 'dead')`;
const TAKEN_SQL = `assigned_to IS NOT NULL AND status IN ${OPEN_STATUSES_SQL}`;
const WON_SQL = `status = 'won'`;
// Released within the next 24 hours: accepted between 5 and 4 days ago.
const RETURNING_SOON_SQL = `${AUTO_RELEASE_ELIGIBLE_SQL}
       AND accepted_at >= now() - interval '5 days'
       AND accepted_at < now() - interval '4 days'`;
const STALE_POOL_DAYS = 7;

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
  await releaseOverdueLeads();
  const { rows } = await query(
    `SELECT ${bucketSql('pool', POOL_SQL)}, ${bucketSql('taken', TAKEN_SQL)}, ${bucketSql('won', WON_SQL)}
     FROM leads WHERE archived_at IS NULL`
  );
  return { pool: bucket(rows[0], 'pool'), taken: bucket(rows[0], 'taken'), won: bucket(rows[0], 'won') };
}

export async function getSalesSummary(salesId) {
  await releaseOverdueLeads();
  const { rows } = await query(
    `SELECT ${bucketSql('taken', TAKEN_SQL)}, ${bucketSql('won', WON_SQL)}, ${bucketSql('returning', RETURNING_SOON_SQL)}
     FROM leads WHERE archived_at IS NULL AND assigned_to = $1`,
    [salesId]
  );
  return {
    taken: bucket(rows[0], 'taken'),
    won: bucket(rows[0], 'won'),
    returningSoon: bucket(rows[0], 'returning')
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

export async function getAnalytics(period = 'all') {
  if (!ANALYTICS_PERIODS.includes(period)) {
    throw Object.assign(new Error(`period must be one of: ${ANALYTICS_PERIODS.join(', ')}`), { status: 400 });
  }
  const periodStart = PERIOD_START_SQL[period];
  await releaseOverdueLeads();

  // Needs Attention is always "right now" — not affected by the period
  // filter, which only applies to outcomes (conversion + leaderboard).
  const returningSoonQ = query(
    `SELECT l.id, l.company, l.value_estimate, l.status, l.assigned_to, s.full_name AS assigned_name,
            l.accepted_at + interval '5 days' AS releases_at
     FROM (SELECT * FROM leads WHERE ${RETURNING_SOON_SQL}) l
     LEFT JOIN sales s ON s.id = l.assigned_to
     ORDER BY l.accepted_at ASC`
  );
  // "Untouched" = no lead_history activity (and no creation) in the last
  // STALE_POOL_DAYS days.
  const stalePoolQ = query(
    `SELECT l.id, l.company, l.value_estimate, l.status, a.last_activity_at
     FROM (SELECT * FROM leads WHERE archived_at IS NULL AND ${POOL_SQL}) l
     JOIN LATERAL (
       SELECT GREATEST(l.created_at, MAX(h.created_at)) AS last_activity_at
       FROM lead_history h WHERE h.lead_id = l.id
     ) a ON true
     WHERE a.last_activity_at < now() - interval '${STALE_POOL_DAYS} days'
     ORDER BY a.last_activity_at ASC`
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
  // lead. Only active employees are ranked; wins whose owner was deleted
  // still count in `overall`.
  const leaderboardQ = query(
    `SELECT s.id, s.full_name, s.location,
            COUNT(c.status) FILTER (WHERE c.status = 'won')::int AS won_count,
            COALESCE(SUM(c.value_estimate) FILTER (WHERE c.status = 'won'), 0) AS won_value,
            COUNT(c.status) FILTER (WHERE c.status = 'won' AND c.value_estimate IS NULL)::int AS won_missing,
            COUNT(c.status) FILTER (WHERE c.status = 'lost')::int AS lost_count
     FROM sales s
     LEFT JOIN (${closedInPeriodSql(periodStart)}) c ON c.assigned_to = s.id
     WHERE s.is_active = true
     GROUP BY s.id, s.full_name, s.location`
  );

  const [returningSoon, stalePool, overall, leaderboard] = await Promise.all([returningSoonQ, stalePoolQ, overallQ, leaderboardQ]);

  const summarize = (rows) => ({
    count: rows.length,
    value: rows.reduce((sum, r) => sum + Number(r.value_estimate || 0), 0),
    missingValue: rows.filter((r) => r.value_estimate == null).length
  });
  const mapItem = (r) => ({ ...r, value_estimate: r.value_estimate == null ? null : Number(r.value_estimate) });

  const o = overall.rows[0];
  const ranked = leaderboard.rows
    .map((r) => ({
      salesId: r.id,
      name: r.full_name,
      location: r.location,
      wonCount: r.won_count,
      wonValue: Number(r.won_value),
      wonMissingValue: r.won_missing,
      lostCount: r.lost_count,
      conversionRate: conversionRate(r.won_count, r.lost_count)
    }))
    // Won ₹ -> Conversion Rate -> Won Count; name keeps the order stable.
    .sort((a, b) =>
      b.wonValue - a.wonValue ||
      (b.conversionRate ?? -1) - (a.conversionRate ?? -1) ||
      b.wonCount - a.wonCount ||
      (a.name || '').localeCompare(b.name || '')
    )
    .map((r, i) => ({ ...r, rank: i + 1 }));

  return {
    period,
    needsAttention: {
      returningSoon: { ...summarize(returningSoon.rows), items: returningSoon.rows.map(mapItem) },
      stalePool: { ...summarize(stalePool.rows), days: STALE_POOL_DAYS, items: stalePool.rows.map(mapItem) }
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
