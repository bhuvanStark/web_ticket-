// Admin → Reports (technician performance). Read-only; additive — does not
// import or modify adminRoutes.js or any ticket/project route. Gated by the
// same 'reports' admin permission as the Reports page in the sidebar.
import express from 'express';
import { requireAdmin, requirePermission } from '../middleware/auth.js';
import { validateUUID } from '../middleware/validation.js';
import * as techReportService from '../services/techReportService.js';

const router = express.Router();
router.use(requireAdmin, requirePermission('reports'));

const fail = (res, error) => {
  if (error.code === 'INVALID_RANGE') {
    return res.status(400).json({ success: false, error: 'Validation Error', message: error.message });
  }
  console.error('Tech report error:', error);
  return res.status(500).json({ success: false, error: 'Error', message: error.message });
};

// GET /api/admin/tech-reports/overview?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/overview', async (req, res) => {
  try {
    res.json({ success: true, data: await techReportService.getOverview({ from: req.query.from, to: req.query.to }) });
  } catch (error) {
    fail(res, error);
  }
});

// GET /api/admin/tech-reports/technicians/:id?from=&to=
router.get('/technicians/:id', validateUUID, async (req, res) => {
  try {
    const data = await techReportService.getTechnicianDetail(req.params.id, { from: req.query.from, to: req.query.to });
    if (!data) return res.status(404).json({ success: false, error: 'Not Found', message: 'Technician not found' });
    res.json({ success: true, data });
  } catch (error) {
    fail(res, error);
  }
});

export default router;
