// Attendance Category (V1) — technician self-service check-in/check-out.
// Additive: does not import or modify anything from serviceRequests.js,
// projects.js, or projectActivities.js.
import express from 'express';
import { requireTechnician } from '../middleware/auth.js';
import { validateUUID, validateAttendanceCheckIn } from '../middleware/validation.js';
import * as attendanceService from '../services/attendanceService.js';

const router = express.Router();
router.use(requireTechnician);

// GET /api/attendance/today — the authenticated technician's own attendance
// for the current India calendar day. Never trusts a client-supplied
// technician id: identity always comes from the verified JWT.
router.get('/today', async (req, res) => {
  try {
    const data = await attendanceService.getTodayForTechnician(req.user.userId);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error', message: error.message });
  }
});

// POST /api/attendance/check-in
router.post('/check-in', validateAttendanceCheckIn, async (req, res) => {
  try {
    const { location_status, location_lat, location_lng, location_accuracy_m } = req.body || {};
    const data = await attendanceService.checkIn(req.user.userId, {
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
    console.error('Error checking in:', error);
    res.status(500).json({ success: false, error: 'Error', message: error.message });
  }
});

// POST /api/attendance/:id/check-out — ownership-checked in the service
// layer (a technician may only check out their own record).
router.post('/:id/check-out', validateUUID, async (req, res) => {
  try {
    const data = await attendanceService.checkOut(req.params.id, {
      actorRole: 'technician',
      actorTechnicianId: req.user.userId
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
