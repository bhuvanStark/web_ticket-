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
import { query } from '../config/database.js';
import { requireAdmin, requirePermission } from '../middleware/auth.js';
import { validateUUID } from '../middleware/validation.js';
// TaskPro Sales Module V1 — deactivating/deleting a Sales employee must
// return their active leads to the common pool (plan §6). Additive: this is
// the only change this file makes for that feature.
import { reassignLeadsForDeactivatedSales } from '../services/leadService.js';

const router = express.Router();
// Admin RBAC V1 — Sales employee management is itself part of the 'sales'
// admin module (plan §2), same gate the Leads router (routes/leads.js) uses.
router.use(requireAdmin, requirePermission('sales'));

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

// DEACTIVATE — the safe alternative to DELETE: flips is_active off so the
// employee drops out of the roster (GET / already filters eq('is_active',
// true)) while the row itself and every attendance_records row pointing at
// it are left completely untouched. Deliberately one-directional (no
// reactivate route) — not asked for, and not adding one keeps this change
// scoped to what was requested.
router.patch('/:id/deactivate', validateUUID, async (req, res) => {
  try {
    const { id } = req.params;

    // Audit fix P0-1 — bump token_version so this Sales employee's existing
    // access/refresh tokens are rejected on their very next use, instead of
    // remaining valid (and able to keep accepting leads) until natural
    // expiry. requireSales checks this on every request. Raw SQL for the
    // `token_version + 1` expression — the query builder's .update() only
    // accepts plain bound values, not expressions.
    const { rows } = await query(
      `UPDATE sales SET is_active = false, token_version = token_version + 1, updated_at = now()
       WHERE id = $1
       RETURNING ${SELECT_FIELDS}`,
      [id]
    );
    const data = rows[0];

    if (!data) {
      return res.status(404).json({ success: false, error: 'Sales employee not found' });
    }

    // Plan §6: their active/unclosed leads return to the common pool. Best
    // effort — a failure here must not undo the deactivation that already
    // succeeded; it's logged so it can be reconciled by hand if it ever hits.
    try {
      await reassignLeadsForDeactivatedSales(id, { type: 'admin', id: req.user.userId, name: null });
    } catch (leadError) {
      console.error(`Failed to reassign leads after deactivating sales ${id}:`, leadError.message);
    }

    res.json({ success: true, data, message: `Sales employee ${data.full_name || ''} deactivated successfully`.trim() });
  } catch (error) {
    console.error('Error deactivating Sales employee:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE — permanent. attendance_records.sales_id is now ON DELETE CASCADE
// (migration 026): deleting a Sales employee also deletes every attendance
// record that belongs to them, so this succeeds whether or not they have
// attendance history. The frontend's delete confirmation warns explicitly
// that attendance history is destroyed; anyone who needs to keep that
// history should use PATCH /:id/deactivate instead.
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

    // leads.assigned_to is ON DELETE SET NULL (migration 028), so this can't
    // fail on lead history — but do the same reassignment history logging
    // as deactivate first, or those leads would silently lose their owner
    // with no lead_history row explaining why.
    try {
      await reassignLeadsForDeactivatedSales(id, { type: 'admin', id: req.user.userId, name: null });
    } catch (leadError) {
      console.error(`Failed to reassign leads before deleting sales ${id}:`, leadError.message);
    }

    const { error } = await supabase
      .from('sales')
      .delete()
      .eq('id', id);

    if (error) throw error;

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
