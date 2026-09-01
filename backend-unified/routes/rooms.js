import express from 'express';
import { supabase } from '../config/supabaseClient.js';
import { validateRoom, validateUUID } from '../middleware/validation.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth);

// GET all rooms with location details
router.get('/', async (req, res) => {
  try {
    const { location_id } = req.query;

    let query = supabase
      .from('rooms')
      .select(`
        *,
        locations (id, name, city, address)
      `);

    if (location_id) {
      query = query.eq('location_id', location_id);
    }

    const { data, error } = await query.order('name', { ascending: true });

    if (error) throw error;

    res.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('Error fetching rooms:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET rooms by location
router.get('/location/:locationId', async (req, res) => {
  try {
    const { locationId } = req.params;

    const { data, error } = await supabase
      .from('rooms')
      .select(`
        *,
        locations (id, name, city, address)
      `)
      .eq('location_id', locationId)
      .order('name', { ascending: true });

    if (error) throw error;

    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching rooms by location:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET single room by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('rooms')
      .select(`
        *,
        locations (id, name, city, address)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, error: 'Room not found' });

    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching room:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET room by QR code
router.get('/qr/:qrCode', async (req, res) => {
  try {
    const { qrCode } = req.params;

    const { data, error } = await supabase
      .from('rooms')
      .select(`
        *,
        locations (id, name, city, address)
      `)
      .eq('qr_code', qrCode)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    if (!data) return res.status(404).json({ success: false, error: 'Room with this QR code not found' });

    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching room by QR code:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE room
router.delete('/:id', validateUUID, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if room exists
    const { data: existing, error: checkError } = await supabase
      .from('rooms')
      .select('id')
      .eq('id', id)
      .single();

    if (checkError || !existing) {
      return res.status(404).json({
        success: false,
        error: 'Room not found'
      });
    }

    // Delete related equipment first
    await supabase
      .from('equipment')
      .delete()
      .eq('room_id', id);

    // Delete the room
    const { error: deleteError } = await supabase
      .from('rooms')
      .delete()
      .eq('id', id);

    if (deleteError) throw deleteError;

    res.json({
      success: true,
      message: 'Room deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting room:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET room with full details and equipment
router.get('/:id/details', validateUUID, async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('rooms')
      .select(`
        *,
        locations (id, name, city, address),
        equipment (id, name, type, status, notes),
        service_requests (id, ticket_number, status, created_at)
      `)
      .eq('id', id)
      .single();

    if (error || !data) {
      return res.status(404).json({
        success: false,
        error: 'Room not found'
      });
    }

    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error fetching room details:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// SEARCH rooms
router.get('/search/query', async (req, res) => {
  try {
    const { q, limit = 10, locationId } = req.query;

    if (!q || q.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Search query (q) is required'
      });
    }

    const searchTerm = `%${q}%`;

    let query = supabase
      .from('rooms')
      .select('id, name, room_type, capacity, locations(id, name, city)')
      .or(`name.ilike.${searchTerm},room_type.ilike.${searchTerm}`);

    if (locationId) {
      query = query.eq('location_id', locationId);
    }

    const { data, error } = await query
      .limit(parseInt(limit))
      .order('name', { ascending: true });

    if (error) throw error;

    res.json({
      success: true,
      data,
      count: data?.length || 0
    });
  } catch (error) {
    console.error('Error searching rooms:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
