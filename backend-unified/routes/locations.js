import express from 'express';
import { supabase } from '../config/supabaseClient.js';
import { validateLocation, validateUUID } from '../middleware/validation.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth);

// GET all locations (shared across all customers)
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('locations')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;

    res.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('Error fetching locations:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET location by ID with rooms and equipment
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('locations')
      .select(`
        *,
        rooms (
          *,
          equipment (*)
        )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, error: 'Location not found' });

    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching location:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// CREATE new location
router.post('/', async (req, res) => {
  try {
    const { name, address, city, postal_code, country, customer_id } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'name is required'
      });
    }

    const { data, error } = await supabase
      .from('locations')
      .insert([
        {
          customer_id: customer_id || null,
          name,
          address,
          city,
          postal_code,
          country,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ])
      .select();

    if (error) throw error;

    res.status(201).json({ success: true, data: data?.[0], message: 'Location created successfully' });
  } catch (error) {
    console.error('Error creating location:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// UPDATE location
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = {
      ...req.body,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('locations')
      .update(updateData)
      .eq('id', id)
      .select();

    if (error) throw error;
    if (!data || data.length === 0) {
      return res.status(404).json({ success: false, error: 'Location not found' });
    }

    res.json({ success: true, data: data[0], message: 'Location updated successfully' });
  } catch (error) {
    console.error('Error updating location:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE location
router.delete('/:id', validateUUID, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if location exists
    const { data: existing, error: checkError } = await supabase
      .from('locations')
      .select('id')
      .eq('id', id)
      .single();

    if (checkError || !existing) {
      return res.status(404).json({
        success: false,
        error: 'Location not found'
      });
    }

    // Check if location has rooms
    const { data: rooms, error: roomsError } = await supabase
      .from('rooms')
      .select('id', { count: 'exact', head: true })
      .eq('location_id', id);

    if (rooms && rooms.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete location with existing rooms. Please delete rooms first.'
      });
    }

    // Delete the location
    const { error: deleteError } = await supabase
      .from('locations')
      .delete()
      .eq('id', id);

    if (deleteError) throw deleteError;

    res.json({
      success: true,
      message: 'Location deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting location:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET location with room count and stats
router.get('/:id/stats', validateUUID, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: location, error: locationError } = await supabase
      .from('locations')
      .select('*')
      .eq('id', id)
      .single();

    if (locationError || !location) {
      return res.status(404).json({
        success: false,
        error: 'Location not found'
      });
    }

    // Get room count
    const { data: rooms, error: roomsError } = await supabase
      .from('rooms')
      .select('id', { count: 'exact' })
      .eq('location_id', id);

    if (roomsError) throw roomsError;

    res.json({
      success: true,
      data: {
        ...location,
        room_count: rooms?.length || 0
      }
    });
  } catch (error) {
    console.error('Error fetching location stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// SEARCH locations
router.get('/search/query', async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;

    if (!q || q.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Search query (q) is required'
      });
    }

    const searchTerm = `%${q}%`;

    const { data, error } = await supabase
      .from('locations')
      .select('id, name, address, city, country')
      .or(`name.ilike.${searchTerm},city.ilike.${searchTerm},address.ilike.${searchTerm}`)
      .limit(parseInt(limit))
      .order('name', { ascending: true });

    if (error) throw error;

    res.json({
      success: true,
      data,
      count: data?.length || 0
    });
  } catch (error) {
    console.error('Error searching locations:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
