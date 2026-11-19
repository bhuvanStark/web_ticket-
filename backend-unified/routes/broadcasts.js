// Broadcasts, employee side (Technician / Sales / Back-Office). Identity
// always comes from the verified JWT, never the client.
import express from 'express';
import { requireEmployee } from '../middleware/auth.js';
import { validateUUID } from '../middleware/validation.js';
import * as broadcastService from '../services/broadcastService.js';

const router = express.Router();
router.use(requireEmployee);

export const sendBroadcastError = (res, error, what) => {
  if (error.status && error.status < 500) {
    return res.status(error.status).json({ success: false, error: error.message, data: error.busy || undefined });
  }
  console.error(`Error ${what}:`, error);
  return res.status(500).json({ success: false, error: 'Error', message: error.message });
};

// GET /api/broadcasts/mine — the live broadcast I haven't tapped "Got it" on, or null.
router.get('/mine', async (req, res) => {
  try {
    const data = await broadcastService.getPendingForEmployee(req.user.role, req.user.userId);
    res.json({ success: true, data });
  } catch (error) {
    sendBroadcastError(res, error, 'fetching broadcast');
  }
});

// POST /api/broadcasts/:id/seen — the popup opened.
router.post('/:id/seen', validateUUID, async (req, res) => {
  try {
    const data = await broadcastService.markSeen(req.params.id, req.user.role, req.user.userId);
    res.json({ success: true, data });
  } catch (error) {
    sendBroadcastError(res, error, 'marking broadcast seen');
  }
});

// POST /api/broadcasts/:id/acknowledge — "Got it".
router.post('/:id/acknowledge', validateUUID, async (req, res) => {
  try {
    const data = await broadcastService.acknowledge(req.params.id, req.user.role, req.user.userId);
    res.json({ success: true, data });
  } catch (error) {
    sendBroadcastError(res, error, 'acknowledging broadcast');
  }
});

export default router;
