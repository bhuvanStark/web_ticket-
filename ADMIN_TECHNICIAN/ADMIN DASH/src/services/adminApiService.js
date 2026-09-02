import unifiedClient from '../api/unifiedClient';

const API_BASE_URL = import.meta.env?.VITE_API_BASE_URL || 'http://localhost:5000/api';

const authHeaders = (json = false) => ({
  ...(json ? { 'Content-Type': 'application/json' } : {}),
  ...(localStorage.getItem('admin_access_token')
    ? { Authorization: `Bearer ${localStorage.getItem('admin_access_token')}` }
    : {})
});

// Every call in this module is authenticated. On a 401 (expired access token)
// refresh once through the shared client and retry the request a single time —
// same contract as unifiedClient.fetch, and it cannot loop.
async function authFetch(url, options = {}) {
  let res = await fetch(url, options);
  if (res.status === 401) {
    try {
      const freshToken = await unifiedClient.refreshAccessToken();
      res = await fetch(url, {
        ...options,
        headers: { ...options.headers, Authorization: `Bearer ${freshToken}` }
      });
    } catch {
      // Refresh failed; unifiedClient has already cleared the tokens. Return the
      // original 401 so the caller surfaces the error and the app falls back to
      // the login screen on its next session check.
    }
  }
  return res;
}

async function readApiData(response, operation) {
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.message || payload?.error || `Failed to ${operation}`);
  }
  return payload?.data ?? payload ?? [];
}

const STATUS_MAP = {
  'request_received': 'Unassigned',
  'under_review': 'Under Review',
  'unassigned': 'Unassigned',
  'assigned': 'Assigned',
  'technician_on_the_way': 'Technician On The Way',
  'service_in_progress': 'Service In Progress',
  'service_completed': 'Awaiting Customer Signature',
  'pending_customer_signoff': 'Awaiting Customer Signature',
  'pending_next_visit': 'Pending Next Visit',
  'resolved': 'Resolved',
  'closed': 'Closed',
  'cancelled': 'Cancelled'
};

const STATUS_TO_DB = {
  'Unassigned': 'unassigned',
  'Under Review': 'under_review',
  'Assigned': 'assigned',
  'Technician On The Way': 'technician_on_the_way',
  'Service In Progress': 'service_in_progress',
  'Service Completed - Pending Customer Sign-Off': 'pending_customer_signoff',
  'Awaiting Customer Signature': 'pending_customer_signoff',
  'Pending Next Visit': 'pending_next_visit',
  'Resolved': 'resolved',
  'Closed': 'closed',
  'Cancelled': 'cancelled'
};

