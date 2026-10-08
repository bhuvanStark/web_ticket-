// TaskPro Sales Module V1 (TaskPro_Sales_RBAC_plan.md §3-9). Mounted at
// /api/sales-leads — deliberately not /api/sales, which is already the
// existing Sales *employee roster* router (routes/sales.js). Leads are a
// separate resource from the Sales identity table; nothing here touches
// sales.js, the sales table's own CRUD, or Sales/Back-Office authentication.
//
// Admin access to everything in this file additionally requires the 'sales'
// admin_permissions module (§2 "Sales is an Admin module controlled by the
// RBAC above" — a Super Admin bypasses this the same as any other module).
// Sales employees reach their own subset (mine/release/status/follow-ups/
// remarks on leads they own, plus creating and editing their own) through
// requireSales, unchanged from their existing identity/session. Pipeline V2
// removed the common pool: Admin assigns leads directly (one or in bulk).
import crypto from 'node:crypto';
import express from 'express';
import { requireAdmin, requirePermission, requireSuperAdmin, requireSales, requireAdminOrSales, verifyLiveSession } from '../middleware/auth.js';
import { validateUUID } from '../middleware/validation.js';
import { supabase } from '../config/supabaseClient.js';
import * as leadService from '../services/leadService.js';

const router = express.Router();

// ============================================
// Shared-endpoint authorization helper. GET /:id, PATCH /:id/status,
// POST /:id/follow-ups, and GET /:id/history are reachable by either an
// admin (with the 'sales' module) or the owning Sales employee — each side
// otherwise has its own dedicated route (list/mine, assign, release,
// etc.), so this is deliberately the only place both roles meet. Every
// route using it sits behind requireAdminOrSales, so the session is live
// (active, not revoked) and req.user.isSuperAdmin comes from the DB.
// ============================================
async function hasSalesModule(adminId) {
  const { data } = await supabase
    .from('admin_permissions')
    .select('can_access')
    .eq('admin_id', adminId)
    .eq('module', 'sales')
    .maybeSingle();
  return data?.can_access === true;
}

async function actorAndAccess(req, lead) {
  const { role, userId, isSuperAdmin } = req.user;
  if (role === 'admin') {
    const canAccess = isSuperAdmin === true || await hasSalesModule(userId);
    const { data: admin } = await supabase.from('admins').select('full_name').eq('id', userId).maybeSingle();
    return { actor: { type: 'admin', id: userId, name: admin?.full_name || null, isSuperAdmin }, canAccess, isOwner: true };
  }
  if (role === 'sales') {
    const { data: salesRow } = await supabase.from('sales').select('full_name').eq('id', userId).maybeSingle();
    const isOwner = !!lead && lead.assigned_to === userId;
    return { actor: { type: 'sales', id: userId, name: salesRow?.full_name || null }, canAccess: true, isOwner };
  }
  return { actor: null, canAccess: false, isOwner: false };
}

// `code` (e.g. DUPLICATE_LEAD, DUPLICATE_WON, WON_PENDING) and `duplicates` let the UI show
// the duplicate warning and offer "continue anyway".
function sendError(res, error) {
  const status = error.status || 500;
  res.status(status).json({
    success: false,
    error: error.message || 'Error',
    ...(error.code ? { code: error.code } : {}),
    ...(error.duplicates ? { duplicates: error.duplicates } : {})
  });
}

const confirmed = (req) => req.body?.confirm_duplicate === true;

// Query options shared by the Sales "mine" list and its Super Admin view-as twin.
const mineOptions = ({ scope, status, q, limit, offset }) => ({
  scope: scope || 'active',
  status: status || undefined,
  q: q || undefined,
  limit: limit ? Number(limit) : 50,
  offset: offset ? Number(offset) : 0
});

// ============================================
// ADMIN-ONLY
// ============================================

router.get('/', requireAdmin, requirePermission('sales'), async (req, res) => {
  try {
    const { status, assigned_to, unassigned, overdue, expired, won_requests, archived, q, limit, offset } = req.query;
    const result = await leadService.listLeads({
      status: status || undefined,
      assignedTo: assigned_to || undefined,
      unassignedOnly: unassigned === 'true',
      overdueOnly: overdue === 'true',
      expiredOnly: expired === 'true',
      wonRequestsOnly: won_requests === 'true',
      archivedOnly: archived === 'true',
      q: q || undefined,
      limit: limit ? Number(limit) : 50,
      offset: offset ? Number(offset) : 0
    });
    res.json({ success: true, data: result.data, pagination: { total: result.count } });
  } catch (error) {
    sendError(res, error);
  }
});

