import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { User, MoreHorizontal } from 'lucide-react';
import {
  techNavItems,
  salesNavItems,
  backOfficeNavItems,
  filterByEnabledModules
} from '../../config/employeeNavItems';
import {
  adminNavItems,
  adminPrimaryNavIds,
  filterAdminNavItems
} from '../../config/adminNavItems';
import { AdminMoreSheet } from './AdminMoreSheet';

const NAV_ITEMS_BY_ROLE = {
  sales: salesNavItems,
  back_office: backOfficeNavItems
};

export const BottomNav = () => {
  const { activePage, setActivePage, role, enabledModules, rolePermissions, currentUser } = useApp();
  const isMobile = useIsMobile();

  // Admin Mobile Navigation fix — More sheet's open/closed state lives here
  // so it unmounts (and resets to closed) for free whenever this component
  // does: a role switch away from admin, or a resize/rotation past the
  // `md` breakpoint (the `!isMobile` early-return below), both naturally
  // close it without needing a dedicated effect.
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  if (!isMobile) return null;

  if (role === 'admin') {
    const filteredAdminItems = filterAdminNavItems(adminNavItems, enabledModules, rolePermissions, currentUser);
    const primaryItems = adminPrimaryNavIds
      .map((id) => filteredAdminItems.find((item) => item.id === id))
      .filter(Boolean);

    return (
      <>
        {/* Admin Mobile Navigation fix — bottom bar exposes the same 4
            highest-traffic Admin pages plus a "More" tab for every other
            page the desktop Sidebar carries (AdminMoreSheet.jsx). z-40 (one
            below ToastContainer's z-50) so a toast fired while this bar is
            visible renders on top of it rather than being hidden under it. */}
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#E4E7EC] z-40 flex md:hidden">
          {primaryItems.map((item) => (
            <button
              key={item.id}
              onClick={() => { setIsMoreOpen(false); setActivePage(item.id); }}
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
          <button
            onClick={() => setIsMoreOpen((open) => !open)}
            aria-expanded={isMoreOpen}
            className={`flex-1 py-2 px-0 flex flex-col items-center justify-center gap-1 text-center transition-colors border-0 rounded-none ${
              isMoreOpen ? 'text-[#004898] bg-[#F0F7FF]' : 'text-[#667085] hover:text-[#172033]'
            }`}
          >
            <MoreHorizontal className="w-5 h-5" />
            <span className="text-xs font-medium truncate">More</span>
          </button>
        </nav>

        <AdminMoreSheet isOpen={isMoreOpen} onClose={() => setIsMoreOpen(false)} />
      </>
    );
  }

  // Technician/Sales/Back-Office Nav Parity fix — root cause was this file
  // rendering a flat, hardcoded item list with no relation to Sidebar.jsx's
  // module-filtered one (Work/Calendar showed up here unconditionally, even
  // when an admin had switched those modules off for desktop). Both surfaces
  // now read the same source array (config/employeeNavItems.js) and apply
  // the same `enabledModules` filter Sidebar.jsx already applied.
  const baseItems = NAV_ITEMS_BY_ROLE[role] || techNavItems;
  const items = filterByEnabledModules(baseItems, enabledModules);

  // Profile has no dedicated desktop nav entry — on desktop it's reached by
  // clicking the avatar at the bottom of the Sidebar (Sidebar.jsx). There is
  // no Sidebar on mobile at all (App.jsx hides it below the `md` breakpoint),
  // so Technician keeps a Profile tab here as its equivalent path to the
  // same TechProfilePage — not an extra/unintended page, just a different
  // affordance for the one that already exists on desktop. Sales/Back-Office
  // have no profile page yet, so none is added here for them.
  const techNavWithProfile = role === 'tech'
    ? [...items, { id: 'profile', mobileLabel: 'Profile', icon: User }]
    : items;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#E4E7EC] z-50 flex md:hidden">
      {techNavWithProfile.map((item) => (
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
          <span className="text-xs font-medium truncate">{item.mobileLabel}</span>
        </button>
      ))}
    </nav>
  );
};