export function transformDbTicketToAdmin(row) {
  if (!row) return null;

  const dateObj = row.created_at ? new Date(row.created_at) : new Date();
  const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const formattedTimeline = (row.service_updates || []).map(u => ({
    time: new Date(u.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    title: u.notes,
    subtitle: `Updated by ${u.author_name || 'System'}`
  }));
  if (formattedTimeline.length === 0) formattedTimeline.push(
    {
      time: timeStr,
      title: 'Customer submitted request.',
      subtitle: `Created via TaskTel for ${row.customers?.name || 'Customer'}`
    }
  );

  const requestReference = row.id ? row.id.slice(0, 8).toUpperCase() : 'UNKNOWN';

  return {
    id: `#${requestReference}`,
    dbId: row.id,
    ticketNumber: requestReference,
    title: row.issue_title || 'Untitled service request',
    customer: row.customers?.name || row.customers?.company_name || 'Unknown customer',
    customerId: row.customer_id,
    location: row.locations?.name || 'Unknown location',
    locationId: row.location_id,
    // EPABX tickets have no room.
    room: row.rooms?.name || (row.support_category === 'epabx' ? '—' : 'Unknown room'),
    roomId: row.room_id || null,
    area: row.area || '',
    equipment: row.equipment?.name || null,
    equipmentId: row.equipment_id,
    issueType: row.issue_category || 'Uncategorized',
    // 'av' | 'epabx' — the support line the ticket was raised under.
    supportCategory: row.support_category || 'av',
    serviceType: row.support_category === 'epabx' ? 'EPABX' : 'AV',
    // On-site vs Remote, from service_type ('onsite_service' | 'remote_support').
    serviceMode: row.service_type === 'remote_support' ? 'Remote' : 'On-site',
    priority: row.priority ? row.priority.charAt(0).toUpperCase() + row.priority.slice(1) : 'High',
    preferredDate: row.preferred_date || null,
    preferredSlot: row.preferred_time || null,
    status: STATUS_MAP[row.status] || (row.status ? row.status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : (row.technician?.full_name ? 'Assigned' : 'Unassigned')),
    assignedToId: row.technician?.id || null,
    assignedTo: row.technician?.full_name || null,
    assignedToRole: row.technician?.role_title || null,
    assignedToAvatar: row.technician?.avatar_url || null,
    createdDate: `${dateStr}, ${timeStr}`,
    createdAt: row.created_at || null,
    completedAt: row.actual_completion_date || null,
    preferredTime: row.estimated_completion_date || null,
    customerDescription: row.issue_description || '',
    attachments: [],
    rating: row.rating ?? null,
    timeline: formattedTimeline,
    serviceReport: (() => {
      const r = Array.isArray(row.service_reports) ? row.service_reports[0] : (row.service_reports || null);
      if (!r) return null;
      return {
        system: r.system || '',
        natureOfComplaint: r.nature_of_complaint || '',
        workDone: r.work_done || '',
        partsMaterial: r.parts_material || '',
        techSigned: !!r.tech_signed,
        techSignerName: r.tech_signer_name || '',
        techSignedAt: r.tech_signed_at || null,
        customerSigned: !!r.customer_signed,
        customerSignerName: r.customer_signer_name || '',
        customerSignedAt: r.customer_signed_at || null
      };
    })()
  };
}

// 1. Fetch Service Requests
export async function fetchAdminServiceRequests() {
  try {
    const res = await authFetch(`${API_BASE_URL}/service-requests`, { headers: authHeaders() });
    if (!res.ok) throw new Error('Failed to fetch requests');
    const data = await readApiData(res, 'fetch service requests');
    return (data || []).map(transformDbTicketToAdmin);
  } catch (error) {
    console.warn('fetchAdminServiceRequests error:', error.message);
    return [];
  }
}

// 2. Fetch Customers
export async function fetchAdminCustomers() {
  try {
    const res = await authFetch(`${API_BASE_URL}/customers`, { headers: authHeaders() });
    const data = await readApiData(res, 'fetch customers');
    return data || [];
  } catch (error) {
    console.warn('fetchAdminCustomers error:', error.message);
    return [];
  }
}

// 3. Fetch Locations
export async function fetchAdminLocations() {
  try {
    const res = await authFetch(`${API_BASE_URL}/locations`, { headers: authHeaders() });
    const data = await readApiData(res, 'fetch locations');
    return data || [];
  } catch (error) {
    console.warn('fetchAdminLocations error:', error.message);
    return [];
  }
}

// 4. Fetch Rooms
export async function fetchAdminRooms() {
  try {
    const res = await authFetch(`${API_BASE_URL}/rooms`, { headers: authHeaders() });
    const data = await readApiData(res, 'fetch rooms');
    return data || [];
  } catch (error) {
    console.warn('fetchAdminRooms error:', error.message);
    return [];
  }
}

// 5. Fetch Technicians
export async function fetchAdminTechnicians() {
  try {
    const res = await authFetch(`${API_BASE_URL}/technicians`, { headers: authHeaders() });
    const data = await readApiData(res, 'fetch technicians');
    return data || [];
  } catch (error) {
    console.warn('fetchAdminTechnicians error:', error.message);
    return [];
  }
}

// 6. Assign Technician
export async function assignTechnicianInApi(ticketDbId, techDbId, mode = 'onsite') {
  try {
    const res = await authFetch(`${API_BASE_URL}/service-requests/${ticketDbId}/assign`, {
      method: 'POST',
      headers: authHeaders(true),
      body: JSON.stringify({ technician_id: techDbId, mode })
    });
    if (!res.ok) throw new Error('Failed to assign technician');
    return await res.json();
  } catch (error) {
    console.error('assignTechnician error:', error.message);
    throw error;
  }
}

// 7. Update Ticket Status
export async function updateTicketStatusInApi(ticketDbId, newStatusStr, customSubtitle = '') {
  try {
    const dbStatus = STATUS_TO_DB[newStatusStr] || 'assigned';
    const res = await authFetch(`${API_BASE_URL}/service-requests/${ticketDbId}/status`, {
      method: 'PATCH',
      headers: authHeaders(true),
      body: JSON.stringify({ status: dbStatus, customSubtitle })
    });
    if (!res.ok) throw new Error('Failed to update status');
    return await res.json();
  } catch (error) {
    console.error('updateTicketStatus error:', error.message);
    throw error;
  }
}

// Technician submits the field service report. Creates the report row (tech
// signed) and moves the ticket to awaiting-customer-signature.
export async function submitServiceReportInApi(ticketDbId, report) {
  const res = await authFetch(`${API_BASE_URL}/service-requests/${ticketDbId}/report`, {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify({
      system: report.system || null,
      nature_of_complaint: report.natureOfComplaint || null,
      work_done: report.workDone || '',
      parts_material: report.partsMaterial || null,
      tech_signer_name: report.techSignerName || null
    })
  });
  if (!res.ok) throw new Error('Failed to submit service report');
  return readApiData(res, 'submit service report');
}

// 8. Create Service Request
export async function createServiceRequestInApiAdmin(newTicketData) {
  try {
    // The modal works in camelCase; POST /service-requests destructures
    // snake_case and customer_id/location_id/room_id/issue_category/issue_title
    // are all NOT NULL. Map here, or every field arrives undefined and the
    // insert fails.
    const isEpabx = newTicketData.serviceType === 'EPABX';

    const payload = {
      customer_id: newTicketData.customerId,
      location_id: newTicketData.locationId,
      issue_category: newTicketData.issueType,
      issue_title: newTicketData.title || newTicketData.issueType || 'Service request',
      // The customer ticket has no separate notes field — mirror that here.
      issue_description: newTicketData.title || newTicketData.issueType || '',
      // service_type is the support mode ('onsite_service'/'remote_support'),
      // not the AV/EPABX product line — existing rows store 'onsite_service'.
      service_type: newTicketData.supportMode === 'Remote Support' ? 'remote_support' : 'onsite_service',
      // The AV/EPABX support line, a separate axis from service_type.
      support_category: isEpabx ? 'epabx' : 'av'
    };

    // Room is AV-only; EPABX tickets are stored with room_id NULL.
    if (!isEpabx && newTicketData.roomId) {
      payload.room_id = newTicketData.roomId;
    }
    if (newTicketData.preferredDate) payload.preferred_date = newTicketData.preferredDate;
    if (newTicketData.preferredTime) payload.preferred_time = newTicketData.preferredTime;
    if (newTicketData.area) payload.area = newTicketData.area;

    const res = await authFetch(`${API_BASE_URL}/service-requests`, {
      method: 'POST',
      headers: authHeaders(true),
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Failed to create ticket');
    
    // The backend just returns the raw object. We would ideally re-fetch or format it, but to match Supabase's optimistic return:
    const rawData = await readApiData(res, 'create service request');
    return transformDbTicketToAdmin(rawData);
  } catch (error) {
    console.error('createServiceRequest error:', error.message);
    throw error;
  }
}

// 10. Delete Service Request
export async function deleteServiceRequestFromApi(ticketDbId) {
  const res = await authFetch(`${API_BASE_URL}/service-requests/${ticketDbId}`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  let body = null;
  try { body = await res.json(); } catch { /* no JSON body */ }
  if (!res.ok) {
    throw new Error(body?.error || `Failed to delete ticket (HTTP ${res.status})`);
  }
  return body;
}

// 9. Create Technician
export async function createTechnicianInApi(techData) {
  try {
    const payload = {
      full_name: techData.full_name || techData.name,
      email: techData.email,
      phone: techData.phone || null,
      role_title: techData.role_title || techData.role || null,
      location: techData.location || null,
      specialization: techData.specialization || null
    };

    const res = await authFetch(`${API_BASE_URL}/technicians`, {
      method: 'POST',
      headers: authHeaders(true),
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      let message = 'Failed to create technician';
      try {
        const body = await res.json();
        message = body.error || body.message || message;
      } catch {
        // response was not JSON; keep the default message
      }
      throw new Error(message);
    }

    return res.json();
  } catch (error) {
    console.error('createTechnician error:', error.message);
    throw error;
  }
}
// 10. Realtime Subscription (Placeholder until Socket.io is fully implemented)
export function subscribeToAdminServiceRequests(onRealtimeChange) {
  console.log('Realtime is temporarily disabled. Use manual refresh or implement Socket.io.');
  // Return a dummy unsubscribe object so it doesn't break React cleanup hooks
  return { unsubscribe: () => {} };
}
export async function createAdminCustomer(payload) {
  const res = await authFetch(`${API_BASE_URL}/customers`, {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('Failed to create customer');
  return await res.json();
}
export async function updateAdminCustomer(id, payload) {
  const res = await authFetch(`${API_BASE_URL}/customers/${id}`, {
    method: 'PATCH',
    headers: authHeaders(true),
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('Failed to update customer');
  return await res.json();
}
export async function deleteAdminCustomer(id) {
  const res = await authFetch(`${API_BASE_URL}/customers/${id}`, { method: 'DELETE', headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to delete customer');
  return await res.json();
}