// Summary cards above the Admin lead table (Pool / Taken / Won).
router.get('/summary', requireAdmin, requirePermission('sales'), async (_req, res) => {
  try {
    res.json({ success: true, data: await leadService.getAdminSummary() });
  } catch (error) {
    sendError(res, error);
  }
});

// Analytics tab — Needs Attention, conversion, leaderboard.
// ?period=all|month|week (India-time boundaries).
router.get('/analytics', requireAdmin, requirePermission('sales'), async (req, res) => {
  try {
    res.json({ success: true, data: await leadService.getAnalytics(req.query.period || 'all') });
  } catch (error) {
    sendError(res, error);
  }
});

// ============================================
// SUPER ADMIN — "View as Sales employee". Mirrors the technician "view as":
// the Super Admin keeps their own admin JWT (no Sales token is ever minted),
// and reads that employee's dashboard/leads through these read-only routes.
// requireSuperAdmin re-checks is_super_admin live on every call, so a normal
// admin — even one with the 'sales' module — can't use them. Every write a
// Sales employee can make stays behind requireSales and is unreachable here.
// ============================================
async function requireSalesEmployee(req, res, next) {
  try {
    const { data } = await supabase.from('sales').select('id').eq('id', req.params.id).maybeSingle();
    if (!data) return res.status(404).json({ success: false, error: 'Sales employee not found' });
    next();
  } catch (error) {
    sendError(res, error);
  }
}

