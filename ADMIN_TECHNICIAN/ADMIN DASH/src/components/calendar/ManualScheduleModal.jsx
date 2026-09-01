import React from 'react';
import { X, Calendar, Clock, PlusCircle, Search } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const ManualScheduleModal = ({ isOpen, onClose, technician, timeSlot, date }) => {
  const { assignTechnicianToSlot, tickets } = useApp();
  
  // Only show unassigned tickets in the manual scheduling list
  const unassignedTickets = tickets.filter(t => t.status === 'Unassigned' || t.status === 'New');
  
  const [selectedTicketId, setSelectedTicketId] = React.useState('');
  const [searchTerm, setSearchTerm] = React.useState('');

  // Filter tickets based on search term
  const filteredTickets = React.useMemo(() => {
    if (!searchTerm.trim()) return unassignedTickets;
    const lowerQuery = searchTerm.toLowerCase();
    return unassignedTickets.filter(t => 
      (t.ticketNumber && t.ticketNumber.toLowerCase().includes(lowerQuery)) ||
      (t.id && t.id.toLowerCase().includes(lowerQuery)) ||
      (t.customer && t.customer.toLowerCase().includes(lowerQuery))
    );
  }, [unassignedTickets, searchTerm]);

  // Generate a stable demo ID while the modal is open
  const demoTicketId = React.useMemo(() => `#TT-${Math.floor(Math.random() * 90000) + 10000}`, [isOpen]);

  React.useEffect(() => {
    if (isOpen && filteredTickets.length > 0 && !selectedTicketId) {
      setSelectedTicketId(filteredTickets[0].id);
    }
  }, [isOpen, filteredTickets, selectedTicketId]);

  if (!isOpen || !technician) return null;

  const handleSchedule = () => {
    const finalTicketId = selectedTicketId || demoTicketId;
    assignTechnicianToSlot(finalTicketId, technician.id, timeSlot, date);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200" onClick={(e) => e.stopPropagation()}>
        
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#E4E7EC] flex items-center justify-between bg-[#F8FAFC]">
          <div>
            <h3 className="text-base font-extrabold text-[#172033]">Manual Schedule</h3>
            <p className="text-xs text-[#667085] mt-0.5">Assign a ticket directly to {technician.name}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 hover:bg-[#E4E7EC] rounded-full transition-colors cursor-pointer">
            <X className="w-5 h-5 text-[#667085]" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-6">
          
          {/* Target Slot Info */}
          <div className="flex items-center gap-4 p-4 rounded-xl border border-[#E4E7EC] bg-[#FAFCFF]">
            <img src={technician.avatar} alt={technician.name} className="w-10 h-10 rounded-full object-cover border border-[#D0D5DD]" />
            <div className="flex-1">
              <h4 className="font-extrabold text-sm text-[#172033]">{technician.name}</h4>
              <p className="text-xs text-[#667085]">{technician.role}</p>
            </div>
            <div className="text-right">
              <div className="flex items-center justify-end gap-1.5 text-xs font-bold text-[#004898]">
                <Calendar className="w-4 h-4" /> {date}
              </div>
              <div className="flex items-center justify-end gap-1.5 text-xs font-bold text-[#004898] mt-1">
                <Clock className="w-4 h-4" /> {timeSlot}
              </div>
            </div>
          </div>

          {/* Ticket Selection */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-[#667085] uppercase tracking-wider">Select Ticket to Assign</h4>
            
            {/* Search */}
            <div className="relative">
              <Search className="w-4 h-4 text-[#98A2B3] absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                type="text" 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search unassigned tickets by ID, Customer..." 
                className="w-full pl-9 pr-4 py-2 text-sm border border-[#E4E7EC] rounded-lg focus:outline-none focus:border-[#004898] focus:ring-1 focus:ring-[#004898] transition-all"
              />
            </div>
            <h4 className="text-xs font-bold text-[#667085] uppercase tracking-wider">Unassigned Queue</h4>
            
            <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
              {filteredTickets.length === 0 && (
                <label className="flex items-center gap-3 p-3 rounded-xl border border-[#E4E7EC] hover:border-[#B3D1F2] hover:bg-[#EFF5FC] cursor-pointer transition-all group">
                  <input 
                    type="radio" 
                    name="ticket_select" 
                    className="w-4 h-4 text-[#004898] border-gray-300 focus:ring-[#004898] cursor-pointer" 
                    checked={true}
                    readOnly
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[10px] text-[#667085]">{demoTicketId}</span>
                      <span className="font-bold text-[10px] uppercase text-[#B54708] opacity-80">Demo Ticket</span>
                    </div>
                    <h5 className="font-bold text-xs text-[#172033] mt-0.5">Demo Customer</h5>
                    <p className="text-[10px] text-[#667085] truncate mt-0.5">Mock generated for testing</p>
                  </div>
                </label>
              )}
              {filteredTickets.map((t) => (
                <label key={t.id} className="flex items-center gap-3 p-3 rounded-xl border border-[#E4E7EC] hover:border-[#B3D1F2] hover:bg-[#EFF5FC] cursor-pointer transition-all group">
                  <input 
                    type="radio" 
                    name="ticket_select" 
                    className="w-4 h-4 text-[#004898] border-gray-300 focus:ring-[#004898] cursor-pointer" 
                    checked={selectedTicketId === t.id}
                    onChange={() => setSelectedTicketId(t.id)}
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[10px] text-[#667085]">{t.ticketNumber || t.id}</span>
                      <span className="font-bold text-[10px] uppercase text-[#B54708] opacity-80">{t.issueType || 'Break/Fix'}</span>
                    </div>
                    <h5 className="font-bold text-xs text-[#172033] mt-0.5">{t.customer}</h5>
                    <p className="text-[10px] text-[#667085] truncate mt-0.5">{t.room}</p>
                  </div>
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
          <button type="button" onClick={handleSchedule} className="btn btn-primary text-sm shadow-sm cursor-pointer">
            <PlusCircle className="w-4 h-4" />
            <span>Schedule Ticket</span>
          </button>
        </div>

      </div>
    </div>
  );
};
