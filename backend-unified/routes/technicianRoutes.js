import express from 'express';
import { supabase } from '../config/supabaseClient.js';
import { requireTechnician, requireAuth } from '../middleware/auth.js';
import { validateUUID, validateStatusUpdate, validatePagination } from '../middleware/validation.js';

const router = express.Router();

// ============================================
// TECHNICIAN DASHBOARD
// ============================================

// Get Technician Dashboard
router.get('/dashboard', requireTechnician, async (req, res) => {
  try {
    const { userId } = req.user;

    // Get technician info
    const { data: technician } = await supabase
      .from('technicians')
      .select('id, full_name, email, phone, specialization, is_active')
      .eq('id', userId)
      .single();

    // Get assigned requests
    const { data: assignedRequests } = await supabase
      .from('service_requests')
      .select(`
        id,
        status,
        issue_title,
        priority,
        created_at,
        customers (name, company_name, phone),
        locations (name, city),
        rooms (name)
      `)
      .eq('assigned_technician_id', userId)
      .neq('status', 'resolved')
      .neq('status', 'closed')
      .order('created_at', { ascending: false });

    // Get statistics
    const { data: allRequests } = await supabase
      .from('service_requests')
      .select('id, status')
      .eq('assigned_technician_id', userId);

    const stats = {
      total_assigned: allRequests?.length || 0,
      pending: assignedRequests?.length || 0,
      completed: allRequests?.filter(r => r.status === 'resolved' || r.status === 'closed').length || 0,
      completion_rate: ((allRequests?.filter(r => r.status === 'resolved' || r.status === 'closed').length || 0) / (allRequests?.length || 1) * 100).toFixed(2)
    };

    res.json({
      success: true,
      data: {
        technician,
        assigned_requests: assignedRequests || [],
        stats
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error',
      message: error.message
    });
  }
});

// ============================================
// ASSIGNED REQUESTS
// ============================================

// Get All Assigned Requests
router.get('/assigned-requests', requireTechnician, validatePagination, async (req, res) => {
  try {
    const { userId } = req.user;
    const { limit = 10, offset = 0, status } = req.query;

    let query = supabase
      .from('service_requests')
      .select(`
        *,
        customers (id, name, company_name, email, phone),
        locations (id, name, city, address),
        rooms (id, name, room_type, capacity),
        service_updates (id, author_name, notes, created_at)
      `)
      .eq('assigned_technician_id', userId)
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (status) query = query.eq('status', status);

    const { data, error, count } = await query;

    if (error) throw error;

    res.json({
      success: true,
      data,
      pagination: {
        total: count,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: count > parseInt(offset) + parseInt(limit)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error',
      message: error.message
    });
  }
});

// Get Single Assigned Request
router.get('/assigned-requests/:id', requireTechnician, validateUUID, async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.user;

    const { data, error } = await supabase
      .from('service_requests')
      .select(`
        *,
        customers (id, name, company_name, email, phone, address, city),
        locations (id, name, city, address, postal_code, country),
        rooms (id, name, room_type, capacity),
        service_updates (id, author_name, notes, created_at)
      `)
      .eq('id', id)
      .eq('assigned_technician_id', userId)
      .single();

    if (error || !data) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Request not found or not assigned to you'
      });
    }

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error',
      message: error.message
    });
  }
});

// ============================================
// REQUEST STATUS UPDATES (Technician)
// ============================================

// Start Service (Technician On The Way)
router.patch('/assigned-requests/:id/start', requireTechnician, validateUUID, async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.user;
    const { notes } = req.body;

    // Verify request belongs to technician
    const { data: request } = await supabase
      .from('service_requests')
      .select('id, assigned_technician_id')
      .eq('id', id)
      .single();

    if (!request || request.assigned_technician_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'This request is not assigned to you'
      });
    }

    // Update status
    const { data: updated, error } = await supabase
      .from('service_requests')
      .update({
        status: 'technician_on_the_way',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Add update
    await supabase.from('service_updates').insert([
      {
        service_request_id: id,
        author_name: 'Technician',
        notes: `Technician on the way. ${notes || ''}`
      }
    ]);

    res.json({
      success: true,
      message: 'Request status updated to on the way',
      data: updated
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error',
      message: error.message
    });
  }
});

