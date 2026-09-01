import { useState, useCallback, useEffect } from 'react';
import apiClient from '../api/client';

export const useLocations = () => {
  const [locations, setLocations] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch locations
  const fetchLocations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await apiClient.getLocations();

      if (response.data) {
        setLocations(Array.isArray(response.data) ? response.data : []);
      }

      return response.data;
    } catch (err) {
      setError(err.message || 'Failed to fetch locations');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch single location
  const fetchLocation = useCallback(async (id) => {
    try {
      setError(null);
      const response = await apiClient.getLocation(id);

      if (response.data) {
        setSelectedLocation(response.data);
      }

      return response.data;
    } catch (err) {
      setError(err.message || 'Failed to fetch location');
      return null;
    }
  }, []);

  // Fetch all rooms
  const fetchRooms = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await apiClient.getRooms();

      if (response.data) {
        setRooms(Array.isArray(response.data) ? response.data : []);
      }

      return response.data;
    } catch (err) {
      setError(err.message || 'Failed to fetch rooms');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch rooms by location
  const fetchRoomsByLocation = useCallback(async (locationId) => {
    try {
      setError(null);
      const response = await apiClient.getRoomsByLocation(locationId);

      if (response.data) {
        return Array.isArray(response.data) ? response.data : [];
      }

      return [];
    } catch (err) {
      setError(err.message || 'Failed to fetch rooms');
      return [];
    }
  }, []);

  // Fetch single room
  const fetchRoom = useCallback(async (id) => {
    try {
      setError(null);
      const response = await apiClient.getRoom(id);

      if (response.data) {
        setSelectedRoom(response.data);
      }

      return response.data;
    } catch (err) {
      setError(err.message || 'Failed to fetch room');
      return null;
    }
  }, []);

  // Fetch room details
  const fetchRoomDetails = useCallback(async (id) => {
    try {
      setError(null);
      const response = await apiClient.getRoomDetails(id);

      if (response.data) {
        setSelectedRoom(response.data);
      }

      return response.data;
    } catch (err) {
      setError(err.message || 'Failed to fetch room details');
      return null;
    }
  }, []);

  // Fetch room by QR code
  const fetchRoomByQR = useCallback(async (qrCode) => {
    try {
      setError(null);
      const response = await apiClient.getRoomByQRCode(qrCode);

      if (response.data) {
        setSelectedRoom(response.data);
      }

      return response.data;
    } catch (err) {
      setError(err.message || 'Failed to fetch room by QR code');
      return null;
    }
  }, []);

  // Create location
  const createLocation = useCallback(async (data) => {
    try {
      setError(null);
      const response = await apiClient.createLocation(data);

      if (response.data) {
        setLocations(prev => [response.data, ...prev]);
      }

      return response.data;
    } catch (err) {
      setError(err.message || 'Failed to create location');
      throw err;
    }
  }, []);

  // Update location
  const updateLocation = useCallback(async (id, data) => {
    try {
      setError(null);
      const response = await apiClient.updateLocation(id, data);

      if (response.data) {
        setLocations(prev =>
          prev.map(l => l.id === id ? response.data : l)
        );
        if (selectedLocation?.id === id) {
          setSelectedLocation(response.data);
        }
      }

      return response.data;
    } catch (err) {
      setError(err.message || 'Failed to update location');
      throw err;
    }
  }, [selectedLocation]);

  // Delete location
  const deleteLocation = useCallback(async (id) => {
    try {
      setError(null);
      await apiClient.deleteLocation(id);

      setLocations(prev => prev.filter(l => l.id !== id));
      if (selectedLocation?.id === id) {
        setSelectedLocation(null);
      }

      return true;
    } catch (err) {
      setError(err.message || 'Failed to delete location');
      throw err;
    }
  }, [selectedLocation]);

  // Create room
  const createRoom = useCallback(async (data) => {
    try {
      setError(null);
      const response = await apiClient.createRoom(data);

      if (response.data) {
        setRooms(prev => [response.data, ...prev]);
      }

      return response.data;
    } catch (err) {
      setError(err.message || 'Failed to create room');
      throw err;
    }
  }, []);

  // Update room
  const updateRoom = useCallback(async (id, data) => {
    try {
      setError(null);
      const response = await apiClient.updateRoom(id, data);

      if (response.data) {
        setRooms(prev =>
          prev.map(r => r.id === id ? response.data : r)
        );
        if (selectedRoom?.id === id) {
          setSelectedRoom(response.data);
        }
      }

      return response.data;
    } catch (err) {
      setError(err.message || 'Failed to update room');
      throw err;
    }
  }, [selectedRoom]);

  // Delete room
  const deleteRoom = useCallback(async (id) => {
    try {
      setError(null);
      await apiClient.deleteRoom(id);

      setRooms(prev => prev.filter(r => r.id !== id));
      if (selectedRoom?.id === id) {
        setSelectedRoom(null);
      }

      return true;
    } catch (err) {
      setError(err.message || 'Failed to delete room');
      throw err;
    }
  }, [selectedRoom]);

  // Search locations
  const searchLocations = useCallback(async (query, limit = 10) => {
    try {
      setError(null);
      const response = await apiClient.searchLocations(query, limit);

      return response.data || [];
    } catch (err) {
      setError(err.message || 'Failed to search locations');
      return [];
    }
  }, []);

  // Search rooms
  const searchRooms = useCallback(async (query, locationId = null, limit = 10) => {
    try {
      setError(null);
      const response = await apiClient.searchRooms(query, locationId, limit);

      return response.data || [];
    } catch (err) {
      setError(err.message || 'Failed to search rooms');
      return [];
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchLocations();
    fetchRooms();
  }, [fetchLocations, fetchRooms]);

  return {
    locations,
    rooms,
    selectedLocation,
    selectedRoom,
    loading,
    error,
    setSelectedLocation,
    setSelectedRoom,
    fetchLocations,
    fetchLocation,
    fetchRooms,
    fetchRoomsByLocation,
    fetchRoom,
    fetchRoomDetails,
    fetchRoomByQR,
    createLocation,
    updateLocation,
    deleteLocation,
    createRoom,
    updateRoom,
    deleteRoom,
    searchLocations,
    searchRooms
  };
};
