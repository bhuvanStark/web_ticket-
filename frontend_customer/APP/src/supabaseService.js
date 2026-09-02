import unifiedClient from './api/unifiedClient';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api').replace(/\/$/, '');

function buildHeaders(options) {
  const token = localStorage.getItem('tasktel_access_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers
  };
}

async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  let response = await fetch(url, { ...options, headers: buildHeaders(options) });

  // On a 401 (expired access token) refresh once through the shared client and
  // retry a single time — same contract as unifiedClient.fetch, cannot loop.
  if (response.status === 401) {
    try {
      await unifiedClient.refreshAccessToken();
      response = await fetch(url, { ...options, headers: buildHeaders(options) });
    } catch {
      // Refresh failed; tokens are cleared. Fall through and surface the error.
    }
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.success === false) {
    throw new Error(payload.error || payload.message || `Request failed with status ${response.status}`);
  }

  return payload;
}

async function fetchApiCollection(endpoint) {
  const payload = await apiRequest(endpoint);
  return Array.isArray(payload.data) ? payload.data : [];
}

const STEP_INDEX_TO_STATUS = [
  'request_received',
  'under_review',
  'assigned',
  'technician_on_the_way',
  'service_in_progress',
  'resolved'
];

export function transformDbTicketToFrontend(row) {
  if (!row) return null;

  const rawStatus = row.status || 'unassigned';

  // The field service report (one row, embedded as an array by the query
  // builder). Signatures are never stored — only whether each party signed.
  const reportRow = Array.isArray(row.service_reports) ? row.service_reports[0] : (row.service_reports || null);
  const serviceReport = reportRow ? {
    system: reportRow.system || '',
    natureOfComplaint: reportRow.nature_of_complaint || '',
    workDone: reportRow.work_done || '',
    partsMaterial: reportRow.parts_material || '',
    techSigned: !!reportRow.tech_signed,
    techSignerName: reportRow.tech_signer_name || '',
    customerSigned: !!reportRow.customer_signed,
    customerSignerName: reportRow.customer_signer_name || ''
  } : null;

  // The customer only ever sees two states: submitted, or completed. A report
  // that the technician has signed but the customer has not is "awaiting
  // signature" — still shown as submitted, with a sign prompt.
  const isCompleted = rawStatus === 'resolved' || rawStatus === 'closed' || serviceReport?.customerSigned;
  const awaitingCustomerSignature =
    !isCompleted && (rawStatus === 'pending_customer_signoff' || (serviceReport?.techSigned && !serviceReport?.customerSigned));

  const mappedStatus = isCompleted ? 'Completed'
    : awaitingCustomerSignature ? 'Awaiting Your Signature'
    : 'Request Submitted';

  return {
    id: row.ticket_number || row.id,
    ticketNumber: row.ticket_number || row.id,
    dbId: row.id,
    customerName: row.customers?.name || row.customers?.company_name || '',
    customer: row.customers?.name || row.customers?.company_name || '',
    // Company account the ticket belongs to, kept separate from the person's name.
    companyName: row.customers?.company_name || '',
    company: row.customers?.company_name || '',
    locationId: row.location_id,
    locationName: row.locations?.name || '',
    location: row.locations?.name || '',
    roomId: row.room_id || null,
    roomName: row.rooms?.name || '',
    room: row.rooms?.name || '',
    area: row.area || '',
    category: row.issue_category,
    issue: row.issue_title,
    title: row.issue_title,
    description: row.issue_description,
    serviceType: row.service_type === 'onsite_service' ? 'On-site Service' : 'Remote Support',
    // Which support line: 'av' | 'epabx'.
    supportCategory: row.support_category || 'av',
    supportLine: row.support_category === 'epabx' ? 'EPABX Support' : 'AV Support',
    preferredDate: row.preferred_date || null,
    preferredTime: row.preferred_time || null,
    createdAt: row.created_at ? new Date(row.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Just Now',
    status: mappedStatus,
    dbStatus: row.status,
    // Two-state timeline for the customer: 0 = submitted, 1 = completed.
    currentStepIndex: isCompleted ? 1 : 0,
    awaitingCustomerSignature,
    isCompleted,
    serviceReport,
    priority: row.priority ? `${row.priority.charAt(0).toUpperCase() + row.priority.slice(1)} Priority` : 'High Priority',
    // The customer is deliberately not shown any technician identity.
    attachedMedia: [],
    resolution: null,
    notes: row.service_updates?.map(u => ({
      time: new Date(u.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      author: u.author_name || 'System',
      text: u.notes
    })) || []
  };
}

// 1. Fetch Customers
export async function fetchCustomers() {
  try {
    return await fetchApiCollection('/customers');
  } catch (error) {
    console.warn('API fetchCustomers error:', error.message);
    return [];
  }
}

// 2. Fetch Locations
export async function fetchLocations() {
  try {
    return await fetchApiCollection('/locations');
  } catch (error) {
    console.warn('API fetchLocations error:', error.message);
    return [];
  }
}

// 3. Fetch Rooms
export async function fetchRooms() {
  try {
    const rooms = await fetchApiCollection('/rooms');
    return rooms.map((room) => ({
      ...room,
      tags: Array.isArray(room.tags) ? room.tags : [],
      installedSystems: Array.isArray(room.installedSystems) ? room.installedSystems : []
    }));
  } catch (error) {
    console.warn('API fetchRooms error:', error.message);
    return [];
  }
}

// 4. Fetch Service Requests
export async function fetchServiceRequests(customerId) {
  if (!customerId) return [];

  try {
    const rows = await fetchApiCollection(`/service-requests?customerId=${encodeURIComponent(customerId)}`);
    return rows.map(transformDbTicketToFrontend);
  } catch (error) {
    console.warn('API fetchServiceRequests error:', error.message);
    return [];
  }
}

// 5. Create a service request through the configured backend
export async function createServiceRequest(ticketData) {
  const isEpabx = ticketData.supportCategory === 'epabx';

  if (!ticketData.customerId) {
    throw new Error('Customer is required.');
  }
  // AV tickets are room-scoped; EPABX tickets have no room.
  if (!isEpabx && !ticketData.roomId) {
    throw new Error('A room is required for AV tickets.');
  }

  // "Other" location: create the location first, then use its id. Only EPABX
  // reaches here without a locationId.
  let locationId = ticketData.locationId;
  if (!locationId && ticketData.newLocationName) {
    const created = await apiRequest('/locations', {
      method: 'POST',
      body: JSON.stringify({ name: ticketData.newLocationName, customer_id: ticketData.customerId })
    });
    locationId = created.data?.id;
  }
  if (!locationId) {
    throw new Error('A location is required.');
  }

  const insertPayload = {
    customer_id: ticketData.customerId,
    location_id: locationId,
    issue_category: ticketData.category || 'Other',
    issue_title: ticketData.issue || ticketData.title || ticketData.category || 'Service request',
    issue_description: ticketData.description || '',
    service_type: ticketData.serviceType === 'Remote Support' ? 'remote_support' : 'onsite_service',
    support_category: isEpabx ? 'epabx' : 'av'
  };

  // Only send room_id for AV — omitting it lets the backend store NULL.
  if (!isEpabx && ticketData.roomId) {
    insertPayload.room_id = ticketData.roomId;
  }
  // Scheduling: only when the customer picked a specific slot.
  if (ticketData.preferredDate) insertPayload.preferred_date = ticketData.preferredDate;
  if (ticketData.preferredTime) insertPayload.preferred_time = ticketData.preferredTime;
  if (ticketData.area) insertPayload.area = ticketData.area;

  const response = await apiRequest('/service-requests', {
    method: 'POST',
    body: JSON.stringify(insertPayload)
  });
  const transformed = transformDbTicketToFrontend(response.data);
  return {
    ...transformed,
    locationName: transformed.locationName || ticketData.location || ticketData.locationName || '',
    location: transformed.location || ticketData.location || ticketData.locationName || '',
    roomName: transformed.roomName || ticketData.room || ticketData.roomName || '',
    room: transformed.room || ticketData.room || ticketData.roomName || '',
    // The create response is a bare insert with no customers join, so carry the
    // company/name through from the caller.
    companyName: transformed.companyName || ticketData.companyName || ticketData.company || '',
    company: transformed.company || ticketData.company || ticketData.companyName || '',
    customerName: transformed.customerName || ticketData.customerName || ''
  };
}

// 6. Update Service Request Status / Timeline Step
export async function updateServiceRequest(dbId, nextStepIndex, resolutionNotes = null) {
  const nextStatus = STEP_INDEX_TO_STATUS[nextStepIndex] || 'request_received';
  const response = await apiRequest(`/service-requests/${dbId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status: nextStatus, notes: resolutionNotes })
  });
  return transformDbTicketToFrontend(response.data);
}
