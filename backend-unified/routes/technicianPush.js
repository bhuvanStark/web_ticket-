// Web Push subscription management for technicians (ticket-assignment
// notifications — see services/pushNotificationService.js). Identity always
// comes from the verified technician JWT, never from the request body.
import express from 'express';
import { requireTechnician } from '../middleware/auth.js';
import { getVapidPublicKey, saveSubscription, removeSubscription } from '../services/pushNotificationService.js';

const router = express.Router();
router.use(requireTechnician);

const isValidSubscription = (sub) =>
  sub && typeof sub.endpoint === 'string' && /^https:\/\//.test(sub.endpoint) && sub.endpoint.length <= 2048
  && typeof sub.keys?.p256dh === 'string' && sub.keys.p256dh.length <= 256
  && typeof sub.keys?.auth === 'string' && sub.keys.auth.length <= 256;

// GET /api/technician/push/public-key — null when push isn't configured.
router.get('/public-key', (req, res) => {
  res.json({ success: true, data: { publicKey: getVapidPublicKey() } });
});

// POST /api/technician/push/subscribe  { subscription: PushSubscriptionJSON }
router.post('/subscribe', async (req, res) => {
  const subscription = req.body?.subscription;
  if (!isValidSubscription(subscription)) {
    return res.status(400).json({ success: false, error: 'A valid push subscription is required' });
  }
  try {
    await saveSubscription(req.user.userId, subscription, String(req.headers['user-agent'] || '').slice(0, 512));
    res.json({ success: true, message: 'Notifications enabled' });
  } catch (error) {
    console.error('Error saving push subscription:', error);
    res.status(500).json({ success: false, error: 'Error', message: error.message });
  }
});

// POST /api/technician/push/unsubscribe  { endpoint }
router.post('/unsubscribe', async (req, res) => {
  const endpoint = req.body?.endpoint;
  if (typeof endpoint !== 'string' || !endpoint) {
    return res.status(400).json({ success: false, error: 'endpoint is required' });
  }
  try {
    await removeSubscription(req.user.userId, endpoint);
    res.json({ success: true, message: 'Notifications disabled' });
  } catch (error) {
    console.error('Error removing push subscription:', error);
    res.status(500).json({ success: false, error: 'Error', message: error.message });
  }
});

export default router;
