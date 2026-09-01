import React from 'react';
import { X, Calendar, Clock, MapPin, UserCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const DispatchModal = ({ isOpen, onClose, currentDate }) => {
  const { technicians, assignTechnicianToSlot, tickets } = useApp();
  const [selectedTechId, setSelectedTechId] = React.useState(null);

  // Generate a stable demo ID while the modal is open (MUST BE BEFORE EARLY RETURN)
  const demoTicketId = React.useMemo(() => `#TT-${Math.floor(Math.random() * 90000) + 10000}`, [isOpen]);

  if (!isOpen) return null;

  const unassignedTicket = tickets.find(t => t.status === 'Unassigned' || t.status === 'New');
  const dispatchTicketId = unassignedTicket ? unassignedTicket.id : demoTicketId;

  const handleDispatch = () => {
    if (selectedTechId) {
      assignTechnicianToSlot(dispatchTicketId, selectedTechId, '01:30 PM', currentDate);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200" onClick={(e) => e.stopPropagation()}>
        
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#E4E7EC] flex items-center justify-between bg-[#F8FAFC]">
          <div>
            <h3 className="text-base font-extrabold text-[#172033]">Dispatch Unassigned Ticket</h3>
            <p className="text-xs text-[#667085] mt-0.5">Assign technician for customer-scheduled request</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 hover:bg-[#E4E7EC] rounded-full transition-colors cursor-pointer">
            <X className="w-5 h-5 text-[#667085]" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-6">
          {/* Ticket Info Card */}
          <div className="p-4 rounded-xl border border-[#E4E7EC] bg-[#FAFCFF] space-y-3">
            <div className="flex items-center justify-between">
              <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FEF0C7] text-[#B54708] uppercase tracking-wider">
                Needs Assignment
              </span>
              <span className="font-bold text-xs text-[#667085]">#NEW</span>
            </div>
            <div>
              <h4 className="font-extrabold text-sm text-[#172033]">Nexus Corp HQ</h4>
              <p className="text-xs text-[#667085] flex items-center gap-1.5 mt-1">
                <MapPin className="w-3.5 h-3.5" /> Main Auditorium • Fix Projector
              </p>
            </div>
            <div className="flex items-center gap-4 pt-3 border-t border-[#E4E7EC]">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#004898]">
                <Calendar className="w-4 h-4" /> {currentDate}
              </div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#004898]">
                <Clock className="w-4 h-4" /> 01:30 PM - 03:00 PM
              </div>
            </div>
          </div>

          {/* Available Technicians */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-[#667085] uppercase tracking-wider">Available Technicians at 01:30 PM</h4>
            
            <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
              {technicians.map((tech) => (
                <label key={tech.id} className="flex items-center justify-between p-3 rounded-xl border border-[#E4E7EC] hover:border-[#B3D1F2] hover:bg-[#EFF5FC] cursor-pointer transition-all group">
                  <div className="flex items-center gap-3">
                    <input 
                      type="radio" 
                      name="technician" 
                      className="w-4 h-4 text-[#004898] border-gray-300 focus:ring-[#004898] cursor-pointer" 
                      checked={selectedTechId === tech.id}
                      onChange={() => setSelectedTechId(tech.id)}
                    />
                    <img src={tech.avatar} alt={tech.name} className="w-8 h-8 rounded-full object-cover border border-[#D0D5DD]" />
                    <div>
                      <h5 className="font-bold text-xs text-[#172033]">{tech.name}</h5>
                      <p className="text-[10px] text-[#667085]">{tech.role}</p>
                    </div>
                  </div>
                  <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#ECFDF3] text-[#027A48]">
                    Available slot
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-4 border-t border-[#E4E7EC] flex justify-end gap-3 bg-[#F8FAFC]">
          <button type="button" onClick={onClose} className="btn btn-secondary text-sm cursor-pointer">
            Cancel
          </button>
          <button 
            type="button" 
            onClick={handleDispatch} 
            disabled={!selectedTechId}
            className="btn btn-primary text-sm shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <UserCheck className="w-4 h-4" />
            <span>Confirm Assignment</span>
          </button>
        </div>

      </div>
    </div>
  );
};
