import { supabase } from '../config/supabaseClient.js';

const subscriptions = new Map();

// Subscribe to service request updates
export const subscribeToServiceRequest = (requestId, callback) => {
  try {
    if (subscriptions.has(requestId)) {
      console.log(`Already subscribed to request ${requestId}`);
      return subscriptions.get(requestId);
    }

    const subscription = supabase
      .from(`service_requests:id=eq.${requestId}`)
      .on('*', (payload) => {
        console.log('Service request update:', payload);
        callback({
          type: payload.eventType,
          data: payload.new || payload.old,
          timestamp: new Date().toISOString()
        });
      })
      .subscribe((status) => {
        console.log(`Subscription status for request ${requestId}:`, status);
      });

    subscriptions.set(requestId, subscription);
    return subscription;
  } catch (error) {
    console.error(`Failed to subscribe to request ${requestId}:`, error);
    throw error;
  }
};

// Subscribe to service updates for a request
export const subscribeToServiceUpdates = (requestId, callback) => {
  try {
    const key = `updates:${requestId}`;

    if (subscriptions.has(key)) {
      console.log(`Already subscribed to updates for request ${requestId}`);
      return subscriptions.get(key);
    }

    const subscription = supabase
      .from(`service_updates:service_request_id=eq.${requestId}`)
      .on('INSERT', (payload) => {
        console.log('New service update:', payload);
        callback({
          type: 'UPDATE_ADDED',
          data: payload.new,
          timestamp: new Date().toISOString()
        });
      })
      .subscribe((status) => {
        console.log(`Updates subscription status for request ${requestId}:`, status);
      });

    subscriptions.set(key, subscription);
    return subscription;
  } catch (error) {
    console.error(`Failed to subscribe to updates for request ${requestId}:`, error);
    throw error;
  }
};

// Subscribe to customer's service requests
export const subscribeToCustomerRequests = (customerId, callback) => {
  try {
    const key = `customer:${customerId}`;

    if (subscriptions.has(key)) {
      console.log(`Already subscribed to customer ${customerId} requests`);
      return subscriptions.get(key);
    }

    const subscription = supabase
      .from(`service_requests:customer_id=eq.${customerId}`)
      .on('*', (payload) => {
        console.log('Customer request update:', payload);
        callback({
          type: payload.eventType,
          data: payload.new || payload.old,
          timestamp: new Date().toISOString()
        });
      })
      .subscribe((status) => {
        console.log(`Customer subscription status for ${customerId}:`, status);
      });

    subscriptions.set(key, subscription);
    return subscription;
  } catch (error) {
    console.error(`Failed to subscribe to customer ${customerId} requests:`, error);
    throw error;
  }
};

// Unsubscribe from specific subscription
export const unsubscribeFromServiceRequest = async (requestId) => {
  try {
    const subscription = subscriptions.get(requestId);
    if (subscription) {
      await supabase.removeSubscription(subscription);
      subscriptions.delete(requestId);
      console.log(`Unsubscribed from request ${requestId}`);
    }
  } catch (error) {
    console.error(`Failed to unsubscribe from request ${requestId}:`, error);
    throw error;
  }
};

export const unsubscribeFromServiceUpdates = async (requestId) => {
  try {
    const key = `updates:${requestId}`;
    const subscription = subscriptions.get(key);
    if (subscription) {
      await supabase.removeSubscription(subscription);
      subscriptions.delete(key);
      console.log(`Unsubscribed from updates for request ${requestId}`);
    }
  } catch (error) {
    console.error(`Failed to unsubscribe from updates for request ${requestId}:`, error);
    throw error;
  }
};

export const unsubscribeFromCustomerRequests = async (customerId) => {
  try {
    const key = `customer:${customerId}`;
    const subscription = subscriptions.get(key);
    if (subscription) {
      await supabase.removeSubscription(subscription);
      subscriptions.delete(key);
      console.log(`Unsubscribed from customer ${customerId} requests`);
    }
  } catch (error) {
    console.error(`Failed to unsubscribe from customer ${customerId}:`, error);
    throw error;
  }
};

// Unsubscribe all
export const unsubscribeAll = async () => {
  try {
    for (const [key, subscription] of subscriptions) {
      await supabase.removeSubscription(subscription);
    }
    subscriptions.clear();
    console.log('All subscriptions removed');
  } catch (error) {
    console.error('Failed to unsubscribe all:', error);
    throw error;
  }
};

// Broadcast event to WebSocket clients (for multi-user scenarios)
export const broadcastUpdate = (channel, event) => {
  try {
    supabase
      .channel(channel)
      .send({
        type: 'broadcast',
        event: 'update',
        payload: {
          ...event,
          timestamp: new Date().toISOString()
        }
      });
  } catch (error) {
    console.error(`Failed to broadcast to channel ${channel}:`, error);
    throw error;
  }
};

// Listen to broadcast messages
export const listenToBroadcast = (channel, callback) => {
  try {
    const subscription = supabase
      .channel(channel)
      .on('broadcast', { event: 'update' }, (payload) => {
        console.log('Broadcast received:', payload);
        callback(payload.payload);
      })
      .subscribe();

    subscriptions.set(`broadcast:${channel}`, subscription);
    return subscription;
  } catch (error) {
    console.error(`Failed to listen to broadcast on ${channel}:`, error);
    throw error;
  }
};

// Get subscription count
export const getSubscriptionCount = () => {
  return subscriptions.size;
};

// Get all active subscriptions
export const getActiveSubscriptions = () => {
  return Array.from(subscriptions.keys());
};

export default {
  subscribeToServiceRequest,
  subscribeToServiceUpdates,
  subscribeToCustomerRequests,
  unsubscribeFromServiceRequest,
  unsubscribeFromServiceUpdates,
  unsubscribeFromCustomerRequests,
  unsubscribeAll,
  broadcastUpdate,
  listenToBroadcast,
  getSubscriptionCount,
  getActiveSubscriptions
};
