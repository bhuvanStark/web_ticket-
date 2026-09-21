// Attendance Category (V1) — admin-side attendance management. Additive:
// does not import or modify anything from adminRoutes.js, projects.js, or
// projectActivities.js. The Admin Attendance page never touches ticket or
// project data at all.
import express from 'express';
import { requireAdmin } from '../middleware/auth.js';
import {
  validateUUID,
  validateUUIDParam,
  validateAttendanceDateQuery,
  validateAttendanceDateBody
} from '../middleware/validation.js';
import * as attendanceService from '../services/attendanceService.js';

const router = express.Router();
router.use(requireAdmin);

// GET /api/admin/attendance?date=&technician_id=&card=present|absent|not_yet_checked_out&search=
router.get('/', validateAttendanceDateQuery, async (req, res) => {
  try {
    const { date, technician_id, card, search } = req.query;
    const data = await attendanceService.listForAdmin({ date, technicianId: technician_id, cardFilter: card, search });
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error listing attendance:', error);
    res.status(500).json({ success: false, error: 'Error', message: error.message });
  }
});

// POST /api/admin/attendance/mark-all-absent  { date? }
router.post('/mark-all-absent', validateAttendanceDateBody, async (req, res) => {
  try {
    const data = await attendanceService.markAllAbsent(req.body?.date, req.user.userId);
    res.json({ success: true, data, message: `Marked ${data.markedCount} technician(s) absent` });
  } catch (error) {
    if (error.code === 'CONFLICT') return res.status(409).json({ success: false, error: error.message });
    console.error('Error marking all absent:', error);
    res.status(500).json({ success: false, error: 'Error', message: error.message });
  }
});

// POST /api/admin/attendance/bulk-check-out  { date? }
router.post('/bulk-check-out', validateAttendanceDateBody, async (req, res) => {
  try {
    const data = await attendanceService.bulkCheckOutOpenSessions(req.body?.date);
    res.json({ success: true, data, message: `Checked out ${data.succeeded}/${data.total} open session(s)` });
  } catch (error) {
    console.error('Error bulk checking out:', error);
    res.status(500).json({ success: false, error: 'Error', message: error.message });
  }
});

// POST /api/admin/attendance/:id/check-out — admin resolving one open
// session. Unrestricted by technician ownership (an admin may check out
// anyone), but never usable to CREATE a check-in — there is no admin
// check-in route anywhere in this file, by design.
router.post('/:id/check-out', validateUUID, async (req, res) => {
  try {
    const data = await attendanceService.checkOut(req.params.id, { actorRole: 'admin' });
    res.json({ success: true, data, message: 'Checked out' });
  } catch (error) {
    if (error.code === 'NOT_FOUND') return res.status(404).json({ success: false, error: error.message });
    if (error.code === 'INVALID_TRANSITION') return res.status(409).json({ success: false, error: error.message });
    console.error('Error checking out:', error);
    res.status(500).json({ success: false, error: 'Error', message: error.message });
  }
});

// GET /api/admin/attendance/:technicianId/history
router.get('/:technicianId/history', validateUUIDParam('technicianId'), async (req, res) => {
  try {
    const data = await attendanceService.getHistoryForTechnician(req.params.technicianId, { actorRole: 'admin' });
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching attendance history:', error);
    res.status(500).json({ success: false, error: 'Error', message: error.message });
  }
});

// POST /api/admin/attendance/:technicianId/mark-absent  { date? }
router.post('/:technicianId/mark-absent', validateUUIDParam('technicianId'), validateAttendanceDateBody, async (req, res) => {
  try {
    const data = await attendanceService.markAbsent(req.params.technicianId, req.body?.date, req.user.userId);
    res.status(201).json({ success: true, data, message: 'Marked absent' });
  } catch (error) {
    if (error.code === 'NOT_FOUND') return res.status(404).json({ success: false, error: error.message });
    if (error.code === 'ALREADY_HAS_ATTENDANCE') return res.status(409).json({ success: false, error: error.message });
    console.error('Error marking absent:', error);
    res.status(500).json({ success: false, error: 'Error', message: error.message });
  }
});

export default router;
