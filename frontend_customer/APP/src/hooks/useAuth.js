import { useState, useCallback, useEffect } from 'react';
import apiClient from '../api/client';

export const useAuth = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Restore session on mount
  useEffect(() => {
    const restoreSession = async () => {
      try {
        setLoading(true);
        const tokens = apiClient.getTokens();

        if (!tokens.accessToken) {
          setIsAuthenticated(false);
          setUser(null);
          return;
        }

        apiClient.setTokens(tokens.accessToken, tokens.refreshToken);

        try {
          const response = await apiClient.getCurrentUser();
          setUser(response.data);
          setIsAuthenticated(true);
          setError(null);
        } catch (err) {
          setIsAuthenticated(false);
          setUser(null);
          apiClient.clearTokens();
        }
      } catch (err) {
        console.error('Session restore error:', err);
        setIsAuthenticated(false);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    restoreSession();
  }, []);

  const register = useCallback(async (email, password, name, company_name, phone, address, city) => {
    try {
      setLoading(true);
      setError(null);

      const response = await apiClient.register(email, password, name, company_name, phone, address, city);

      if (response.data?.customer) {
        setUser(response.data.customer);
        setIsAuthenticated(true);
      }

      return response;
    } catch (err) {
      setError(err.message || 'Registration failed');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (email, password) => {
    try {
      setLoading(true);
      setError(null);

      const response = await apiClient.login(email, password);

      if (response.data?.customer) {
        setUser(response.data.customer);
        setIsAuthenticated(true);
      }

      return response;
    } catch (err) {
      setError(err.message || 'Login failed');
      setIsAuthenticated(false);
      setUser(null);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      setLoading(true);
      await apiClient.logout();
      setUser(null);
      setIsAuthenticated(false);
      setError(null);
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const changePassword = useCallback(async (currentPassword, newPassword) => {
    try {
      setError(null);
      return await apiClient.changePassword(currentPassword, newPassword);
    } catch (err) {
      setError(err.message || 'Password change failed');
      throw err;
    }
  }, []);

  return {
    user,
    loading,
    error,
    isAuthenticated,
    register,
    login,
    logout,
    changePassword
  };
};
