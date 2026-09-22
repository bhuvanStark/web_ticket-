// Attendance Category (V1), generalized by Sales & Back-Office Roles V1
// (§8 of the plan: "The existing Admin Attendance page becomes the
// attendance view for Technician | Sales | Back-Office") — admin-side
// unified attendance management. Additive: does not import or modify
// anything from adminRoutes.js, projects.js, or projectActivities.js. The
// Admin Attendance page never touches ticket or project data at all.
import express from 'express';
import { requireAdmin } from '../middleware/auth.js';
import {
  validateUUID,
  validateUUIDParam,
  validateEmployeeType,
  validateAttendanceDateQuery,
  validateAttendanceDateBody,
  validateAttendanceRangeQuery
} from '../middleware/validation.js';
import * as attendanceService from '../services/attendanceService.js';

const router = express.Router();
router.use(requireAdmin);

// GET /api/admin/attendance?date=&employee_id=&card=present|absent|not_yet_checked_out&branch=&employee_type=technician|sales|back_office&search=
router.get('/', validateAttendanceDateQuery, async (req, res) => {
  try {
    const { date, employee_id, card, branch, employee_type, search } = req.query;
    const data = await attendanceService.listForAdmin({
      date, employeeId: employee_id, cardFilter: card, branch, employeeType: employee_type, search
    });
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error listing attendance:', error);
    res.status(500).json({ success: false, error: 'Error', message: error.message });
  }
});

// GET /api/admin/attendance/export?start_date=&end_date=&card=&branch=&employee_type=&search=
// Export Range selector's data source — same shape as the single-day list
// above (one row per employee per day), just spanning every day in
// [start_date, end_date] inclusive. Registered before the dynamic
// /:employeeType/:employeeId/history route below so "export" is never
// swallowed as an employeeType.
router.get('/export', validateAttendanceRangeQuery, async (req, res) => {
  try {
    const { start_date, end_date, card, branch, employee_type, search } = req.query;
    const data = await attendanceService.listForAdminRange({
      startDate: start_date, endDate: end_date, cardFilter: card, branch, employeeType: employee_type, search
    });
    res.json({ success: true, data });
  } catch (error) {
    if (error.code === 'INVALID_RANGE') return res.status(400).json({ success: false, error: error.message });
    console.error('Error exporting attendance range:', error);
    res.status(500).json({ success: false, error: 'Error', message: error.message });
  }
});

// POST /api/admin/attendance/mark-all-absent  { date?, branch?, employee_type?, search? }
// Marks every active employee with no attendance row for the day as
// absent, scoped to whatever branch/employee-type/search the Admin page
// currently has applied — omitting all three marks absent across every
// employee type and branch, same as before.
router.post('/mark-all-absent', validateAttendanceDateBody, async (req, res) => {
  try {
    const { date, branch, employee_type, search } = req.body || {};
    const data = await attendanceService.markAllAbsent(date, req.user.userId, { branch, employeeType: employee_type, search });
    res.json({ success: true, data, message: `Marked ${data.markedCount} employee(s) absent` });
  } catch (error) {
    if (error.code === 'CONFLICT') return res.status(409).json({ success: false, error: error.message });
    console.error('Error marking all absent:', error);
    res.status(500).json({ success: false, error: 'Error', message: error.message });
  }
});

// POST /api/admin/attendance/bulk-check-out  { date?, branch?, employee_type?, search? }
// Same scoping as mark-all-absent above.
router.post('/bulk-check-out', validateAttendanceDateBody, async (req, res) => {
  try {
    const { date, branch, employee_type, search } = req.body || {};
    const data = await attendanceService.bulkCheckOutOpenSessions(date, { branch, employeeType: employee_type, search });
    res.json({ success: true, data, message: `Checked out ${data.succeeded}/${data.total} open session(s)` });
  } catch (error) {
    console.error('Error bulk checking out:', error);
    res.status(500).json({ success: false, error: 'Error', message: error.message });
  }
});

// POST /api/admin/attendance/:id/check-out — admin resolving one open
// session. Unrestricted by employee ownership (an admin may check out
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

// GET /api/admin/attendance/:employeeType/:employeeId/history — an id alone
// is ambiguous once there are three identity tables, so the unified routes
// address an employee by (type, id) rather than a bare id.
router.get('/:employeeType/:employeeId/history', validateEmployeeType, validateUUIDParam('employeeId'), async (req, res) => {
  try {
    const data = await attendanceService.getHistoryForEmployee(req.params.employeeType, req.params.employeeId, { actorRole: 'admin' });
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching attendance history:', error);
    res.status(500).json({ success: false, error: 'Error', message: error.message });
  }
});

// POST /api/admin/attendance/:employeeType/:employeeId/mark-absent  { date? }
router.post('/:employeeType/:employeeId/mark-absent', validateEmployeeType, validateUUIDParam('employeeId'), validateAttendanceDateBody, async (req, res) => {
  try {
    const data = await attendanceService.markAbsent(req.params.employeeType, req.params.employeeId, req.body?.date, req.user.userId);
    res.status(201).json({ success: true, data, message: 'Marked absent' });
  } catch (error) {
    if (error.code === 'NOT_FOUND') return res.status(404).json({ success: false, error: error.message });
    if (error.code === 'ALREADY_HAS_ATTENDANCE') return res.status(409).json({ success: false, error: error.message });
    console.error('Error marking absent:', error);
    res.status(500).json({ success: false, error: 'Error', message: error.message });
  }
});

export default router;
