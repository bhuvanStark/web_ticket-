import { supabase } from '../config/supabaseClient.js';

// Get complete customer profile with all related data
export const getCustomerProfile = async (customerId) => {
  try {
    const { data, error } = await supabase
      .from('customers')
      .select(`
        *,
        locations (id, name, city, address),
        service_requests (
          id,
          ticket_number,
          status,
          issue_title,
          priority,
          created_at,
          updated_at
        )
      `)
      .eq('id', customerId)
      .single();

    if (error) throw error;
    if (!data) throw new Error('Customer not found');

    return data;
  } catch (error) {
    throw new Error(`Failed to fetch customer profile: ${error.message}`);
  }
};

// Get customer dashboard stats
export const getCustomerDashboardStats = async (customerId) => {
  try {
    // Get all service requests
    const { data: requests, error: requestsError } = await supabase
      .from('service_requests')
      .select('id, status, priority, created_at, updated_at')
      .eq('customer_id', customerId);

    if (requestsError) throw requestsError;

    // Calculate stats
    const stats = {
      total_requests: requests?.length || 0,
      pending: 0,
      completed: 0,
      by_status: {},
      by_priority: {},
      avg_resolution_time: 0,
      critical_count: 0,
      high_count: 0
    };

    let totalResolutionTime = 0;
    let resolvedCount = 0;

    requests?.forEach(req => {
      // Count by status
      stats.by_status[req.status] = (stats.by_status[req.status] || 0) + 1;

      // Count by priority
      stats.by_priority[req.priority] = (stats.by_priority[req.priority] || 0) + 1;

      // Count pending vs completed
      if (req.status === 'resolved' || req.status === 'closed') {
        stats.completed++;
      } else {
        stats.pending++;
      }

      // Count critical and high
      if (req.priority === 'critical') stats.critical_count++;
      if (req.priority === 'high') stats.high_count++;

      // Calculate average resolution time
      if (req.status === 'resolved' || req.status === 'closed') {
        const created = new Date(req.created_at);
        const updated = new Date(req.updated_at);
        const hours = (updated - created) / (1000 * 60 * 60);
        totalResolutionTime += hours;
        resolvedCount++;
      }
    });

    if (resolvedCount > 0) {
      stats.avg_resolution_time = parseFloat(
        (totalResolutionTime / resolvedCount).toFixed(2)
      );
    }

    return stats;
  } catch (error) {
    throw new Error(`Failed to fetch dashboard stats: ${error.message}`);
  }
};

// Get customer's locations with room details
export const getCustomerLocations = async (customerId) => {
  try {
    // First get customer's locations
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('id')
      .eq('id', customerId)
      .single();

    if (customerError) throw customerError;

    // Get all locations with rooms
    const { data: locations, error: locationsError } = await supabase
      .from('locations')
      .select(`
        *,
        rooms (
          id,
          name,
          room_type,
          capacity,
          equipment (id, name, type)
        )
      `)
      .order('name', { ascending: true });

    if (locationsError) throw locationsError;

    return locations || [];
  } catch (error) {
    throw new Error(`Failed to fetch customer locations: ${error.message}`);
  }
};

// Get customer's service request summary
export const getRequestSummary = async (customerId) => {
  try {
    const { data: requests, error } = await supabase
      .from('service_requests')
      .select(`
        id,
        ticket_number,
        status,
        issue_title,
        issue_category,
        priority,
        created_at,
        updated_at,
        rating,
        locations (id, name),
        rooms (id, name)
      `)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    // Group by status
    const summary = {
      total: requests?.length || 0,
      by_status: {},
      recent: requests?.slice(0, 10) || []
    };

    requests?.forEach(req => {
      if (!summary.by_status[req.status]) {
        summary.by_status[req.status] = [];
      }
      summary.by_status[req.status].push(req);
    });

    return summary;
  } catch (error) {
    throw new Error(`Failed to fetch request summary: ${error.message}`);
  }
};

// Get high-priority requests
export const getHighPriorityRequests = async (customerId) => {
  try {
    const { data, error } = await supabase
      .from('service_requests')
      .select('*')
      .eq('customer_id', customerId)
      .in('priority', ['critical', 'high'])
      .neq('status', 'resolved')
      .neq('status', 'closed')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return data || [];
  } catch (error) {
    throw new Error(`Failed to fetch high-priority requests: ${error.message}`);
  }
};

