import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { X, Monitor, Wifi } from 'lucide-react';

export const AssignTechModal = () => {
  const {
    selectedTicket,
    isAssignModalOpen,
    setIsAssignModalOpen,
    setSelectedTicketId,
    technicians,
    assignTechnician
  } = useApp();

  // The admin picks the service mode here — it is stored on the ticket.
  const [mode, setMode] = useState('onsite'); // 'onsite' | 'remote'

  if (!isAssignModalOpen || !selectedTicket) return null;

  const handleClose = () => {
    setIsAssignModalOpen(false);
    setSelectedTicketId(null);
  };

  const assign = (techId) => {
    assignTechnician(selectedTicket.id, techId, mode);
    handleClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg rounded-xl shadow-2xl border border-[#E4E7EC] overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-[#E4E7EC] bg-[#F8FAFC] flex items-center justify-between">
          <div>
            <h3 className="font-extrabold text-base text-[#172033]">
              {selectedTicket.assignedTo ? `Reassign Technician (Was: ${selectedTicket.assignedTo})` : 'Assign Technician'}
            </h3>
            <p className="text-xs text-[#667085]">
              Ticket <span className="font-mono text-[#004898] font-bold">{selectedTicket.id}</span>
            </p>
          </div>
          <button onClick={handleClose} className="p-1 text-[#667085] hover:text-[#172033] rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Service mode toggle */}
        <div className="px-5 pt-4">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-[#667085] mb-2">Service Mode</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode('onsite')}
              className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-bold transition-all ${
                mode === 'onsite'
                  ? 'border-[#004898] bg-[#EFF5FC] text-[#004898]'
                  : 'border-[#E4E7EC] bg-white text-[#667085] hover:border-[#004898]'
              }`}
            >
              <Monitor className="w-4 h-4" />
              On-site
            </button>
            <button
              type="button"
              onClick={() => setMode('remote')}
              className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-bold transition-all ${
                mode === 'remote'
                  ? 'border-[#004898] bg-[#EFF5FC] text-[#004898]'
                  : 'border-[#E4E7EC] bg-white text-[#667085] hover:border-[#004898]'
              }`}
            >
              <Wifi className="w-4 h-4" />
              Remote
            </button>
          </div>
          <p className="text-[11px] text-[#98A2B3] mt-2">
            Pick the mode, then choose a technician to assign the job.
          </p>
        </div>

        {/* Technician list */}
        <div className="p-5 space-y-3 max-h-96 overflow-y-auto">
          {technicians.map((tech) => {
            const isSelected = selectedTicket.assignedTo === tech.name;
            return (
              <div
                key={tech.id}
                onClick={() => assign(tech.id)}
                className={`p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between group ${
                  isSelected
                    ? 'border-[#004898] bg-[#EFF5FC]'
                    : 'border-[#E4E7EC] bg-white hover:border-[#004898] hover:shadow-md'
                }`}
              >
                <div>
                  <h4 className="font-bold text-sm text-[#172033]">{tech.name}</h4>
                  <p className="text-xs text-[#667085]">
                    {[tech.role, tech.location].filter(Boolean).join(' • ') || 'Field Engineer'}
                  </p>
                </div>
                <div className="flex items-center">
                  {isSelected ? (
                    <span className="text-[10px] font-bold text-[#004898] bg-[#D6E6F7] px-2.5 py-1 rounded-md border border-[#B3D1F2]">
                      Assigned
                    </span>
                  ) : (
                    <div className="text-[11px] font-bold text-[#004898] bg-[#F6F8FB] group-hover:bg-[#004898] group-hover:text-white px-3 py-1.5 rounded-lg transition-all border border-[#E4E7EC] group-hover:border-[#004898]">
                      Assign ({mode === 'remote' ? 'Remote' : 'On-site'})
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
