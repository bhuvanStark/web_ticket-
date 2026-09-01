import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Search, X, Ticket, Users, MapPin, Tv, Wrench, ArrowRight } from 'lucide-react';
import { StatusBadge, PriorityBadge } from './Badge';

export const GlobalSearchModal = () => {
  const {
    isSearchOpen,
    setIsSearchOpen,
    tickets,
    customers,
    locations,
    rooms,
    equipment,
    technicians,
    setSelectedTicketId,
    setSelectedCustomerId,
    setSelectedRoomId,
    setSelectedTechId,
    setActivePage,
    role,
    globalSearchQuery,
    setGlobalSearchQuery
  } = useApp();

  const query = globalSearchQuery;
  const setQuery = setGlobalSearchQuery;

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
      if (e.key === 'Escape' && isSearchOpen) {
        setIsSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSearchOpen, setIsSearchOpen]);

  if (!isSearchOpen) return null;

  const q = query.trim().toLowerCase();

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
      )
    : tickets.slice(0, 3);

  const matchedCustomers = q
    ? customers.filter(c =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.industry || '').toLowerCase().includes(q) ||
        (c.contactPerson || '').toLowerCase().includes(q)
      )
    : customers.slice(0, 2);

  const matchedRooms = q
    ? rooms.filter(r =>
        (r.name || '').toLowerCase().includes(q) ||
        (r.customerName || '').toLowerCase().includes(q) ||
        (r.locationName || '').toLowerCase().includes(q)
      )
    : rooms.slice(0, 2);

  const matchedEquipment = q
    ? equipment.filter(e =>
        (e.brand || '').toLowerCase().includes(q) ||
        (e.model || '').toLowerCase().includes(q) ||
        (e.serialNumber || '').toLowerCase().includes(q) ||
        (e.category || '').toLowerCase().includes(q)
      )
    : equipment.slice(0, 2);

  const matchedTechs = q
    ? technicians.filter(t =>
        (t.name || '').toLowerCase().includes(q) ||
        (t.specialization || '').toLowerCase().includes(q) ||
        (t.location || '').toLowerCase().includes(q)
      )
    : technicians.slice(0, 2);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-start justify-center pt-16 px-4">
      <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl border border-[#E4E7EC] overflow-hidden flex flex-col max-h-[80vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Search Header */}
        <div className="p-4 border-b border-[#E4E7EC] flex items-center gap-3 bg-[#F8FAFC]">
          <Search className="w-5 h-5 text-[#004898]" />
          <input
            type="text"
            placeholder="Search ticket #, customer, room, equipment, serial #, technician..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            className="w-full bg-transparent border-none outline-none text-base font-semibold text-[#172033] placeholder-[#98A2B3]"
          />
          <button
            onClick={() => setIsSearchOpen(false)}
            className="p-1 text-[#667085] hover:text-[#172033] rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Results Scroll Area */}
        <div className="p-4 overflow-y-auto space-y-5 flex-1">
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
                      setIsSearchOpen(false);
                    }}
                    className="p-3 rounded-lg border border-[#E4E7EC] hover:border-[#004898] hover:bg-[#EFF5FC] cursor-pointer transition-all flex items-center justify-between group"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-xs text-[#004898]">{t.id}</span>
                        <h4 className="font-semibold text-xs text-[#172033]">{t.title}</h4>
                        <PriorityBadge priority={t.priority} />
                      </div>
                      <div className="text-[11px] text-[#667085]">
                        {t.customer} • {t.location} • {t.room}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={t.status} />
                      <ArrowRight className="w-4 h-4 text-[#98A2B3] group-hover:text-[#004898]" />
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {matchedCustomers.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => {
                      setSelectedCustomerId(c.id);
                      setActivePage('customers');
                      setIsSearchOpen(false);
                    }}
                    className="p-2.5 rounded-lg border border-[#E4E7EC] hover:border-[#004898] hover:bg-[#EFF5FC] cursor-pointer transition-all flex items-center gap-3"
                  >
                    <img src={c.avatar} alt={c.name} className="w-8 h-8 rounded-lg object-cover" />
                    <div>
                      <h4 className="font-bold text-xs text-[#172033]">{c.name}</h4>
                      <p className="text-[10px] text-[#667085]">{c.totalRooms} Rooms • {c.headquarters}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Rooms & Equipment */}
          {matchedEquipment.length > 0 && (
            <div>
              <div className="text-[11px] font-bold text-[#667085] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Tv className="w-3.5 h-3.5 text-[#004898]" />
                <span>AV Equipment ({matchedEquipment.length})</span>
              </div>
              <div className="space-y-1.5">
                {matchedEquipment.map((eq) => (
                  <div
                    key={eq.id}
                    onClick={() => {
                      setSelectedRoomId(eq.roomId);
                      setActivePage('rooms');
                      setIsSearchOpen(false);
                    }}
                    className="p-2.5 rounded-lg border border-[#E4E7EC] hover:border-[#004898] hover:bg-[#EFF5FC] cursor-pointer transition-all flex items-center justify-between"
                  >
                    <div>
                      <div className="font-bold text-xs text-[#172033]">{eq.brand} {eq.model}</div>
                      <div className="text-[11px] text-[#667085]">
                        S/N: <span className="font-mono text-[#004898] font-bold">{eq.serialNumber}</span> • {eq.roomName} ({eq.customerName})
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

          {/* Technicians */}
          {role === 'admin' && matchedTechs.length > 0 && (
            <div>
              <div className="text-[11px] font-bold text-[#667085] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Wrench className="w-3.5 h-3.5 text-[#004898]" />
                <span>Technicians ({matchedTechs.length})</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {matchedTechs.map((tech) => (
                  <div
                    key={tech.id}
                    onClick={() => {
                      setSelectedTechId(tech.id);
                      setActivePage('technicians');
                      setIsSearchOpen(false);
                    }}
                    className="p-2.5 rounded-lg border border-[#E4E7EC] hover:border-[#004898] hover:bg-[#EFF5FC] cursor-pointer transition-all flex items-center gap-3"
                  >
                    <img src={tech.avatar} alt={tech.name} className="w-8 h-8 rounded-full object-cover" />
                    <div>
                      <h4 className="font-bold text-xs text-[#172033]">{tech.name}</h4>
                      <p className="text-[10px] text-[#667085]">{tech.role} • {tech.location}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {q && matchedTickets.length === 0 && matchedCustomers.length === 0 && matchedEquipment.length === 0 && (
            <div className="py-8 text-center text-[#667085]">
              <Search className="w-8 h-8 mx-auto mb-2 text-[#98A2B3]" />
              <p className="text-sm font-semibold">No results found for "{query}"</p>
              <p className="text-xs text-[#98A2B3] mt-1">Try searching by ticket #, serial number, room, or customer name.</p>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-4 py-2.5 bg-[#F8FAFC] border-t border-[#E4E7EC] flex items-center justify-between text-[11px] text-[#667085]">
          <span>Tip: Press <kbd className="bg-white border rounded px-1 text-[#172033]">ESC</kbd> to close</span>
          <span>TaskTel AV Global Index</span>
        </div>
      </div>
    </div>
  );
};
