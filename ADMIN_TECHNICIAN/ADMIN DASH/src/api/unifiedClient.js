// Unified API Client for Admin Dashboard - Connects to backend on port 5000
// Vite exposes env vars on import.meta.env, not process.env — referencing
// process here throws "process is not defined" in the browser.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

class AdminAPIClient {
  constructor(baseURL = API_BASE_URL) {
    this.baseURL = baseURL;
    this.accessToken = null;
    this.refreshToken = null;
    this.userRole = 'admin';
  }

  // Initialize from localStorage
  init() {
    this.accessToken = localStorage.getItem('admin_access_token') || localStorage.getItem('tasktel_access_token');
    this.refreshToken = localStorage.getItem('admin_refresh_token') || localStorage.getItem('tasktel_refresh_token');
  }

  // Set tokens
  setTokens(accessToken, refreshToken) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    if (accessToken) {
      localStorage.setItem('admin_access_token', accessToken);
      localStorage.setItem('tasktel_access_token', accessToken);
    }
    if (refreshToken) {
      localStorage.setItem('admin_refresh_token', refreshToken);
      localStorage.setItem('tasktel_refresh_token', refreshToken);
    }
  }

  // Clear tokens
  clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
    localStorage.removeItem('admin_access_token');
    localStorage.removeItem('admin_refresh_token');
    localStorage.removeItem('tasktel_access_token');
    localStorage.removeItem('tasktel_refresh_token');
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
        localStorage.setItem('admin_access_token', this.accessToken);
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

    // Auto-refresh on 401, but never for the credential-check endpoints — a 401
    // there is a real credential failure, not an expired session, and retrying
    // would replace the real error with "Token refresh failed". /auth/session and
    // /auth/me are NOT excluded: a 401 from them should trigger one refresh.
    const isAuthEntryPoint = /^\/auth\/(login|register|refresh|logout)\b|^\/auth\/(admin|technician)\/login\b|^\/password-reset\//.test(endpoint);

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

  // ============================================
  // COMPANIES (derived from customer records)
  // ============================================

  async getCompanies() {
    return this.fetch('/admin/companies');
  }

  // ============================================
  // DASHBOARD CONFIGURATION & "VIEW AS" CHECKS
  // ============================================

  // Confirm the admin knows a technician's password before switching into that
  // technician's view. Resolves on success, throws APIError(401) on a bad password.
  async verifyTechnicianPassword(technicianId, password) {
    return this.fetch('/admin/verify-technician-password', {
      method: 'POST',
      body: JSON.stringify({ technicianId, password })
    });
  }

  async deleteTechnician(technicianId) {
    return this.fetch(`/technicians/${technicianId}`, { method: 'DELETE' });
  }

  async deleteCustomer(customerId) {
    return this.fetch(`/customers/${customerId}`, { method: 'DELETE' });
  }

  async getAppSettings() {
    return this.fetch('/admin/settings');
  }

  async updateAppSettings({ enabled_modules, role_permissions } = {}) {
    return this.fetch('/admin/settings', {
      method: 'PUT',
      body: JSON.stringify({ enabled_modules, role_permissions })
    });
  }

  // ============================================
  // CSV EXPORT
  // ============================================

  // Downloads a CSV through an authenticated request, then hands the browser a
  // blob — a plain link cannot carry the Authorization header.
  async downloadCsv(kind) {
    const response = await fetch(`${this.baseURL}/admin/export/${kind}`, {
      headers: this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}
    });

    if (!response.ok) {
      let message = `Export failed (${response.status})`;
      try {
        const body = await response.json();
        message = body.error || body.message || message;
      } catch {
        // Response was not JSON; keep the status-based message.
      }
      throw new Error(message);
    }

    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const match = /filename="?([^"]+)"?/.exec(disposition);
    const filename = match?.[1] || `${kind}-${new Date().toISOString().slice(0, 10)}.csv`;

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    return { filename };
  }

  // ============================================
  // PASSWORD RESET (admin — direct link, no approval)
  // ============================================

  async requestAdminPasswordReset(email) {
    return this.fetch('/password-reset/admin/request', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
  }

  async requestTechnicianPasswordReset(email) {
    return this.fetch('/password-reset/technician/request', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
  }

  // OTP sign-in (Forgot Password). Emails a 4-digit code; verify signs in.
  async requestOtp(role, email) {
    return this.fetch(`/password-reset/${role}/request-otp`, {
      method: 'POST',
      body: JSON.stringify({ email })
    });
  }

  async verifyOtp(role, email, otp) {
    const response = await this.fetch(`/password-reset/${role}/verify-otp`, {
      method: 'POST',
      body: JSON.stringify({ email, otp })
    });

    if (response.data?.accessToken && response.data?.refreshToken) {
      this.userRole = role;
      this.setTokens(response.data.accessToken, response.data.refreshToken);
    }

    return response;
  }

  // Customer reset requests awaiting an admin decision.
  async getPendingPasswordResets() {
    return this.fetch('/password-reset/admin/pending');
  }

  async approvePasswordReset(id) {
    return this.fetch(`/password-reset/admin/pending/${id}/approve`, { method: 'POST' });
  }

  async rejectPasswordReset(id) {
    return this.fetch(`/password-reset/admin/pending/${id}/reject`, { method: 'POST' });
  }

  async verifyPasswordResetToken(token) {
    return this.fetch(`/password-reset/verify/${token}`);
  }

  async confirmPasswordReset(token, password) {
    return this.fetch(`/password-reset/confirm/${token}`, {
      method: 'POST',
      body: JSON.stringify({ password })
    });
  }

  async technicianLogin(email, password) {
    const response = await this.fetch('/auth/technician/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    if (response.success && response.data) {
      this.userRole = 'technician';
      this.setTokens(response.data.accessToken, response.data.refreshToken);
    }

    return response;
  }

  async adminLogin(email, password) {
    const response = await this.fetch('/auth/admin/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    if (response.data?.accessToken && response.data?.refreshToken) {
      this.setTokens(response.data.accessToken, response.data.refreshToken);
    }

    return response;
  }

  async adminRegister(email, password, full_name, department) {
    const response = await this.fetch('/auth/admin/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, full_name, department })
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

  // Validate a stored token on startup — works for admin and technician roles
  // (unlike /auth/me, which assumes the customers table).
  async getSession() {
    return this.fetch('/auth/session');
  }

  // ============================================
  // ADMIN DASHBOARD
  // ============================================

  async getDashboardOverview() {
    return this.fetch('/admin/dashboard/overview');
  }

  async getAdminDashboard() {
    return this.fetch('/admin/dashboard/overview');
  }

  // ============================================
  // SERVICE REQUESTS (Admin View)
  // ============================================

  async getAllServiceRequests(limit = 10, offset = 0, status = null) {
    let endpoint = `/admin/service-requests?limit=${limit}&offset=${offset}`;
    if (status) {
      endpoint += `&status=${status}`;
    }
    return this.fetch(endpoint);
  }

  async getServiceRequestStats() {
    return this.fetch('/admin/service-requests/stats');
  }

  async getServiceRequest(id) {
    return this.fetch(`/service-requests/${id}`);
  }

  async updateServiceRequestStatus(id, status) {
    return this.fetch(`/admin/service-requests/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
  }

  async assignTechnician(requestId, technicianId) {
    return this.fetch(`/admin/service-requests/${requestId}/assign`, {
      method: 'PATCH',
      body: JSON.stringify({ technician_id: technicianId })
    });
  }

  // ============================================
  // CUSTOMERS (Admin View)
  // ============================================

  async getAllCustomers() {
    return this.fetch('/customers');
  }

  async getCustomer(id) {
    return this.fetch(`/customers/${id}`);
  }

  async getCustomerStats(id) {
    return this.fetch(`/customers/${id}/stats`);
  }

  // ============================================
  // TECHNICIANS (Admin View)
  // ============================================

  async getAllTechnicians() {
    return this.fetch('/admin/technicians');
  }

  async getTechnician(id) {
    return this.fetch(`/admin/technicians/${id}`);
  }

  async getTechnicianStats(id) {
    return this.fetch(`/admin/technicians/${id}/stats`);
  }

  // ============================================
  // LOCATIONS
  // ============================================

  async getLocations() {
    return this.fetch('/locations');
  }

  async getLocation(id) {
    return this.fetch(`/locations/${id}`);
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

const adminClient = new AdminAPIClient();
adminClient.init();

export default adminClient;
export { AdminAPIClient, APIError };
