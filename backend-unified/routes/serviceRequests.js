import express from 'express';
import { supabase } from '../config/supabaseClient.js';
import {
  validateServiceRequest,
  validateStatusUpdate,
  validateCompleteRequest,
  validateServiceUpdate,
  validateUUID
} from '../middleware/validation.js';
import * as serviceRequestService from '../services/serviceRequestService.js';
import * as notificationService from '../services/notificationService.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth);

// GET all service requests (for admin) or filtered by customer
router.get('/', async (req, res) => {
  try {
    const { customerId } = req.query;

    let query = supabase
      .from('service_requests')
      .select(`
        *,
        customers (id, name, company_name),
        locations (id, name, city, address),
        rooms (id, name, room_type, capacity),
        technician:assigned_technician_id (id, full_name, email, phone, role_title, avatar_url),
        service_updates (*),
        service_reports (*)
      `)
      .order('created_at', { ascending: false });

    if (customerId) {
      query = query.eq('customer_id', customerId);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching service requests:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET single service request by ID
router.get('/:id', validateUUID, async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('service_requests')
      .select(`
        *,
        customers (id, name, company_name),
        locations (id, name, city, address),
        rooms (id, name, room_type, capacity),
        technician:assigned_technician_id (id, full_name, email, phone, role_title, avatar_url),
        service_updates (*),
        service_reports (*)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, error: 'Service request not found' });

    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching service request:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// CREATE new service request
router.post('/', validateServiceRequest, async (req, res) => {
  try {
    const {
      customer_id,
      location_id,
      room_id,
      customer_org,
      facility_location,
      room_name,
      issue_category,
      issue_title,
      issue_description,
      service_type,
      support_category = 'av',
      preferred_date,
      preferred_time,
      area
    } = req.body;

    // Constrained to 'av' | 'epabx'; fold anything else onto 'av' rather than
    // letting a check-constraint violation surface as a 500.
    const normalisedSupportCategory =
      String(support_category).toLowerCase() === 'epabx' ? 'epabx' : 'av';

    // EPABX tickets never carry a room, regardless of what a stale client sends.
    const resolvedRoomId =
      normalisedSupportCategory === 'epabx' ? null : (room_id || null);
    const resolvedRoomName =
      normalisedSupportCategory === 'epabx' ? null : (room_name || null);

    const data = await serviceRequestService.createServiceRequest({
      customer_id: customer_id || null,
      location_id: location_id || null,
      room_id: resolvedRoomId,
      // Free-text ticket fields (admin "Raise Ticket"): stored as typed, never
      // looked up or resolved to a profile.
      customer_org: customer_org || null,
      facility_location: facility_location || null,
      room_name: resolvedRoomName,
      issue_category,
      issue_title,
      issue_description,
      service_type,
      support_category: normalisedSupportCategory,
      preferred_date: preferred_date || null,
      preferred_time: preferred_time || null,
      area: area || null,
      // Priority is no longer collected in either portal; every new ticket is
      // 'high' (also the column default).
      priority: 'high'
    });

    // Send notification only for tickets tied to a real customer account.
    if (customer_id) {
      try {
        await notificationService.sendTemplateNotification(
          customer_id,
          'request_received',
          { ticket_number: data.ticket_number || data.id },
          data.id
        );
      } catch (notificationError) {
        console.warn('Service request created, but notification failed:', notificationError.message);
      }
    }

    res.status(201).json({ success: true, data, message: 'Service request created successfully' });
  } catch (error) {
    console.error('Error creating service request:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Assign an active technician to a real service request. The admin also picks
// the service mode here — On-site or Remote — which is stored on service_type.
router.post('/:id/assign', validateUUID, async (req, res) => {
  try {
    const { id } = req.params;
    const technicianId = req.body.technician_id || req.body.techDbId;
    if (!technicianId) {
      return res.status(400).json({ success: false, error: 'technician_id is required' });
    }

    const mode = String(req.body.mode || req.body.service_mode || '').toLowerCase();
    const serviceType =
      mode === 'remote' || mode === 'remote_support' ? 'remote_support' : 'onsite_service';

    const { data: technician, error: technicianError } = await supabase
      .from('technicians')
      .select('id, full_name, is_active')
      .eq('id', technicianId)
      .single();
    if (technicianError || !technician || !technician.is_active) {
      return res.status(404).json({ success: false, error: 'Active technician not found' });
    }

    const { data, error } = await supabase
      .from('service_requests')
      .update({
        assigned_technician_id: technician.id,
        status: 'assigned',
        service_type: serviceType,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;

    const modeLabel = serviceType === 'remote_support' ? 'Remote' : 'On-site';
    const { error: updateError } = await supabase.from('service_updates').insert([{
      service_request_id: id,
      author_name: 'Admin',
      notes: `Assigned to ${technician.full_name} (${modeLabel})`
    }]);
    if (updateError) console.warn('Could not record assignment timeline:', updateError.message);

    // Notify the customer that a technician is now on the job.
    if (data?.customer_id) {
      try {
        await notificationService.handleRequestStatusChange(id, 'under_review', 'assigned', data);
      } catch (notificationError) {
        console.warn('Technician assigned, but notification delivery failed:', notificationError.message);
      }
    }

    res.json({ success: true, data, message: 'Technician assigned successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// UPDATE service request status
router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    if (!status) {
      return res.status(400).json({ success: false, error: 'Status is required' });
    }

    // Get current request first
    const { data: currentRequest } = await supabase
      .from('service_requests')
      .select('*')
      .eq('id', id)
      .single();

    if (!currentRequest) {
      return res.status(404).json({ success: false, error: 'Service request not found' });
    }

    // Update status using service
    const data = await serviceRequestService.updateServiceRequestStatus(id, status, notes);

    // Send notification if customer exists
    if (currentRequest.customer_id) {
      try {
        await notificationService.handleRequestStatusChange(
          id,
          currentRequest.status,
          status,
          { ...currentRequest, ticket_number: data.ticket_number || currentRequest.ticket_number || data.id }
        );
      } catch (notificationError) {
        console.warn('Status updated, but notification delivery failed:', notificationError.message);
      }
    }

    res.json({ success: true, data, message: 'Service request updated successfully' });
  } catch (error) {
    console.error('Error updating service request:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// UPDATE service request with signature and feedback
router.patch('/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, feedback_notes, customer_signer_name } = req.body;

    // The customer's sign-off. We record only that they signed and their typed
    // name — never the drawn signature image.
    const data = await serviceRequestService.completeServiceRequest(
      id,
      rating,
      feedback_notes,
      customer_signer_name
    );

    // Notify the customer their request is now resolved.
    if (data?.customer_id) {
      try {
        await notificationService.handleRequestStatusChange(id, 'pending_customer_signoff', 'resolved', data);
      } catch (notificationError) {
        console.warn('Request completed, but notification delivery failed:', notificationError.message);
      }
    }

    res.json({ success: true, data, message: 'Service request completed and signed off' });
  } catch (error) {
    console.error('Error completing service request:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET the field service report for a request (or null if none yet)
router.get('/:id/report', validateUUID, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('service_reports')
      .select('*')
      .eq('service_request_id', req.params.id)
      .maybeSingle();

    if (error) throw error;
    res.json({ success: true, data: data || null });
  } catch (error) {
    console.error('Error fetching service report:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Technician submits the field service report. Creates or updates the single
// report row, marks it tech-signed, and moves the ticket to awaiting-customer.
router.post('/:id/report', validateUUID, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      system,
      nature_of_complaint,
      work_done,
      parts_material,
      tech_signer_name
    } = req.body;

    if (!work_done || work_done.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'work_done is required' });
    }

    const data = await serviceRequestService.submitServiceReport(id, {
      system: system || null,
      nature_of_complaint: nature_of_complaint || null,
      work_done: work_done.trim(),
      parts_material: parts_material || null,
      tech_signer_name: tech_signer_name || null
    });

    res.status(201).json({ success: true, data, message: 'Service report submitted' });
  } catch (error) {
    console.error('Error submitting service report:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ADD service update/note
router.post('/:id/updates', async (req, res) => {
  try {
    const { id } = req.params;
    const { author_name, notes } = req.body;

    if (!notes) {
      return res.status(400).json({ success: false, error: 'Notes are required' });
    }

    const { data, error } = await supabase
      .from('service_updates')
      .insert([
        {
          service_request_id: id,
          author_name: author_name || 'System',
          notes,
          created_at: new Date().toISOString()
        }
      ])
      .select();

    if (error) throw error;

    res.status(201).json({ success: true, data: data?.[0], message: 'Service update added' });
  } catch (error) {
    console.error('Error adding service update:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE service request
router.delete('/:id', validateUUID, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if request exists
    const { data: existing, error: checkError } = await supabase
      .from('service_requests')
      .select('id, status')
      .eq('id', id)
      .single();

    if (checkError || !existing) {
      return res.status(404).json({
        success: false,
        error: 'Service request not found'
      });
    }

    // Admins may delete a request in any status. Non-admin callers can only
    // delete requests that have not started being worked on yet.
    if (req.user?.role !== 'admin') {
      const deletableStatuses = ['request_received', 'under_review', 'pending'];
      if (!deletableStatuses.includes(existing.status)) {
        return res.status(400).json({
          success: false,
          error: `Cannot delete request with status: ${existing.status}.`
        });
      }
    }

    // Delete related service updates first
    await supabase
      .from('service_updates')
      .delete()
      .eq('service_request_id', id);

    // Delete the service request
    const { error: deleteError } = await supabase
      .from('service_requests')
      .delete()
      .eq('id', id);

    if (deleteError) throw deleteError;

    res.json({
      success: true,
      message: 'Service request deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting service request:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET service request statistics for dashboard
router.get('/stats/overview', async (req, res) => {
  try {
    const { customerId } = req.query;

    let totalQuery = supabase.from('service_requests').select('id', { count: 'exact', head: true });
    let pendingQuery = supabase.from('service_requests').select('id', { count: 'exact', head: true });
    let completedQuery = supabase.from('service_requests').select('id', { count: 'exact', head: true });

    if (customerId) {
      totalQuery = totalQuery.eq('customer_id', customerId);
      pendingQuery = pendingQuery.eq('customer_id', customerId).neq('status', 'resolved');
      completedQuery = completedQuery.eq('customer_id', customerId).eq('status', 'resolved');
    } else {
      pendingQuery = pendingQuery.neq('status', 'resolved');
      completedQuery = completedQuery.eq('status', 'resolved');
    }

    const [totalResult, pendingResult, completedResult] = await Promise.all([
      totalQuery,
      pendingQuery,
      completedQuery
    ]);

    res.json({
      success: true,
      data: {
        total: totalResult.count || 0,
        pending: pendingResult.count || 0,
        completed: completedResult.count || 0
      }
    });
  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET requests by customer
router.get('/customer/:customerId', validateUUID, async (req, res) => {
  try {
    const { customerId } = req.params;
    const { status, limit = 10, offset = 0 } = req.query;

    let query = supabase
      .from('service_requests')
      .select(`
        *,
        customers (id, name, company_name),
        locations (id, name, city),
        rooms (id, name),
        service_updates (id, author_name, notes, created_at)
      `)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (status) {
      query = query.eq('status', status);
    }

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
    console.error('Error fetching customer requests:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// SEARCH service requests
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
      .from('service_requests')
      .select(`
        *,
        customers (id, name, company_name),
        locations (id, name, city),
        rooms (id, name)
      `)
      .ilike('issue_title', searchTerm)
      .limit(parseInt(limit))
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      data,
      count: data?.length || 0
    });
  } catch (error) {
    console.error('Error searching service requests:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
