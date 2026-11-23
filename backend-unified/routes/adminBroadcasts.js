// Broadcasts, admin side: send, track read receipts, end, delete, and take
// people out of a live broadcast. Super Admin only.
import express from 'express';
import { requireSuperAdmin } from '../middleware/auth.js';
import { validateUUID, validateUUIDParam, validateEmployeeType } from '../middleware/validation.js';
import * as broadcastService from '../services/broadcastService.js';
import { sendBroadcastError } from './broadcasts.js';

const router = express.Router();
router.use(requireSuperAdmin);

// GET /api/admin/broadcasts — all broadcasts with receipt counts.
router.get('/', async (req, res) => {
  try {
    res.json({ success: true, data: await broadcastService.listBroadcasts() });
  } catch (error) {
    sendBroadcastError(res, error, 'listing broadcasts');
  }
});

// GET /api/admin/broadcasts/employees — the audience picker list.
router.get('/employees', async (req, res) => {
  try {
    res.json({ success: true, data: await broadcastService.listEmployeesForPicker() });
  } catch (error) {
    sendBroadcastError(res, error, 'listing broadcast employees');
  }
});

// POST /api/admin/broadcasts
router.post('/', async (req, res) => {
  try {
    const data = await broadcastService.createBroadcast(req.body, req.user.userId);
    res.status(201).json({ success: true, data, message: 'Broadcast sent' });
  } catch (error) {
    sendBroadcastError(res, error, 'creating broadcast');
  }
});

// GET /api/admin/broadcasts/:id/recipients
router.get('/:id/recipients', validateUUID, async (req, res) => {
  try {
    res.json({ success: true, data: await broadcastService.listRecipients(req.params.id) });
  } catch (error) {
    sendBroadcastError(res, error, 'listing broadcast recipients');
  }
});

// POST /api/admin/broadcasts/:id/end — end a live broadcast now.
router.post('/:id/end', validateUUID, async (req, res) => {
  try {
    res.json({ success: true, data: await broadcastService.endBroadcast(req.params.id, req.user.userId) });
  } catch (error) {
    sendBroadcastError(res, error, 'ending broadcast');
  }
});

// DELETE /api/admin/broadcasts/:id/recipients/:employeeType/:employeeId
router.delete(
  '/:id/recipients/:employeeType/:employeeId',
  validateUUID, validateEmployeeType, validateUUIDParam('employeeId'),
  async (req, res) => {
    try {
      const { id, employeeType, employeeId } = req.params;
      res.json({ success: true, data: await broadcastService.removeRecipient(id, employeeType, employeeId, req.user.userId) });
    } catch (error) {
      sendBroadcastError(res, error, 'removing broadcast recipient');
    }
  }
);

// DELETE /api/admin/broadcasts/:id — delete permanently.
router.delete('/:id', validateUUID, async (req, res) => {
  try {
    res.json({ success: true, data: await broadcastService.deleteBroadcast(req.params.id) });
  } catch (error) {
    sendBroadcastError(res, error, 'deleting broadcast');
  }
});

export default router;
