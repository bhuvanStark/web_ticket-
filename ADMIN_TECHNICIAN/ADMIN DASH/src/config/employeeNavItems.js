// Technician/Sales/Back-Office Nav Parity fix — single source of truth for
// the Technician/Sales/Back-Office nav entries, shared by Sidebar.jsx
// (desktop) and BottomNav.jsx (mobile).
//
// Root cause this fixes: Sidebar.jsx's `techNavItems` and BottomNav.jsx's
// `employeeNavItemsFor` used to be two independently maintained arrays.
// Sidebar's list carried `module` keys and got filtered by the admin's
// `enabledModules` toggles; BottomNav's list was a flat hardcoded array with
// no filtering at all, so Work (Onsite Installations) and Calendar showed up
// on mobile even when an admin had switched those modules off for desktop.
// Defining the items once here — `module` keys included — and having both
// surfaces filter the same array the same way (see `filterByEnabledModules`)
// makes that kind of drift structurally impossible going forward.
//
// `label` is the desktop (Sidebar) text; `mobileLabel` is the shorter text
// BottomNav already used for the same entries — both preserved as-is from
// the two pre-fix arrays, only the item *set* and *filtering* changed.
import {
  LayoutDashboard,
  Ticket,
  Layers,
  Calendar,
  History,
  Sparkles,
  Clock3,
  TrendingUp
} from 'lucide-react';

export const techNavItems = [
  { id: 'my-dashboard', label: 'My Dashboard', mobileLabel: 'Dashboard', icon: LayoutDashboard },
  { id: 'my-jobs', label: 'My Jobs', mobileLabel: 'Jobs', icon: Ticket, module: 'requests' },
  { id: 'demos', label: 'Demo Management', mobileLabel: 'Demos', icon: Sparkles, module: 'demos' },
  { id: 'installations', label: 'Onsite Installations', mobileLabel: 'Work', icon: Layers, module: 'installations' },
  { id: 'calendar', label: 'Service Calendar', mobileLabel: 'Calendar', icon: Calendar, module: 'calendar' },
  { id: 'history', label: 'Service History', mobileLabel: 'History', icon: History, module: 'history' },
  // New: personal attendance page (this fix, item 2). No module toggle,
  // same as Admin's own 'attendance' sidebar entry — always shown.
  { id: 'my-attendance', label: 'My Attendance', mobileLabel: 'Attendance', icon: Clock3 }
];

export const salesNavItems = [
  { id: 'my-dashboard', label: 'My Dashboard', mobileLabel: 'Dashboard', icon: LayoutDashboard },
  // TaskPro Sales Module V1 — the pool + own-leads page. No `module` toggle:
  // Leads aren't a page that gets hidden by an Admin's enabledModules
  // setting (that system is Admin-only), just always present for Sales.
  { id: 'my-leads', label: 'My Leads', mobileLabel: 'Leads', icon: TrendingUp },
  { id: 'my-attendance', label: 'My Attendance', mobileLabel: 'Attendance', icon: Clock3 }
];

export const backOfficeNavItems = [
  { id: 'my-dashboard', label: 'My Dashboard', mobileLabel: 'Dashboard', icon: LayoutDashboard },
  { id: 'my-attendance', label: 'My Attendance', mobileLabel: 'Attendance', icon: Clock3 }
];

// Same enabled-module gating Sidebar.jsx already applied inline for every
// role's nav list — extracted so BottomNav.jsx can apply the identical rule
// instead of rendering its item set unfiltered.
export const filterByEnabledModules = (items, enabledModules) =>
  items.filter((item) => !item.module || (enabledModules && enabledModules[item.module]));
