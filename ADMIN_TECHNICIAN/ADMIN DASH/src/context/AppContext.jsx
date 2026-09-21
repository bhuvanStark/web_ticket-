import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';

import unifiedClient from '../api/unifiedClient';

import {
  fetchAdminServiceRequests,
  fetchAdminCustomers,
  fetchAdminLocations,
  fetchAdminRooms,
  fetchAdminTechnicians,
  assignTechnicianInApi,
  addTechnicianInApi,
  removeTechnicianFromApi,
  updateTicketStatusInApi,
  createServiceRequestInApiAdmin,
  submitServiceReportInApi,
  reassignPendingInApi,
  deleteServiceRequestFromApi,
  subscribeToAdminServiceRequests,
  createTechnicianInApi,
  updateTechnicianInApi
} from '../services/adminApiService';

// Project Category (V1) — a separate module from Service Tickets. Imported
// independently so a failure anywhere in this module can never affect the
// ticket data above (see the isolated fetch/poll effects below).
import {
  fetchProjects,
  fetchMyProjectActivitiesInApi,
  fetchTechnicianProjectActivitiesInApi,
  createProjectInApi,
  updateProjectInApi,
  markProjectCompleteInApi,
  deleteProjectInApi,
  assignProjectActivitiesInApi,
  updateActivityStatusInApi,
  completeActivityInApi,
  reassignActivityInApi
} from '../services/projectApiService';

