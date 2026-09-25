import React from 'react';
import { LogOut, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  adminNavItems,
  adminPrimaryNavIds,
  adminProfileNavItem,
  filterAdminNavItems
} from '../../config/adminNavItems';

// Admin Mobile Navigation fix — slide-up sheet for every Admin page that
// doesn't fit on the 4-tab bottom bar (BottomNav.jsx), plus Profile and
// Logout. Admin-only: mounted solely from BottomNav's admin branch, so this
// never renders for Tech/Sales/Back-Office.
//
// z-[60] matches the rest of the app's modal/overlay convention (see the
// technician-switch modals in Sidebar.jsx and GlobalSearchModal.jsx) so it
// sits above the bottom bar, the Header's search/notifications overlays, and
// ToastContainer's z-50 toast — a toast firing while this sheet is open is
// still readable underneath rather than being hidden by it.
export const AdminMoreSheet = ({ isOpen, onClose }) => {
  const { activePage, setActivePage, enabledModules, rolePermissions, currentUser, handleLogout } = useApp();

  if (!isOpen) return null;

  const moreItems = filterAdminNavItems(
    adminNavItems.filter((item) => !adminPrimaryNavIds.includes(item.id)),
    enabledModules,
    rolePermissions,
    currentUser
  );

  const goTo = (id) => {
    setActivePage(id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end md:hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 animate-in fade-in duration-150"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="relative bg-white rounded-t-2xl shadow-2xl max-h-[75vh] flex flex-col animate-in slide-in-from-bottom duration-200">
        <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-[#F2F4F7]">
          <h3 className="text-sm font-bold text-[#172033]">More</h3>
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="p-1.5 text-[#98A2B3] hover:text-[#172033] rounded-lg hover:bg-[#F8FAFC] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto py-2">
          <button
            onClick={() => goTo(adminProfileNavItem.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors ${
              activePage === adminProfileNavItem.id
                ? 'text-[#004898] bg-[#F0F7FF]'
                : 'text-[#344054] hover:bg-[#F8FAFC]'
            }`}
          >
            <adminProfileNavItem.icon className="w-5 h-5" />
            <span>{adminProfileNavItem.label}</span>
          </button>

          {moreItems.map((item) => (
            <button
              key={item.id}
              onClick={() => goTo(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors ${
                activePage === item.id
                  ? 'text-[#004898] bg-[#F0F7FF]'
                  : 'text-[#344054] hover:bg-[#F8FAFC]'
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        <div className="shrink-0 border-t border-[#F2F4F7] p-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <button
            onClick={() => { onClose(); handleLogout(); }}
            className="w-full flex items-center justify-center gap-2 rounded-md text-sm font-semibold text-[#F04438] hover:bg-[#FEF3F2] border border-[#FECDCA] px-3 py-2.5 transition-all"
          >
            <LogOut className="w-4 h-4" />
            <span>Log out</span>
          </button>
        </div>
      </div>
    </div>
  );
};
