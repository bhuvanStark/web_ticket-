import React from 'react';
import { useApp } from '../../context/AppContext';
import { useIsMobile } from '../../hooks/useMediaQuery';
import {
  LayoutDashboard,
  Ticket,
  Calendar,
  History,
  User,
  Layers
} from 'lucide-react';

// Sales & Back-Office Roles V1 — basic dashboard shell only (matches
// Sidebar.jsx's salesNavItems/backOfficeNavItems: a single Dashboard tab,
// no Ticket/Project pages at all). Audit fix: this previously fell through
// to the full Technician tab set for any non-admin role, so Sales/
// Back-Office saw five tabs (Jobs/Work/Calendar/History/Profile) that
// either don't exist for them (App.jsx ignores activePage entirely for
// these two roles, always rendering the dashboard) or are misleading.
const employeeNavItemsFor = (role) => {
  if (role === 'sales' || role === 'back_office') {
    return [{ id: 'my-dashboard', label: 'Dashboard', icon: LayoutDashboard }];
  }
  return [
    { id: 'my-dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'my-jobs', label: 'Jobs', icon: Ticket },
    { id: 'installations', label: 'Work', icon: Layers },
    { id: 'calendar', label: 'Calendar', icon: Calendar },
    { id: 'history', label: 'History', icon: History },
    { id: 'profile', label: 'Profile', icon: User },
  ];
};

export const BottomNav = () => {
  const { activePage, setActivePage, role } = useApp();
  const isMobile = useIsMobile();

  if (!isMobile || role === 'admin') return null;

  const techNavItems = employeeNavItemsFor(role);

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#E4E7EC] z-50 flex md:hidden">
      {techNavItems.map((item) => (
        <button
          key={item.id}
          onClick={() => setActivePage(item.id)}
          className={`flex-1 py-2 px-0 flex flex-col items-center justify-center gap-1 text-center transition-colors border-0 rounded-none ${
            activePage === item.id
              ? 'text-[#004898] bg-[#F0F7FF]'
              : 'text-[#667085] hover:text-[#172033]'
          }`}
        >
          <item.icon className="w-5 h-5" />
          <span className="text-xs font-medium truncate">{item.label}</span>
        </button>
      ))}
    </nav>
  );
};