// Begin Service
router.patch('/assigned-requests/:id/begin', requireTechnician, validateUUID, async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.user;
    const { notes } = req.body;

    // Verify request
    const { data: request } = await supabase
      .from('service_requests')
      .select('id, assigned_technician_id')
      .eq('id', id)
      .single();

    if (!request || request.assigned_technician_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'This request is not assigned to you'
      });
    }

    // Update status
    const { data: updated, error } = await supabase
      .from('service_requests')
      .update({
        status: 'service_in_progress',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Add update
    await supabase.from('service_updates').insert([
      {
        service_request_id: id,
        author_name: 'Technician',
        notes: `Service started. ${notes || ''}`
      }
    ]);

    res.json({
      success: true,
      message: 'Service in progress',
      data: updated
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error',
      message: error.message
    });
  }
});

// Complete Service (Request Customer Sign-off)
router.patch('/assigned-requests/:id/complete', requireTechnician, validateUUID, async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.user;
    const { notes, work_done } = req.body;

    // Verify request
    const { data: request } = await supabase
      .from('service_requests')
      .select('id, assigned_technician_id')
      .eq('id', id)
      .single();

    if (!request || request.assigned_technician_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'This request is not assigned to you'
      });
    }

    // Update status
    const { data: updated, error } = await supabase
      .from('service_requests')
      .update({
        status: 'pending_customer_signoff',
        feedback_notes: work_done || notes,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Add update
    await supabase.from('service_updates').insert([
      {
        service_request_id: id,
        author_name: 'Technician',
        notes: `Service completed. ${notes || ''}`
      }
    ]);

    res.json({
      success: true,
      message: 'Service marked complete - awaiting customer sign-off',
      data: updated
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error',
      message: error.message
    });
  }
});

// ============================================
// SERVICE UPDATES & NOTES
// ============================================

// Add Service Update/Note
router.post('/assigned-requests/:id/updates', requireTechnician, validateUUID, async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.user;
    const { notes } = req.body;

    if (!notes) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Notes are required'
      });
    }

    // Verify request
    const { data: request } = await supabase
      .from('service_requests')
      .select('id, assigned_technician_id')
      .eq('id', id)
      .single();

    if (!request || request.assigned_technician_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'This request is not assigned to you'
      });
    }

    // Add update
    const { data, error } = await supabase
      .from('service_updates')
      .insert([
        {
          service_request_id: id,
          author_name: 'Technician',
          notes,
          created_at: new Date().toISOString()
        }
      ])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      message: 'Update added',
      data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error',
      message: error.message
    });
  }
});

// ============================================
// TECHNICIAN PROFILE
// ============================================

// Get My Profile
router.get('/profile', requireTechnician, async (req, res) => {
  try {
    const { userId } = req.user;

    const { data, error } = await supabase
      .from('technicians')
      .select('id, email, full_name, phone, specialization, is_active, created_at, updated_at')
      .eq('id', userId)
      .single();

    if (error || !data) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Technician not found'
      });
    }

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error',
      message: error.message
    });
  }
});

// Update My Profile
router.patch('/profile', requireTechnician, async (req, res) => {
  try {
    const { userId } = req.user;
    const { phone, specialization } = req.body;

    const updateData = {};
    if (phone) updateData.phone = phone;
    if (specialization) updateData.specialization = specialization;

    const { data, error } = await supabase
      .from('technicians')
      .update({ ...updateData, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'Profile updated',
      data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error',
      message: error.message
    });
  }
});

// ============================================
// TECHNICIAN ANALYTICS
// ============================================

// Get My Performance Stats
router.get('/analytics/performance', requireTechnician, async (req, res) => {
  try {
    const { userId } = req.user;

    const { data: requests } = await supabase
      .from('service_requests')
      .select('id, status, created_at, updated_at')
      .eq('assigned_technician_id', userId);

    const stats = {
      total_assigned: requests?.length || 0,
      completed: requests?.filter(r => r.status === 'resolved' || r.status === 'closed').length || 0,
      in_progress: requests?.filter(r => r.status === 'service_in_progress').length || 0,
      pending: requests?.filter(r => r.status !== 'resolved' && r.status !== 'closed').length || 0,
      completion_rate: 0
    };

    if (requests && requests.length > 0) {
      stats.completion_rate = ((stats.completed / requests.length) * 100).toFixed(2);
    }

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error',
      message: error.message
    });
  }
});

export default router;
