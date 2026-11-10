// Quotation module (Back-Office Quote Managers; Super Admin read-only).
// Every route is gated by middleware/quoteAuth.js — see that file for who
// gets in. Business logic lives in services/quoteService.js.
import express from 'express';
import { requireSuperAdmin } from '../middleware/auth.js';
import { requireQuoteAccess, requireQuoteManager, readQuoteAccess } from '../middleware/quoteAuth.js';
import * as quotes from '../services/quoteService.js';

const router = express.Router();

const handle = (fn, status = 200) => async (req, res) => {
  try {
    const data = await fn(req);
    res.status(status).json({ success: true, data: data ?? null });
  } catch (error) {
    if (!error.status) console.error('Quotation module error:', error);
    res.status(error.status || 500).json({ success: false, error: error.message, details: error.details });
  }
};

// Whether this session may open the module (never 403s).
router.get('/access', readQuoteAccess);

// Quote Manager tag — assigned by the Super Admin from the Back-Office roster.
router.get('/managers', requireSuperAdmin, handle(() => quotes.listQuoteManagerIds()));
router.put('/managers/:backOfficeId', requireSuperAdmin,
  handle((req) => quotes.setQuoteManager(req.params.backOfficeId, req.body?.enabled === true, req.user.userId)));

router.use(requireQuoteAccess);
const write = requireQuoteManager;
const me = (req) => req.user.userId;

// Catalog
router.get('/categories', handle(() => quotes.listCategories()));
router.post('/categories', write, handle((req) => quotes.createCategory(req.body || {}, me(req)), 201));
router.patch('/categories/:id', write, handle((req) => quotes.renameCategory(req.params.id, req.body || {})));
router.delete('/categories/:id', write, handle((req) => quotes.deleteCategory(req.params.id)));

router.get('/items', handle((req) => quotes.listItems(req.query)));
router.post('/items', write, handle((req) => quotes.createItem(req.body || {}, me(req)), 201));
router.post('/items/import', write, handle((req) => quotes.importItems(req.body?.rows, me(req))));
router.post('/items/delete', write, handle((req) => quotes.deleteItems(req.body?.ids)));
router.patch('/items/:id', write, handle((req) => quotes.updateItem(req.params.id, req.body || {}, me(req))));

// Quote leads (separate from Sales leads)
router.get('/leads', handle((req) => quotes.listLeads(req.query)));
router.post('/leads', write, handle((req) => quotes.createLead(req.body || {}, me(req)), 201));
router.patch('/leads/:id', write, handle((req) => quotes.updateLead(req.params.id, req.body || {})));
router.delete('/leads/:id', write, handle((req) => quotes.deleteLead(req.params.id)));

// Quotations
router.get('/', handle((req) => quotes.listQuotes(req.query)));
router.post('/', write, handle((req) => quotes.createQuote(req.body || {}, me(req)), 201));
router.get('/:id', handle((req) => quotes.getQuote(req.params.id)));
router.delete('/:id', write, handle((req) => quotes.deleteQuote(req.params.id)));
router.patch('/:id/status', write, handle((req) => quotes.setQuoteStatus(req.params.id, req.body || {})));
router.post('/:id/versions', write, handle((req) => quotes.createNextVersion(req.params.id, me(req)), 201));
router.get('/:id/versions/:versionId', handle((req) => quotes.getVersion(req.params.id, req.params.versionId)));
router.put('/:id/versions/:versionId', write,
  handle((req) => quotes.saveVersion(req.params.id, req.params.versionId, req.body || {}, me(req))));

export default router;
