import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Calendar, AlertTriangle, MapPin, PlusCircle } from 'lucide-react';
import { TableSkeleton } from '../common/SkeletonLoader';
import { DispatchModal } from './DispatchModal';
import { DatePicker } from './DatePicker';
import { ManualScheduleModal } from './ManualScheduleModal';
import { ReassignModal } from './ReassignModal';
import { Avatar } from '../common/Avatar';

export const ServiceCalendarPage = () => {
  const { tickets, technicians, role, simulatedLoading } = useApp();
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState("17 Aug 2026");
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualSlot, setManualSlot] = useState(null);
  const [isReassignModalOpen, setIsReassignModalOpen] = useState(false);
  const [reassignTicketInfo, setReassignTicketInfo] = useState(null);

  if (simulatedLoading) return <TableSkeleton rows={4} />;

  const displayedTechs = role === 'admin' ? technicians : technicians.filter(t => t.id === 'TECH-01');
  const timeSlots = ["09:00 AM", "11:00 AM", "01:30 PM", "03:30 PM", "05:00 PM"];

  // Helper to determine event block colors based on status
  const getEventStyle = (status) => {
    switch(status) {
      case 'Assigned': return 'bg-[#EFF8FF] border-[#B2DDFF] text-[#175CD3]';
      case 'Resolved': return 'bg-[#ECFDF3] border-[#ABE5C6] text-[#027A48]';
      case 'Closed': return 'bg-[#F8FAFC] border-[#E4E7EC] text-[#475467]';
      case 'In Progress': return 'bg-[#FEF0C7] border-[#FDB022] text-[#B54708]';
      case 'Escalated': return 'bg-[#FEF3F2] border-[#FECDCA] text-[#B42318]';
      default: return 'bg-[#F8FAFC] border-[#E4E7EC] text-[#475467]';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-[#172033] tracking-tight">Service Calendar</h2>
          <p className="text-xs md:text-sm text-[#667085] mt-0.5">
            {role === 'admin' ? 'Field technician dispatch matrix & scheduling conflict detector' : 'My personal daily service schedule'}
          </p>
        </div>
        <div className="relative">
          <button 
            onClick={() => setIsDatePickerOpen(!isDatePickerOpen)}
            className="flex items-center gap-2 text-xs font-bold bg-white px-3 py-2 rounded-lg border border-[#E4E7EC] shadow-xs text-[#172033] hover:bg-[#F8FAFC] transition-colors cursor-pointer"
          >
            <Calendar className="w-4 h-4 text-[#004898]" />
            <span>Schedule Date: {selectedDate}</span>
          </button>

          {/* Real Date Picker Dropdown */}
          {isDatePickerOpen && (
            <DatePicker 
              selectedDate={selectedDate} 
              onSelect={(date) => setSelectedDate(date)} 
              onClose={() => setIsDatePickerOpen(false)} 
            />
          )}
        </div>
      </div>



      {/* Scheduler Matrix Table */}
      <div className="card overflow-hidden border border-[#E4E7EC] shadow-xs bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-[#F8FAFC] text-[#667085] uppercase font-bold text-[10px] tracking-wider border-b border-[#E4E7EC]">
              <tr>
                <th className="px-6 py-4 text-left w-[20%] border-r border-[#E4E7EC]">Technician / Roster</th>
                {timeSlots.map((slot, idx) => (
                  <th key={idx} className="px-3 py-4 text-center w-[16%] border-r border-[#E4E7EC] last:border-0">{slot}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E7EC]">
              {/* Unassigned Dispatch Queue */}
              {role === 'admin' && (
                <tr className="bg-[#FFFAEB] group">
                  <td className="px-6 py-4 align-middle border-r border-[#E4E7EC]">
                    <div className="flex flex-col gap-0.5">
                      <h4 className="font-extrabold text-[13px] text-[#B54708] leading-tight flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4" />
                        Dispatch Queue
                      </h4>
                      <div className="text-[10px] text-[#B54708] font-medium opacity-80 mt-0.5">
                        Requires Assignment
                      </div>
                    </div>
                  </td>
                  {timeSlots.map((slot, idx) => {
                    const unassignedTickets = tickets.filter(t => t.status === 'Unassigned' || t.status === 'New');
                    // Find an unassigned ticket to display in this slot (distribute them across slots for demo purposes)
                    const ticketToDispatch = unassignedTickets[idx]; 

                    if (ticketToDispatch) {
                      return (
                        <td key={idx} className="px-2 py-2 align-middle border-r border-[#E4E7EC] last:border-0">
                          <div 
                            onClick={() => setIsDispatchModalOpen(true)}
                            className="p-2.5 rounded-lg border-2 border-dashed border-[#F79009] bg-white transition-all cursor-pointer hover:shadow-md hover:-translate-y-0.5"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-extrabold text-[10px] tracking-wide uppercase text-[#B54708]">{ticketToDispatch.status}</span>
                              <span className="font-bold text-[10px] text-[#B54708] opacity-60">#{ticketToDispatch.id.replace('TT-', '')}</span>
                            </div>
                            <h5 className="font-bold text-[11px] truncate leading-tight text-[#172033]">{ticketToDispatch.customer}</h5>
                            <p className="text-[9px] truncate opacity-80 mt-0.5 text-[#667085]">{ticketToDispatch.room}</p>
                          </div>
                        </td>
                      );
                    }
                    return (
                      <td key={idx} className="px-2 py-2 align-middle border-r border-[#E4E7EC] last:border-0 text-center">
                         <span className="text-[#FEDF89] font-bold text-lg leading-none select-none opacity-50">-</span>
                      </td>
                    );
                  })}
                </tr>
              )}

              {displayedTechs.map((tech) => {
                // Only consider tickets assigned to this tech AND scheduled for the selectedDate
                const techTickets = tickets.filter(t => 
                  (t.assignedToId === tech.id || t.assignedTo === tech.name) &&
                  (t.scheduledDate === selectedDate || (t.preferredTime && t.preferredTime.includes(selectedDate)))
                );
                
                return (
                  <tr key={tech.id} className="hover:bg-[#F8FAFC] transition-all group">
                    <td className="px-6 py-4 align-middle border-r border-[#E4E7EC] bg-white group-hover:bg-[#F8FAFC]">
                      <div className="flex items-center gap-3">
                        <Avatar src={tech.avatar} name={tech.name} className="w-9 h-9" />
                        <div className="flex flex-col gap-0.5">
                          <h4 className="font-extrabold text-[13px] text-[#004898] leading-tight">{tech.name}</h4>
                          <div className="flex items-center gap-1 text-[10px] text-[#667085] font-medium">
                            <MapPin className="w-2.5 h-2.5" /> {tech.location}
                          </div>
                        </div>
                      </div>
                    </td>

                    {timeSlots.map((slot, idx) => {
                      // Look for exact explicit schedule
                      let ticket = techTickets.find(t => t.scheduledTimeSlot === slot);
                      
                      if (ticket) {
                        return (
                          <td key={idx} className="px-2 py-2 align-middle border-r border-[#E4E7EC] last:border-0 relative group/ticket z-10">
                            <div 
                              onClick={() => {
                                setReassignTicketInfo({ ticket, timeSlot: slot, date: selectedDate });
                                setIsReassignModalOpen(true);
                              }}
                              className={`p-2.5 rounded-lg border ${getEventStyle(ticket.status)} transition-all cursor-pointer hover:shadow-md hover:-translate-y-0.5 relative z-20`}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-extrabold text-[10px] tracking-wide uppercase opacity-80">{ticket.status}</span>
                                <span className="font-bold text-[10px] opacity-60">#{ticket.id.replace('TT-', '')}</span>
                              </div>
                              <h5 className="font-bold text-[11px] truncate leading-tight">{ticket.customer}</h5>
                              <p className="text-[9px] truncate opacity-80 mt-0.5">{ticket.room}</p>
                            </div>
                          </td>
                        );
                      }
                      
                      // Empty Slot State
                      return (
                        <td key={idx} className="px-2 py-2 align-middle border-r border-[#E4E7EC] last:border-0 text-center group/slot relative">
                          <div 
                            onClick={() => {
                              setManualSlot({ technician: tech, timeSlot: slot, date: selectedDate });
                              setIsManualModalOpen(true);
                            }}
                            className="absolute inset-1 rounded-lg border-2 border-transparent hover:border-dashed hover:border-[#B3D1F2] hover:bg-[#F8FAFC] flex items-center justify-center cursor-pointer transition-all z-0"
                          >
                            <PlusCircle className="w-5 h-5 text-[#98A2B3] opacity-0 group-hover/slot:opacity-100 transition-opacity" />
                          </div>
                          <span className="text-[#D0D5DD] font-bold text-lg leading-none select-none group-hover/slot:opacity-0 transition-opacity relative z-10 pointer-events-none">-</span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      <DispatchModal 
        isOpen={isDispatchModalOpen} 
        onClose={() => setIsDispatchModalOpen(false)} 
        currentDate={selectedDate}
      />
      <ManualScheduleModal 
        isOpen={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
        technician={manualSlot?.technician}
        timeSlot={manualSlot?.timeSlot}
        date={manualSlot?.date}
      />
      <ReassignModal
        isOpen={isReassignModalOpen}
        onClose={() => setIsReassignModalOpen(false)}
        ticket={reassignTicketInfo?.ticket}
        currentDate={reassignTicketInfo?.date}
        currentTime={reassignTicketInfo?.timeSlot}
      />
    </div>
  );
};
