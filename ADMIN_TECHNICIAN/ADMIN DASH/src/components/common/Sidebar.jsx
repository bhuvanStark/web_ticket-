import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Avatar } from './Avatar';
import {
  LayoutDashboard,
  Ticket,
  Users,
  MapPin,
  Tv,
  Wrench,
  Calendar,
  History,
  BarChart3,
  Settings,
  User,
  LogOut,
  ShieldAlert,
  BellRing,
  HardHat,
  Layers,
  Package,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Eye,
  EyeOff,
  ArrowLeft
} from 'lucide-react';

export const Sidebar = () => {
  const {
    role, baseRole, switchRole, activePage, setActivePage, currentUser, handleLogout,
    isSidebarCollapsed, setIsSidebarCollapsed, enabledModules, rolePermissions,
    tickets, customers, rooms, technicians, verifyTechnicianPassword,
    setSelectedTicketId, setSelectedCustomerId, setSelectedRoomId, setSelectedTechId
  } = useApp();

  const [showTechSelector, setShowTechSelector] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  // "View as technician" password gate. Selecting a technician from either
  // picker opens this modal; the switch only happens once their password checks
  // out against the backend.
  const [pendingTech, setPendingTech] = useState(null);
  const [techPassword, setTechPassword] = useState('');
  const [showTechPassword, setShowTechPassword] = useState(false);
  const [techAuthError, setTechAuthError] = useState('');
  const [techAuthLoading, setTechAuthLoading] = useState(false);

  const requestTechSwitch = (tech) => {
    setShowProfileMenu(false);
    setShowTechSelector(false);
    setTechPassword('');
    setShowTechPassword(false);
    setTechAuthError('');
    setPendingTech(tech);
  };

  const cancelTechSwitch = () => {
    setPendingTech(null);
    setTechPassword('');
    setShowTechPassword(false);
    setTechAuthError('');
    setTechAuthLoading(false);
  };

  const confirmTechSwitch = async (e) => {
    e.preventDefault();
    if (!pendingTech || techAuthLoading) return;
    setTechAuthLoading(true);
    setTechAuthError('');
    try {
      await verifyTechnicianPassword(pendingTech.id, techPassword);
      const tech = pendingTech;
      cancelTechSwitch();
      switchRole('tech', tech);
    } catch (err) {
      setTechAuthError(err?.message || 'Incorrect password. Please try again.');
      setTechAuthLoading(false);
    }
  };

  const handleNavigation = (pageId) => {
    // Clear global modal selections when navigating away via sidebar
    if (setSelectedTicketId) setSelectedTicketId(null);
    if (setSelectedCustomerId) setSelectedCustomerId(null);
    if (setSelectedRoomId) setSelectedRoomId(null);
    if (setSelectedTechId) setSelectedTechId(null);
    setActivePage(pageId);
  };

  const adminNavItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'approvals', label: 'Approvals & Alerts', icon: BellRing, module: 'approvals' },
    { id: 'requests', label: 'Service Requests', icon: Ticket, module: 'requests' },
    { id: 'customers', label: 'Customers', icon: Users, module: 'customers' },
    { id: 'rooms', label: 'Rooms & Equipment', icon: Tv, module: 'rooms' },
    { id: 'technicians', label: 'Technicians', icon: Wrench, module: 'technicians' },
    { id: 'installations', label: 'Onsite Installations', icon: Layers, module: 'installations' },
    { id: 'inventory', label: 'Spare Parts Stock', icon: Package, module: 'inventory' },
    { id: 'demos', label: 'Demo Management', icon: Sparkles, module: 'demos' },
    { id: 'calendar', label: 'Service Calendar', icon: Calendar, module: 'calendar' },
    { id: 'history', label: 'Service History', icon: History, module: 'history' },
    { id: 'reports', label: 'Reports', icon: BarChart3, module: 'reports' },
    { id: 'staff', label: 'Admin Roles', icon: ShieldAlert },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const techNavItems = [
    { id: 'my-dashboard', label: 'My Dashboard', icon: LayoutDashboard },
    { id: 'my-jobs', label: 'My Jobs', icon: Ticket, module: 'requests' },
    { id: 'demos', label: 'Demo Management', icon: Sparkles, module: 'demos' },
    { id: 'installations', label: 'Onsite Installations', icon: Layers, module: 'installations' },
    { id: 'calendar', label: 'Service Calendar', icon: Calendar, module: 'calendar' },
    { id: 'history', label: 'Service History', icon: History, module: 'history' },
  ];

  const allNavItems = role === 'admin' ? adminNavItems : techNavItems;
  const navItems = allNavItems.filter(item => {
    // 1. Module enabled check
    if (item.module && !enabledModules[item.module]) return false;
    
    // 2. Role permission check (only for admins)
    if (role === 'admin' && rolePermissions && currentUser && currentUser.role) {
      const userPerms = rolePermissions[currentUser.role];
      if (userPerms && item.id in userPerms && !userPerms[item.id]) {
        return false;
      }
    }
    return true;
  });

  return (
    <aside className={`bg-white border-r border-[#E4E7EC] flex flex-col h-screen sticky top-0 z-40 select-none shadow-xs transition-all duration-300 relative ${isSidebarCollapsed ? 'w-20' : 'w-64'}`}>
      
      {/* Collapse Toggle Button */}
      <button 
        onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        className="absolute -right-3.5 top-7 bg-white border border-[#E4E7EC] shadow-sm rounded-full p-1 z-30 text-[#667085] hover:text-[#004898] hover:border-[#004898] transition-colors"
      >
        {isSidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>

      {/* FIXED TOP: Brand Header & Role Switcher */}
      <div className="shrink-0 flex flex-col">
        {/* Brand Header with Official TaskTel Logo */}
        <div className={`p-4 border-b border-[#F2F4F7] flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
          <div className="flex items-center gap-3">
            {isSidebarCollapsed ? (
              <div className="w-10 h-10 bg-[#004898] rounded-xl flex items-center justify-center">
                <img src={`${import.meta.env.BASE_URL}tasktel-logo.png`} alt="TaskTel AV Logo" className="h-6 object-contain invert brightness-0" />
              </div>
            ) : (
              <img
                src={`${import.meta.env.BASE_URL}tasktel-logo.png`}
                alt="TaskTel AV Logo"
                className="h-10 object-contain transition-all"
              />
            )}
          </div>
        </div>

        {/* Role Switcher — only for accounts that signed in through the admin
            portal. A technician login has no admin view to switch to. */}
        {baseRole === 'admin' && (
          <div className={`px-4 pt-4 pb-2 ${isSidebarCollapsed ? 'hidden' : 'block'}`}>
            <div className="p-2.5 rounded-lg bg-[#F6F8FB] border border-[#E4E7EC]">
              <div className="text-[11px] font-bold text-[#667085] uppercase tracking-wider mb-1 flex items-center justify-between">
                <span>Active View Role</span>
                {role === 'admin' ? (
                  <ShieldAlert className="w-3.5 h-3.5 text-[#004898]" />
                ) : (
                  <HardHat className="w-3.5 h-3.5 text-[#12B76A]" />
                )}
              </div>
              <div className="flex items-center justify-between bg-white rounded-md p-1 border border-[#E4E7EC]">
                <button
                  onClick={() => { if (role !== 'admin') switchRole('admin'); }}
                  disabled={role === 'admin'}
                  className={`flex-1 py-1 px-2 text-xs font-semibold rounded-md transition-all ${
                    role === 'admin'
                      ? 'bg-[#004898] text-white shadow-xs cursor-default'
                      : 'text-[#667085] hover:text-[#172033] cursor-pointer'
                  }`}
                >
                  Admin
                </button>
                <button
                  onClick={() => { if (role !== 'tech') handleNavigation('technicians'); }}
                  disabled={role === 'tech'}
                  className={`flex-1 py-1 px-2 text-xs font-semibold rounded-md transition-all ${
                    role === 'tech'
                      ? 'bg-[#004898] text-white shadow-xs cursor-default'
                      : 'text-[#667085] hover:text-[#172033] cursor-pointer'
                  }`}
                >
                  Technician
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SCROLLABLE MIDDLE: Navigation Links */}
      <div className="flex-1 overflow-y-auto">
        <nav className={`px-3 py-2 space-y-1 ${isSidebarCollapsed ? 'mt-4' : ''}`}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavigation(item.id)}
                title={isSidebarCollapsed ? item.label : ''}
                className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center py-3' : 'justify-between px-3 py-2.5'} rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-[#EFF5FC] text-[#004898] font-bold shadow-xs border-l-4 border-[#004898]'
                    : 'text-[#475467] hover:bg-[#F8FAFC] hover:text-[#172033] border-l-4 border-transparent'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-5 h-5 ${isActive ? 'text-[#004898]' : 'text-[#667085]'}`} />
                  {!isSidebarCollapsed && <span>{item.label}</span>}
                </div>
                {!isSidebarCollapsed && item.badge && (
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                      isActive
                        ? 'bg-[#004898] text-white'
                        : 'bg-[#F2F4F7] text-[#475467]'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* FIXED BOTTOM: User Profile & Logout Bottom Section */}
      <div className={`p-4 border-t border-[#F2F4F7] bg-[#FAFCFF] shrink-0 relative ${isSidebarCollapsed ? 'flex flex-col items-center gap-4' : ''}`}>
        <div
          onClick={() => role === 'tech' ? setShowProfileMenu(!showProfileMenu) : handleNavigation('profile')}
          className={`flex items-center gap-3 rounded-lg hover:bg-white cursor-pointer transition-all border border-transparent hover:border-[#E4E7EC] ${isSidebarCollapsed ? 'p-0' : 'p-2'}`}
          title={isSidebarCollapsed ? 'Settings / Profile' : ''}
        >
          <Avatar
            src={currentUser.avatar}
            name={currentUser.name}
            className="w-10 h-10"
          />
          {!isSidebarCollapsed && (
            <>
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-bold text-[#172033] truncate">{currentUser.name}</h4>
                <p className="text-[11px] text-[#667085] truncate">{currentUser.roleLabel}</p>
              </div>
              <ChevronRight className={`w-4 h-4 text-[#98A2B3] transition-transform ${showProfileMenu ? 'rotate-90' : ''}`} />
            </>
          )}
        </div>

        {/* Technician Switcher Dropdown - Show when in tech mode */}
        {role === 'tech' && showProfileMenu && !isSidebarCollapsed && (
          <div className="absolute bottom-16 left-4 right-4 bg-white border border-[#E4E7EC] rounded-lg shadow-lg z-40 max-h-64 overflow-y-auto">
            <div className="p-2 border-b border-[#F2F4F7] sticky top-0 bg-white">
              <button
                onClick={() => {
                  handleNavigation('profile');
                  setShowProfileMenu(false);
                }}
                className="w-full text-left px-3 py-2 hover:bg-[#F8FAFC] transition-colors text-sm font-semibold text-[#004898] border-b border-[#F2F4F7] pb-2"
              >
                👤 View My Profile
              </button>
            </div>
            <div className="p-2 border-b border-[#F2F4F7]">
              <p className="text-xs font-semibold text-[#667085] uppercase tracking-wide px-2 py-1">Switch Technician</p>
            </div>
            <div className="divide-y divide-[#F2F4F7]">
              {technicians && technicians.length > 0 ? (
                technicians.map((tech) => (
                  <button
                    key={tech.id}
                    onClick={() => requestTechSwitch(tech)}
                    className={`w-full text-left px-3 py-2 hover:bg-[#F8FAFC] transition-colors text-sm ${
                      currentUser.id === tech.id ? 'bg-[#EFF5FC] border-l-2 border-[#004898]' : ''
                    }`}
                  >
                    <div className="font-semibold text-[#172033]">{tech.full_name || tech.name}</div>
                    <div className="text-xs text-[#667085]">{tech.email}</div>
                  </button>
                ))
              ) : (
                <div className="px-3 py-2 text-xs text-[#667085]">No other technicians</div>
              )}
            </div>
          </div>
        )}


        {/* An admin viewing a technician's dashboard is still signed in as the
            admin, so the exit from this view is "return to my own dashboard",
            not "log out". A real technician login keeps the logout button. */}
        {baseRole === 'admin' && role === 'tech' ? (
          <button
            onClick={() => switchRole('admin')}
            title={isSidebarCollapsed ? 'Back to Admin' : ''}
            className={`mt-2 flex items-center justify-center gap-2 rounded-md text-xs font-semibold text-[#004898] hover:bg-[#EFF5FC] border border-[#B3D1F2] transition-all ${isSidebarCollapsed ? 'w-10 h-10 p-0' : 'w-full px-3 py-2'}`}
          >
            <ArrowLeft className="w-4 h-4" />
            {!isSidebarCollapsed && <span>Back to Admin</span>}
          </button>
        ) : (
          <button
            onClick={handleLogout}
            title={isSidebarCollapsed ? 'Log out' : ''}
            className={`mt-2 flex items-center justify-center gap-2 rounded-md text-xs font-semibold text-[#F04438] hover:bg-[#FEF3F2] border border-[#FECDCA] transition-all ${isSidebarCollapsed ? 'w-10 h-10 p-0' : 'w-full px-3 py-2'}`}
          >
            <LogOut className="w-4 h-4" />
            {!isSidebarCollapsed && <span>Log out</span>}
          </button>
        )}
      </div>

      {/* Technician Selector Modal */}
      {showTechSelector && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full mx-4 max-h-96 flex flex-col">
            <div className="p-4 border-b border-[#E4E7EC]">
              <h3 className="text-lg font-bold text-[#172033]">Select Technician</h3>
              <p className="text-sm text-[#667085] mt-1">Choose a technician to view as</p>
            </div>
            <div className="overflow-y-auto flex-1">
              {technicians && technicians.length > 0 ? (
                <div className="divide-y divide-[#F2F4F7]">
                  {technicians.map((tech) => (
                    <button
                      key={tech.id}
                      onClick={() => requestTechSwitch(tech)}
                      className="w-full text-left px-4 py-3 hover:bg-[#F8FAFC] transition-colors"
                    >
                      <div className="font-semibold text-[#172033]">{tech.full_name || tech.name}</div>
                      <div className="text-sm text-[#667085]">{tech.email}</div>
                      {tech.specialization && (
                        <div className="text-xs text-[#98A2B3] mt-1">{tech.specialization}</div>
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-4 text-center text-[#667085]">
                  No technicians available
                </div>
              )}
            </div>
            <div className="p-4 border-t border-[#E4E7EC] flex gap-2 justify-end">
              <button
                onClick={() => setShowTechSelector(false)}
                className="px-4 py-2 rounded-lg text-[#667085] hover:bg-[#F8FAFC] font-semibold text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password gate before viewing as a technician */}
      {pendingTech && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
          <form
            onSubmit={confirmTechSwitch}
            className="bg-white rounded-lg shadow-lg max-w-sm w-full mx-4"
          >
            <div className="p-4 border-b border-[#E4E7EC]">
              <h3 className="text-lg font-bold text-[#172033]">Confirm technician access</h3>
              <p className="text-sm text-[#667085] mt-1">
                Enter the password for{' '}
                <span className="font-semibold text-[#172033]">
                  {pendingTech.full_name || pendingTech.name}
                </span>{' '}
                to view their dashboard.
              </p>
            </div>
            <div className="p-4 space-y-2">
              <label className="block text-xs font-semibold text-[#667085] uppercase tracking-wide">
                Technician password
              </label>
              <div className="relative">
                <input
                  type={showTechPassword ? 'text' : 'password'}
                  autoFocus
                  value={techPassword}
                  onChange={(e) => { setTechPassword(e.target.value); setTechAuthError(''); }}
                  className="w-full px-3 py-2 pr-10 border border-[#D0D5DD] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004898]/30 focus:border-[#004898]"
                  placeholder="••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowTechPassword(v => !v)}
                  aria-label={showTechPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-[#98A2B3] hover:text-[#667085]"
                >
                  {showTechPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {techAuthError && (
                <p className="text-xs text-[#F04438] font-medium">{techAuthError}</p>
              )}
            </div>
            <div className="p-4 border-t border-[#E4E7EC] flex gap-2 justify-end">
              <button
                type="button"
                onClick={cancelTechSwitch}
                className="px-4 py-2 rounded-lg text-[#667085] hover:bg-[#F8FAFC] font-semibold text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={techAuthLoading || techPassword.length === 0}
                className="px-4 py-2 rounded-lg bg-[#004898] hover:bg-[#00346E] text-white font-semibold text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {techAuthLoading ? 'Verifying…' : 'Confirm'}
              </button>
            </div>
          </form>
        </div>
      )}
    </aside>
  );
};





