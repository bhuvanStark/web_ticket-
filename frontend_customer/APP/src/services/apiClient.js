/**
 * API Client Service
 * Communicates with TaskTel Customer Backend
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

class APIClient {
  async request(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;

    try {
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        },
        ...options
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `API error: ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error(`API request failed: ${endpoint}`, error);
      throw error;
    }
  }

  // Service Requests
  async getServiceRequests(customerId = null) {
    const params = customerId ? `?customerId=${customerId}` : '';
    return this.request(`/service-requests${params}`);
  }

  async getServiceRequest(id) {
    return this.request(`/service-requests/${id}`);
  }

  async createServiceRequest(data) {
    return this.request('/service-requests', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async updateServiceRequestStatus(id, status, notes = null) {
    return this.request(`/service-requests/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, notes })
    });
  }

  async completeServiceRequest(id, signature, rating, feedback) {
    return this.request(`/service-requests/${id}/complete`, {
      method: 'PATCH',
      body: JSON.stringify({
        customer_signature: signature,
        rating,
        feedback_notes: feedback
      })
    });
  }

  async addServiceUpdate(id, notes, authorName = 'Customer') {
    return this.request(`/service-requests/${id}/updates`, {
      method: 'POST',
      body: JSON.stringify({
        author_name: authorName,
        notes
      })
    });
  }

  // Rooms
  async getRooms() {
    return this.request('/rooms');
  }

  async getRoomsByLocation(locationId) {
    return this.request(`/rooms/location/${locationId}`);
  }

  async getRoom(id) {
    return this.request(`/rooms/${id}`);
  }

  async getRoomByQRCode(qrCode) {
    return this.request(`/rooms/qr/${qrCode}`);
  }

  // Customers
  async getCustomers() {
    return this.request('/customers');
  }

  async getCustomer(id) {
    return this.request(`/customers/${id}`);
  }

  async createCustomer(data) {
    return this.request('/customers', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async updateCustomer(id, data) {
    return this.request(`/customers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  }

  // Locations
  async getLocations() {
    return this.request('/locations');
  }

  async getLocation(id) {
    return this.request(`/locations/${id}`);
  }

  async createLocation(data) {
    return this.request('/locations', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async updateLocation(id, data) {
    return this.request(`/locations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  }

  // Health check
  async healthCheck() {
    try {
      const response = await fetch(`${API_BASE_URL.replace('/api', '')}/health`);
      return await response.json();
    } catch (error) {
      return { status: 'offline', error: error.message };
    }
  }
}

export const apiClient = new APIClient();
export default apiClient;
