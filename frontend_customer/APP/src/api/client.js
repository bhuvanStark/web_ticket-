// NOTE: this client is currently unused (superseded by ./unifiedClient.js). Kept
// in sync so it cannot crash the bundle if re-imported — `process` is undefined
// in a Vite browser build; the API URL comes from import.meta.env.VITE_*.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

class APIClient {
  constructor(baseURL = API_BASE_URL) {
    this.baseURL = baseURL;
    this.accessToken = null;
    this.refreshToken = null;
  }

  // Set authentication tokens
  setTokens(accessToken, refreshToken) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    if (accessToken) {
      localStorage.setItem('tasktel_access_token', accessToken);
    }
    if (refreshToken) {
      localStorage.setItem('tasktel_refresh_token', refreshToken);
    }
  }

  // Get stored tokens
  getTokens() {
    return {
      accessToken: this.accessToken || localStorage.getItem('tasktel_access_token'),
      refreshToken: this.refreshToken || localStorage.getItem('tasktel_refresh_token')
    };
  }

  // Clear tokens
  clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
    localStorage.removeItem('tasktel_access_token');
    localStorage.removeItem('tasktel_refresh_token');
  }

  // Prepare request headers
  getHeaders(contentType = 'application/json') {
    const headers = { 'Content-Type': contentType };
    const { accessToken } = this.getTokens();
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }
    return headers;
  }

  // Refresh access token
  async refreshAccessToken() {
    try {
      const { refreshToken } = this.getTokens();
      if (!refreshToken) throw new Error('No refresh token available');

      const response = await fetch(`${this.baseURL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      });

      if (!response.ok) throw new Error('Token refresh failed');

      const data = await response.json();
      if (data.success && data.data?.accessToken) {
        this.accessToken = data.data.accessToken;
        localStorage.setItem('tasktel_access_token', this.accessToken);
        return this.accessToken;
      }

      throw new Error('Invalid token response');
    } catch (error) {
      console.error('Token refresh error:', error);
      this.clearTokens();
      throw error;
    }
  }

  // Generic fetch with auto token refresh
  async fetch(endpoint, options = {}) {
    let url = `${this.baseURL}${endpoint}`;
    let headers = this.getHeaders(options.headers?.['Content-Type'] || 'application/json');

    if (options.headers) {
      headers = { ...headers, ...options.headers };
    }

    let response = await fetch(url, {
      ...options,
      headers
    });

    // If 401, try refreshing token and retry once
    if (response.status === 401) {
      try {
        await this.refreshAccessToken();
        headers = this.getHeaders(options.headers?.['Content-Type'] || 'application/json');
        response = await fetch(url, {
          ...options,
          headers
        });
      } catch (error) {
        this.clearTokens();
        throw error;
      }
    }

    const data = await response.json();

    if (!response.ok) {
      throw new APIError(data.message || 'API error', response.status, data);
    }

    return data;
  }

  // ============================================
  // AUTHENTICATION ENDPOINTS
  // ============================================

  async register(email, password, name, company_name, phone, address, city) {
    const response = await this.fetch('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        name,
        company_name,
        phone,
        address,
        city
      })
    });

    if (response.data?.accessToken && response.data?.refreshToken) {
      this.setTokens(response.data.accessToken, response.data.refreshToken);
    }

    return response;
  }

  async login(email, password) {
    const response = await this.fetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    if (response.data?.accessToken && response.data?.refreshToken) {
      this.setTokens(response.data.accessToken, response.data.refreshToken);
    }

    return response;
  }

  async logout() {
    try {
      await this.fetch('/auth/logout', { method: 'POST' });
    } finally {
      this.clearTokens();
    }
  }

  async getCurrentUser() {
    return this.fetch('/auth/me');
  }

  async changePassword(currentPassword, newPassword) {
    return this.fetch('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword })
    });
  }

  // ============================================
  // SERVICE REQUESTS ENDPOINTS
  // ============================================

  async getServiceRequests(customerId = null) {
    const params = new URLSearchParams();
    if (customerId) params.append('customerId', customerId);
    return this.fetch(`/service-requests?${params}`);
  }

  async getServiceRequest(id) {
    return this.fetch(`/service-requests/${id}`);
  }

  async createServiceRequest(data) {
    return this.fetch('/service-requests', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async updateServiceRequestStatus(id, status, notes = null) {
    return this.fetch(`/service-requests/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, notes })
    });
  }

  async completeServiceRequest(id, customer_signature, rating, feedback_notes) {
    return this.fetch(`/service-requests/${id}/complete`, {
      method: 'PATCH',
      body: JSON.stringify({ customer_signature, rating, feedback_notes })
    });
  }

  async addServiceUpdate(requestId, author_name, notes) {
    return this.fetch(`/service-requests/${requestId}/updates`, {
      method: 'POST',
      body: JSON.stringify({ author_name, notes })
    });
  }

  async deleteServiceRequest(id) {
    return this.fetch(`/service-requests/${id}`, { method: 'DELETE' });
  }

  async getServiceRequestStats(customerId = null) {
    const params = new URLSearchParams();
    if (customerId) params.append('customerId', customerId);
    return this.fetch(`/service-requests/stats/overview?${params}`);
  }

  async getCustomerRequests(customerId, status = null, limit = 10, offset = 0) {
    const params = new URLSearchParams({ limit: limit.toString(), offset: offset.toString() });
    if (status) params.append('status', status);
    return this.fetch(`/service-requests/customer/${customerId}?${params}`);
  }

  async searchServiceRequests(query, limit = 10) {
    const params = new URLSearchParams({ q: query, limit: limit.toString() });
    return this.fetch(`/service-requests/search/query?${params}`);
  }

  // ============================================
  // CUSTOMERS ENDPOINTS
  // ============================================

  async getCustomers() {
    return this.fetch('/customers');
  }

  async getCustomer(id) {
    return this.fetch(`/customers/${id}`);
  }

  async createCustomer(data) {
    return this.fetch('/customers', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async updateCustomer(id, data) {
    return this.fetch(`/customers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  }

  async deleteCustomer(id) {
    return this.fetch(`/customers/${id}`, { method: 'DELETE' });
  }

  async getCustomerStats(id) {
    return this.fetch(`/customers/${id}/stats`);
  }

  async getCustomerProfile(id) {
    return this.fetch(`/customers/${id}/profile`);
  }

  async searchCustomers(query, limit = 10) {
    const params = new URLSearchParams({ q: query, limit: limit.toString() });
    return this.fetch(`/customers/search/query?${params}`);
  }

  // ============================================
  // LOCATIONS ENDPOINTS
  // ============================================

  async getLocations() {
    return this.fetch('/locations');
  }

  async getLocation(id) {
    return this.fetch(`/locations/${id}`);
  }

  async createLocation(data) {
    return this.fetch('/locations', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async updateLocation(id, data) {
    return this.fetch(`/locations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  }

  async deleteLocation(id) {
    return this.fetch(`/locations/${id}`, { method: 'DELETE' });
  }

  async getLocationStats(id) {
    return this.fetch(`/locations/${id}/stats`);
  }

  async searchLocations(query, limit = 10) {
    const params = new URLSearchParams({ q: query, limit: limit.toString() });
    return this.fetch(`/locations/search/query?${params}`);
  }

  // ============================================
  // ROOMS ENDPOINTS
  // ============================================

  async getRooms() {
    return this.fetch('/rooms');
  }

  async getRoom(id) {
    return this.fetch(`/rooms/${id}`);
  }

  async getRoomsByLocation(locationId) {
    return this.fetch(`/rooms/location/${locationId}`);
  }

  async createRoom(data) {
    return this.fetch('/rooms', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async updateRoom(id, data) {
    return this.fetch(`/rooms/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  }

  async deleteRoom(id) {
    return this.fetch(`/rooms/${id}`, { method: 'DELETE' });
  }

  async getRoomDetails(id) {
    return this.fetch(`/rooms/${id}/details`);
  }

  async getRoomByQRCode(qrCode) {
    return this.fetch(`/rooms/qr/${qrCode}`);
  }

  async searchRooms(query, locationId = null, limit = 10) {
    const params = new URLSearchParams({ q: query, limit: limit.toString() });
    if (locationId) params.append('locationId', locationId);
    return this.fetch(`/rooms/search/query?${params}`);
  }

  // ============================================
  // HEALTH CHECK
  // ============================================

  async getHealth() {
    return this.fetch('/health');
  }
}

// Custom error class
class APIError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

// Create singleton instance
const apiClient = new APIClient();

export default apiClient;
export { APIClient, APIError };