router.get('/view-as/:id/summary', requireSuperAdmin, validateUUID, requireSalesEmployee, async (req, res) => {
  try {
    res.json({ success: true, data: await leadService.getSalesSummary(req.params.id) });
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/view-as/:id/mine', requireSuperAdmin, validateUUID, requireSalesEmployee, async (req, res) => {
  try {
    const result = await leadService.listMine(req.params.id, mineOptions(req.query));
    res.json({ success: true, data: result.data, pagination: { total: result.count } });
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/', requireAdmin, requirePermission('sales'), async (req, res) => {
  try {
    const { data: admin } = await supabase.from('admins').select('full_name').eq('id', req.user.userId).maybeSingle();
    const data = await leadService.createLead(req.body || {}, { type: 'admin', id: req.user.userId, name: admin?.full_name }, { confirmDuplicate: confirmed(req) });
    res.status(201).json({ success: true, data });
  } catch (error) {
    sendError(res, error);
  }
});

router.put('/:id', requireAdmin, requirePermission('sales'), validateUUID, async (req, res) => {
  try {
    const { data: admin } = await supabase.from('admins').select('full_name').eq('id', req.user.userId).maybeSingle();
    const data = await leadService.updateLead(req.params.id, req.body || {}, { type: 'admin', id: req.user.userId, name: admin?.full_name }, { confirmDuplicate: confirmed(req) });
    res.json({ success: true, data });
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/:id/assign', requireAdmin, requirePermission('sales'), validateUUID, async (req, res) => {
  try {
    const { sales_id } = req.body || {};
    if (!sales_id) return res.status(400).json({ success: false, error: 'sales_id is required' });
    const { data: admin } = await supabase.from('admins').select('full_name').eq('id', req.user.userId).maybeSingle();
    const data = await leadService.assignLead(req.params.id, sales_id, { type: 'admin', id: req.user.userId, name: admin?.full_name });
    res.json({ success: true, data, message: 'Lead assigned' });
  } catch (error) {
    sendError(res, error);
  }
});

// Bulk assignment from the Admin Leads tab's multi-select:
// { lead_ids: [uuid, ...], sales_id }. Won/archived leads are skipped and
// reported back in `skipped`.
router.post('/assign-bulk', requireAdmin, requirePermission('sales'), async (req, res) => {
  try {
    const { lead_ids, sales_id } = req.body || {};
    if (!sales_id) return res.status(400).json({ success: false, error: 'sales_id is required' });
    const { data: admin } = await supabase.from('admins').select('full_name').eq('id', req.user.userId).maybeSingle();
    const data = await leadService.assignLeads(lead_ids, sales_id, { type: 'admin', id: req.user.userId, name: admin?.full_name });
    res.json({ success: true, data });
  } catch (error) {
    sendError(res, error);
  }
});

// Admin decision on an expired stage: { action: 'ignore' | 'restart' |
// 'reassign', sales_id (reassign only) }.
router.post('/:id/expiry', requireAdmin, requirePermission('sales'), validateUUID, async (req, res) => {
  try {
    const { data: admin } = await supabase.from('admins').select('full_name').eq('id', req.user.userId).maybeSingle();
    const data = await leadService.resolveExpiredLead(req.params.id, { action: req.body?.action, salesId: req.body?.sales_id }, { type: 'admin', id: req.user.userId, name: admin?.full_name });
    res.json({ success: true, data });
  } catch (error) {
    sendError(res, error);
  }
});

// Admin decision on a Sales Won request (a Won on a lead with duplicates):
// { action: 'approve' | 'reject', reason (reject only) }.
router.post('/:id/won-request', requireAdmin, requirePermission('sales'), validateUUID, async (req, res) => {
  try {
    const { data: admin } = await supabase.from('admins').select('full_name').eq('id', req.user.userId).maybeSingle();
    const data = await leadService.resolveWonRequest(req.params.id, { action: req.body?.action, reason: req.body?.reason }, { type: 'admin', id: req.user.userId, name: admin?.full_name });
    res.json({ success: true, data });
  } catch (error) {
    sendError(res, error);
  }
});

// Bulk delete from the Admin Leads tab's multi-select: { lead_ids: [uuid, ...] }.
// Per lead: hard delete if it has no history, otherwise archive.
router.post('/delete-bulk', requireAdmin, requirePermission('sales'), async (req, res) => {
  try {
    const { data: admin } = await supabase.from('admins').select('full_name').eq('id', req.user.userId).maybeSingle();
    const data = await leadService.deleteOrArchiveLeads(req.body?.lead_ids, { type: 'admin', id: req.user.userId, name: admin?.full_name });
    res.json({ success: true, data });
  } catch (error) {
    sendError(res, error);
  }
});

router.delete('/:id', requireAdmin, requirePermission('sales'), validateUUID, async (req, res) => {
  try {
    const { data: admin } = await supabase.from('admins').select('full_name').eq('id', req.user.userId).maybeSingle();
    const result = await leadService.deleteOrArchiveLead(req.params.id, { type: 'admin', id: req.user.userId, name: admin?.full_name });
    res.json({
      success: true,
      message: result.archived
        ? 'Lead has history and was archived instead of deleted, to preserve it'
        : 'Lead deleted'
    });
  } catch (error) {
    sendError(res, error);
  }
});

// §8 Excel import — Upload/parse happens client-side; both endpoints take
// the same shape: { rows: [{ company, person_to_contact, email, phone,
// value_estimate, demand }, ...] }, plus include_duplicates on /import.
// /validate never writes.
router.post('/import/validate', requireAdmin, requirePermission('sales'), async (req, res) => {
  try {
    const result = await leadService.checkImportRows(req.body?.rows || []);
    res.json({ success: true, data: result });
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/import', requireAdmin, requirePermission('sales'), async (req, res) => {
  try {
    const { data: admin } = await supabase.from('admins').select('full_name').eq('id', req.user.userId).maybeSingle();
    const result = await leadService.importLeads(req.body?.rows || [], { type: 'admin', id: req.user.userId, name: admin?.full_name }, {
      includeDuplicates: req.body?.include_duplicates === true
    });
    res.json({ success: true, data: result });
  } catch (error) {
    sendError(res, error);
  }
});

// ============================================
// SALES-ONLY
// ============================================

router.get('/mine', requireSales, async (req, res) => {
  try {
    const result = await leadService.listMine(req.user.userId, mineOptions(req.query));
    res.json({ success: true, data: result.data, pagination: { total: result.count } });
  } catch (error) {
    sendError(res, error);
  }
});

// The signed-in Sales employee's own dashboard cards. Always scoped to
// req.user.userId — never to an id from the request.
router.get('/mine/summary', requireSales, async (req, res) => {
  try {
    res.json({ success: true, data: await leadService.getSalesSummary(req.user.userId) });
  } catch (error) {
    sendError(res, error);
  }
});

// A Sales employee adding their own lead — assigned to them on creation (leadService.createLead's ownerSalesId).
// The owner is always req.user.userId, never an id from the request body.
router.post('/mine', requireSales, async (req, res) => {
  try {
    const { data: salesRow } = await supabase.from('sales').select('full_name').eq('id', req.user.userId).maybeSingle();
    const data = await leadService.createLead(req.body || {}, { type: 'sales', id: req.user.userId, name: salesRow?.full_name }, { ownerSalesId: req.user.userId, confirmDuplicate: confirmed(req) });
    res.status(201).json({ success: true, data });
  } catch (error) {
    sendError(res, error);
  }
});

// A Sales employee editing the fields of a lead they own, while it is open
// (ownership/open status re-checked atomically in leadService). Separate from
// the Admin PUT /:id so that route's contract is unchanged.
router.put('/:id/details', requireSales, validateUUID, async (req, res) => {
  try {
    const { data: salesRow } = await supabase.from('sales').select('full_name').eq('id', req.user.userId).maybeSingle();
    const data = await leadService.updateLeadAsSales(req.params.id, req.user.userId, req.body || {}, { type: 'sales', id: req.user.userId, name: salesRow?.full_name }, { confirmDuplicate: confirmed(req) });
    res.json({ success: true, data });
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/:id/release', requireSales, validateUUID, async (req, res) => {
  try {
    const { data: salesRow } = await supabase.from('sales').select('full_name').eq('id', req.user.userId).maybeSingle();
    const data = await leadService.releaseLead(req.params.id, req.user.userId, req.body?.reason, { type: 'sales', id: req.user.userId, name: salesRow?.full_name });
    res.json({ success: true, data, message: 'Lead returned to Admin for reassignment' });
  } catch (error) {
    sendError(res, error);
  }
});

// ============================================
// REALTIME (Phase 7, §5 "realtime updates/events plus API refresh
// fallback"). Server-Sent Events — plain Express/Node, no new dependency.
//
// EventSource cannot send an Authorization header. Audit fix: instead of
// putting the long-lived access token in the URL (where it lands in logs and
// history), the browser first trades its token for a single-use ticket that
// expires in 60 seconds (POST /stream-ticket, normal header auth), then
// opens /stream?ticket=…. The session is re-checked on every heartbeat, so a
// deactivated or logged-out user's stream closes within ~25s. Sales
// employees only receive events about leads they own (or just lost);
// Admins with the Sales module receive everything.
//
// Registered here — before the generic '/:id' route below — deliberately:
// Express matches routes in registration order, so '/stream' has to come
// first or '/:id' would swallow it as id="stream".
// ============================================
const STREAM_TICKET_TTL_MS = 60 * 1000;
const streamTickets = new Map(); // ticket -> { user, expiresAt }

// Live session + (for a normal admin) the Sales module. Throws when either is gone.
async function checkStreamAccess(user) {
  const live = await verifyLiveSession(user);
  if (live.role === 'admin' && !live.isSuperAdmin && !await hasSalesModule(live.userId)) {
    throw Object.assign(new Error('Forbidden'), { status: 403 });
  }
  return live;
}

router.post('/stream-ticket', requireAdminOrSales, async (req, res) => {
  try {
    await checkStreamAccess(req.user);
    const now = Date.now();
    for (const [key, entry] of streamTickets) if (entry.expiresAt <= now) streamTickets.delete(key);
    const ticket = crypto.randomBytes(24).toString('hex');
    streamTickets.set(ticket, { user: req.user, expiresAt: now + STREAM_TICKET_TTL_MS });
    res.json({ success: true, data: { ticket, expiresInMs: STREAM_TICKET_TTL_MS } });
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/stream', async (req, res) => {
  const entry = streamTickets.get(String(req.query.ticket || ''));
  streamTickets.delete(String(req.query.ticket || ''));
  if (!entry || entry.expiresAt <= Date.now()) return res.status(401).end();
  let user;
  try {
    user = await checkStreamAccess(entry.user);
  } catch {
    return res.status(401).end();
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  res.write('retry: 5000\n\n');

  const onEvent = ({ owners, ...event }) => {
    if (user.role === 'sales' && !owners.includes(user.userId)) return;
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };
  leadService.emitter.on('lead-event', onEvent);

  // Heartbeat keeps proxies from timing the connection out, and re-checks
  // the session so revoked access ends the stream.
  const heartbeat = setInterval(async () => {
    try {
      await checkStreamAccess(entry.user);
      res.write(':ping\n\n');
    } catch {
      res.end();
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    leadService.emitter.off('lead-event', onEvent);
  });
});

// ============================================
// SHARED (admin-with-sales-permission OR owning Sales employee)
// ============================================

router.get('/:id', requireAdminOrSales, validateUUID, async (req, res) => {
  try {
    const lead = await leadService.getLead(req.params.id);
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
    const { canAccess, isOwner } = await actorAndAccess(req, lead);
    // A Sales employee may only view their own leads (no common pool).
    const salesAllowed = req.user.role === 'sales' && isOwner;
    const adminAllowed = req.user.role === 'admin' && canAccess;
    if (!salesAllowed && !adminAllowed) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    res.json({ success: true, data: lead });
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/:id/history', requireAdminOrSales, validateUUID, async (req, res) => {
  try {
    const lead = await leadService.getLead(req.params.id);
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
    const { canAccess, isOwner } = await actorAndAccess(req, lead);
    if (!canAccess || (req.user.role === 'sales' && !isOwner)) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    const history = await leadService.getHistory(req.params.id);
    // Admin's expiry decisions, where a reassigned lead was copied from, and
    // the ids of other leads for the same customer (Won requests and
    // auto-closes) are internal — a salesperson sees their lead as an
    // ordinary lead.
    const INTERNAL_DETAILS = ['source', 'copied_from', 'duplicates', 'won_lead_id', 'requested_by'];
    const visible = req.user.role === 'sales'
      ? history
        .filter((h) => !h.event_type.startsWith('expiry_'))
        .map((h) => (INTERNAL_DETAILS.some((key) => key in (h.details || {}))
          ? { ...h, details: Object.fromEntries(Object.entries(h.details).filter(([key]) => !INTERNAL_DETAILS.includes(key))) }
          : h))
      : history;
    res.json({ success: true, data: visible });
  } catch (error) {
    sendError(res, error);
  }
});

router.patch('/:id/status', requireAdminOrSales, validateUUID, async (req, res) => {
  try {
    const lead = await leadService.getLead(req.params.id);
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
    const { actor, canAccess, isOwner } = await actorAndAccess(req, lead);
    // §7: only the owning salesperson or an authorised admin may change
    // status (Won/Lost included; Dead is further restricted to admin inside
    // leadService.updateStatus itself).
    if (!canAccess || (req.user.role === 'sales' && !isOwner)) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    // value_estimate / ref_id: Proposal-onwards moves. lost_reason / lost_note:
    // Lost and Dead. confirm_duplicate: Admin marking an already-Won customer Won.
    const { status, value_estimate, ref_id, lost_reason, lost_note } = req.body || {};
    const data = await leadService.updateStatus(req.params.id, status, actor, {
      value_estimate, ref_id, lost_reason, lost_note, confirm_duplicate: req.body?.confirm_duplicate === true
    });
    res.json({ success: true, data });
  } catch (error) {
    sendError(res, error);
  }
});

router.patch('/:id/remarks', requireAdminOrSales, validateUUID, async (req, res) => {
  try {
    const lead = await leadService.getLead(req.params.id);
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
    const { actor, canAccess, isOwner } = await actorAndAccess(req, lead);
    if (!canAccess || (req.user.role === 'sales' && !isOwner)) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    const data = await leadService.updateRemarks(req.params.id, req.body?.remarks, actor, {
      ownerSalesId: req.user.role === 'sales' ? req.user.userId : undefined
    });
    res.json({ success: true, data });
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/:id/follow-ups', requireAdminOrSales, validateUUID, async (req, res) => {
  try {
    const lead = await leadService.getLead(req.params.id);
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
    const { actor, canAccess, isOwner } = await actorAndAccess(req, lead);
    if (!canAccess || (req.user.role === 'sales' && !isOwner)) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    const history = await leadService.addFollowUp(req.params.id, req.body?.note, req.body?.next_action_date, actor);
    res.json({ success: true, data: history });
  } catch (error) {
    sendError(res, error);
  }
});

export default router;
