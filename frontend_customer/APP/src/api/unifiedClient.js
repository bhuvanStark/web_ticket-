// Unified API Client for TaskTel - Connects to single backend on port 5000
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

class UnifiedAPIClient {
  constructor(baseURL = API_BASE_URL) {
    this.baseURL = baseURL;
    this.accessToken = null;
    this.refreshToken = null;
    this.userRole = null;
  }

  // Initialize from localStorage
  init() {
    this.accessToken = localStorage.getItem('tasktel_access_token');
    this.refreshToken = localStorage.getItem('tasktel_refresh_token');
    this.userRole = localStorage.getItem('tasktel_user_role');
  }

  // Set tokens and role
  setTokens(accessToken, refreshToken, role = 'customer') {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    this.userRole = role;
    if (accessToken) {
      localStorage.setItem('tasktel_access_token', accessToken);
    }
    if (refreshToken) {
      localStorage.setItem('tasktel_refresh_token', refreshToken);
    }
    if (role) {
      localStorage.setItem('tasktel_user_role', role);
    }
  }

  // Clear tokens
  clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
    this.userRole = null;
    localStorage.removeItem('tasktel_access_token');
    localStorage.removeItem('tasktel_refresh_token');
    localStorage.removeItem('tasktel_user_role');
  }

  // Get headers
  getHeaders(contentType = 'application/json') {
    const headers = { 'Content-Type': contentType };
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }
    return headers;
  }

  // Refresh token
  async refreshAccessToken() {
    try {
      if (!this.refreshToken) throw new Error('No refresh token');

      const response = await fetch(`${this.baseURL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this.refreshToken })
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
      this.clearTokens();
      throw error;
    }
  }

  // Generic fetch
  async fetch(endpoint, options = {}) {
    let url = `${this.baseURL}${endpoint}`;
    let headers = this.getHeaders(options.headers?.['Content-Type'] || 'application/json');

    if (options.headers) {
      headers = { ...headers, ...options.headers };
    }

    let response = await fetch(url, { ...options, headers });

    // Auto-refresh on 401, but never for login/register/refresh themselves —
    // a 401 there is a real credential failure, not an expired session.
    const isAuthEntryPoint = /^\/auth\/(login|register|refresh)|^\/team-members\/activate\/|^\/password-reset\//.test(endpoint);

    if (response.status === 401 && !isAuthEntryPoint) {
      try {
        await this.refreshAccessToken();
        headers = this.getHeaders(options.headers?.['Content-Type'] || 'application/json');
        response = await fetch(url, { ...options, headers });
      } catch (error) {
        throw error;
      }
    }

    const data = await response.json();

    if (!response.ok) {
      throw new APIError(data.error || data.message || 'API error', response.status, data);
    }

    return data;
  }

  // ============================================
  // AUTHENTICATION
  // ============================================

  async register(email, password, name, company_name, phone, address, city) {
    const response = await this.fetch('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name, company_name, phone, address, city })
    });

    if (response.data?.accessToken && response.data?.refreshToken) {
      this.setTokens(response.data.accessToken, response.data.refreshToken, 'customer');
    }

    return response;
  }

  async login(email, password) {
    const response = await this.fetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    if (response.data?.accessToken && response.data?.refreshToken) {
      this.setTokens(response.data.accessToken, response.data.refreshToken, 'customer');
    }

    return response;
  }

  async adminLogin(email, password) {
    const response = await this.fetch('/auth/admin/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    if (response.data?.accessToken && response.data?.refreshToken) {
      this.setTokens(response.data.accessToken, response.data.refreshToken, 'admin');
    }

    return response;
  }

  async technicianLogin(email, password) {
    const response = await this.fetch('/auth/technician/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    if (response.data?.accessToken && response.data?.refreshToken) {
      this.setTokens(response.data.accessToken, response.data.refreshToken, 'technician');
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
  // SIGN-IN BY EMAILED OTP (customer portal has no password)
  // ============================================

  // Step 1: ask the backend to email a 4-digit sign-in code. Rejects with a
  // real error if the email is not on any account.
  async requestLoginOtp(email) {
    return this.fetch('/password-reset/request', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
  }

  // Step 2: verify the code. On success the user is signed in (tokens returned
  // and stored).
  async verifyLoginOtp(email, otp) {
    const response = await this.fetch('/password-reset/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ email, otp })
    });

    if (response.data?.accessToken && response.data?.refreshToken) {
      this.setTokens(response.data.accessToken, response.data.refreshToken, 'customer');
    }

    return response;
  }

  // ============================================
  // PASSWORD RESET (emailed link — not used by the customer login screen)
  // ============================================

  async verifyPasswordResetToken(token) {
    return this.fetch(`/password-reset/verify/${token}`);
  }

  async confirmPasswordReset(token, password) {
    return this.fetch(`/password-reset/confirm/${token}`, {
      method: 'POST',
      body: JSON.stringify({ password })
    });
  }

  // ============================================
  // TEAM MEMBERS
  // ============================================

  // Sends a request to TaskTel to add an authorized user. Nothing is written to
  // the database — TaskTel creates the account manually.
  async requestTeamMember(data) {
    return this.fetch('/team-members/invite', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  // ============================================
  // SERVICE REQUESTS
  // ============================================

  async getServiceRequests(limit = 10, offset = 0) {
    return this.fetch(`/service-requests?limit=${limit}&offset=${offset}`);
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

  async updateServiceRequestStatus(id, status) {
    return this.fetch(`/service-requests/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
  }

  // Customer signs off the field service report. We send only the typed signer
  // name — the drawn signature image is never persisted.
  async completeServiceRequest(id, { customerSignerName, rating = null, feedbackNotes = null } = {}) {
    return this.fetch(`/service-requests/${id}/complete`, {
      method: 'PATCH',
      body: JSON.stringify({
        customer_signer_name: customerSignerName || null,
        rating,
        feedback_notes: feedbackNotes
      })
    });
  }

  async getServiceReport(id) {
    return this.fetch(`/service-requests/${id}/report`);
  }

  // ============================================
  // LOCATIONS
  // ============================================

  async getLocations() {
    return this.fetch('/locations');
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

  // ============================================
  // ROOMS
  // ============================================

  async getRooms() {
    return this.fetch('/rooms');
  }

  async getRoomsByLocation(locationId) {
    return this.fetch(`/rooms?location_id=${locationId}`);
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

  // ============================================
  // CUSTOMERS
  // ============================================

  async getCustomers() {
    return this.fetch('/customers');
  }

  async getCustomer(id) {
    return this.fetch(`/customers/${id}`);
  }

  // ============================================
  // ADMIN ENDPOINTS
  // ============================================

  async getAdminDashboard() {
    return this.fetch('/admin/dashboard/overview');
  }

  async getAllServiceRequests(limit = 10, offset = 0) {
    return this.fetch(`/admin/service-requests?limit=${limit}&offset=${offset}`);
  }

  async assignTechnician(requestId, technicianId) {
    return this.fetch(`/admin/service-requests/${requestId}/assign`, {
      method: 'PATCH',
      body: JSON.stringify({ technician_id: technicianId })
    });
  }

  async getTechnicians() {
    return this.fetch('/admin/technicians');
  }

  // ============================================
  // TECHNICIAN ENDPOINTS
  // ============================================

  async getTechnicianDashboard() {
    return this.fetch('/technician/dashboard');
  }

  async getAssignedRequests() {
    return this.fetch('/technician/assigned-requests');
  }

  async updateRequestStatus(id, status) {
    return this.fetch(`/technician/requests/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
  }

  // ============================================
  // HEALTH
  // ============================================

  async getHealth() {
    return this.fetch('/health');
  }
}

class APIError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

const unifiedClient = new UnifiedAPIClient();
unifiedClient.init();

export default unifiedClient;
export { UnifiedAPIClient, APIError };