// Update customer profile
export const updateCustomerProfile = async (customerId, updates) => {
  try {
    const allowedFields = ['name', 'company_name', 'email', 'phone', 'address', 'city'];
    const filteredUpdates = {};

    allowedFields.forEach(field => {
      if (field in updates) {
        filteredUpdates[field] = updates[field];
      }
    });

    filteredUpdates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('customers')
      .update(filteredUpdates)
      .eq('id', customerId)
      .select()
      .single();

    if (error) throw error;
    if (!data) throw new Error('Customer not found');

    return data;
  } catch (error) {
    throw new Error(`Failed to update customer profile: ${error.message}`);
  }
};

// Get customer preferences
export const getCustomerPreferences = async (customerId) => {
  try {
    const { data, error } = await supabase
      .from('customer_preferences')
      .select('*')
      .eq('customer_id', customerId)
      .single();

    if (error && error.code === 'PGRST116') {
      return {
        customer_id: customerId,
        notifications_enabled: true,
        email_notifications: true,
        sms_notifications: false,
        preferred_contact_method: 'email'
      };
    }

    if (error) throw error;
    return data;
  } catch (error) {
    throw new Error(`Failed to fetch preferences: ${error.message}`);
  }
};

// Update customer preferences
export const updateCustomerPreferences = async (customerId, preferences) => {
  try {
    const { data: existing, error: fetchError } = await supabase
      .from('customer_preferences')
      .select('id')
      .eq('customer_id', customerId)
      .single();

    let result;

    if (existing) {
      const { data, error } = await supabase
        .from('customer_preferences')
        .update({
          ...preferences,
          updated_at: new Date().toISOString()
        })
        .eq('customer_id', customerId)
        .select()
        .single();

      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await supabase
        .from('customer_preferences')
        .insert([
          {
            customer_id: customerId,
            ...preferences,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ])
        .select()
        .single();

      if (error) throw error;
      result = data;
    }

    return result;
  } catch (error) {
    throw new Error(`Failed to update preferences: ${error.message}`);
  }
};

// Get customer reviews
export const getCustomerReviews = async (customerId) => {
  try {
    const { data, error } = await supabase
      .from('service_requests')
      .select('id, ticket_number, rating, feedback_notes, updated_at')
      .eq('customer_id', customerId)
      .not('rating', 'is', null)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    const reviews = {
      total_reviews: data?.length || 0,
      average_rating: 0,
      rating_breakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
      reviews: data || []
    };

    let totalRating = 0;
    data?.forEach(review => {
      totalRating += review.rating;
      reviews.rating_breakdown[review.rating]++;
    });

    if (data?.length > 0) {
      reviews.average_rating = parseFloat((totalRating / data.length).toFixed(2));
    }

    return reviews;
  } catch (error) {
    throw new Error(`Failed to fetch reviews: ${error.message}`);
  }
};

// Get customer activity
export const getCustomerActivity = async (customerId, limit = 20) => {
  try {
    // Get service request history
    const { data: requests, error: requestsError } = await supabase
      .from('service_requests')
      .select('id, ticket_number, status, created_at')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (requestsError) throw requestsError;

    // Get service updates
    const { data: updates, error: updatesError } = await supabase
      .from('service_updates')
      .select(`
        id,
        notes,
        author_name,
        created_at,
        service_requests (ticket_number)
      `)
      .in('service_request_id', requests?.map(r => r.id) || [])
      .order('created_at', { ascending: false })
      .limit(limit);

    if (updatesError) throw updatesError;

    return {
      requests: requests || [],
      updates: updates || []
    };
  } catch (error) {
    throw new Error(`Failed to fetch activity: ${error.message}`);
  }
};

export default {
  getCustomerProfile,
  getCustomerDashboardStats,
  getCustomerLocations,
  getRequestSummary,
  getHighPriorityRequests,
  updateCustomerProfile,
  getCustomerPreferences,
  updateCustomerPreferences,
  getCustomerReviews,
  getCustomerActivity
};
