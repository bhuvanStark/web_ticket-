// Sales Daily Report (pipeline V2). Mounted at /api/sales-daily-reports.
// Sales employees manage only their own reports (always scoped to
// req.user.userId, never an id from the request); Admins with the 'sales'
// module read everyone's; a Super Admin "viewing as" a Sales employee reads
// that employee's list read-only — same split as routes/leads.js.
import express from 'express';
import { requireAdmin, requirePermission, requireSuperAdmin, requireSales } from '../middleware/auth.js';
import { validateUUID } from '../middleware/validation.js';
import * as reportService from '../services/salesDailyReportService.js';

const router = express.Router();

function sendError(res, error) {
  res.status(error.status || 500).json({ success: false, error: error.message || 'Error' });
}

// ---- Sales employee ----

router.get('/mine', requireSales, async (req, res) => {
  try {
    res.json({ success: true, data: await reportService.listForSales(req.user.userId) });
  } catch (error) {
    sendError(res, error);
  }
});

// Creates today's report (India time). Body: { items: [...] }.
router.post('/mine', requireSales, async (req, res) => {
  try {
    const data = await reportService.createTodayReport(req.user.userId, req.body?.items);
    res.status(201).json({ success: true, data });
  } catch (error) {
    sendError(res, error);
  }
});

// Replaces the lines of the caller's own report — today's only.
router.put('/mine/:id', requireSales, validateUUID, async (req, res) => {
  try {
    const data = await reportService.updateReport(req.params.id, req.user.userId, req.body?.items);
    res.json({ success: true, data });
  } catch (error) {
    sendError(res, error);
  }
});

// ---- Super Admin "View as Sales employee" (read-only) ----

router.get('/view-as/:id', requireSuperAdmin, validateUUID, async (req, res) => {
  try {
    res.json({ success: true, data: await reportService.listForSales(req.params.id) });
  } catch (error) {
    sendError(res, error);
  }
});

// ---- Admin ----

// Who has / hasn't submitted for a day. ?date=YYYY-MM-DD (default today, India time).
router.get('/status', requireAdmin, requirePermission('sales'), async (req, res) => {
  try {
    res.json({ success: true, data: await reportService.getSubmissionStatus(req.query.date || undefined) });
  } catch (error) {
    sendError(res, error);
  }
});

// ?sales_id=<uuid>&from=YYYY-MM-DD&to=YYYY-MM-DD (all optional).
router.get('/', requireAdmin, requirePermission('sales'), async (req, res) => {
  try {
    const { sales_id, from, to } = req.query;
    res.json({ success: true, data: await reportService.listAll({ salesId: sales_id, from, to }) });
  } catch (error) {
    sendError(res, error);
  }
});

export default router;