// Attendance Category (V1) — a separate module from Service Tickets and
// Projects. Imported independently so a failure anywhere in this module can
// never affect ticket or project data (see the isolated fetch/poll effect
// below). Only the technician's own "today" check-in state is fetched here;
// the Admin Attendance page keeps its own date/filter-scoped fetch logic
// locally, only reading this context's `pollTick` counter to know when the
// shared poll ticked, so it refreshes without a second interval.
import {
  fetchMyAttendanceTodayInApi,
  checkInInApi,
  checkOutInApi
} from '../services/attendanceApiService';

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

  // Project Category (V1) — separate state from `tickets`, fetched and
  // polled independently (see effects below) so a Projects API problem can
  // never block or delay ticket data. `projects` holds every project
  // regardless of status (ProjectsPage filters tabs client-side, same as
  // ticket pages already do). `myProjectActivities` is technician-only: the
  // logged-in technician's own Daily Project Activities, every status.
  const [projects, setProjects] = useState([]);
  const [myProjectActivities, setMyProjectActivities] = useState([]);

  // Attendance Category (V1) — separate state again, same isolation
  // reasoning as above. Only ever set for a *real* technician session
  // (baseRole === 'tech'); while an admin is impersonating a technician's
  // view, Attendance is read-only history only (never fetched into this
  // poll) — see TechDashboard.jsx.
  const [myAttendanceToday, setMyAttendanceToday] = useState(null);
  // Bumped once per tick of the existing poll below (never a second
  // interval). AttendancePage.jsx reacts to this to refresh its own
  // date/filter-scoped fetch, instead of the page owning its own timer —
  // "reuse the existing shared polling mechanism" per the spec.
  const [pollTick, setPollTick] = useState(0);

  // Modals & Panels State
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [selectedTechId, setSelectedTechId] = useState(null);
  // Create/Edit Technician modal state — mirrors the Project modal pattern
  // (isNewProjectModalOpen/projectModalMode) so the same NewTechnicianModal
  // form serves both "Add New Technician" (TechniciansPage) and "Edit"
  // (TechProfileModal, opened on the technician currently in `selectedTech`).
  const [isTechnicianModalOpen, setIsTechnicianModalOpen] = useState(false);
  const [technicianModalMode, setTechnicianModalMode] = useState('create'); // 'create' | 'edit'
  const [isCreateTicketOpen, setIsCreateTicketOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  // 'assign' = first assignment / Reassign (existing flow). 'add' = add an
  // ADDITIONAL technician alongside the existing primary. Same popup, same
  // On-site/Remote picker — see AssignTechModal.jsx.
  const [assignModalMode, setAssignModalMode] = useState('assign');
  const [isServiceFormOpen, setIsServiceFormOpen] = useState(false);

  // Set just before navigating to Service History from the "Completed Today"
  // dashboard card, so that page can default its date filter to today. Read
  // once on mount, then cleared — a later sidebar nav to History is
  // unaffected and stays on "All dates".
  const [pendingHistoryDate, setPendingHistoryDate] = useState(null);

  // Project Category (V1) modal state — mirrors the ticket modal pattern above.
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [projectModalMode, setProjectModalMode] = useState('create'); // 'create' | 'edit'
  const [isAssignProjectTeamModalOpen, setIsAssignProjectTeamModalOpen] = useState(false);

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  
  const [enabledModules, setEnabledModules] = useState({
    approvals: true,
    requests: true,
    projects: true,
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
      projects: true,
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
      projects: true,
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
      projects: true,
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
            const completedStatuses = new Set(['Completed', 'Resolved', 'Closed']);
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
              openRequestsCount: roomTickets.filter(ticket => !['Completed', 'Resolved', 'Closed'].includes(ticket.status)).length,
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
              ticket.assignedToId === t.id && !['Completed', 'Reassigned', 'Resolved', 'Closed'].includes(ticket.status)
            ).length,
            completedJobsCount: (dbTickets || []).filter(ticket =>
              ticket.assignedToId === t.id && ['Completed', 'Resolved', 'Closed'].includes(ticket.status)
            ).length,
            reassignedJobsCount: (dbTickets || []).filter(ticket =>
              ticket.assignedToId === t.id && ticket.status === 'Reassigned'
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

  // Poll PostgreSQL for ticket updates — and, on the exact same interval,
  // Project Category (V1) data. This reuses the one existing interval
  // rather than starting a second polling loop, but each fetch below is
  // independently try/caught: fetchLiveTickets is completely unmodified
  // from before, and a failure in the Projects fetch can never throw here or
  // affect it (nor vice versa) — Projects is never a dependency of tickets.
  useEffect(() => {
    const fetchLiveTickets = async () => {
      try {
        const dbTickets = await fetchAdminServiceRequests();
        setTickets(Array.isArray(dbTickets) ? dbTickets : []);
      } catch (err) {
        console.warn('Admin polling DB tickets error:', err);
      }
    };

    // Admin-only on the backend, and isolated: `projects` simply keeps its
    // last-known value (or []) if this ever fails, and nothing else in the
    // app is affected. Skipped entirely for a technician session — that
    // endpoint would just 403 for them, same as any other admin-only route.
    const fetchLiveProjects = async () => {
      if (role !== 'admin') return;
      try {
        const dbProjects = await fetchProjects({});
        setProjects(Array.isArray(dbProjects) ? dbProjects : []);
      } catch (err) {
        console.warn('Admin polling projects error (isolated from tickets):', err);
      }
    };

    // Technician-only: their own Daily Project Activities. Also isolated.
    // A real technician login (baseRole 'tech') carries a technician-role JWT
    // and reads its own activities directly. An admin using "switch into a
    // technician's view" (Sidebar picker) is still holding an admin JWT —
    // exactly like fetchLiveTickets above, which never calls a
    // technician-only ticket endpoint while impersonating — so it reads the
    // same data through the admin-scoped route instead, or that technician
    // JWT would 403 against /api/technician/project-activities.
    const fetchLiveMyActivities = async () => {
      if (role !== 'tech') return;
      try {
        const activities = baseRole === 'tech'
          ? await fetchMyProjectActivitiesInApi()
          : currentUser?.id
            ? await fetchTechnicianProjectActivitiesInApi(currentUser.id)
            : [];
        setMyProjectActivities(Array.isArray(activities) ? activities : []);
      } catch (err) {
        console.warn('Technician polling project activities error (isolated from tickets):', err);
      }
    };

    // Attendance Category (V1) — the authenticated technician's own "today"
    // check-in state. Real technician sessions only (baseRole === 'tech'):
    // an admin impersonating a technician's view never holds a technician
    // JWT and, per the plan, must never check in on a technician's behalf —
    // so this is intentionally skipped while impersonating rather than
    // rerouted through an admin-scoped endpoint (unlike fetchLiveMyActivities
    // above). Isolated exactly like the two fetches above: a failure here
    // only ever leaves `myAttendanceToday` at its last-known value.
    const fetchLiveMyAttendanceToday = async () => {
      if (role !== 'tech' || baseRole !== 'tech') return;
      try {
        const today = await fetchMyAttendanceTodayInApi();
        setMyAttendanceToday(today || null);
      } catch (err) {
        console.warn('Technician polling attendance error (isolated from tickets):', err);
      }
    };

    const tick = () => {
      fetchLiveTickets();
      fetchLiveProjects();
      fetchLiveMyActivities();
      fetchLiveMyAttendanceToday();
      // AttendancePage.jsx's own effect depends on this to re-run its
      // date/filter-scoped fetch on the same cadence, without a second
      // setInterval anywhere.
      setPollTick((t) => t + 1);
    };

    tick();
    const interval = setInterval(tick, 3000);
    return () => clearInterval(interval);
  }, [role, baseRole, currentUser?.id]);

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

  // Onboard a new technician — used by NewTechnicianModal in 'create' mode.
  // A brand-new technician has no jobs yet, so the roster row is seeded with
  // 0/0 rather than left blank until the next full reload.
  const createTechnician = async (payload) => {
    try {
      const response = await createTechnicianInApi(payload);
      const d = response?.data;
      if (d) {
        const created = {
          id: d.id,
          name: d.full_name,
          role: d.role_title,
          specialization: d.specialization,
          email: d.email,
          phone: d.phone,
          location: d.location,
          status: 'Available',
          activeJobsCount: 0,
          completedJobsCount: 0
        };
        setTechnicians((prev) => [created, ...(prev || [])]);
      }
      showToast(`Onboarded technician "${payload.full_name}".`, 'success');
      return true;
    } catch (error) {
      showToast(error?.message || 'Failed to create technician', 'error');
      return false;
    }
  };

  // Edit an existing technician's profile — used by NewTechnicianModal in
  // 'edit' mode (opened from TechProfileModal). Only the profile fields the
  // Create form itself collects; availability and password keep going
  // through their own existing endpoints, unchanged.
  const updateTechnician = async (technicianId, payload) => {
    try {
      const response = await updateTechnicianInApi(technicianId, payload);
      const d = response?.data;
      if (d) {
        setTechnicians((prev) => (prev || []).map((t) => (t.id === technicianId ? {
          ...t,
          name: d.full_name,
          role: d.role_title,
          specialization: d.specialization,
          email: d.email,
          phone: d.phone,
          location: d.location
        } : t)));
      }
      showToast(`Technician ${payload.full_name} updated.`, 'success');
      return true;
    } catch (error) {
      showToast(error?.message || 'Failed to update technician', 'error');
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

  // Add an ADDITIONAL technician to a ticket that already has a primary
  // (assignTechnician above). Never changes the primary owner. Refetches the
  // full ticket list afterward so secondaryTechnicians is correctly
  // re-hydrated from the backend rather than hand-built optimistically.
  const addTechnician = async (ticketId, techId, mode = 'onsite') => {
    const tech = technicians.find(t => t.id === techId || t.name === techId);
    const targetTicket = tickets.find(t => isSameTicket(t, ticketId));
    const modeLabel = mode === 'remote' ? 'Remote' : 'On-site';

    if (!targetTicket?.dbId || !tech?.id) {
      showToast('A real request and technician are required.', 'error');
      return false;
    }
    try {
      await addTechnicianInApi(targetTicket.dbId, tech.id, mode);
    } catch (err) {
      showToast(`Could not add technician: ${err.message}`, 'error');
      return false;
    }

    try {
      const refreshedTickets = await fetchAdminServiceRequests();
      setTickets(Array.isArray(refreshedTickets) ? refreshedTickets : []);
    } catch {
      // Non-fatal: the add already succeeded server-side; the next natural
      // refresh will pick it up.
    }

    showToast(`Added ${tech?.name || 'Technician'} to ${ticketId} — ${modeLabel}`, 'success');
    return true;
  };

  // Remove an ADDITIONAL technician from a ticket. Never touches the primary
  // — that still requires Reassign.
  const removeTechnician = async (ticketId, techId) => {
    const tech = technicians.find(t => t.id === techId || t.name === techId);
    const targetTicket = tickets.find(t => isSameTicket(t, ticketId));

    if (!targetTicket?.dbId || !techId) {
      showToast('A real request and technician are required.', 'error');
      return false;
    }
    try {
      await removeTechnicianFromApi(targetTicket.dbId, techId);
    } catch (err) {
      showToast(`Could not remove technician: ${err.message}`, 'error');
      return false;
    }

    try {
      const refreshedTickets = await fetchAdminServiceRequests();
      setTickets(Array.isArray(refreshedTickets) ? refreshedTickets : []);
    } catch {
      // Non-fatal — same reasoning as addTechnician above.
    }

    showToast(`Removed ${tech?.name || 'technician'} from ${ticketId}`, 'success');
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
        if (newStatus === 'Assigned') statusTitle = `Technician assigned by ${currentUser.name}.`;
        if (newStatus === 'Active') statusTitle = `Job accepted & service started (${currentUser.name}).`;
        if (newStatus === 'Completed') statusTitle = 'Service completed & report submitted.';

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
  // (tech-signed + customer sign-off captured on the technician's device) and
  // moves the ticket to Completed.
  const submitServiceReport = async (ticketId, reportData) => {
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const targetTicket = tickets.find(t => isSameTicket(t, ticketId));

    if (!targetTicket?.dbId) {
      showToast('Cannot submit a report for a request that is not stored on the server.', 'error');
      return false;
    }

    const customerPresent = reportData.customerPresent !== false;
    const customerDetails = reportData.customerSignerDetails || '';
    const outcome = reportData.outcome === 'pending' ? 'pending' : 'completed';
    const nextStatus = outcome === 'pending' ? 'Pending' : 'Completed';

    let savedReport;
    try {
      savedReport = await submitServiceReportInApi(targetTicket.dbId, {
        system: reportData.system,
        natureOfComplaint: reportData.natureOfComplaint,
        workDone: reportData.workDone,
        partsMaterial: reportData.partsMaterial,
        techSignerName: reportData.techSignerName || currentUser?.name,
        customerSignerDetails: customerDetails,
        customerSignerName: reportData.customerSignerName || customerDetails,
        customerPresent,
        outcome
      });
    } catch (err) {
      showToast(`Service report failed: ${err.message}`, 'error');
      return false;
    }

    updateAndSyncTickets(prev => prev.map(t => {
      if (isSameTicket(t, ticketId)) {
        return {
          ...t,
          status: nextStatus,
          serviceReport: {
            system: savedReport?.system || reportData.system || '',
            natureOfComplaint: savedReport?.nature_of_complaint || reportData.natureOfComplaint || '',
            workDone: savedReport?.work_done || reportData.workDone || '',
            partsMaterial: savedReport?.parts_material || reportData.partsMaterial || '',
            techSigned: true,
            techSignerName: savedReport?.tech_signer_name || currentUser?.name || '',
            customerSigned: savedReport ? !!savedReport.customer_signed : customerPresent,
            customerSignerName: savedReport?.customer_signer_name || customerDetails,
            customerSignerDetails: savedReport?.customer_signer_details || customerDetails
          },
          timeline: [
            ...(t.timeline || []),
            {
              time: timeStr,
              title: outcome === 'pending'
                ? 'Field service report submitted — job left pending.'
                : 'Field service report submitted.',
              subtitle: customerPresent
                ? `Signed on site by ${customerDetails || 'the customer'}.`
                : `Customer not present (${customerDetails || 'contact recorded'}).`
            }
          ]
        };
      }
      return t;
    }));

    showToast(
      outcome === 'pending'
        ? `Service report for ${ticketId} submitted. Ticket marked Pending.`
        : `Service report for ${ticketId} submitted. Ticket completed.`,
      'success'
    );
    return true;
  };

  // Admin moves a Pending ticket to Reassigned. Only this ticket changes — no
  // new ticket is created. The ticket keeps its assigned technician so
  // technician stats can compare Completed vs Reassigned.
  const reassignPending = async (ticketId) => {
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const targetTicket = tickets.find(t => isSameTicket(t, ticketId));

    if (!targetTicket?.dbId) {
      showToast('Cannot reassign a request that is not stored on the server.', 'error');
      return false;
    }
    try {
      await reassignPendingInApi(targetTicket.dbId);
    } catch (err) {
      showToast(`Reassign failed: ${err.message}`, 'error');
      return false;
    }

    updateAndSyncTickets(prev => prev.map(t => {
      if (isSameTicket(t, ticketId)) {
        return {
          ...t,
          status: 'Reassigned',
          timeline: [
            ...(t.timeline || []),
            {
              time: timeStr,
              title: 'Ticket reassigned by admin.',
              subtitle: 'Pending job closed for reassignment. Raise a new ticket if the work needs to continue.'
            }
          ]
        };
      }
      return t;
    }));

    showToast(`Ticket ${ticketId} marked Reassigned.`, 'success');
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

  // ============================================
  // PROJECT CATEGORY (V1) — additive. Every mutator below follows the same
  // guard -> try/catch -> optimistic-patch -> toast -> return-bool shape as
  // the ticket mutators above, but touches only `projects`/
  // `myProjectActivities` state — never `tickets`.
  // ============================================

  const createProject = async (payload) => {
    try {
      const created = await createProjectInApi(payload);
      setProjects(prev => [created, ...prev]);
      showToast(`Project ${created.id} created successfully.`, 'success');
      return created;
    } catch (err) {
      showToast(`Could not create project: ${err.message}`, 'error');
      return null;
    }
  };

  const updateProject = async (projectId, payload) => {
    try {
      const updated = await updateProjectInApi(projectId, payload);
      setProjects(prev => prev.map(p => (p.id === projectId ? { ...p, ...updated } : p)));
      showToast(`Project ${projectId} updated.`, 'success');
      return true;
    } catch (err) {
      showToast(`Could not update project: ${err.message}`, 'error');
      return false;
    }
  };

  // Date + Time + multiple technicians -> one independent activity per
  // technician. All-or-nothing: a conflict rejects the whole assignment.
  const assignProjectTeam = async (projectId, { date, time, technicianIds }) => {
    try {
      await assignProjectActivitiesInApi(projectId, { scheduledDate: date, scheduledTime: time, technicianIds });
    } catch (err) {
      showToast(`Assignment failed: ${err.message}`, 'error');
      return false;
    }
    // Re-fetch this project's active activities rather than hand-rolling the
    // merge — createActivitiesBulk's response and the project summary's
    // active_activities shape are both server-derived; refetching keeps them
    // in sync with zero risk of drifting apart.
    try {
      const refreshed = await fetchProjects({});
      setProjects(Array.isArray(refreshed) ? refreshed : []);
    } catch {
      // Isolated: the assignment itself already succeeded; a refresh hiccup
      // here just means the summary catches up on the next 3s poll.
    }
    showToast(`Assigned ${technicianIds.length} technician(s) for ${date}.`, 'success');
    return true;
  };

  const markProjectComplete = async (projectId) => {
    try {
      const updated = await markProjectCompleteInApi(projectId);
      setProjects(prev => prev.map(p => (p.id === projectId ? { ...p, ...updated } : p)));
      showToast(`Project ${projectId} marked complete.`, 'success');
      return true;
    } catch (err) {
      showToast(err.code === 'UNRESOLVED_ACTIVITIES'
        ? `Cannot complete ${projectId}: it still has active daily activities.`
        : `Could not complete project: ${err.message}`, 'error');
      return false;
    }
  };

  const deleteProject = async (projectId) => {
    try {
      await deleteProjectInApi(projectId);
    } catch (err) {
      showToast(err.code === 'HAS_ACTIVITIES'
        ? `Cannot delete ${projectId}: it has activity history.`
        : `Delete failed: ${err.message}`, 'error');
      return false;
    }
    setProjects(prev => prev.filter(p => p.id !== projectId));
    if (selectedProjectId === projectId) setSelectedProjectId(null);
    showToast(`Project ${projectId} deleted.`, 'info');
    return true;
  };

  // Assigned -> Accepted (technician "accept", same generic mechanism the
  // ticket system uses) or -> Cancelled.
  const updateActivityStatus = async (activityId, status) => {
    try {
      await updateActivityStatusInApi(activityId, status);
    } catch (err) {
      showToast(`Status update failed: ${err.message}`, 'error');
      return false;
    }
    setMyProjectActivities(prev => prev.map(a => (a.id === activityId ? { ...a, status } : a)));
    showToast(`Activity ${status.toLowerCase()}.`, 'success');
    return true;
  };

  // Attendance Category (V1) — mirrors updateActivityStatus/completeActivity
  // above: call the API, fold the result into local state, toast, and never
  // throw out of this function (the caller — the TechDashboard banner —
  // reads the boolean return instead). Geolocation itself is captured by
  // the caller (only after the Check In click, per the plan) and passed in
  // as `location`.
  const checkIn = async (location) => {
    try {
      const record = await checkInInApi(location);
      setMyAttendanceToday(record);
      showToast('Checked in.', 'success');
      return true;
    } catch (err) {
      if (err.code === 'ALREADY_CHECKED_IN' && err.existing) {
        // Another tab/device already checked in for today — resync instead
        // of leaving the banner stuck on "Check In".
        setMyAttendanceToday(err.existing);
      }
      showToast(err.message || 'Check-in failed', 'error');
      return false;
    }
  };

  const checkOut = async () => {
    if (!myAttendanceToday?.id) return false;
    try {
      const record = await checkOutInApi(myAttendanceToday.id);
      setMyAttendanceToday(record);
      showToast('Checked out.', 'success');
      return true;
    } catch (err) {
      showToast(err.message || 'Check-out failed', 'error');
      return false;
    }
  };

  // Light completion: notes + completed_at only (no service-report shape).
  const completeActivity = async (activityId, completionNotes = '') => {
    try {
      const updated = await completeActivityInApi(activityId, completionNotes);
      setMyProjectActivities(prev => prev.map(a => (a.id === activityId ? { ...a, ...updated } : a)));
      showToast('Activity completed.', 'success');
      return true;
    } catch (err) {
      showToast(err.code === 'INVALID_TRANSITION'
        ? 'Accept this activity before completing it.'
        : `Could not complete activity: ${err.message}`, 'error');
      return false;
    }
  };

  // Admin reassigns a daily activity to a different technician. History-safe
  // on the backend: the original row becomes Cancelled, never deleted.
  const reassignActivity = async (activityId, newTechnicianId) => {
    try {
      await reassignActivityInApi(activityId, newTechnicianId);
    } catch (err) {
      showToast(err.code === 'DUPLICATE_ACTIVITY'
        ? 'That technician already has an activity for this project on this date.'
        : `Reassignment failed: ${err.message}`, 'error');
      return false;
    }
    try {
      const refreshed = await fetchProjects({});
      setProjects(Array.isArray(refreshed) ? refreshed : []);
    } catch {
      // Isolated — see assignProjectTeam's comment above.
    }
    showToast('Activity reassigned.', 'success');
    return true;
  };

  const selectedTicket = (tickets || []).find(t => isSameTicket(t, selectedTicketId));
  const selectedProject = (projects || []).find(p => p.id === selectedProjectId);
  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);
  const selectedRoom = (rooms || []).find(r => r.id === selectedRoomId || (r.name || '').toLowerCase() === (selectedRoomId || '').toLowerCase());
  const selectedTech = technicians.find(t => t.id === selectedTechId);

  const reportsData = useMemo(() => {
    const totalRequests = tickets.length;
    const resolvedStatuses = new Set(['Completed', 'Resolved', 'Closed']);
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
        createTechnician,
        updateTechnician,
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
        isTechnicianModalOpen,
        setIsTechnicianModalOpen,
        technicianModalMode,
        setTechnicianModalMode,

        isCreateTicketOpen,
        setIsCreateTicketOpen,
        isAssignModalOpen,
        setIsAssignModalOpen,
        assignModalMode,
        setAssignModalMode,
        pendingHistoryDate,
        setPendingHistoryDate,
        isServiceFormOpen,
        setIsServiceFormOpen,

        assignTechnician,
        addTechnician,
        removeTechnician,
        assignTechnicianToSlot,
        updateTicketStatus,
        submitServiceReport,
        reassignPending,
        markTicketPendingHandover,
        requestTechnicianReplacement,
        deleteTicket,
        createServiceRequest,

        // Project Category (V1) — additive, separate from the ticket state above.
        projects,
        setProjects,
        myProjectActivities,
        selectedProject,
        selectedProjectId,
        setSelectedProjectId,
        isNewProjectModalOpen,
        setIsNewProjectModalOpen,
        projectModalMode,
        setProjectModalMode,
        isAssignProjectTeamModalOpen,
        setIsAssignProjectTeamModalOpen,
        createProject,
        updateProject,
        assignProjectTeam,
        markProjectComplete,
        deleteProject,
        updateActivityStatus,
        completeActivity,
        reassignActivity,

        // Attendance Category (V1) — additive, separate from tickets and
        // projects. AttendancePage.jsx (admin) manages its own list/filter
        // state locally and reads only `pollTick` from here, to refresh on
        // the same cadence as tickets/projects without a second interval.
        myAttendanceToday,
        checkIn,
        checkOut,
        pollTick,

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







