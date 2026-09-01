import { supabase } from '../config/supabaseClient.js';

// Human-readable ticket number: TT-YYMMDD-NNN, where NNN is a per-day counter.
// Example: TT-260828-001
export const formatTicketNumber = (date, sequence) => {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `TT-${yy}${mm}${dd}-${String(sequence).padStart(3, '0')}`;
};

// Generate the next unique ticket number for today by finding the highest
// counter already issued for the current date prefix.
export const generateTicketNumber = async (date = new Date()) => {
  try {
    const yy = String(date.getFullYear()).slice(-2);
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const prefix = `TT-${yy}${mm}${dd}-`;

    const { data, error } = await supabase
      .from('service_requests')
      .select('ticket_number')
      .like('ticket_number', `${prefix}%`)
      .order('ticket_number', { ascending: false })
      .limit(1);

    if (error) throw error;

    let next = 1;
    if (data && data.length > 0 && data[0].ticket_number) {
      const parsed = parseInt(data[0].ticket_number.slice(prefix.length), 10);
      if (!Number.isNaN(parsed)) next = parsed + 1;
    }

    return formatTicketNumber(date, next);
  } catch (error) {
    throw new Error(`Failed to generate ticket number: ${error.message}`);
  }
};

// Validate service request data
export const validateServiceRequestData = (data) => {
  const errors = [];

  if (!data.customer_id) errors.push('customer_id is required');
  if (!data.location_id) errors.push('location_id is required');
  // Room is mandatory for AV tickets and not used for EPABX (which has no
  // room concept — the column is left NULL).
  if (String(data.support_category).toLowerCase() !== 'epabx' && !data.room_id) {
    errors.push('room_id is required');
  }
  if (!data.issue_title || data.issue_title.trim().length === 0) {
    errors.push('issue_title is required');
  }
  if (!data.issue_description || data.issue_description.trim().length === 0) {
    errors.push('issue_description is required');
  }
  if (!data.issue_category) errors.push('issue_category is required');
  if (!data.service_type) errors.push('service_type is required');

  if (data.issue_title && data.issue_title.length > 255) {
    errors.push('issue_title must not exceed 255 characters');
  }

  if (data.issue_description && data.issue_description.length > 2000) {
    errors.push('issue_description must not exceed 2000 characters');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

// Create service request using the live service_requests schema
export const createServiceRequest = async (requestData) => {
  try {
    const basePayload = Object.fromEntries(
      Object.entries({
        ...requestData,
        status: 'request_received',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }).filter(([, value]) => value !== undefined && value !== null && value !== '')
    );

    // Retry a few times: two requests created at the same moment can compute the
    // same daily counter, and the loser hits a duplicate-key error.
    let data;
    let lastError;

    for (let attempt = 0; attempt < 5; attempt++) {
      const ticketNumber = await generateTicketNumber();
      const result = await supabase
        .from('service_requests')
        .insert([{ ...basePayload, ticket_number: ticketNumber }])
        .select()
        .single();

      if (!result.error) {
        data = result.data;
        break;
      }

      lastError = result.error;
      // 23505 = unique violation; anything else is a real failure.
      if (result.error.code !== '23505') throw result.error;
    }

    if (!data) throw lastError || new Error('Could not allocate a unique ticket number');

    // Add initial service update
    await addServiceUpdate(
      data.id,
      'Customer',
      'Service request created and received'
    );

    return data;
  } catch (error) {
    throw new Error(`Failed to create service request: ${error.message}`);
  }
};

// Update service request status
export const updateServiceRequestStatus = async (requestId, status, notes = null) => {
  try {
    const validStatuses = [
      'request_received',
      'under_review',
      'assigned',
      'technician_on_the_way',
      'service_in_progress',
      'pending_next_visit',
      'pending_customer_signoff',
      'resolved',
      'closed'
    ];

    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status: ${status}`);
    }

    const updateData = {
      status,
      updated_at: new Date().toISOString()
    };
    if (status === 'resolved' || status === 'closed') {
      updateData.actual_completion_date = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('service_requests')
      .update(updateData)
      .eq('id', requestId)
      .select()
      .single();

    if (error) throw error;

    // Add status update note
    if (notes) {
      await addServiceUpdate(requestId, 'System', `Status changed to ${status}. ${notes}`);
    } else {
      await addServiceUpdate(requestId, 'System', `Status changed to ${status}`);
    }

    return data;
  } catch (error) {
    throw new Error(`Failed to update status: ${error.message}`);
  }
};

// Technician submits the field service report: upsert the single report row for
// this request, mark it tech-signed, and move the ticket to awaiting-customer.
export const submitServiceReport = async (requestId, report) => {
  try {
    const nowIso = new Date().toISOString();

    const { data: existing } = await supabase
      .from('service_reports')
      .select('id')
      .eq('service_request_id', requestId)
      .maybeSingle();

    const payload = {
      system: report.system,
      nature_of_complaint: report.nature_of_complaint,
      work_done: report.work_done,
      parts_material: report.parts_material,
      tech_signed: true,
      tech_signed_at: nowIso,
      tech_signer_name: report.tech_signer_name,
      updated_at: nowIso
    };

    let saved;
    if (existing) {
      const { data, error } = await supabase
        .from('service_reports')
        .update(payload)
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      saved = data;
    } else {
      const { data, error } = await supabase
        .from('service_reports')
        .insert([{ service_request_id: requestId, ...payload, created_at: nowIso }])
        .select()
        .single();
      if (error) throw error;
      saved = data;
    }

    await updateServiceRequestStatus(
      requestId,
      'pending_customer_signoff',
      'Field service report submitted. Awaiting customer signature.'
    );

    return saved;
  } catch (error) {
    throw new Error(`Failed to submit service report: ${error.message}`);
  }
};

// Complete service request — the customer's sign-off. Records that the customer
// signed (boolean + typed name + time) on the report row, and resolves the
// ticket. The drawn signature image is never stored.
export const completeServiceRequest = async (requestId, rating, feedback, customerSignerName) => {
  try {
    const normalizedRating = rating == null || rating === ''
      ? null
      : Math.min(Math.max(Number(rating), 1), 5);

    const nowIso = new Date().toISOString();

    const { data, error } = await supabase
      .from('service_requests')
      .update({
        status: 'resolved',
        rating: normalizedRating,
        feedback_notes: feedback || null,
        actual_completion_date: nowIso,
        updated_at: nowIso
      })
      .eq('id', requestId)
      .select()
      .single();

    if (error) throw error;

    // Mark the report customer-signed, if a report row exists.
    const { data: reportRow } = await supabase
      .from('service_reports')
      .select('id')
      .eq('service_request_id', requestId)
      .maybeSingle();

    if (reportRow) {
      await supabase
        .from('service_reports')
        .update({
          customer_signed: true,
          customer_signed_at: nowIso,
          customer_signer_name: customerSignerName || null,
          updated_at: nowIso
        })
        .eq('id', reportRow.id);
    }

    await addServiceUpdate(
      requestId,
      'Customer',
      normalizedRating
        ? `Service report signed. Rating: ${normalizedRating}/5. Feedback: ${feedback || 'None'}`
        : 'Service report signed and approved by the customer.'
    );

    return data;
  } catch (error) {
    throw new Error(`Failed to complete service request: ${error.message}`);
  }
};

// Add service update/note
export const addServiceUpdate = async (requestId, authorName, notes) => {
  try {
    const { data, error } = await supabase
      .from('service_updates')
      .insert([
        {
          service_request_id: requestId,
          author_name: authorName,
          notes,
          created_at: new Date().toISOString()
        }
      ])
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    throw new Error(`Failed to add service update: ${error.message}`);
  }
};

// Get service request with timeline
export const getServiceRequestWithTimeline = async (requestId) => {
  try {
    const { data, error } = await supabase
      .from('service_requests')
      .select(`
        *,
        customers (id, name, company_name, email, phone),
        locations (id, name, city, address),
        rooms (id, name, room_type, capacity),
        service_updates (id, author_name, notes, created_at)
      `)
      .eq('id', requestId)
      .single();

    if (error) throw error;

    // Sort updates by created_at ascending
    if (data?.service_updates) {
      data.service_updates.sort((a, b) =>
        new Date(a.created_at) - new Date(b.created_at)
      );
    }

    return data;
  } catch (error) {
    throw new Error(`Failed to fetch service request: ${error.message}`);
  }
};

// Calculate SLA based on priority and creation time
export const calculateSLA = (createdAt, priority) => {
  const now = new Date();
  const created = new Date(createdAt);
  const elapsedHours = (now - created) / (1000 * 60 * 60);

  const slaHours = {
    critical: 1,
    high: 4,
    medium: 8,
    low: 24
  };

  const targetHours = slaHours[priority] || 24;
  const isBreached = elapsedHours > targetHours;
  const remainingHours = Math.max(0, targetHours - elapsedHours);

  return {
    targetHours,
    elapsedHours: parseFloat(elapsedHours.toFixed(2)),
    remainingHours: parseFloat(remainingHours.toFixed(2)),
    isBreached,
    percentComplete: (elapsedHours / targetHours) * 100
  };
};

// Get pending requests (requests not in resolved/closed status)
export const getPendingRequests = async (customerId = null) => {
  try {
    let query = supabase
      .from('service_requests')
      .select(`
        *,
        customers (id, name, company_name),
        locations (id, name),
        rooms (id, name)
      `)
      .neq('status', 'resolved')
      .neq('status', 'closed')
      .order('created_at', { ascending: false });

    if (customerId) {
      query = query.eq('customer_id', customerId);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Calculate SLA for each request
    const withSLA = data?.map(request => ({
      ...request,
      sla: calculateSLA(request.created_at, request.priority)
    })) || [];

    return withSLA;
  } catch (error) {
    throw new Error(`Failed to fetch pending requests: ${error.message}`);
  }
};

// Get overdue requests (SLA breached)
export const getOverdueRequests = async (customerId = null) => {
  try {
    const pending = await getPendingRequests(customerId);
    return pending.filter(req => req.sla.isBreached);
  } catch (error) {
    throw new Error(`Failed to fetch overdue requests: ${error.message}`);
  }
};

// Get request statistics
export const getRequestStatistics = async (customerId = null) => {
  try {
    let query = supabase.from('service_requests').select('id, status, priority, created_at');

    if (customerId) {
      query = query.eq('customer_id', customerId);
    }

    const { data, error } = await query;

    if (error) throw error;

    const stats = {
      total: data?.length || 0,
      by_status: {},
      by_priority: {},
      pending: 0,
      overdue: 0
    };

    data?.forEach(req => {
      // Count by status
      stats.by_status[req.status] = (stats.by_status[req.status] || 0) + 1;

      // Count by priority
      stats.by_priority[req.priority] = (stats.by_priority[req.priority] || 0) + 1;

      // Count pending
      if (req.status !== 'resolved' && req.status !== 'closed') {
        stats.pending++;
      }

      // Check if overdue
      const sla = calculateSLA(req.created_at, req.priority);
      if (sla.isBreached) {
        stats.overdue++;
      }
    });

    return stats;
  } catch (error) {
    throw new Error(`Failed to get statistics: ${error.message}`);
  }
};

// Export all functions for use in routes
export default {
  generateTicketNumber,
  validateServiceRequestData,
  createServiceRequest,
  updateServiceRequestStatus,
  completeServiceRequest,
  submitServiceReport,
  addServiceUpdate,
  getServiceRequestWithTimeline,
  calculateSLA,
  getPendingRequests,
  getOverdueRequests,
  getRequestStatistics
};
