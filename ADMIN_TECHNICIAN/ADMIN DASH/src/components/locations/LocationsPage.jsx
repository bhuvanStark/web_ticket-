import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Search, MapPin, Building2, Tv, Eye, X } from 'lucide-react';
import { TableSkeleton } from '../common/SkeletonLoader';

export const LocationsPage = () => {
  const { locations, setSelectedRoomId, setSelectedCustomerId, simulatedLoading } = useApp();
  const [search, setSearch] = useState('');
  const [selectedLoc, setSelectedLoc] = useState(null);

  if (simulatedLoading) return <TableSkeleton rows={4} />;

  const filtered = locations.filter(l =>
    l.name.toLowerCase().includes(search.toLowerCase()) ||
    l.customerName.toLowerCase().includes(search.toLowerCase()) ||
    l.city.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-[#172033] tracking-tight">Locations</h2>
          <p className="text-xs md:text-sm text-[#667085] mt-0.5">
            Customer facility sites, addresses, room configurations and field contacts.
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="card p-4 bg-white">
        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-[#98A2B3] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
          <input
            type="text"
            placeholder="Search location, city or customer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: '40px' }}
            className="form-input text-xs"
          />
        </div>
      </div>

      {/* Grid of Locations */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(loc => (
          <div key={loc.id} className="card p-5 space-y-4 hover:border-[#004898] transition-all flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#004898] uppercase tracking-wider flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5" />
                  {loc.customerName}
                </span>
                <span className="badge badge-assigned text-[10px]">{loc.status}</span>
              </div>
              <h3 className="font-extrabold text-base text-[#172033]">{loc.name}</h3>
              <p className="text-xs text-[#667085] line-clamp-2">{loc.address}</p>
            </div>

            <div className="pt-3 border-t border-[#E4E7EC] space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[#667085]">Configured Rooms:</span>
                <span className="font-bold text-[#172033]">{loc.roomsCount} Rooms</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#667085]">Site Contact:</span>
                <span className="font-bold text-[#004898]">{loc.contactPerson}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#667085]">Open Requests:</span>
                <span className={`font-bold ${loc.openRequests > 0 ? 'text-[#B54708]' : 'text-[#027A48]'}`}>
                  {loc.openRequests} Active
                </span>
              </div>
            </div>

            <button
              onClick={() => setSelectedLoc(loc)}
              className="w-full mt-2 btn btn-secondary btn-sm flex justify-center text-xs"
            >
              <Eye className="w-3.5 h-3.5 text-[#004898]" />
              <span>View Location Details</span>
            </button>
          </div>
        ))}
      </div>

      {/* Location Details Modal */}
      {selectedLoc && (
        <LocationDetailModal loc={selectedLoc} onClose={() => setSelectedLoc(null)} />
      )}
    </div>
  );
};

const LocationDetailModal = ({ loc, onClose }) => {
  const { rooms, equipment, tickets } = useApp();

  const locRooms = rooms.filter(r => r.locationId === loc.id || r.locationName === loc.name);
  const locEquipment = equipment.filter(e => e.locationName === loc.name);
  const locTickets = tickets.filter(t => t.locationId === loc.id || t.location === loc.name);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl border border-[#E4E7EC] overflow-hidden">
        <div className="p-5 border-b border-[#E4E7EC] bg-[#F8FAFC] flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-[#004898] uppercase">{loc.customerName}</span>
            <h3 className="font-extrabold text-lg text-[#172033]">{loc.name}</h3>
          </div>
          <button onClick={onClose} className="p-1 text-[#667085] hover:text-[#172033]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          <div className="p-4 rounded-xl bg-[#F6F8FB] border text-xs space-y-1">
            <span className="font-bold text-[#344054]">Full Facility Address:</span>
            <p className="text-[#172033]">{loc.address}</p>
            <div className="pt-2 text-[#004898] font-semibold">
              Contact: {loc.contactPerson} ({loc.phone})
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="font-bold text-xs uppercase tracking-wider text-[#667085]">
              Installed Rooms & AV Systems ({locRooms.length})
            </h4>
            <div className="space-y-1.5">
              {locRooms.map(r => (
                <div key={r.id} className="p-3 rounded-lg border bg-white text-xs flex items-center justify-between">
                  <div>
                    <h5 className="font-bold text-[#172033]">{r.name}</h5>
                    <p className="text-[#667085]">{r.roomType}</p>
                  </div>
                  <span className="badge badge-assigned">{r.installedSystems.length} Systems</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4 bg-[#F8FAFC] border-t flex justify-end">
          <button onClick={onClose} className="btn btn-primary btn-sm">Close Location</button>
        </div>
      </div>
    </div>
  );
};
