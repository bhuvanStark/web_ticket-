import { useState, useCallback, useEffect } from 'react';
import apiClient from '../api/client';

export const useServiceRequests = (customerId = null) => {
  const [requests, setRequests] = useState([]);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  const [pagination, setPagination] = useState({ total: 0, limit: 10, offset: 0 });

  // Fetch requests
  const fetchRequests = useCallback(async (filters = {}) => {
    try {
      setLoading(true);
      setError(null);

      const { status = null, limit = 10, offset = 0 } = filters;

      let response;
      if (customerId && status) {
        response = await apiClient.getCustomerRequests(customerId, status, limit, offset);
      } else if (customerId) {
        response = await apiClient.getCustomerRequests(customerId, null, limit, offset);
      } else {
        response = await apiClient.getServiceRequests(customerId);
      }

      if (response.data) {
        setRequests(Array.isArray(response.data) ? response.data : []);
        if (response.pagination) {
          setPagination(response.pagination);
        }
      }

      return response.data;
    } catch (err) {
      setError(err.message || 'Failed to fetch requests');
      return [];
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  // Fetch single request
  const fetchRequest = useCallback(async (id) => {
    try {
      setError(null);
      const response = await apiClient.getServiceRequest(id);

      if (response.data) {
        setSelectedRequest(response.data);
        // Update in list if exists
        setRequests(prev =>
          prev.map(r => r.id === id ? response.data : r)
        );
      }

      return response.data;
    } catch (err) {
      setError(err.message || 'Failed to fetch request');
      return null;
    }
  }, []);

  // Create request
  const createRequest = useCallback(async (data) => {
    try {
      setError(null);
      const response = await apiClient.createServiceRequest(data);

      if (response.data) {
        setRequests(prev => [response.data, ...prev]);
        setSelectedRequest(response.data);
      }

      return response.data;
    } catch (err) {
      setError(err.message || 'Failed to create request');
      throw err;
    }
  }, []);

  // Update status
  const updateStatus = useCallback(async (id, status, notes = null) => {
    try {
      setError(null);
      const response = await apiClient.updateServiceRequestStatus(id, status, notes);

      if (response.data) {
        setRequests(prev =>
          prev.map(r => r.id === id ? response.data : r)
        );
        if (selectedRequest?.id === id) {
          setSelectedRequest(response.data);
        }
      }

      return response.data;
    } catch (err) {
      setError(err.message || 'Failed to update status');
      throw err;
    }
  }, [selectedRequest]);

  // Complete request
  const completeRequest = useCallback(async (id, signature, rating, feedback) => {
    try {
      setError(null);
      const response = await apiClient.completeServiceRequest(id, signature, rating, feedback);

      if (response.data) {
        setRequests(prev =>
          prev.map(r => r.id === id ? response.data : r)
        );
        if (selectedRequest?.id === id) {
          setSelectedRequest(response.data);
        }
      }

      return response.data;
    } catch (err) {
      setError(err.message || 'Failed to complete request');
      throw err;
    }
  }, [selectedRequest]);

  // Add update
  const addUpdate = useCallback(async (requestId, author, notes) => {
    try {
      setError(null);
      await apiClient.addServiceUpdate(requestId, author, notes);

      // Refetch request to get updated timeline
      return await fetchRequest(requestId);
    } catch (err) {
      setError(err.message || 'Failed to add update');
      throw err;
    }
  }, [fetchRequest]);

  // Delete request
  const deleteRequest = useCallback(async (id) => {
    try {
      setError(null);
      await apiClient.deleteServiceRequest(id);

      setRequests(prev => prev.filter(r => r.id !== id));
      if (selectedRequest?.id === id) {
        setSelectedRequest(null);
      }

      return true;
    } catch (err) {
      setError(err.message || 'Failed to delete request');
      throw err;
    }
  }, [selectedRequest]);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      setError(null);
      const response = await apiClient.getServiceRequestStats(customerId);

      if (response.data) {
        setStats(response.data);
      }

      return response.data;
    } catch (err) {
      setError(err.message || 'Failed to fetch stats');
      return null;
    }
  }, [customerId]);

  // Search requests
  const searchRequests = useCallback(async (query, limit = 10) => {
    try {
      setError(null);
      const response = await apiClient.searchServiceRequests(query, limit);

      return response.data || [];
    } catch (err) {
      setError(err.message || 'Failed to search requests');
      return [];
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchRequests();
    fetchStats();
  }, [customerId, fetchRequests, fetchStats]);

  return {
    requests,
    selectedRequest,
    setSelectedRequest,
    loading,
    error,
    stats,
    pagination,
    fetchRequests,
    fetchRequest,
    createRequest,
    updateStatus,
    completeRequest,
    addUpdate,
    deleteRequest,
    fetchStats,
    searchRequests
  };
};
