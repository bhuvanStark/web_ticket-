import { validateUUID } from '../middleware/validation.js';
import { removalPreview, removeStaff, deleteStaff } from '../services/staffRemovalService.js';

// Staff removal endpoints, shared by routes/technicians.js, routes/sales.js
// and routes/backOffice.js (see services/staffRemovalService.js):
//   GET    /:id/removal-preview  what Remove / Delete would do
//   POST   /:id/remove           lock out, delete attendance, hand over work
//   DELETE /:id                  permanent, only without work history
// `guards` are the admin middlewares for routers that don't already apply
// them router-wide.
export function mountStaffRemovalRoutes(router, role, ...guards) {
  const fail = (res, error, what) => {
    if (!error.status) console.error(`Error ${what} (${role}):`, error);
    res.status(error.status || 500).json({ success: false, error: error.message });
  };
  const actorOf = (req) => ({ type: 'admin', id: req.user?.userId || null, name: null });

  router.get('/:id/removal-preview', ...guards, validateUUID, async (req, res) => {
    try {
      res.json({ success: true, data: await removalPreview(role, req.params.id) });
    } catch (error) {
      fail(res, error, 'loading removal preview');
    }
  });

  router.post('/:id/remove', ...guards, validateUUID, async (req, res) => {
    try {
      const data = await removeStaff(role, req.params.id, actorOf(req));
      res.json({ success: true, data, message: `${data.name || 'Employee'} removed` });
    } catch (error) {
      fail(res, error, 'removing employee');
    }
  });

  router.delete('/:id', ...guards, validateUUID, async (req, res) => {
    try {
      const data = await deleteStaff(role, req.params.id);
      res.json({ success: true, data, message: `${data.name || 'Employee'} deleted` });
    } catch (error) {
      fail(res, error, 'deleting employee');
    }
  });

  return actorOf;
}
