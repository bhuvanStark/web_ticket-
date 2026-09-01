import express from 'express';
import { supabase } from '../config/supabaseClient.js';
import { requireAuth, hashPassword } from '../middleware/auth.js';
import { validateUUID } from '../middleware/validation.js';

const router = express.Router();

// Technicians onboarded through the dashboard get this password until they
// change it; it is hashed like any other, never stored in plain text.
const DEFAULT_TECHNICIAN_PASSWORD = '123456';
router.use(requireAuth);

// Public directory fields used by the dispatch UI. Password hashes and other
// authentication data are deliberately never selected.
router.get('/', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('technicians')
      .select('id, email, full_name, phone, specialization, role_title, location, status, is_active, created_at, updated_at')
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
      .from('technicians')
      .select('id, email, full_name, phone, specialization, role_title, location, status, is_active, created_at, updated_at')
      .eq('id', req.params.id)
      .single();
    if (error || !data) return res.status(404).json({ success: false, error: 'Technician not found' });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// CREATE new technician
router.post('/', async (req, res) => {
  try {
    const { full_name, email, phone, specialization, role_title, location, password } = req.body;

    if (!full_name || !email) {
      return res.status(400).json({ success: false, error: 'full_name and email are required' });
    }

    // Check if email already exists
    const { data: existing } = await supabase
      .from('technicians')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existing) {
      return res.status(400).json({ success: false, error: 'Technician with this email already exists' });
    }

    // Always store a real bcrypt hash — an empty or plaintext value here makes
    // the account impossible to log into, since bcrypt.compare would never match.
    const passwordHash = await hashPassword(password || DEFAULT_TECHNICIAN_PASSWORD);

    const { data, error } = await supabase
      .from('technicians')
      .insert([{
        full_name,
        email,
        phone: phone || null,
        specialization: specialization || null,
        role_title: role_title || null,
        location: location || null,
        password_hash: passwordHash,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select('id, email, full_name, phone, specialization, role_title, location, status, is_active, created_at, updated_at')
      .single();

    if (error) throw error;

    res.status(201).json({ success: true, data, message: 'Technician created successfully' });
  } catch (error) {
    console.error('Error creating technician:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE a technician.
// service_requests.assigned_technician_id is ON DELETE SET NULL, so existing
// tickets survive and fall back to unassigned rather than disappearing with
// the technician.
router.delete('/:id', validateUUID, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: existing, error: lookupError } = await supabase
      .from('technicians')
      .select('id, full_name')
      .eq('id', id)
      .maybeSingle();

    if (lookupError) throw lookupError;
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Technician not found' });
    }

    const { error } = await supabase
      .from('technicians')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({
      success: true,
      data: { id },
      message: `Technician ${existing.full_name || ''} deleted successfully`.trim()
    });
  } catch (error) {
    console.error('Error deleting technician:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
