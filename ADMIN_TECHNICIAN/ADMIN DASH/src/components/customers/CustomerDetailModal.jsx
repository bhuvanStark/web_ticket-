import React from 'react';
import { useApp } from '../../context/AppContext';
import { X, Building2, MapPin, Tv, Mail, Phone, CheckCircle2, AlertCircle } from 'lucide-react';
import { StatusBadge } from '../common/Badge';

export const CustomerDetailModal = () => {
  const {
    selectedCustomer,
    setSelectedCustomerId,
    locations,
    rooms,
    equipment,
    tickets,
    setSelectedTicketId,
    setActivePage
  } = useApp();

  if (!selectedCustomer) return null;

  const c = selectedCustomer;

  // Filtered relational data for this customer
  const customerLocations = locations.filter(l => l.customerId === c.id || l.customerName === c.name);
  const customerRooms = rooms.filter(r => r.customerId === c.id || r.customerName === c.name);
  const customerEquipment = equipment.filter(e => e.customerName === c.name);
  const customerTickets = tickets.filter(t => t.customerId === c.id || t.customer === c.name);
  const activeTickets = customerTickets.filter(t => t.status !== 'Closed' && t.status !== 'Resolved');

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl border border-[#E4E7EC] overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-6 border-b border-[#E4E7EC] bg-[#F8FAFC] flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <img src={c.avatar || "https://images.unsplash.com/photo-1560179707-f14e90ef3623?w=150&auto=format&fit=crop&q=80"} alt={c.name} className="w-14 h-14 rounded-xl object-cover border border-[#D0D5DD] shadow-sm" />
            <div>
              <h2 className="text-2xl font-extrabold text-[#172033] tracking-tight">{c.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs font-semibold text-[#667085]">{c.industry || 'Enterprise Technology'}</span>
                <span className="text-[#D0D5DD]">&bull;</span>
                <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold border bg-[#EFF5FC] text-[#004898] border-[#B3D1F2]">
                  {c.status || c.sla_tier || 'Active SLA'}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={() => setSelectedCustomerId(null)}
            className="p-2 text-[#667085] hover:text-[#172033] hover:bg-white rounded-lg transition-all border border-transparent hover:border-[#E4E7EC] shadow-none hover:shadow-xs"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Dashboard Body - Two Column Layout */}
        <div className="flex-1 overflow-y-auto bg-white flex flex-col md:flex-row">
          
          {/* LEFT COLUMN: Profile & Stats */}
          <div className="w-full md:w-[35%] border-r border-[#E4E7EC] bg-[#F8FAFC] p-6 space-y-8">
            
            {/* Key Contact */}
            <div className="space-y-4">
              <h3 className="text-xs font-extrabold text-[#475467] uppercase tracking-wider">Primary Contact</h3>
              <div className="bg-white p-4 rounded-xl border border-[#E4E7EC] shadow-xs space-y-3">
                <div>
                  <h4 className="font-bold text-sm text-[#172033]">{c.contactPerson || 'Alex Rivera'}</h4>
                  <p className="text-xs text-[#004898] font-semibold">{c.role || 'IT & Workplace Director'}</p>
                </div>
                <div className="space-y-2 pt-3 border-t border-[#F2F4F7]">
                  <a href={`mailto:${c.email}`} className="flex items-center gap-2 text-xs text-[#475467] hover:text-[#004898] transition-colors">
                    <Mail className="w-3.5 h-3.5 text-[#98A2B3]" /> 
                    <span className="truncate">{c.email || 'contact@company.com'}</span>
                  </a>
                  <a href={`tel:${c.phone}`} className="flex items-center gap-2 text-xs text-[#475467] hover:text-[#004898] transition-colors">
                    <Phone className="w-3.5 h-3.5 text-[#98A2B3]" /> 
                    <span>{c.phone || '+91 98450 12345'}</span>
                  </a>
                  <div className="flex items-center gap-2 text-xs text-[#475467] pt-1">
                    <Building2 className="w-3.5 h-3.5 text-[#98A2B3]" /> 
                    <span className="truncate">{c.headquarters || 'Bengaluru HQ'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* AV Infrastructure Stats */}
            <div className="space-y-4">
              <h3 className="text-xs font-extrabold text-[#475467] uppercase tracking-wider">Infrastructure Health</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white p-4 rounded-xl border border-[#E4E7EC] shadow-xs text-center flex flex-col items-center justify-center">
                  <span className="text-2xl font-extrabold text-[#172033]">{customerLocations.length || c.locationsCount || 3}</span>
                  <span className="text-[10px] font-bold text-[#667085] uppercase tracking-wide mt-1">Locations</span>
                </div>
                <div className="bg-white p-4 rounded-xl border border-[#E4E7EC] shadow-xs text-center flex flex-col items-center justify-center">
                  <span className="text-2xl font-extrabold text-[#004898]">{customerRooms.length || c.totalRooms || 26}</span>
                  <span className="text-[10px] font-bold text-[#667085] uppercase tracking-wide mt-1">Rooms</span>
                </div>
                <div className="bg-white p-4 rounded-xl border border-[#E4E7EC] shadow-xs text-center flex flex-col items-center justify-center">
                  <span className="text-2xl font-extrabold text-[#172033]">{customerEquipment.length || 45}</span>
                  <span className="text-[10px] font-bold text-[#667085] uppercase tracking-wide mt-1">AV Systems</span>
                </div>
                <div className={`p-4 rounded-xl border shadow-xs text-center flex flex-col items-center justify-center ${activeTickets.length > 0 ? 'bg-[#FEF0C7] border-[#FDE68A]' : 'bg-[#ECFDF3] border-[#A6F4C5]'}`}>
                  <span className={`text-2xl font-extrabold ${activeTickets.length > 0 ? 'text-[#B54708]' : 'text-[#027A48]'}`}>{activeTickets.length}</span>
                  <span className={`text-[10px] font-bold uppercase tracking-wide mt-1 ${activeTickets.length > 0 ? 'text-[#93370D]' : 'text-[#065F46]'}`}>Open Tickets</span>
                </div>
              </div>
            </div>

          </div>

          {/* RIGHT COLUMN: Actionable Data */}
          <div className="w-full md:w-[65%] p-6 space-y-8">
            
            {/* Active Service Requests */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-[#172033] flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-[#B54708]" />
                  Active Service Requests
                </h3>
                {activeTickets.length > 0 && (
                  <span className="text-xs text-[#004898] font-bold cursor-pointer hover:underline">View All</span>
                )}
              </div>
              
              {activeTickets.length === 0 ? (
                <div className="p-6 rounded-lg border border-dashed border-[#D0D5DD] bg-[#F8FAFC] text-center flex flex-col items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-[#12B76A] mb-2 opacity-80" />
                  <p className="text-sm font-bold text-[#172033]">All Clear</p>
                  <p className="text-xs text-[#667085] mt-1">No active service requests for this customer.</p>
                </div>
              ) : (
                <div className="border border-[#E4E7EC] rounded-lg bg-white overflow-hidden shadow-xs">
                  {activeTickets.slice(0, 4).map((t, index) => (
                    <div
                      key={t.id}
                      onClick={() => {
                        setSelectedCustomerId(null);
                        setSelectedTicketId(t.id);
                        setActivePage('requests');
                      }}
                      className={`p-3.5 hover:bg-[#F8FAFC] cursor-pointer transition-all flex items-center justify-between group ${
                        index !== activeTickets.slice(0, 4).length - 1 ? 'border-b border-[#E4E7EC]' : ''
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[#004898] text-xs">{t.id}</span>
                          <span className="font-bold text-[#172033] text-sm group-hover:text-[#004898] transition-colors">{t.title}</span>
                        </div>
                        <p className="text-xs text-[#667085] mt-1 flex items-center gap-1.5">
                          <MapPin className="w-3 h-3" /> {t.room} &bull; {t.location}
                        </p>
                      </div>
                      <StatusBadge status={t.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Locations & Rooms Summary */}
            <div className="space-y-4">
              <h3 className="text-sm font-extrabold text-[#172033] flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#004898]" />
                Registered Facilities & Rooms
              </h3>
              
              <div className="border border-[#E4E7EC] rounded-lg bg-white shadow-xs overflow-hidden">
                {customerLocations.length > 0 ? (
                  customerLocations.map((loc, index) => (
                    <div key={loc.id} className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      index !== customerLocations.length - 1 ? 'border-b border-[#E4E7EC]' : ''
                    }`}>
                      <div>
                        <h4 className="font-bold text-sm text-[#172033]">{loc.name}</h4>
                        <p className="text-[11px] text-[#667085] mt-0.5 max-w-sm">{loc.address}</p>
                      </div>
                      <div className="flex items-center gap-4 text-xs font-semibold shrink-0">
                        <span className="text-[#004898] bg-[#EFF5FC] px-2.5 py-1 rounded-md">{loc.roomsCount || 0} Rooms</span>
                        <span className="text-[#027A48] flex items-center gap-1 bg-[#ECFDF3] px-2.5 py-1 rounded-md"><CheckCircle2 className="w-3.5 h-3.5"/> Operational</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-6 bg-[#F8FAFC] text-center">
                    <p className="text-xs text-[#667085]">No locations configured yet.</p>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
};
