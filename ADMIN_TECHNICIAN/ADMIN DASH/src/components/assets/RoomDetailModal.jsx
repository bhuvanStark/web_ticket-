import React from 'react';
import { useApp } from '../../context/AppContext';
import {
  X,
  Tv,
  MapPin,
  Building2,
  Wrench,
  PlusCircle,
  History,
  CheckCircle2,
  Ticket
} from 'lucide-react';
import { StatusBadge } from '../common/Badge';

export const RoomDetailModal = () => {
  const {
    selectedRoom,
    setSelectedRoomId,
    equipment,
    tickets,
    setIsCreateTicketOpen,
    setSelectedTicketId,
    setActivePage
  } = useApp();

  if (!selectedRoom) return null;

  const rm = selectedRoom;

  const roomEquipment = equipment.filter(e => e.roomId === rm.id || e.roomName === rm.name);
  const roomTickets = tickets.filter(t => t.roomId === rm.id || t.room === rm.name);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-3xl rounded-xl shadow-2xl border border-[#E4E7EC] overflow-hidden my-8 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-[#E4E7EC] bg-[#F8FAFC] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#004898] text-white flex items-center justify-center font-bold">
              <Tv className="w-6 h-6" />
            </div>
            <div>
              <div className="text-[11px] font-bold text-[#004898] uppercase tracking-wider">
                {rm.customerName} • {rm.locationName}
              </div>
              <h2 className="text-xl font-extrabold text-[#172033]">{rm.name}</h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setSelectedRoomId(null);
                setIsCreateTicketOpen(true);
              }}
              className="btn btn-primary btn-sm"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Create Service Request</span>
            </button>
            <button
              onClick={() => setSelectedRoomId(null)}
              className="p-1.5 text-[#667085] hover:text-[#172033] rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-white">
          {/* Room Specs Banner */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-xl bg-[#F6F8FB] border border-[#E4E7EC] text-xs">
            <div>
              <span className="text-[#667085] font-medium block">Room Type:</span>
              <strong className="text-[#172033] font-bold text-sm">{rm.roomType}</strong>
            </div>
            <div>
              <span className="text-[#667085] font-medium block">Location:</span>
              <strong className="text-[#172033] font-bold text-sm">{rm.locationName}</strong>
            </div>
            <div>
              <span className="text-[#667085] font-medium block">Health Status:</span>
              <span className={`badge mt-1 ${rm.openRequestsCount > 0 ? 'badge-unassigned' : 'badge-resolved'}`}>
                {rm.status}
              </span>
            </div>
          </div>

          {/* Installed Systems Breakdown */}
          <div className="space-y-3">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#004898] flex items-center gap-1.5">
              <Tv className="w-4 h-4" />
              Installed Systems Breakdown
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {rm.installedSystems.map((sys, idx) => {
                const item = roomEquipment.find(e => e.category === sys) || roomEquipment[idx];
                return (
                  <div key={idx} className="p-3.5 rounded-xl border border-[#E4E7EC] bg-[#F8FAFC] space-y-1">
                    <span className="text-[10px] font-bold text-[#004898] uppercase tracking-wider block">
                      {sys}
                    </span>
                    <h4 className="font-bold text-xs text-[#172033]">
                      {item ? `${item.brand} ${item.model}` : `Standard ${sys} System`}
                    </h4>
                    {item && (
                      <div className="text-[11px] text-[#667085]">
                        S/N: <span className="font-mono text-[#004898] font-bold">{item.serialNumber}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Service History Section (Required by prompt) */}
          <div className="space-y-3">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#004898] flex items-center gap-1.5">
              <History className="w-4 h-4" />
              Room Service History
            </h3>

            <div className="space-y-2">
              {roomTickets.length === 0 ? (
                <div className="p-4 rounded-lg bg-[#F8FAFC] border border-[#E4E7EC] text-xs text-[#667085] text-center">
                  No service tickets logged for this room yet.
                </div>
              ) : (
                roomTickets.map(t => (
                  <div
                    key={t.id}
                    onClick={() => {
                      setSelectedRoomId(null);
                      setSelectedTicketId(t.id);
                      setActivePage('requests');
                    }}
                    className="p-3.5 rounded-lg border border-[#E4E7EC] hover:border-[#004898] hover:bg-[#EFF5FC] cursor-pointer transition-all flex items-center justify-between text-xs group"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#004898] font-mono">{t.id}</span>
                        <h4 className="font-bold text-[#172033] group-hover:text-[#004898]">{t.title}</h4>
                      </div>
                      <p className="text-[#667085] mt-0.5">
                        Created: {t.createdDate} • Tech: {t.assignedTo || 'Unassigned'}
                      </p>
                    </div>
                    <StatusBadge status={t.status} />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-[#F8FAFC] border-t border-[#E4E7EC] flex justify-end gap-2">
          <button onClick={() => setSelectedRoomId(null)} className="btn btn-primary btn-sm">
            Close Room View
          </button>
        </div>
      </div>
    </div>
  );
};
