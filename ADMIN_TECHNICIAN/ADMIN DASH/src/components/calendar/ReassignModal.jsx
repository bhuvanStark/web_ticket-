import React from 'react';
import { X, Calendar, Clock, MapPin, UserCheck, Search, ArrowRightLeft } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const ReassignModal = ({ isOpen, onClose, ticket, currentDate, currentTime }) => {
  const { technicians, assignTechnicianToSlot } = useApp();
  const [selectedTechId, setSelectedTechId] = React.useState(null);
  const [searchTerm, setSearchTerm] = React.useState('');

  const filteredTechs = React.useMemo(() => {
    if (!searchTerm.trim()) return technicians;
    const lower = searchTerm.toLowerCase();
    return technicians.filter(tech => 
      (tech.name && tech.name.toLowerCase().includes(lower)) ||
      (tech.role && tech.role.toLowerCase().includes(lower)) ||
      (tech.location && tech.location.toLowerCase().includes(lower))
    );
  }, [technicians, searchTerm]);

  if (!isOpen || !ticket) return null;

  const handleReassign = () => {
    if (selectedTechId) {
      assignTechnicianToSlot(ticket.id, selectedTechId, currentTime, currentDate);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200" onClick={(e) => e.stopPropagation()}>
        
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#E4E7EC] flex items-center justify-between bg-[#F8FAFC]">
          <div>
            <h3 className="text-base font-extrabold text-[#172033]">Reassign Ticket</h3>
            <p className="text-xs text-[#667085] mt-0.5">Move ticket to a different technician</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 hover:bg-[#E4E7EC] rounded-full transition-colors cursor-pointer">
            <X className="w-5 h-5 text-[#667085]" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-6">
          
          {/* Target Ticket Info */}
          <div className="p-4 rounded-xl border border-[#E4E7EC] bg-[#FAFCFF] space-y-3">
            <div className="flex items-center justify-between">
              <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#EFF8FF] text-[#175CD3] uppercase tracking-wider">
                Current: {ticket.status}
              </span>
              <span className="font-bold text-xs text-[#667085]">#{ticket.id.replace('TT-', '')}</span>
            </div>
            <div>
              <h4 className="font-extrabold text-sm text-[#172033]">{ticket.customer}</h4>
              <p className="text-xs text-[#667085] flex items-center gap-1.5 mt-1">
                <MapPin className="w-3.5 h-3.5" /> {ticket.room}
              </p>
            </div>
            <div className="flex items-center gap-4 pt-3 border-t border-[#E4E7EC]">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#004898]">
                <Calendar className="w-4 h-4" /> {currentDate}
              </div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#004898]">
                <Clock className="w-4 h-4" /> {currentTime}
              </div>
            </div>
          </div>

          {/* Technician Selection */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-[#667085] uppercase tracking-wider">Select New Technician</h4>
            
            {/* Search */}
            <div className="relative">
              <Search className="w-4 h-4 text-[#98A2B3] absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                type="text" 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search technicians by name, location..." 
                className="w-full pl-9 pr-4 py-2 text-sm border border-[#E4E7EC] rounded-lg focus:outline-none focus:border-[#004898] focus:ring-1 focus:ring-[#004898] transition-all"
              />
            </div>

            {/* Available Techs */}
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {filteredTechs.length === 0 && (
                <div className="p-3 text-center text-sm text-[#667085]">
                  No technicians match your search.
                </div>
              )}
              {filteredTechs.map((tech, idx) => {
                // Don't show the currently assigned tech as an option to reassign to
                if (ticket.assignedToId === tech.id || ticket.assignedTo === tech.name) return null;
                
                return (
                  <label key={tech.id} className="flex items-center gap-3 p-3 rounded-xl border border-[#E4E7EC] hover:border-[#B3D1F2] hover:bg-[#EFF5FC] cursor-pointer transition-all group">
                    <input 
                      type="radio" 
                      name="tech_select" 
                      className="w-4 h-4 text-[#004898] border-gray-300 focus:ring-[#004898] cursor-pointer" 
                      checked={selectedTechId === tech.id}
                      onChange={() => setSelectedTechId(tech.id)}
                    />
                    <img src={tech.avatar} alt={tech.name} className="w-8 h-8 rounded-full object-cover border border-[#D0D5DD]" />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h5 className="font-bold text-xs text-[#172033]">{tech.name}</h5>
                        <span className="text-[10px] text-[#027A48] font-bold bg-[#ECFDF3] px-2 py-0.5 rounded-full">Available</span>
                      </div>
                      <p className="text-[10px] text-[#667085] mt-0.5">{tech.role} • {tech.location}</p>
                    </div>
                  </label>
                );
              })}
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
            onClick={handleReassign} 
            disabled={!selectedTechId}
            className={`btn btn-primary text-sm shadow-sm cursor-pointer ${!selectedTechId ? 'opacity-50 cursor-not-allowed' : 'bg-[#004898] hover:bg-[#003673]'}`}
          >
            <ArrowRightLeft className="w-4 h-4" />
            <span>Reassign Ticket</span>
          </button>
        </div>

      </div>
    </div>
  );
};
