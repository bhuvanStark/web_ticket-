// Sales & Back-Office Roles V1 — Admin management of the `sales` identity
// table. Mirrors routes/technicians.js's CRUD shape (section 4 of the plan:
// "Use the same fields/form style as Technician"), but Admin-only — unlike
// technicians, no other portal ever needs to list Sales employees (they are
// never assignable to tickets/projects), so this stays behind requireAdmin
// rather than technicians.js's requireAuth. No password_hash: Sales signs in
// by OTP only (see routes/passwordReset.js), so there is nothing to hash or
// verify here.
import express from 'express';
import { supabase } from '../config/supabaseClient.js';
import { requireAdmin, requirePermission } from '../middleware/auth.js';
import { validateUUID } from '../middleware/validation.js';
import { mountStaffRemovalRoutes } from './staffRemoval.js';
import { removeStaff } from '../services/staffRemovalService.js';

const router = express.Router();
// Admin RBAC V1 — Sales employee management is itself part of the 'sales'
// admin module (plan §2), same gate the Leads router (routes/leads.js) uses.
router.use(requireAdmin, requirePermission('sales'));

const SELECT_FIELDS = 'id, email, full_name, phone, location, is_active, created_at, updated_at';

// ?include_inactive=true also returns deactivated employees (the Leads tab
// needs their names for the Won/Lost leads they still own); everything that
// assigns work keeps using the default active-only list.
router.get('/', async (req, res) => {
  try {
    let q = supabase.from('sales').select(SELECT_FIELDS);
    if (req.query.include_inactive !== 'true') q = q.eq('is_active', true);
    const { data, error } = await q.order('full_name', { ascending: true });
    if (error) throw error;
    res.json({ success: true, data: data || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:id', validateUUID, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('sales')
      .select(SELECT_FIELDS)
      .eq('id', req.params.id)
      .single();
    if (error || !data) return res.status(404).json({ success: false, error: 'Sales employee not found' });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { full_name, email, phone, location } = req.body;

    if (!full_name || !email) {
      return res.status(400).json({ success: false, error: 'full_name and email are required' });
    }

    // Case-insensitive: sales_email_lower_unique enforces uniqueness on
    // lower(email), so an exact-match check here let a case-variant
    // duplicate (e.g. "CaseTest@x.com" vs "casetest@x.com") reach the
    // insert below and surface as a raw 500 instead of this clean 400
    // (audit finding #2).
    const { data: existing } = await supabase
      .from('sales')
      .select('id, removed_at')
      .ilike('email', email)
      .maybeSingle();

    if (existing) {
      // Staff removal: a removed employee keeps their row (and email).
      const error = existing.removed_at ? "This email belongs to a removed employee and can't be reused yet." : 'A Sales employee with this email already exists';
      return res.status(400).json({ success: false, error });
    }

    const { data, error } = await supabase
      .from('sales')
      .insert([{
        full_name,
        email,
        phone: phone || null,
        location: location || null,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select(SELECT_FIELDS)
      .single();

    if (error) {
      // Belt-and-suspenders for the narrow race between the check above and
      // this insert (two concurrent requests for the same email).
      if (error.code === '23505') {
        return res.status(400).json({ success: false, error: 'A Sales employee with this email already exists' });
      }
      throw error;
    }

    res.status(201).json({ success: true, data, message: 'Sales employee created successfully' });
  } catch (error) {
    console.error('Error creating Sales employee:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/:id', validateUUID, async (req, res) => {
  try {
    const { id } = req.params;
    const { full_name, email, phone, location } = req.body;

    if (!full_name || !email) {
      return res.status(400).json({ success: false, error: 'full_name and email are required' });
    }

    const { data: existingRow, error: lookupError } = await supabase
      .from('sales')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!existingRow) {
      return res.status(404).json({ success: false, error: 'Sales employee not found' });
    }

    // Case-insensitive, same reason as the create-path check above.
    const { data: emailOwner } = await supabase
      .from('sales')
      .select('id')
      .ilike('email', email)
      .maybeSingle();
    if (emailOwner && emailOwner.id !== id) {
      return res.status(400).json({ success: false, error: 'Another Sales employee already uses this email' });
    }

    const { data, error } = await supabase
      .from('sales')
      .update({
        full_name,
        email,
        phone: phone || null,
        location: location || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select(SELECT_FIELDS)
      .single();
    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ success: false, error: 'Another Sales employee already uses this email' });
      }
      throw error;
    }

    res.json({ success: true, data, message: 'Sales employee updated successfully' });
  } catch (error) {
    console.error('Error updating Sales employee:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Staff removal (services/staffRemovalService.js): GET /:id/removal-preview,
// POST /:id/remove, and DELETE /:id (only without work history). This
// router already requires an admin for every route.
mountStaffRemovalRoutes(router, 'sales');

// DEACTIVATE — kept for older admin clients; now does exactly what Remove
// does (lock out for good, delete attendance, hand over open work).
router.patch('/:id/deactivate', validateUUID, async (req, res) => {
  try {
    const data = await removeStaff('sales', req.params.id, { type: 'admin', id: req.user.userId, name: null });
    res.json({ success: true, data, message: `Sales employee ${data.name || ''} removed`.trim() });
  } catch (error) {
    if (!error.status) console.error('Error removing Sales employee:', error);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

export default router;
