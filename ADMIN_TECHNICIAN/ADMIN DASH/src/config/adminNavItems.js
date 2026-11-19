// Single source of truth for the Admin page set, shared by Sidebar.jsx
// (desktop), BottomNav.jsx and AdminMoreSheet.jsx (mobile), so no surface
// can drift into showing a different Admin page set than another.
//
// `section` only affects how the list is grouped visually; ids, labels,
// icons, `module` toggles and the permission filters below are unchanged.
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
  ClipboardList,
  FileText
} from 'lucide-react';

// Display order of the sidebar groups. `label: null` renders no heading.
export const adminNavSections = [
  { id: 'home', label: null },
  { id: 'triage', label: 'Triage' },
  { id: 'work', label: 'Work' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'people', label: 'People' },
  { id: 'revenue', label: 'Revenue' },
  { id: 'field', label: 'Field Programs' },
  { id: 'insights', label: 'Insights' },
  { id: 'system', label: 'System' }
];

export const adminNavItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, section: 'home' },
  { id: 'approvals', label: 'Approvals & Alerts', icon: BellRing, module: 'approvals', section: 'triage' },
  { id: 'requests', label: 'Service Requests', icon: Ticket, module: 'requests', section: 'work' },
  { id: 'projects', label: 'Projects', icon: Briefcase, module: 'projects', section: 'work' },
  { id: 'calendar', label: 'Service Calendar', icon: Calendar, module: 'calendar', section: 'work' },
  { id: 'history', label: 'Service History', icon: History, module: 'history', section: 'work' },
  { id: 'customers', label: 'Customers', icon: Users, module: 'customers', section: 'accounts' },
  { id: 'rooms', label: 'Rooms & Equipment', icon: Tv, module: 'rooms', section: 'accounts' },
  { id: 'technicians', label: 'Technicians', icon: Wrench, module: 'technicians', section: 'people' },
  { id: 'sales', label: 'Sales', icon: TrendingUp, section: 'people' },
  { id: 'back-office', label: 'Back-Office', icon: ClipboardList, section: 'people' },
  { id: 'attendance', label: 'Attendance', icon: Clock3, section: 'people' },
  { id: 'staff', label: 'Admin Roles', icon: ShieldAlert, section: 'people' },
  { id: 'quotations', label: 'Quotations', icon: FileText, section: 'revenue' },
  { id: 'installations', label: 'Onsite Installations', icon: Layers, module: 'installations', section: 'field' },
  { id: 'inventory', label: 'Spare Parts Stock', icon: Package, module: 'inventory', section: 'field' },
  { id: 'demos', label: 'Demo Management', icon: Sparkles, module: 'demos', section: 'field' },
  { id: 'reports', label: 'Reports', icon: BarChart3, module: 'reports', section: 'insights' },
  { id: 'settings', label: 'Settings', icon: Settings, section: 'system' }
];

// The 4 fixed bottom-bar tabs (highest-traffic pages), in display order.
// Everything else in adminNavItems surfaces in the "More" sheet instead.
export const adminPrimaryNavIds = ['dashboard', 'requests', 'approvals', 'customers'];

// Profile has no dedicated desktop Sidebar entry — on desktop it's reached
// by clicking the avatar at the bottom of Sidebar.jsx. There is no Sidebar
// on mobile, so the More sheet carries this as its equivalent affordance,
// same reasoning BottomNav.jsx already uses for Technician's Profile tab.
export const adminProfileNavItem = { id: 'profile', label: 'My Profile', icon: User };

// Two-step gate, identical on every surface: first the enabledModules
// toggle, then the per-sub-role rolePermissions map (only when that role's
// map actually declares the key — an absent key means "not gated").
// `canAccessAdminPage` (from AppContext) then applies the admin's own module
// permissions, the same rules the backend enforces.
export const filterAdminNavItems = (items, enabledModules, rolePermissions, currentUser, canAccessAdminPage) =>
  items.filter((item) => {
    if (item.module && !(enabledModules && enabledModules[item.module])) return false;

    if (rolePermissions && currentUser && currentUser.role) {
      const userPerms = rolePermissions[currentUser.role];
      if (userPerms && item.id in userPerms && !userPerms[item.id]) return false;
    }

    if (canAccessAdminPage && !canAccessAdminPage(item.id)) return false;
    return true;
  });

// Already-filtered items, bucketed by section in adminNavSections order.
// Sections with nothing visible are dropped, so a permission-restricted
// admin never sees an empty heading.
export const groupAdminNavItems = (items) =>
  adminNavSections
    .map((section) => ({ ...section, items: items.filter((item) => (item.section || 'home') === section.id) }))
    .filter((section) => section.items.length > 0);
