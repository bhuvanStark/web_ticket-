import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';

import unifiedClient from '../api/unifiedClient';

import {
  fetchAdminServiceRequests,
  fetchAdminCustomers,
  fetchAdminLocations,
  fetchAdminRooms,
  fetchAdminTechnicians,
  assignTechnicianInApi,
  updateTicketStatusInApi,
  createServiceRequestInApiAdmin,
  submitServiceReportInApi,
  deleteServiceRequestFromApi,
  subscribeToAdminServiceRequests
} from '../services/adminApiService';

// Reuse the same context object across Vite hot updates. Without this, a provider
// refresh can briefly leave already-mounted consumers attached to the old context.
const AppContext = globalThis.__TASKTEL_APP_CONTEXT__ || createContext(null);
if (import.meta.env.DEV) globalThis.__TASKTEL_APP_CONTEXT__ = AppContext;

export const AppProvider = ({ children }) => {
  useEffect(() => {
    // One-time cleanup of the retired mock-ticket cache. Live requests are always
    // loaded from the backend and are never restored from browser storage.
    localStorage.removeItem('tasktel_created_tickets');
  }, []);

  // Auth & Navigation State
  const [role, setRole] = useState(() => localStorage.getItem('admin_role') || 'admin');

  // The portal the user actually authenticated against. `role` is the view being
  // displayed and an admin may switch it; baseRole never changes after login, so
  // a technician cannot reach the admin view by flipping the switcher.
  const [baseRole, setBaseRole] = useState(() => localStorage.getItem('base_role') || 'admin');
  // A session counts as restored only when a real JWT is present. The flag alone
  // used to be enough, which left the UI "logged in" while every protected API
  // call returned 401.
  const hasStoredSession = () =>
    localStorage.getItem('admin_auth') === 'true' &&
    Boolean(localStorage.getItem('admin_access_token'));

  const [isLoggedIn, setIsLoggedIn] = useState(hasStoredSession);
  // While true, MainLayout shows a loader instead of the dashboard or the login
  // screen. A stored token is only trusted once /auth/me confirms it is still
  // valid — otherwise an expired token would flash the dashboard before the
  // first protected call 401s and bounces to login.
  const [isRestoringSession, setIsRestoringSession] = useState(hasStoredSession);
  const [activePage, _setActivePage] = useState(() => {
    const isAuth = hasStoredSession();
    if (!isAuth) return 'dashboard';
    const params = new URLSearchParams(window.location.search);
    return params.get('page') || 'dashboard';
  });

  // Validate any stored session against the backend on first mount.
  useEffect(() => {
    if (!hasStoredSession()) {
      setIsRestoringSession(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        await unifiedClient.getSession();
        if (!cancelled) setIsLoggedIn(true);
      } catch {
        if (cancelled) return;
        unifiedClient.clearTokens();
        localStorage.removeItem('admin_auth');
        localStorage.removeItem('admin_role');
        localStorage.removeItem('admin_user');
        localStorage.removeItem('base_role');
        setIsLoggedIn(false);
      } finally {
        if (!cancelled) setIsRestoringSession(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const setActivePage = (page) => {
    _setActivePage(page);
    if (isLoggedIn) {
      window.history.pushState({ page }, '', `${import.meta.env.BASE_URL}?page=${page}`);
    }
  };

  useEffect(() => {
    const handlePopState = (e) => {
      const isAuth = hasStoredSession();
      if (!isAuth) {
        setIsLoggedIn(false);
        return;
      }
      if (e.state && e.state.page) {
        _setActivePage(e.state.page);
      } else {
        const params = new URLSearchParams(window.location.search);
        _setActivePage(params.get('page') || 'dashboard');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem('admin_user');
    if (saved) return JSON.parse(saved);

    // Neutral placeholder — kept non-null because several components read
    // currentUser.* directly, but carries no fabricated name, email or photo.
    return { id: null, name: '', email: '', avatar: null, roleLabel: '', role: 'Super Admin' };
  });

  // Domain Data State
  const [tickets, setTickets] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [staff, setStaff] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [installations, setInstallations] = useState([]);
  const [isApiLoading, setIsApiLoading] = useState(true);

  // Modals & Panels State
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [selectedTechId, setSelectedTechId] = useState(null);
  const [isCreateTicketOpen, setIsCreateTicketOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isServiceFormOpen, setIsServiceFormOpen] = useState(false);

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  
  const [enabledModules, setEnabledModules] = useState({
    approvals: true,
    requests: true,
    customers: true,
    rooms: true,
    technicians: true,
    installations: true,
    inventory: true,
    demos: true,
    calendar: true,
    history: true,
    reports: true
  });

  const [rolePermissions, setRolePermissions] = useState({
    'Super Admin': {
      dashboard: true,
      requests: true,
      customers: true,
      rooms: true,
      technicians: true,
      installations: true,
      inventory: true,
      demos: true,
      calendar: true,
      history: true,
      reports: true,
      staff: true,
      settings: true
    },
    'Service Manager': {
      dashboard: true,
      requests: true,
      customers: true,
      rooms: true,
      technicians: true,
      installations: true,
      inventory: true,
      demos: true,
      calendar: true,
      history: true,
      reports: true,
      staff: false,
      settings: false
    },
    'Dispatcher': {
      dashboard: true,
      requests: true,
      customers: true,
      rooms: true,
      technicians: false,
      installations: false,
      inventory: false,
      demos: false,
      calendar: true,
      history: true,
      reports: false,
      staff: false,
      settings: false
    }
  });

  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [simulatedLoading, setSimulatedLoading] = useState(false);
  const [simulatedError, setSimulatedError] = useState(false);
  const [toast, setToast] = useState(null);

  // Handle URL Query Params for Direct Technician Links (e.g. ?role=tech&techId=TECH-101)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roleParam = params.get('role');
    const techIdParam = params.get('techId') || params.get('tech');

    if (roleParam === 'tech') {
      setRole('tech');
      setActivePage('my-jobs');

      if (techIdParam) {
        const foundTech = (technicians || []).find(t => t.id === techIdParam || t.name.toLowerCase().includes(techIdParam.toLowerCase()));
        if (foundTech) {
          setCurrentUser({
            name: foundTech.name,
            email: foundTech.email || `${foundTech.name.toLowerCase().replace(/\s+/g, '.')}@tasktel-av.com`,
            avatar: foundTech.avatar,
            roleLabel: foundTech.role || 'Field Service Engineer'
          });
        }
      } else {
        setCurrentUser({
          name: 'Ravi Kumar',
          email: 'ravi.kumar@tasktel-av.com',
          avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
          roleLabel: 'Senior AV Field Engineer'
        });
      }
    }
  }, [technicians]);

  // Load Data from Backend Database on Mount & Setup Realtime Sync
  useEffect(() => {
    const loadApiData = async () => {
      try {
        setIsApiLoading(true);
        const [dbTickets, dbCustomers, dbLocations, dbRooms, dbTechs] = await Promise.all([
          fetchAdminServiceRequests(),
          fetchAdminCustomers(),
          fetchAdminLocations(),
          fetchAdminRooms(),
          fetchAdminTechnicians()
        ]);
        setTickets(Array.isArray(dbTickets) ? dbTickets : []);
        setLocations(Array.isArray(dbLocations) ? dbLocations : []);

        if (dbCustomers && dbCustomers.length > 0) {
          const mappedDbCusts = dbCustomers.map(c => {
            const customerTickets = (dbTickets || []).filter(ticket => ticket.customerId === c.id);
            const customerLocationIds = new Set(customerTickets.map(ticket => ticket.locationId).filter(Boolean));
            const completedStatuses = new Set(['Resolved', 'Closed']);
            const latestTicket = [...customerTickets].sort((a, b) =>
              new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
            )[0];
            return {
              id: c.id,
              name: c.company_name || c.name,
              industry: c.industry || '',
              headquarters: c.city || c.address || '',
              contactPerson: c.contact_person || c.name || '',
              role: c.contact_role || '',
              email: c.email || '',
              phone: c.phone || '',
              locationsCount: customerLocationIds.size,
              totalRooms: new Set(customerTickets.map(ticket => ticket.roomId).filter(Boolean)).size,
              activeRequests: customerTickets.filter(ticket => !completedStatuses.has(ticket.status)).length,
              completedRequests: customerTickets.filter(ticket => completedStatuses.has(ticket.status)).length,
              lastServiceDate: latestTicket?.createdDate || '—',
              status: c.sla_tier || 'Active',
              avatar: c.avatar_url || null
            };
          });

          setCustomers(mappedDbCusts);
        } else {
          setCustomers([]);
        }

        if (dbRooms && dbRooms.length > 0) {
          const mappedDbRooms = dbRooms.map(r => {
            const roomTickets = (dbTickets || []).filter(ticket => ticket.roomId === r.id);
            const linkedTicket = roomTickets[0];
            return {
              id: r.id,
              name: r.name,
              roomType: r.room_type || '',
              locationId: r.location_id || null,
              locationName: r.locations?.name || '',
              customerId: linkedTicket?.customerId || r.customer_id || null,
              customerName: linkedTicket?.customer || r.customer_name || '',
              installedSystems: Array.isArray(r.installed_systems) ? r.installed_systems : [],
              openRequestsCount: roomTickets.filter(ticket => !['Resolved', 'Closed'].includes(ticket.status)).length,
              status: r.status || 'Operational',
              equipmentCount: Array.isArray(r.installed_systems) ? r.installed_systems.length : 0
            };
          });
          setRooms(mappedDbRooms);
        } else {
          setRooms([]);
        }

        if (dbTechs && dbTechs.length > 0) {
          const mappedDbTechs = dbTechs.map(t => ({
            id: t.id,
            name: t.full_name,
            role: 'Field Service Technician',
            specialization: t.specialization || '',
            email: t.email,
            phone: t.phone || '',
            rating: null,
            activeJobsCount: (dbTickets || []).filter(ticket =>
              ticket.assignedToId === t.id && !['Resolved', 'Closed'].includes(ticket.status)
            ).length,
            completedJobsCount: (dbTickets || []).filter(ticket =>
              ticket.assignedToId === t.id && ['Resolved', 'Closed'].includes(ticket.status)
            ).length,
            completionRate: '0%',
            avgResponseTime: '—',
            certifications: [],
            status: t.is_active ? 'Available' : 'Inactive',
            avatar: t.avatar_url || null,
            location: t.location || '—'
          }));

          setTechnicians(mappedDbTechs);
        } else {
          setTechnicians([]);
        }

      } catch (err) {
        console.warn('Admin Dashboard Backend load error:', err);
      } finally {
        setIsApiLoading(false);
      }
    };

    loadApiData();

    // Subscribe to Realtime Postgres Changes
    const subscription = subscribeToAdminServiceRequests(async () => {
      const refreshedTickets = await fetchAdminServiceRequests();
      if (refreshedTickets && refreshedTickets.length > 0) {
        setTickets(refreshedTickets);
      }
    });

    return () => {
      if (subscription) subscription.unsubscribe();
    };
  }, []);

  // Poll PostgreSQL for ticket updates
  useEffect(() => {
    const fetchLiveTickets = async () => {
      try {
        const dbTickets = await fetchAdminServiceRequests();
        setTickets(Array.isArray(dbTickets) ? dbTickets : []);
      } catch (err) {
        console.warn('Admin polling DB tickets error:', err);
      }
    };

    fetchLiveTickets();
    const interval = setInterval(fetchLiveTickets, 3000);
    return () => clearInterval(interval);
  }, []);

  // Load the shared dashboard configuration (module toggles + role permissions)
  // from the backend so the Settings page choices survive a refresh. Only admin
  // sessions can read this endpoint; a technician login skips it.
  useEffect(() => {
    if (localStorage.getItem('base_role') === 'tech') return;

    let cancelled = false;
    (async () => {
      try {
        const res = await unifiedClient.getAppSettings();
        if (cancelled) return;
        const em = res?.data?.enabled_modules;
        const rp = res?.data?.role_permissions;
        if (em && typeof em === 'object' && Object.keys(em).length) {
          setEnabledModules(prev => ({ ...prev, ...em }));
        }
        if (rp && typeof rp === 'object' && Object.keys(rp).length) {
          setRolePermissions(prev => ({ ...prev, ...rp }));
        }
      } catch (err) {
        console.warn('Could not load dashboard settings:', err);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // Persist the current module toggles (and role permissions) to the backend.
  // Called by the Settings page's "Save Configuration Settings" button.
  const saveAppSettings = async () => {
    const res = await unifiedClient.updateAppSettings({
      enabled_modules: enabledModules,
      role_permissions: rolePermissions
    });
    return res;
  };

  // Confirm an admin knows a technician's password before switching into that
  // technician's view. Throws on a wrong password so the caller can show it.
  const verifyTechnicianPassword = (technicianId, password) =>
    unifiedClient.verifyTechnicianPassword(technicianId, password);

  // Helper Toast function
  const showToast = (message, type = 'success') => {
    setToast({ message, type, id: Date.now() });
    setTimeout(() => setToast(null), 4000);
  };

  // Remove a customer. Locations, team members and preferences cascade away,
  // but the API refuses (409) while the customer still has service requests.
  const deleteCustomer = async (customerId) => {
    try {
      await unifiedClient.deleteCustomer(customerId);
      setCustomers((prev) => (prev || []).filter((c) => c.id !== customerId));
      setSelectedCustomerId((prev) => (prev === customerId ? null : prev));
      showToast('Customer deleted successfully.', 'success');
      return true;
    } catch (error) {
      showToast(error?.message || 'Could not delete customer.', 'error');
      return false;
    }
  };

  // Remove a technician. Their tickets are not deleted — the FK is
  // ON DELETE SET NULL, so those tickets return to the unassigned queue.
  const deleteTechnician = async (technicianId) => {
    try {
      await unifiedClient.deleteTechnician(technicianId);
      setTechnicians((prev) => (prev || []).filter((t) => t.id !== technicianId));
      setSelectedTechId((prev) => (prev === technicianId ? null : prev));
      showToast('Technician deleted successfully.', 'success');
      return true;
    } catch (error) {
      showToast(error?.message || 'Could not delete technician.', 'error');
      return false;
    }
  };

  // Individual Technician Login Handler
  const loginAsTechnician = (targetTech) => {
    let techObj = null;
    if (typeof targetTech === 'object' && targetTech !== null) {
      techObj = targetTech;
    } else if (typeof targetTech === 'string') {
      techObj = (technicians || []).find(t => t.id === targetTech || (t.name || '').toLowerCase().includes(targetTech.toLowerCase()));
    }

    if (!techObj) {
      showToast('Technician profile not found.', 'error');
      return;
    }

    // Clear cached data when switching technicians
    setTickets([]);
    setIsApiLoading(true);

    setRole('tech');
    setIsLoggedIn(true);
    const newUser = {
      id: techObj.id,
      name: techObj.full_name || techObj.name,
      email: techObj.email,
      avatar: techObj.avatar,
      roleLabel: 'Field Service Technician',
      role: 'tech'
    };
    setCurrentUser(newUser);

    localStorage.setItem('admin_auth', 'true');
    localStorage.setItem('admin_role', 'tech');
    localStorage.setItem('admin_user', JSON.stringify(newUser));
    _setActivePage('my-dashboard');
    window.history.pushState({ page: 'my-dashboard' }, '', `${import.meta.env.BASE_URL}?page=my-dashboard`);

    showToast(`Logged in as technician: ${newUser.name}`, 'success');
  };

  // Role switch handler
  const switchRole = (newRole, targetUser = null) => {
    // Someone who signed in through the technician portal must never reach the
    // admin view, regardless of what the UI offers.
    if (localStorage.getItem('base_role') === 'tech' && newRole === 'admin') {
      showToast('Technician accounts do not have admin access.', 'error');
      return;
    }

    // Already in this view: do nothing rather than re-running the switch.
    if (newRole === role && !targetUser) return;

    if (newRole === 'tech') {
      loginAsTechnician(targetUser || (technicians || [])[0]);
    } else {
      // Clear cached data when switching to admin
      setTickets([]);
      setIsApiLoading(true);

      setRole('admin');
      let newUser;

      if (targetUser && (targetUser.email || targetUser.name)) {
        // The signed-in admin, as returned by the backend. department is the
        // admins table's own label; role is only present for staff sub-roles.
        newUser = {
          id: targetUser.id,
          name: targetUser.name,
          email: targetUser.email,
          avatar: targetUser.avatar,
          roleLabel: targetUser.role || targetUser.department || 'Administrator',
          role: targetUser.role || 'Super Admin'
        };
      } else {
        // No account details available (e.g. a restored session predating this
        // field); keep the view usable without inventing an identity.
        newUser = {
          name: 'Administrator',
          email: '',
          avatar: null,
          roleLabel: 'Administrator',
          role: 'Super Admin'
        };
      }

      setCurrentUser(newUser);

      localStorage.setItem('admin_auth', 'true');
      localStorage.setItem('admin_role', 'admin');
      localStorage.setItem('admin_user', JSON.stringify(newUser));
      _setActivePage('dashboard');
      window.history.pushState({ page: 'dashboard' }, '', `${import.meta.env.BASE_URL}?page=dashboard`);

      showToast(`Switched view to ${newUser.roleLabel} Mode`, 'info');
    }
  };

  // Authenticates against the backend and stores the JWT the API client needs.
  // Throws on failure so the login screen can show the real reason.
  const handleLogin = async (userEmail, userPassword, roleType, targetUser = null) => {
    if (roleType === 'tech') {
      const response = await unifiedClient.technicianLogin(userEmail, userPassword);
      const technician = response.data?.technician;
      setBaseRole('tech');
      localStorage.setItem('base_role', 'tech');
      setIsLoggedIn(true);
      localStorage.setItem('admin_auth', 'true');
      loginAsTechnician({
        ...(targetUser || {}),
        id: technician?.id,
        name: technician?.full_name,
        email: technician?.email,
        phone: technician?.phone
      });
      return response;
    }

    const response = await unifiedClient.adminLogin(userEmail, userPassword);
    const admin = response.data?.admin;

    setBaseRole('admin');
    localStorage.setItem('base_role', 'admin');
    setIsLoggedIn(true);
    localStorage.setItem('admin_auth', 'true');
    switchRole('admin', {
      ...(targetUser || {}),
      id: admin?.id,
      name: admin?.full_name,
      email: admin?.email,
      department: admin?.department
    });

    return response;
  };

  // Sign in with a verified email OTP (Forgot Password). role is 'admin' | 'tech'.
  // Mirrors handleLogin's context setup once the code checks out.
  const handleOtpLogin = async (roleType, userEmail, otp) => {
    if (roleType === 'tech') {
      const response = await unifiedClient.verifyOtp('technician', userEmail, otp);
      const technician = response.data?.technician;
      setBaseRole('tech');
      localStorage.setItem('base_role', 'tech');
      setIsLoggedIn(true);
      localStorage.setItem('admin_auth', 'true');
      loginAsTechnician({
        id: technician?.id,
        name: technician?.full_name,
        email: technician?.email,
        phone: technician?.phone
      });
      return response;
    }

    const response = await unifiedClient.verifyOtp('admin', userEmail, otp);
    const admin = response.data?.admin;
    setBaseRole('admin');
    localStorage.setItem('base_role', 'admin');
    setIsLoggedIn(true);
    localStorage.setItem('admin_auth', 'true');
    switchRole('admin', {
      id: admin?.id,
      name: admin?.full_name,
      email: admin?.email,
      department: admin?.department
    });
    return response;
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    unifiedClient.clearTokens();
    localStorage.removeItem('admin_auth');
    localStorage.removeItem('admin_role');
    localStorage.removeItem('admin_user');
    localStorage.removeItem('base_role');
    window.history.pushState(null, '', import.meta.env.BASE_URL);
    showToast('Logged out successfully', 'info');
  };

  // Helper for hash-agnostic Ticket Matching
  const isSameTicket = (t, targetId) => {
    if (!t || !targetId) return false;
    const cleanTarget = targetId.toString().replace(/^#/, '').toLowerCase().trim();
    const cleanId = (t.id || '').toString().replace(/^#/, '').toLowerCase().trim();
    const cleanNum = (t.ticketNumber || '').toString().replace(/^#/, '').toLowerCase().trim();
    return cleanId === cleanTarget || cleanNum === cleanTarget;
  };

  // Keep UI state aligned with the backend result; no mock/local ticket persistence.
  const updateAndSyncTickets = (updaterFn) => {
    setTickets(updaterFn);
  };

  // Assign Technician to Ticket (Backend Sync). `mode` is 'onsite' | 'remote'
  // and is stored on the ticket's service_type.
  const assignTechnician = async (ticketId, techId, mode = 'onsite') => {
    const tech = technicians.find(t => t.id === techId || t.name === techId);
    const targetTicket = tickets.find(t => isSameTicket(t, ticketId));
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const assignedTimeFormatted = `${dateStr}, ${timeStr}`;
    const modeLabel = mode === 'remote' ? 'Remote' : 'On-site';

    if (!targetTicket?.dbId || !tech?.id) {
      showToast('A real request and technician are required for assignment.', 'error');
      return false;
    }
    try {
      await assignTechnicianInApi(targetTicket.dbId, tech.id, mode);
    } catch (err) {
      showToast(`Assignment failed: ${err.message}`, 'error');
      return false;
    }

    updateAndSyncTickets(prev => prev.map(t => {
      if (isSameTicket(t, ticketId)) {
        const updatedTimeline = [
          ...(t.timeline || []),
          {
            time: timeStr,
            title: `${tech?.name || 'Technician'} assigned (${modeLabel}).`,
            subtitle: `Assigned by Service Coordinator`
          }
        ];
        return {
          ...t,
          status: 'Assigned',
          assignedToId: tech?.id,
          assignedTo: tech.name,
          assignedToRole: tech.role || '',
          serviceMode: modeLabel,
          assignedTime: timeStr,
          assignedAt: assignedTimeFormatted,
          timeline: updatedTimeline
        };
      }
      return t;
    }));

    showToast(`Assigned ${ticketId} to ${tech?.name || 'Technician'} — ${modeLabel}`, 'success');
    return true;
  };

  // Assign Technician to specific Time Slot
  const assignTechnicianToSlot = async (ticketId, techId, timeSlot, date) => {
    const tech = technicians.find(t => t.id === techId || t.name === techId);
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const assigned = await assignTechnician(ticketId, techId);
    if (!assigned) return false;

    updateAndSyncTickets(prev => {
      return prev.map(t => {
        if (isSameTicket(t, ticketId)) {
          return {
            ...t,
            status: 'Assigned',
            assignedToId: tech?.id,
            assignedTo: tech?.name,
            assignedToRole: tech?.role,
            scheduledDate: date,
            scheduledTimeSlot: timeSlot,
            timeline: [...(t.timeline || []), { time: timeStr, title: `Scheduled to ${tech?.name} at ${timeSlot}` }]
          };
        }
        return t;
      });
    });
    
    showToast(`Assigned job to ${tech?.name} for ${timeSlot}`, 'success');
    return true;
  };

  // Update Ticket Status Workflow (Backend Sync)
  const updateTicketStatus = async (ticketId, newStatus, customSubtitle = '') => {
    const targetTicket = tickets.find(t => isSameTicket(t, ticketId));
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (!targetTicket?.dbId) {
      showToast('Cannot update a request that is not stored on the server.', 'error');
      return false;
    }
    try {
      await updateTicketStatusInApi(targetTicket.dbId, newStatus, customSubtitle);
    } catch (err) {
      showToast(`Status update failed: ${err.message}`, 'error');
      return false;
    }

    updateAndSyncTickets(prev => prev.map(t => {
      if (isSameTicket(t, ticketId)) {
        let statusTitle = `Status changed to ${newStatus}`;
        if (newStatus === 'Job Accepted') statusTitle = `Job accepted & scheduled by ${currentUser.name}.`;
        if (newStatus === 'Technician On The Way') statusTitle = `Technician started travel (${currentUser.name}).`;
        if (newStatus === 'Service In Progress') statusTitle = `Technician checked in & service started (${currentUser.name}).`;
        if (newStatus === 'Resolved') statusTitle = 'Service completed & issue resolved.';
        if (newStatus === 'Closed') statusTitle = 'Customer confirmed & ticket closed.';

        const updatedTimeline = [
          ...(t.timeline || []),
          {
            time: timeStr,
            title: statusTitle,
            subtitle: customSubtitle || `Updated by ${role === 'admin' ? 'Admin' : t.assignedTo || 'Technician'}`
          }
        ];

        return {
          ...t,
          status: newStatus,
          timeline: updatedTimeline
        };
      }
      return t;
    }));

    showToast(`Ticket ${ticketId} status updated to "${newStatus}"`, 'success');
    return true;
  };

  // Submit Technician Service Report — persists to the service_reports table
  // (tech-signed) and moves the ticket to awaiting customer signature.
  const submitServiceReport = async (ticketId, reportData) => {
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const targetTicket = tickets.find(t => isSameTicket(t, ticketId));

    if (!targetTicket?.dbId) {
      showToast('Cannot submit a report for a request that is not stored on the server.', 'error');
      return false;
    }

    let savedReport;
    try {
      savedReport = await submitServiceReportInApi(targetTicket.dbId, {
        system: reportData.system,
        natureOfComplaint: reportData.natureOfComplaint,
        workDone: reportData.workDone,
        partsMaterial: reportData.partsMaterial,
        techSignerName: reportData.techSignerName || currentUser?.name
      });
    } catch (err) {
      showToast(`Service report failed: ${err.message}`, 'error');
      return false;
    }

    updateAndSyncTickets(prev => prev.map(t => {
      if (isSameTicket(t, ticketId)) {
        return {
          ...t,
          status: 'Awaiting Customer Signature',
          serviceReport: {
            system: savedReport?.system || reportData.system || '',
            natureOfComplaint: savedReport?.nature_of_complaint || reportData.natureOfComplaint || '',
            workDone: savedReport?.work_done || reportData.workDone || '',
            partsMaterial: savedReport?.parts_material || reportData.partsMaterial || '',
            techSigned: true,
            techSignerName: savedReport?.tech_signer_name || currentUser?.name || '',
            customerSigned: false,
            customerSignerName: ''
          },
          timeline: [
            ...(t.timeline || []),
            {
              time: timeStr,
              title: 'Field service report submitted.',
              subtitle: 'Report sent to the customer app for signature.'
            }
          ]
        };
      }
      return t;
    }));

    showToast(`Service report for ${ticketId} sent to the customer for signature.`, 'success');
    return true;
  };

  // Mark Ticket as Pending Next Visit / Handover to Next Engineer
  const markTicketPendingHandover = async (ticketId, handoverData) => {
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const targetTicket = tickets.find(t => isSameTicket(t, ticketId));

    if (!targetTicket?.dbId) {
      showToast('Cannot update a request that is not stored on the server.', 'error');
      return false;
    }
    try {
      await updateTicketStatusInApi(targetTicket.dbId, 'Pending Next Visit', handoverData.reason || 'Work incomplete. Pending next visit.');
    } catch (err) {
      showToast(`Pending handover failed: ${err.message}`, 'error');
      return false;
    }

    const newHandoverLog = {
      id: `HND-${Date.now()}`,
      technicianId: currentUser.id || 'TECH-01',
      technicianName: currentUser.name || 'Ravi Kumar',
      technicianAvatar: currentUser.avatar,
      technicianRole: currentUser.roleLabel || 'AV Field Service Engineer',
      timestamp: `${dateStr}, ${timeStr}`,
      reason: handoverData.reason || 'Work Incomplete / Parts Awaited',
      workCompleted: handoverData.workCompleted || 'Initial diagnostics performed.',
      handoverNotes: handoverData.handoverNotes || 'Handover for next engineer.',
      nextVisitDate: handoverData.nextVisitDate || 'Tomorrow'
    };

    updateAndSyncTickets(prev => prev.map(t => {
      if (isSameTicket(t, ticketId)) {
        const existingLogs = t.handoverLogs || (t.previousTechnicianWork ? [t.previousTechnicianWork] : []);
        const updatedLogs = [newHandoverLog, ...existingLogs];

        const updatedTimeline = [
          ...(t.timeline || []),
          {
            time: timeStr,
            title: `Job marked Pending Next Visit (${currentUser.name})`,
            subtitle: `Reason: ${handoverData.reason}. Handover instructions logged for next technician.`
          }
        ];

        return {
          ...t,
          status: 'Pending Next Visit',
          lastHandover: newHandoverLog,
          handoverLogs: updatedLogs,
          previousTechnicianWork: newHandoverLog,
          timeline: updatedTimeline
        };
      }
      return t;
    }));

    showToast(`Job ${ticketId} marked Pending Next Visit. Handover instructions saved!`, 'warning');
    return true;
  };

  // Request Technician Replacement (Notifies Admin immediately)
  const requestTechnicianReplacement = async (ticketId, replacementData) => {
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const techName = replacementData.technicianName || currentUser.name || 'Technician';

    const cleanId = (ticketId || '').toString().replace(/^#/, '');

    const newNotification = {
      id: `notif-${Date.now()}`,
      title: `🚨 URGENT: Replacement Requested for #${cleanId}`,
      message: `Technician ${techName} requested immediate replacement. Reason: ${replacementData.reason}. Notes: ${replacementData.notes}`,
      time: 'Just Now',
      type: 'urgent',
      role: 'admin',
      unread: true,
      read: false,
      ticketId: ticketId
    };

    setNotifications(prev => [newNotification, ...prev]);

    updateAndSyncTickets(prev => prev.map(t => {
      if (isSameTicket(t, ticketId)) {
        const updatedTimeline = [
          ...(t.timeline || []),
          {
            time: timeStr,
            title: `Technician ${techName} requested replacement.`,
            subtitle: `Reason: ${replacementData.reason}. Urgency: ${replacementData.urgency}. Notes: ${replacementData.notes}`
          }
        ];

        return {
          ...t,
          status: 'Replacement Requested',
          replacementRequest: {
            ...replacementData,
            requestedAt: `${dateStr}, ${timeStr}`,
            requestedBy: techName
          },
          timeline: updatedTimeline
        };
      }
      return t;
    }));

    showToast(`🚨 Urgent replacement request submitted to Admin for ticket #${cleanId}`, 'error');
  };

  // Delete Ticket (Admin Action)
  const deleteTicket = async (ticketId) => {
    const targetTicket = tickets.find(t => isSameTicket(t, ticketId));

    if (!targetTicket?.dbId) {
      showToast('Cannot delete a request that is not stored on the server.', 'error');
      return false;
    }
    try {
      await deleteServiceRequestFromApi(targetTicket.dbId);
    } catch (err) {
      showToast(`Delete failed: ${err.message}`, 'error');
      return false;
    }

    setTickets(prev => prev.filter(t => !isSameTicket(t, ticketId)));

    if (selectedTicketId && isSameTicket({ id: selectedTicketId, ticketNumber: selectedTicketId }, ticketId)) {
      setSelectedTicketId(null);
    }

    showToast(`Ticket ${ticketId} deleted successfully.`, 'info');
    return true;
  };

  // Create New Service Request
  const createServiceRequest = async (newTicket) => {
    let finalFormattedTicket = null;

    try {
      const dbCreated = await createServiceRequestInApiAdmin(newTicket);
      if (dbCreated) {
        finalFormattedTicket = dbCreated;
      }
    } catch (err) {
      showToast(`Could not create request: ${err.message}`, 'error');
      throw err;
    }

    updateAndSyncTickets(prev => [finalFormattedTicket, ...prev]);
    showToast(`Created new ticket ${finalFormattedTicket.id} successfully!`, 'success');
  };

  const selectedTicket = (tickets || []).find(t => isSameTicket(t, selectedTicketId));
  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);
  const selectedRoom = (rooms || []).find(r => r.id === selectedRoomId || (r.name || '').toLowerCase() === (selectedRoomId || '').toLowerCase());
  const selectedTech = technicians.find(t => t.id === selectedTechId);

  const reportsData = useMemo(() => {
    const totalRequests = tickets.length;
    const resolvedStatuses = new Set(['Resolved', 'Closed']);
    const resolved = tickets.filter(ticket => resolvedStatuses.has(ticket.status));
    const percentages = count => totalRequests ? `${Math.round((count / totalRequests) * 100)}%` : '0%';
    const groupTickets = (field, fallback) => Object.entries(tickets.reduce((groups, ticket) => {
      const label = ticket[field] || fallback;
      groups[label] = (groups[label] || 0) + 1;
      return groups;
    }, {}));
    const resolutionHours = resolved
      .map(ticket => ticket.createdAt && ticket.completedAt
        ? (new Date(ticket.completedAt) - new Date(ticket.createdAt)) / 3600000
        : null)
      .filter(hours => Number.isFinite(hours) && hours >= 0);
    const ratings = tickets.map(ticket => Number(ticket.rating)).filter(rating => rating > 0);

    return {
      totalRequests,
      openRequests: totalRequests - resolved.length,
      resolvedRequests: resolved.length,
      avgResolutionHours: resolutionHours.length
        ? (resolutionHours.reduce((sum, hours) => sum + hours, 0) / resolutionHours.length).toFixed(1)
        : '0.0',
      customerSatisfaction: ratings.length
        ? (ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length).toFixed(1)
        : '0.0',
      repeatIssueRate: '0%',
      issueTypeBreakdown: groupTickets('issueType', 'Uncategorized').map(([label, value], index) => ({
        label, value, percentage: percentages(value), color: ['#004898', '#0284C7', '#059669', '#F59E0B'][index % 4]
      })),
      locationBreakdown: groupTickets('location', 'Unknown location').map(([label, count]) => ({
        label, count, percentage: percentages(count)
      })),
      techPerformance: technicians.map(tech => {
        const completed = resolved.filter(ticket => ticket.assignedToId === tech.id);
        const techRatings = completed.map(ticket => Number(ticket.rating)).filter(rating => rating > 0);
        return {
          name: tech.name,
          jobs: completed.length,
          time: '—',
          rating: techRatings.length
            ? (techRatings.reduce((sum, rating) => sum + rating, 0) / techRatings.length).toFixed(1)
            : '—'
        };
      })
    };
  }, [tickets, technicians]);

  return (
    <AppContext.Provider
      value={{
        role,
        baseRole,
        switchRole,
        loginAsTechnician,
        deleteTechnician,
        deleteCustomer,
        verifyTechnicianPassword,
        saveAppSettings,
        isLoggedIn,
        isRestoringSession,
        handleLogin,
        handleOtpLogin,
        handleLogout,
        activePage,
        setActivePage,
        currentUser,

        tickets,
        setTickets,
        customers,
        setCustomers,
        locations,
        setLocations,
        rooms,
        setRooms,
        equipment,
        setEquipment,
        technicians,
        setTechnicians,
        staff,
        setStaff,
        notifications,
        setNotifications,
        installations,
        setInstallations,
        reportsData,
        isApiLoading,

        selectedTicket,
        selectedTicketId,
        setSelectedTicketId,
        selectedCustomer,
        setSelectedCustomerId,
        selectedRoom,
        setSelectedRoomId,
        selectedTech,
        setSelectedTechId,

        isCreateTicketOpen,
        setIsCreateTicketOpen,
        isAssignModalOpen,
        setIsAssignModalOpen,
        isServiceFormOpen,
        setIsServiceFormOpen,

        assignTechnician,
        assignTechnicianToSlot,
        updateTicketStatus,
        submitServiceReport,
        markTicketPendingHandover,
        requestTechnicianReplacement,
        deleteTicket,
        createServiceRequest,

        isSearchOpen,
        setIsSearchOpen,
        isNotificationsOpen,
        setIsNotificationsOpen,
        isSidebarCollapsed,
        setIsSidebarCollapsed,
        enabledModules,
        setEnabledModules,
        rolePermissions,
        setRolePermissions,
        globalSearchQuery,
        setGlobalSearchQuery,

        simulatedLoading,
        setSimulatedLoading,
        simulatedError,
        setSimulatedError,
        toast,
        showToast
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};







