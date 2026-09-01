import { useState, useCallback } from 'react';
import apiClient from '../api/client';

export const useCustomer = (customerId = null) => {
  const [customer, setCustomer] = useState(null);
  const [stats, setStats] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch customer
  const fetchCustomer = useCallback(async (id = customerId) => {
    if (!id) {
      setError('Customer ID is required');
      return null;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await apiClient.getCustomer(id);

      if (response.data) {
        setCustomer(response.data);
      }

      return response.data;
    } catch (err) {
      setError(err.message || 'Failed to fetch customer');
      return null;
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  // Fetch customer stats
  const fetchStats = useCallback(async (id = customerId) => {
    if (!id) {
      setError('Customer ID is required');
      return null;
    }

    try {
      setError(null);
      const response = await apiClient.getCustomerStats(id);

      if (response.data) {
        setStats(response.data);
      }

      return response.data;
    } catch (err) {
      setError(err.message || 'Failed to fetch stats');
      return null;
    }
  }, [customerId]);

  // Fetch customer profile
  const fetchProfile = useCallback(async (id = customerId) => {
    if (!id) {
      setError('Customer ID is required');
      return null;
    }

    try {
      setError(null);
      const response = await apiClient.getCustomerProfile(id);

      if (response.data) {
        setProfile(response.data);
      }

      return response.data;
    } catch (err) {
      setError(err.message || 'Failed to fetch profile');
      return null;
    }
  }, [customerId]);

  // Update customer
  const updateCustomer = useCallback(async (data) => {
    if (!customerId) {
      setError('Customer ID is required');
      throw new Error('Customer ID is required');
    }

    try {
      setError(null);
      const response = await apiClient.updateCustomer(customerId, data);

      if (response.data) {
        setCustomer(response.data);
        setProfile(response.data);
      }

      return response.data;
    } catch (err) {
      setError(err.message || 'Failed to update customer');
      throw err;
    }
  }, [customerId]);

  // Create new customer
  const createCustomer = useCallback(async (data) => {
    try {
      setError(null);
      const response = await apiClient.createCustomer(data);

      if (response.data) {
        setCustomer(response.data);
      }

      return response.data;
    } catch (err) {
      setError(err.message || 'Failed to create customer');
      throw err;
    }
  }, []);

  // Delete customer
  const deleteCustomer = useCallback(async (id = customerId) => {
    if (!id) {
      setError('Customer ID is required');
      throw new Error('Customer ID is required');
    }

    try {
      setError(null);
      await apiClient.deleteCustomer(id);

      setCustomer(null);
      setStats(null);
      setProfile(null);

      return true;
    } catch (err) {
      setError(err.message || 'Failed to delete customer');
      throw err;
    }
  }, [customerId]);

  // Search customers
  const searchCustomers = useCallback(async (query, limit = 10) => {
    try {
      setError(null);
      const response = await apiClient.searchCustomers(query, limit);

      return response.data || [];
    } catch (err) {
      setError(err.message || 'Failed to search customers');
      return [];
    }
  }, []);

  return {
    customer,
    stats,
    profile,
    loading,
    error,
    fetchCustomer,
    fetchStats,
    fetchProfile,
    updateCustomer,
    createCustomer,
    deleteCustomer,
    searchCustomers
  };
};
