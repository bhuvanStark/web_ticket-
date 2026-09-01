import express from 'express';
import { supabase } from '../config/supabaseClient.js';
import { validateCustomer, validateUUID } from '../middleware/validation.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth);

// GET all customers
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('company_name', { ascending: true });

    if (error) throw error;

    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET customer by ID with service requests
router.get('/:id', validateUUID, async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('customers')
      .select(`
        *,
        service_requests (
          id,
          ticket_number,
          status,
          issue_title,
          created_at,
          updated_at
        )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, error: 'Customer not found' });

    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching customer:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// CREATE new customer
router.post('/', validateCustomer, async (req, res) => {
  try {
    const {
      name, company_name, email, phone, address, city,
      industry, contact_person, contact_role, role
    } = req.body;

    if (!company_name) {
      return res.status(400).json({
        success: false,
        error: 'company_name is required'
      });
    }

    const { data, error } = await supabase
      .from('customers')
      .insert([
        {
          name: name || contact_person || company_name,
          company_name,
          email,
          phone: phone || null,
          address: address || null,
          city: city || null,
          industry: industry || null,
          contact_person: contact_person || null,
          contact_role: contact_role || role || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ])
      .select();

    if (error) throw error;

    res.status(201).json({ success: true, data: data?.[0], message: 'Customer created successfully' });
  } catch (error) {
    console.error('Error creating customer:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// UPDATE customer
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = {
      ...req.body,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('customers')
      .update(updateData)
      .eq('id', id)
      .select();

    if (error) throw error;
    if (!data || data.length === 0) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }

    res.json({ success: true, data: data[0], message: 'Customer updated successfully' });
  } catch (error) {
    console.error('Error updating customer:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE customer
router.delete('/:id', validateUUID, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if customer exists
    const { data: existing, error: checkError } = await supabase
      .from('customers')
      .select('id')
      .eq('id', id)
      .single();

    if (checkError || !existing) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found'
      });
    }

    // Locations, team members, preferences and notifications cascade, but
    // service_requests.customer_id is ON DELETE RESTRICT — a customer with
    // ticket history cannot be removed. Say so plainly instead of letting the
    // raw FK violation surface as a 500.
    const { data: linkedRequests, error: requestsError } = await supabase
      .from('service_requests')
      .select('id')
      .eq('customer_id', id)
      .limit(1);

    if (requestsError) throw requestsError;

    if (linkedRequests && linkedRequests.length) {
      return res.status(409).json({
        success: false,
        error: 'This customer has service requests and cannot be deleted. Remove or reassign their tickets first.'
      });
    }

    const { error: deleteError } = await supabase
      .from('customers')
      .delete()
      .eq('id', id);

    if (deleteError) throw deleteError;

    res.json({
      success: true,
      message: 'Customer deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting customer:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET customer statistics
router.get('/:id/stats', validateUUID, async (req, res) => {
  try {
    const { id } = req.params;

    // Check customer exists
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('id')
      .eq('id', id)
      .single();

    if (customerError || !customer) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found'
      });
    }

    // Get request counts by status
    const { data: allRequests, error: requestsError } = await supabase
      .from('service_requests')
      .select('id, status')
      .eq('customer_id', id);

    if (requestsError) throw requestsError;

    const stats = {
      total: allRequests?.length || 0,
      pending: allRequests?.filter(r => r.status !== 'resolved').length || 0,
      completed: allRequests?.filter(r => r.status === 'resolved').length || 0,
      by_status: {}
    };

    // Count by status
    allRequests?.forEach(request => {
      stats.by_status[request.status] = (stats.by_status[request.status] || 0) + 1;
    });

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching customer stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET customer profile
router.get('/:id/profile', validateUUID, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: customer, error } = await supabase
      .from('customers')
      .select('id, name, company_name, email, phone, address, city, industry, contact_person, contact_role, created_at, updated_at')
      .eq('id', id)
      .single();

    if (error || !customer) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found'
      });
    }

    res.json({
      success: true,
      data: customer
    });
  } catch (error) {
    console.error('Error fetching customer profile:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// SEARCH customers
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
      .from('customers')
      .select('id, name, company_name, email, phone, city')
      .or(`name.ilike.${searchTerm},company_name.ilike.${searchTerm},email.ilike.${searchTerm}`)
      .limit(parseInt(limit))
      .order('company_name', { ascending: true });

    if (error) throw error;

    res.json({
      success: true,
      data,
      count: data?.length || 0
    });
  } catch (error) {
    console.error('Error searching customers:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
