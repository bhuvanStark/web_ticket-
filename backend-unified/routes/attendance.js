// Attendance Category (V1), generalized by Sales & Back-Office Roles V1
// (§9 of the plan: "Generalize the existing attendance service without
// breaking Technician behavior") — self-service check-in/check-out shared
// by Technician, Sales, and Back-Office. Additive: does not import or
// modify anything from serviceRequests.js, projects.js, or
// projectActivities.js. Identity always comes from the verified JWT
// (req.user.userId / req.user.role) — never a client-supplied id, for any
// of the three roles.
import express from 'express';
import { requireEmployee } from '../middleware/auth.js';
import { validateUUID, validateAttendanceCheckIn } from '../middleware/validation.js';
import * as attendanceService from '../services/attendanceService.js';

const router = express.Router();
router.use(requireEmployee);

// GET /api/attendance/today — the authenticated employee's own attendance
// for the current India calendar day.
router.get('/today', async (req, res) => {
  try {
    const data = await attendanceService.getTodayForEmployee(req.user.role, req.user.userId);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error', message: error.message });
  }
});

// POST /api/attendance/check-in
router.post('/check-in', validateAttendanceCheckIn, async (req, res) => {
  try {
    const { location_status, location_lat, location_lng, location_accuracy_m } = req.body || {};
    const data = await attendanceService.checkIn(req.user.role, req.user.userId, {
      status: location_status,
      lat: location_lat,
      lng: location_lng,
      accuracy: location_accuracy_m
    });
    res.status(201).json({ success: true, data, message: 'Checked in' });
  } catch (error) {
    if (error.code === 'ALREADY_CHECKED_IN') {
      return res.status(409).json({ success: false, error: error.message, data: error.existing });
    }
    // A stale-but-unexpired JWT for an employee who no longer exists —
    // audit finding #4. A clean 404 instead of a raw FK-violation 500.
    if (error.code === 'ACCOUNT_NOT_FOUND') return res.status(404).json({ success: false, error: error.message });
    console.error('Error checking in:', error);
    res.status(500).json({ success: false, error: 'Error', message: error.message });
  }
});

// GET /api/attendance/history — the authenticated employee's own attendance
// history (Technician/Sales/Back-Office Nav Parity fix, plan item 2). Reuses
// attendanceService.getHistoryForEmployee unchanged — the same function
// adminAttendance.js's admin-only history route already calls — just wired
// to a self-service, requireEmployee-gated route instead of requireAdmin.
// employeeType/employeeId always come from the verified JWT, never the
// client, and getHistoryForEmployee's own actorRole/actorOwnerId check
// additionally rejects any mismatch — an employee can only ever get back
// their own rows.
router.get('/history', async (req, res) => {
  try {
    const data = await attendanceService.getHistoryForEmployee(req.user.role, req.user.userId, {
      actorRole: req.user.role,
      actorOwnerId: req.user.userId,
      limit: 400
    });
    res.json({ success: true, data });
  } catch (error) {
    if (error.code === 'FORBIDDEN') return res.status(403).json({ success: false, error: error.message });
    console.error('Error fetching attendance history:', error);
    res.status(500).json({ success: false, error: 'Error', message: error.message });
  }
});

// POST /api/attendance/:id/check-out — ownership-checked in the service
// layer (an employee may only check out their own record).
router.post('/:id/check-out', validateUUID, async (req, res) => {
  try {
    const data = await attendanceService.checkOut(req.params.id, {
      actorRole: req.user.role,
      actorOwnerId: req.user.userId
    });
    res.json({ success: true, data, message: 'Checked out' });
  } catch (error) {
    if (error.code === 'NOT_FOUND') return res.status(404).json({ success: false, error: error.message });
    if (error.code === 'FORBIDDEN') return res.status(403).json({ success: false, error: error.message });
    if (error.code === 'INVALID_TRANSITION') return res.status(409).json({ success: false, error: error.message });
    console.error('Error checking out:', error);
    res.status(500).json({ success: false, error: 'Error', message: error.message });
  }
});

export default router;
