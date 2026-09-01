import { supabase } from '../config/supabaseClient.js';

// Create notification
export const createNotification = async (customerId, type, title, message, relatedRequestId = null) => {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .insert([
        {
          customer_id: customerId,
          type,
          title,
          message,
          service_request_id: relatedRequestId,
          is_read: false,
          created_at: new Date().toISOString()
        }
      ])
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    throw new Error(`Failed to create notification: ${error.message}`);
  }
};

// Mark notification as read
export const markNotificationAsRead = async (notificationId) => {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', notificationId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    throw new Error(`Failed to mark notification as read: ${error.message}`);
  }
};

// Mark all notifications as read for customer
export const markAllNotificationsAsRead = async (customerId) => {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('customer_id', customerId)
      .eq('is_read', false)
      .select();

    if (error) throw error;
    return data;
  } catch (error) {
    throw new Error(`Failed to mark all notifications as read: ${error.message}`);
  }
};

// Get customer notifications
export const getCustomerNotifications = async (customerId, limit = 20, offset = 0) => {
  try {
    const { data, error, count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact' })
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return {
      notifications: data || [],
      total: count || 0,
      limit,
      offset
    };
  } catch (error) {
    throw new Error(`Failed to fetch notifications: ${error.message}`);
  }
};

// Get unread notification count
export const getUnreadCount = async (customerId) => {
  try {
    const { data, error, count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact' })
      .eq('customer_id', customerId)
      .eq('is_read', false);

    if (error) throw error;
    return count || 0;
  } catch (error) {
    throw new Error(`Failed to get unread count: ${error.message}`);
  }
};

// Delete notification
export const deleteNotification = async (notificationId) => {
  try {
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', notificationId);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    throw new Error(`Failed to delete notification: ${error.message}`);
  }
};

// Delete all notifications for customer
export const deleteAllNotifications = async (customerId) => {
  try {
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('customer_id', customerId);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    throw new Error(`Failed to delete all notifications: ${error.message}`);
  }
};

// Notification templates
const notificationTemplates = {
  request_received: {
    title: 'Service Request Received',
    message: (data) => `Your service request (${data.ticket_number}) has been received. We will review it shortly.`
  },
  request_confirmed: {
    title: 'Request Confirmed',
    message: (data) => `Your request (${data.ticket_number}) has been confirmed and is under review.`
  },
  technician_assigned: {
    title: 'Technician Assigned',
    message: (data) => `A technician has been assigned to your request (${data.ticket_number}).`
  },
  technician_on_way: {
    title: 'Technician On The Way',
    message: (data) => `Your assigned technician is on the way to ${data.location_name}.`
  },
  service_in_progress: {
    title: 'Service In Progress',
    message: (data) => `Service work has started on your request (${data.ticket_number}).`
  },
  pending_signoff: {
    title: 'Pending Your Approval',
    message: (data) => `Service work is complete. Please review and sign off on request (${data.ticket_number}).`
  },
  request_resolved: {
    title: 'Service Complete',
    message: (data) => `Your service request (${data.ticket_number}) has been completed successfully.`
  },
  request_closed: {
    title: 'Request Closed',
    message: (data) => `Your service request (${data.ticket_number}) has been closed.`
  },
  high_priority: {
    title: 'High Priority Request',
    message: (data) => `Your high-priority request (${data.ticket_number}) needs immediate attention.`
  },
  sla_warning: {
    title: 'SLA Warning',
    message: (data) => `Request (${data.ticket_number}) is approaching SLA deadline.`
  },
  sla_breached: {
    title: 'SLA Breached',
    message: (data) => `Request (${data.ticket_number}) has exceeded SLA timeframe.`
  }
};

// Send templated notification
export const sendTemplateNotification = async (customerId, templateKey, data, requestId = null) => {
  try {
    const template = notificationTemplates[templateKey];
    if (!template) {
      throw new Error(`Unknown notification template: ${templateKey}`);
    }

    return await createNotification(
      customerId,
      templateKey,
      template.title,
      template.message(data),
      requestId
    );
  } catch (error) {
    throw new Error(`Failed to send template notification: ${error.message}`);
  }
};

// Send batch notifications to multiple customers
export const sendBatchNotifications = async (customerIds, type, title, message) => {
  try {
    const notifications = customerIds.map(customerId => ({
      customer_id: customerId,
      type,
      title,
      message,
      is_read: false,
      created_at: new Date().toISOString()
    }));

    const { data, error } = await supabase
      .from('notifications')
      .insert(notifications)
      .select();

    if (error) throw error;
    return data;
  } catch (error) {
    throw new Error(`Failed to send batch notifications: ${error.message}`);
  }
};

// Trigger notifications on request status change
export const handleRequestStatusChange = async (requestId, oldStatus, newStatus, requestData) => {
  try {
    const customerId = requestData.customer_id;
    const templateMap = {
      'request_received': 'request_received',
      'under_review': 'request_confirmed',
      'assigned': 'technician_assigned',
      'technician_on_the_way': 'technician_on_way',
      'service_in_progress': 'service_in_progress',
      'pending_customer_signoff': 'pending_signoff',
      'resolved': 'request_resolved',
      'closed': 'request_closed'
    };

    const templateKey = templateMap[newStatus];
    if (templateKey) {
      await sendTemplateNotification(
        customerId,
        templateKey,
        {
          ticket_number: requestData.ticket_number,
          location_name: requestData.locations?.name || 'your location'
        },
        requestId
      );
    }
  } catch (error) {
    console.error(`Failed to handle status change notifications:`, error);
  }
};

// Send urgent priority notifications
export const notifyUrgentRequest = async (customerId, requestData) => {
  try {
    if (requestData.priority === 'critical' || requestData.priority === 'high') {
      await sendTemplateNotification(
        customerId,
        'high_priority',
        { ticket_number: requestData.ticket_number },
        requestData.id
      );
    }
  } catch (error) {
    console.error(`Failed to send urgent notification:`, error);
  }
};

// Notify SLA warnings
export const notifySLAWarning = async (customerId, requestData, slaData) => {
  try {
    if (slaData.remainingHours <= 2 && !slaData.isBreached) {
      await sendTemplateNotification(
        customerId,
        'sla_warning',
        { ticket_number: requestData.ticket_number },
        requestData.id
      );
    }

    if (slaData.isBreached) {
      await sendTemplateNotification(
        customerId,
        'sla_breached',
        { ticket_number: requestData.ticket_number },
        requestData.id
      );
    }
  } catch (error) {
    console.error(`Failed to send SLA notification:`, error);
  }
};

export default {
  createNotification,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getCustomerNotifications,
  getUnreadCount,
  deleteNotification,
  deleteAllNotifications,
  sendTemplateNotification,
  sendBatchNotifications,
  handleRequestStatusChange,
  notifyUrgentRequest,
  notifySLAWarning
};
