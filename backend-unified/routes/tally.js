// Tally Desk, Phase 1 (Back-Office Tally Makers). Every route below the
// maker endpoints is gated by middleware/tallyAuth.js. Business logic lives
// in services/tallyService.js.
import express from 'express';
import { requireSuperAdmin } from '../middleware/auth.js';
import { requireTallyMaker, readTallyAccess } from '../middleware/tallyAuth.js';
import * as tally from '../services/tallyService.js';

const router = express.Router();

const handle = (fn, status = 200) => async (req, res) => {
  try {
    const data = await fn(req);
    res.status(status).json({ success: true, data: data ?? null });
  } catch (error) {
    if (!error.status) console.error('Tally Desk error:', error);
    res.status(error.status || 500).json({ success: false, error: error.message, details: error.details });
  }
};

// Whether this session may open Tally Desk (never 403s).
router.get('/access', readTallyAccess);

// Tally Maker tag — assigned by the Super Admin from the Back-Office roster.
router.get('/makers', requireSuperAdmin, handle(() => tally.listTallyMakerIds()));
router.put('/makers/:backOfficeId', requireSuperAdmin,
  handle((req) => tally.setTallyMaker(req.params.backOfficeId, req.body?.enabled === true, req.user.userId)));

router.use(requireTallyMaker);
const me = (req) => req.user.userId;

router.get('/settings', handle(() => tally.getSettings()));
router.put('/settings', handle((req) => tally.saveSettings(req.body || {}, me(req))));

router.get('/quotes', handle((req) => tally.listWonQuotes(req.query)));
router.get('/quotes/:id', handle((req) => tally.getWonQuote(req.params.id)));

router.get('/vouchers', handle((req) => tally.listVouchers(req.query)));
router.post('/vouchers', handle((req) => tally.createVoucher(req.body || {}, me(req)), 201));
router.get('/vouchers/:id', handle((req) => tally.getVoucher(req.params.id)));
router.put('/vouchers/:id', handle((req) => tally.updateVoucher(req.params.id, req.body || {}, me(req))));
router.delete('/vouchers/:id', handle((req) => tally.deleteVoucher(req.params.id)));
router.post('/vouchers/:id/download', handle((req) => tally.downloadVoucher(req.params.id, me(req))));
router.patch('/vouchers/:id/imported', handle((req) => tally.setImported(req.params.id, req.body || {}, me(req))));

router.get('/items', handle((req) => tally.listItemNames(req.query)));
router.put('/items/:id', handle((req) => tally.setItemName(req.params.id, req.body || {}, me(req))));

export default router;
