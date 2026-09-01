import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Avatar } from './Avatar';
import {
  Search,
  Bell,
  PlusCircle,
  Shield,
  HardHat,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  X,
  Ticket,
  Users,
  Tv,
  Wrench,
  ArrowRight
} from 'lucide-react';
import { StatusBadge, PriorityBadge } from '../common/Badge';

export const Header = () => {
  const {
    role,
    currentUser,
    notifications,
    tickets,
    customers,
    rooms,
    equipment,
    technicians,
    setSelectedTicketId,
    setSelectedCustomerId,
    setSelectedRoomId,
    setSelectedTechId,
    setActivePage,
    setIsSearchOpen,
    isNotificationsOpen,
    setIsNotificationsOpen,
    setIsCreateTicketOpen,
    simulatedLoading,
    setSimulatedLoading,
    simulatedError,
    setSimulatedError,
    showToast,
    globalSearchQuery,
    setGlobalSearchQuery
  } = useApp();

  const [isDropdownFocused, setIsDropdownFocused] = useState(false);
  const searchRef = useRef(null);

  const unreadCount = notifications.filter(n => (n.unread || !n.read) && (!n.role || n.role === role)).length;

  // Handle click outside to close header search dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setIsDropdownFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const q = (globalSearchQuery || '').trim().toLowerCase();

  // Search Results Matching Logic
  const matchedTickets = q
    ? tickets.filter(t =>
        (t.ticketNumber || '').toLowerCase().includes(q) ||
        (t.id || '').toLowerCase().includes(q) ||
        (t.title || '').toLowerCase().includes(q) ||
        (t.customer || '').toLowerCase().includes(q) ||
        (t.location || '').toLowerCase().includes(q) ||
        (t.room || '').toLowerCase().includes(q) ||
        (t.equipment || '').toLowerCase().includes(q) ||
        (t.assignedTo || '').toLowerCase().includes(q)
      ).slice(0, 4)
    : [];

  const matchedCustomers = q
    ? customers.filter(c =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.industry || '').toLowerCase().includes(q) ||
        (c.contactPerson || '').toLowerCase().includes(q)
      ).slice(0, 3)
    : [];

  const matchedEquipment = q
    ? equipment.filter(e =>
        (e.brand || '').toLowerCase().includes(q) ||
        (e.model || '').toLowerCase().includes(q) ||
        (e.serialNumber || '').toLowerCase().includes(q) ||
        (e.category || '').toLowerCase().includes(q)
      ).slice(0, 3)
    : [];

  const matchedTechs = q
    ? technicians.filter(t =>
        (t.name || '').toLowerCase().includes(q) ||
        (t.specialization || '').toLowerCase().includes(q) ||
        (t.location || '').toLowerCase().includes(q)
      ).slice(0, 3)
    : [];

  const totalResultsCount = matchedTickets.length + matchedCustomers.length + matchedEquipment.length + matchedTechs.length;

  return (
    <header className="h-14 bg-white border-b border-[#E4E7EC] px-8 flex items-center justify-between sticky top-0 z-20 shadow-xs">
      {/* Real Interactive Search Bar with Live Floating Dropdown */}
      <div className="flex items-center gap-4 flex-1 max-w-xl relative" ref={searchRef}>
        <div className="relative w-full">
          <Search className="w-4 h-4 text-[#004898] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
          <input
            type="text"
            value={globalSearchQuery}
            onChange={(e) => {
              setGlobalSearchQuery(e.target.value);
              setIsDropdownFocused(true);
            }}
            onFocus={() => setIsDropdownFocused(true)}
            placeholder="Search ticket #, customer, room, equipment, or technician..."
            style={{ paddingLeft: '40px' }}
            className="w-full bg-[#F6F8FB] border border-[#E4E7EC] rounded-lg pr-12 py-3 text-xs md:text-sm text-[#172033] font-medium placeholder-[#667085] focus:bg-white focus:border-[#004898] focus:ring-2 focus:ring-[#004898]/15 focus:outline-none transition-all shadow-xs"
          />
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {globalSearchQuery && (
              <button
                onClick={() => {
                  setGlobalSearchQuery('');
                  setIsDropdownFocused(false);
                }}
                className="p-1 text-[#98A2B3] hover:text-[#172033]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Live Search Results Floating Dropdown Panel */}
        {isDropdownFocused && q && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-2xl border border-[#E4E7EC] z-50 p-4 max-h-[75vh] overflow-y-auto space-y-4 animate-in fade-in slide-in-from-top-2 duration-150">
            {totalResultsCount === 0 ? (
              <div className="py-6 text-center text-[#667085]">
                <Search className="w-7 h-7 mx-auto mb-2 text-[#98A2B3]" />
                <p className="text-xs font-bold text-[#172033]">No results found for "{globalSearchQuery}"</p>
                <p className="text-[11px] text-[#98A2B3] mt-1">Try searching by ticket ID (e.g. #TT-10482), customer name, room, or serial #</p>
              </div>
            ) : (
              <>
                {/* Tickets Category */}
                {matchedTickets.length > 0 && (
                  <div>
                    <div className="text-[11px] font-bold text-[#667085] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Ticket className="w-3.5 h-3.5 text-[#004898]" />
                      <span>Service Requests ({matchedTickets.length})</span>
                    </div>
                    <div className="space-y-1.5">
                      {matchedTickets.map((t) => (
                        <div
                          key={t.id}
                          onClick={() => {
                            setSelectedTicketId(t.id);
                            setActivePage(role === 'admin' ? 'requests' : 'my-jobs');
                            setIsDropdownFocused(false);
                          }}
                          className="p-2.5 rounded-lg border border-[#E4E7EC] hover:border-[#004898] hover:bg-[#EFF5FC] cursor-pointer transition-all flex items-center justify-between group"
                        >
                          <div>
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="font-mono font-bold text-xs text-[#004898]">{t.id}</span>
                              <h4 className="font-bold text-xs text-[#172033]">{t.title}</h4>
                              <PriorityBadge priority={t.priority} />
                            </div>
                            <div className="text-[11px] text-[#667085]">
                              {t.customer} • {t.room} ({t.location})
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <StatusBadge status={t.status} />
                            <ArrowRight className="w-3.5 h-3.5 text-[#98A2B3] group-hover:text-[#004898]" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Customers Category */}
                {role === 'admin' && matchedCustomers.length > 0 && (
                  <div>
                    <div className="text-[11px] font-bold text-[#667085] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-[#004898]" />
                      <span>Customers ({matchedCustomers.length})</span>
                    </div>
                    <div className="space-y-1.5">
                      {matchedCustomers.map((c) => (
                        <div
                          key={c.id}
                          onClick={() => {
                            setSelectedCustomerId(c.id);
                            setActivePage('customers');
                            setIsDropdownFocused(false);
                          }}
                          className="p-2.5 rounded-lg border border-[#E4E7EC] hover:border-[#004898] hover:bg-[#EFF5FC] cursor-pointer transition-all flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2.5">
                            <Avatar src={c.avatar} name={c.name} className="w-7 h-7" />
                            <div>
                              <h4 className="font-bold text-xs text-[#172033]">{c.name}</h4>
                              <p className="text-[10px] text-[#667085]">{c.industry} • {c.headquarters}</p>
                            </div>
                          </div>
                          <span className="text-[10px] font-bold text-[#004898] bg-[#EFF5FC] px-2 py-0.5 rounded">
                            {c.totalRooms} Rooms
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Equipment Category */}
                {matchedEquipment.length > 0 && (
                  <div>
                    <div className="text-[11px] font-bold text-[#667085] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Tv className="w-3.5 h-3.5 text-[#004898]" />
                      <span>AV Hardware & Serial # ({matchedEquipment.length})</span>
                    </div>
                    <div className="space-y-1.5">
                      {matchedEquipment.map((eq) => (
                        <div
                          key={eq.id}
                          onClick={() => {
                            setSelectedRoomId(eq.roomId);
                            setActivePage('rooms');
                            setIsDropdownFocused(false);
                          }}
                          className="p-2.5 rounded-lg border border-[#E4E7EC] hover:border-[#004898] hover:bg-[#EFF5FC] cursor-pointer transition-all flex items-center justify-between"
                        >
                          <div>
                            <div className="font-bold text-xs text-[#172033]">{eq.brand} {eq.model}</div>
                            <div className="text-[11px] text-[#667085]">
                              S/N: <span className="font-mono text-[#004898] font-bold">{eq.serialNumber}</span> • {eq.roomName}
                            </div>
                          </div>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#F2F4F7] text-[#344054]">
                            {eq.category}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Technicians Category */}
                {role === 'admin' && matchedTechs.length > 0 && (
                  <div>
                    <div className="text-[11px] font-bold text-[#667085] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Wrench className="w-3.5 h-3.5 text-[#004898]" />
                      <span>Field Technicians ({matchedTechs.length})</span>
                    </div>
                    <div className="space-y-1.5">
                      {matchedTechs.map((tech) => (
                        <div
                          key={tech.id}
                          onClick={() => {
                            setSelectedTechId(tech.id);
                            setActivePage('technicians');
                            setIsDropdownFocused(false);
                          }}
                          className="p-2.5 rounded-lg border border-[#E4E7EC] hover:border-[#004898] hover:bg-[#EFF5FC] cursor-pointer transition-all flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2.5">
                            <Avatar src={tech.avatar} name={tech.name} className="w-7 h-7" />
                            <div>
                              <h4 className="font-bold text-xs text-[#172033]">{tech.name}</h4>
                              <p className="text-[10px] text-[#667085]">{tech.role} • {tech.location}</p>
                            </div>
                          </div>
                          <span className="text-[10px] font-bold text-[#027A48] bg-[#ECFDF3] px-2 py-0.5 rounded">
                            {tech.availability}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-3">

        {/* Notification Bell */}
        <div className="relative">
          <button
            onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
            className="p-2 text-[#667085] hover:text-[#004898] hover:bg-[#F6F8FB] rounded-lg transition-all relative border border-[#E4E7EC]"
            title="Notifications"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#F04438] text-white font-extrabold text-[10px] rounded-full flex items-center justify-center border-2 border-white">
                {unreadCount}
              </span>
            )}
          </button>
        </div>

        {/* User Identity Pill */}
        <div className="flex items-center gap-2 pl-2 border-l border-[#E4E7EC]">
          <div className="text-right hidden sm:block">
            <div className="text-xs font-bold text-[#172033] leading-tight">{currentUser.name}</div>
            <div className="text-[10px] text-[#667085] font-medium flex items-center justify-end gap-1">
              {role === 'admin' ? (
                <span className="text-[#004898] font-bold">Admin Coordinator</span>
              ) : (
                <span className="text-[#12B76A] font-bold">Field Technician</span>
              )}
            </div>
          </div>
          <Avatar src={currentUser.avatar} name={currentUser.name} className="w-8 h-8" />
        </div>
      </div>
    </header>
  );
};
