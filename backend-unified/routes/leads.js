// TaskPro Sales Module V1 (TaskPro_Sales_RBAC_plan.md §3-9). Mounted at
// /api/sales-leads — deliberately not /api/sales, which is already the
// existing Sales *employee roster* router (routes/sales.js). Leads are a
// separate resource from the Sales identity table; nothing here touches
// sales.js, the sales table's own CRUD, or Sales/Back-Office authentication.
//
// Admin access to everything in this file additionally requires the 'sales'
// admin_permissions module (§2 "Sales is an Admin module controlled by the
// RBAC above" — a Super Admin bypasses this the same as any other module).
// Sales employees reach their own subset (pool/mine/accept/release/status/
// follow-ups on leads they own) through requireSales, unchanged from their
// existing identity/session.
import express from 'express';
import { requireAdmin, requirePermission, requireSales, requireAuth, verifyTokenFn } from '../middleware/auth.js';
import { validateUUID } from '../middleware/validation.js';
import { supabase } from '../config/supabaseClient.js';
import * as leadService from '../services/leadService.js';

const router = express.Router();

// ============================================
// Shared-endpoint authorization helper. GET /:id, PATCH /:id/status,
// POST /:id/follow-ups, and GET /:id/history are reachable by either an
// admin (with the 'sales' module) or the owning Sales employee — each side
// otherwise has its own dedicated route (list/pool/mine, assign, accept,
// etc.), so this is deliberately the only place both roles meet.
// ============================================
async function actorAndAccess(req, lead) {
  const { role, userId, isSuperAdmin } = req.user;
  if (role === 'admin') {
    let canAccess = isSuperAdmin === true;
    if (!canAccess) {
      const { data } = await supabase
        .from('admin_permissions')
        .select('can_access')
        .eq('admin_id', userId)
        .eq('module', 'sales')
        .maybeSingle();
      canAccess = data?.can_access === true;
    }
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

function sendError(res, error) {
  const status = error.status || 500;
  res.status(status).json({ success: false, error: error.message || 'Error' });
}

// ============================================
// ADMIN-ONLY
// ============================================

router.get('/', requireAdmin, requirePermission('sales'), async (req, res) => {
  try {
    const { status, assigned_to, unassigned, limit, offset } = req.query;
    const result = await leadService.listLeads({
      status: status || undefined,
      assignedTo: assigned_to || undefined,
      unassignedOnly: unassigned === 'true',
      limit: limit ? Number(limit) : 50,
      offset: offset ? Number(offset) : 0
    });
    res.json({ success: true, data: result.data, pagination: { total: result.count } });
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/', requireAdmin, requirePermission('sales'), async (req, res) => {
  try {
    const { data: admin } = await supabase.from('admins').select('full_name').eq('id', req.user.userId).maybeSingle();
    const data = await leadService.createLead(req.body || {}, { type: 'admin', id: req.user.userId, name: admin?.full_name });
    res.status(201).json({ success: true, data });
  } catch (error) {
    sendError(res, error);
  }
});

router.put('/:id', requireAdmin, requirePermission('sales'), validateUUID, async (req, res) => {
  try {
    const { data: admin } = await supabase.from('admins').select('full_name').eq('id', req.user.userId).maybeSingle();
    const data = await leadService.updateLead(req.params.id, req.body || {}, { type: 'admin', id: req.user.userId, name: admin?.full_name });
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
// value_estimate }, ...] }. /validate never writes.
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
    const result = await leadService.importLeads(req.body?.rows || [], { type: 'admin', id: req.user.userId, name: admin?.full_name });
    res.json({ success: true, data: result });
  } catch (error) {
    sendError(res, error);
  }
});

// ============================================
// SALES-ONLY
// ============================================

router.get('/pool', requireSales, async (req, res) => {
  try {
    const { limit, offset } = req.query;
    const result = await leadService.listPool({ limit: limit ? Number(limit) : 50, offset: offset ? Number(offset) : 0 });
    res.json({ success: true, data: result.data, pagination: { total: result.count } });
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/mine', requireSales, async (req, res) => {
  try {
    const { limit, offset } = req.query;
    const result = await leadService.listMine(req.user.userId, { limit: limit ? Number(limit) : 50, offset: offset ? Number(offset) : 0 });
    res.json({ success: true, data: result.data, pagination: { total: result.count } });
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/:id/accept', requireSales, validateUUID, async (req, res) => {
  try {
    const { data: salesRow } = await supabase.from('sales').select('full_name').eq('id', req.user.userId).maybeSingle();
    const data = await leadService.acceptLead(req.params.id, req.user.userId, { type: 'sales', id: req.user.userId, name: salesRow?.full_name });
    res.json({ success: true, data, message: 'Lead accepted' });
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/:id/release', requireSales, validateUUID, async (req, res) => {
  try {
    const { data: salesRow } = await supabase.from('sales').select('full_name').eq('id', req.user.userId).maybeSingle();
    const data = await leadService.releaseLead(req.params.id, req.user.userId, req.body?.reason, { type: 'sales', id: req.user.userId, name: salesRow?.full_name });
    res.json({ success: true, data, message: 'Lead released back to the pool' });
  } catch (error) {
    sendError(res, error);
  }
});

// ============================================
// REALTIME (Phase 7, §5 "realtime updates/events plus API refresh
// fallback"). Server-Sent Events — plain Express/Node, no new dependency.
// EventSource cannot send an Authorization header, so the token travels as
// a query param here only; verified the same way as every other protected
// route, just not through the header-based middleware.
//
// Registered here — before the generic '/:id' route below — deliberately:
// Express matches GET routes in registration order, so '/stream' has to
// come first or '/:id' would swallow it as id="stream" and run requireAuth
// against a request that (by design) carries no Authorization header.
// ============================================
router.get('/stream', async (req, res) => {
  try {
    const decoded = verifyTokenFn(req.query.token || '');
    if (!['admin', 'sales'].includes(decoded.role)) throw new Error('Forbidden');
    if (decoded.role === 'admin' && !decoded.isSuperAdmin) {
      const { data } = await supabase
        .from('admin_permissions')
        .select('can_access')
        .eq('admin_id', decoded.userId)
        .eq('module', 'sales')
        .maybeSingle();
      if (!data?.can_access) throw new Error('Forbidden');
    }
  } catch {
    return res.status(401).end();
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  res.write('retry: 5000\n\n');

  const onEvent = (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };
  leadService.emitter.on('lead-event', onEvent);

  // Keep intermediary proxies/browsers from silently timing out the connection.
  const heartbeat = setInterval(() => res.write(':ping\n\n'), 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    leadService.emitter.off('lead-event', onEvent);
  });
});

// ============================================
// SHARED (admin-with-sales-permission OR owning Sales employee)
// ============================================

router.get('/:id', requireAuth, validateUUID, async (req, res) => {
  try {
    const lead = await leadService.getLead(req.params.id);
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
    const { canAccess, isOwner } = await actorAndAccess(req, lead);
    // A Sales employee may view an unassigned pool lead (to decide whether to
    // accept it) or their own lead, but never another salesperson's.
    const salesAllowed = req.user.role === 'sales' && (!lead.assigned_to || isOwner);
    const adminAllowed = req.user.role === 'admin' && canAccess;
    if (!salesAllowed && !adminAllowed) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    res.json({ success: true, data: lead });
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/:id/history', requireAuth, validateUUID, async (req, res) => {
  try {
    const lead = await leadService.getLead(req.params.id);
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
    const { canAccess, isOwner } = await actorAndAccess(req, lead);
    if (!canAccess || (req.user.role === 'sales' && !isOwner)) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    const history = await leadService.getHistory(req.params.id);
    res.json({ success: true, data: history });
  } catch (error) {
    sendError(res, error);
  }
});

router.patch('/:id/status', requireAuth, validateUUID, async (req, res) => {
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
    const data = await leadService.updateStatus(req.params.id, req.body?.status, actor);
    res.json({ success: true, data });
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/:id/follow-ups', requireAuth, validateUUID, async (req, res) => {
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
