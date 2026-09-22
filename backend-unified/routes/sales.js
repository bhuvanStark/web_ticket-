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
import { requireAdmin } from '../middleware/auth.js';
import { validateUUID } from '../middleware/validation.js';

const router = express.Router();
router.use(requireAdmin);

const SELECT_FIELDS = 'id, email, full_name, phone, location, is_active, created_at, updated_at';

router.get('/', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('sales')
      .select(SELECT_FIELDS)
      .eq('is_active', true)
      .order('full_name', { ascending: true });
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
      .select('id')
      .ilike('email', email)
      .maybeSingle();

    if (existing) {
      return res.status(400).json({ success: false, error: 'A Sales employee with this email already exists' });
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

// DELETE — RESTRICTed by attendance_records.sales_id (ON DELETE RESTRICT,
// same precedent as technicians): a Sales employee with attendance history
// cannot be deleted, mirroring "Do not silently delete meaningful work
// history" from the Project/Attendance plans. Surfaced as a clean 409, not
// the raw FK-violation 500 the Project deletion bug fix (separately) taught
// this codebase to avoid.
router.delete('/:id', validateUUID, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: existingRow, error: lookupError } = await supabase
      .from('sales')
      .select('id, full_name')
      .eq('id', id)
      .maybeSingle();

    if (lookupError) throw lookupError;
    if (!existingRow) {
      return res.status(404).json({ success: false, error: 'Sales employee not found' });
    }

    const { error } = await supabase
      .from('sales')
      .delete()
      .eq('id', id);

    if (error) {
      if (error.code === '23503') {
        return res.status(409).json({ success: false, error: 'Cannot delete a Sales employee who has attendance history' });
      }
      throw error;
    }

    res.json({
      success: true,
      data: { id },
      message: `Sales employee ${existingRow.full_name || ''} deleted successfully`.trim()
    });
  } catch (error) {
    console.error('Error deleting Sales employee:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
