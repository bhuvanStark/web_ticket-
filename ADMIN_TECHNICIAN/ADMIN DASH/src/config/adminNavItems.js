// Admin Mobile Navigation fix — single source of truth for the Admin page
// set shown on mobile (bottom bar primary tabs + "More" sheet), kept in a
// dedicated file rather than added to employeeNavItems.js because Admin
// needs a second filter (rolePermissions) that Tech/Sales/Back-Office don't.
//
// This list intentionally mirrors Sidebar.jsx's `adminNavItems` array
// (id/label/icon/module) so mobile can never drift into showing a different
// Admin page set than desktop. If a page is added to/removed from the
// desktop Sidebar, mirror the change here too.
import {
  LayoutDashboard,
  Ticket,
  Briefcase,
  Users,
  Tv,
  Wrench,
  Calendar,
  History,
  BarChart3,
  Settings,
  User,
  ShieldAlert,
  BellRing,
  Layers,
  Package,
  Sparkles,
  Clock3,
  TrendingUp,
  ClipboardList
} from 'lucide-react';

export const adminNavItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'approvals', label: 'Approvals & Alerts', icon: BellRing, module: 'approvals' },
  { id: 'requests', label: 'Service Requests', icon: Ticket, module: 'requests' },
  { id: 'projects', label: 'Projects', icon: Briefcase, module: 'projects' },
  { id: 'customers', label: 'Customers', icon: Users, module: 'customers' },
  { id: 'rooms', label: 'Rooms & Equipment', icon: Tv, module: 'rooms' },
  { id: 'technicians', label: 'Technicians', icon: Wrench, module: 'technicians' },
  { id: 'sales', label: 'Sales', icon: TrendingUp },
  { id: 'back-office', label: 'Back-Office', icon: ClipboardList },
  { id: 'attendance', label: 'Attendance', icon: Clock3 },
  { id: 'installations', label: 'Onsite Installations', icon: Layers, module: 'installations' },
  { id: 'inventory', label: 'Spare Parts Stock', icon: Package, module: 'inventory' },
  { id: 'demos', label: 'Demo Management', icon: Sparkles, module: 'demos' },
  { id: 'calendar', label: 'Service Calendar', icon: Calendar, module: 'calendar' },
  { id: 'history', label: 'Service History', icon: History, module: 'history' },
  { id: 'reports', label: 'Reports', icon: BarChart3, module: 'reports' },
  { id: 'staff', label: 'Admin Roles', icon: ShieldAlert },
  { id: 'settings', label: 'Settings', icon: Settings },
];

// The 4 fixed bottom-bar tabs (highest-traffic pages), in display order.
// Everything else in adminNavItems surfaces in the "More" sheet instead.
export const adminPrimaryNavIds = ['dashboard', 'requests', 'approvals', 'customers'];

// Profile has no dedicated desktop Sidebar entry — on desktop it's reached
// by clicking the avatar at the bottom of Sidebar.jsx. There is no Sidebar
// on mobile, so the More sheet carries this as its equivalent affordance,
// same reasoning BottomNav.jsx already uses for Technician's Profile tab.
export const adminProfileNavItem = { id: 'profile', label: 'My Profile', icon: User };

// Exact same two-step gate Sidebar.jsx applies inline for Admin
// (Sidebar.jsx lines ~135-147): first the enabledModules toggle, then the
// per-sub-role rolePermissions map (only when that role's map actually
// declares the key — an absent key means "not gated", same as desktop).
export const filterAdminNavItems = (items, enabledModules, rolePermissions, currentUser) =>
  items.filter((item) => {
    if (item.module && !(enabledModules && enabledModules[item.module])) return false;

    if (rolePermissions && currentUser && currentUser.role) {
      const userPerms = rolePermissions[currentUser.role];
      if (userPerms && item.id in userPerms && !userPerms[item.id]) return false;
    }

    return true;
  });
