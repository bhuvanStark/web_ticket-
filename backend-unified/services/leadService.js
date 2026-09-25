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
export async function releaseOverdueLeads() {
  const { rows } = await query(
    `UPDATE leads
     SET assigned_to = NULL, accepted_at = NULL, updated_at = now()
     WHERE assigned_to IS NOT NULL
       AND accepted_at IS NOT NULL
       AND meeting_reached_at IS NULL
       AND accepted_at < now() - interval '5 days'
       AND status NOT IN ('won', 'lost', 'dead')
       AND archived_at IS NULL
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

  const { data, error } = await supabase
    .from('leads')
    .insert([{
      company: String(company).trim(),
      person_to_contact: person_to_contact || null,
      email: email || null,
      phone: normalizePhone(phone),
      value_estimate: value_estimate ?? null,
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

  const payload = {};
  if (company !== undefined) payload.company = String(company).trim();
  if (person_to_contact !== undefined) payload.person_to_contact = person_to_contact || null;
  if (email !== undefined) payload.email = email || null;
  if (phone !== undefined) payload.phone = normalizePhone(phone);
  if (value_estimate !== undefined) payload.value_estimate = value_estimate;

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

  const { data: previous } = await supabase.from('leads').select('assigned_to, archived_at').eq('id', id).maybeSingle();
  if (!previous) throw Object.assign(new Error('Lead not found'), { status: 404 });
  // Audit fix P1-2 — archived leads are immutable even for Admin. Closed
  // (won/lost/dead) leads are deliberately NOT blocked here — direct
  // (re)assignment is exactly how an Admin explicitly reopens one.
  if (previous.archived_at) {
    throw Object.assign(new Error('This lead has been archived and can no longer be assigned.'), { status: 409 });
  }

  const { data, error } = await supabase
    .from('leads')
    .update({ assigned_to: salesId, accepted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(LEAD_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(error.message);

  await logHistory(null, id, 'assigned', actor, { from: previous.assigned_to, to: salesId, method: 'direct' });
  publish('lead_assigned', { id, assignedTo: salesId });
  return data;
}

// Leads a Sales employee may never pull back into circulation on their own
// — Dead is explicitly Admin-only to set (§6) and to *un*set (audit fix
// P1-1); Won/Lost are terminal outcomes a Sales employee shouldn't be able
// to silently reopen either (audit fix P1-3). An Admin may still reopen any
// of these explicitly via assignLead/updateStatus below.
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
  // state (Dead/Won/Lost); a Sales employee — even the lead's own former
  // owner — cannot revive or reopen a closed lead on their own. "Admin may
  // explicitly reopen where appropriate" per the fix approval.
  if (actor.type !== 'admin' && CLOSED_STATUSES.includes(existing.status)) {
    throw Object.assign(new Error(`This lead is marked ${existing.status} — only an Admin can change it further.`), { status: 403 });
  }

  const payload = { status: newStatus, updated_at: new Date().toISOString() };
  // Timer stop is permanent once set — never overwritten by a later status
  // change, including one that moves the lead away from 'meeting' again.
  if (newStatus === 'meeting' && !existing.meeting_reached_at) {
    payload.meeting_reached_at = new Date().toISOString();
  }

  const { data, error } = await supabase.from('leads').update(payload).eq('id', id).select(LEAD_COLUMNS).maybeSingle();
  if (error) throw new Error(error.message);

  await logHistory(null, id, 'status_changed', actor, { from: existing.status, to: newStatus });
  publish('lead_status_changed', { id, from: existing.status, to: newStatus });
  return data;
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
    value_estimate: row.value_estimate === '' || row.value_estimate == null ? null : Number(row.value_estimate),
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
