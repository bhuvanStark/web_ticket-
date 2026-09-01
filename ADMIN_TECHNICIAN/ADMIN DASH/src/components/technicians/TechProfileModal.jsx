import React from 'react';
import { useApp } from '../../context/AppContext';
import { X, Wrench, MapPin, CheckCircle2, Clock, Ticket, Award, Cpu, Layers, FileCheck } from 'lucide-react';
import { StatusBadge } from '../common/Badge';

export const TechProfileModal = () => {
  const {
    selectedTech,
    setSelectedTechId,
    tickets,
    setSelectedTicketId,
    setActivePage,
    installations
  } = useApp();

  if (!selectedTech) return null;

  const tech = selectedTech;
  const assignedTickets = tickets.filter(t => t.assignedToId === tech.id || t.assignedTo === tech.name);
  const currentJobs = assignedTickets.filter(t => t.status !== 'Closed' && t.status !== 'Resolved');

  // Find installations involving this technician
  const techInstallations = (installations || []).filter(inst => 
    inst.leadEngineer === tech.name || 
    inst.crewMembers?.includes(tech.name)
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-[#E4E7EC] overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-[#E4E7EC] bg-[#F8FAFC] flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src={tech.avatar} alt={tech.name} className="w-14 h-14 rounded-full object-cover border-2 border-[#004898]" />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-lg text-[#172033]">{tech.name}</h3>
                <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                  tech.availability === 'Available' ? 'bg-[#ECFDF3] text-[#027A48]' : 'bg-[#FEF0C7] text-[#B54708]'
                }`}>
                  {tech.availability}
                </span>
              </div>
              <p className="text-xs text-[#004898] font-semibold">{tech.role} • {tech.location}</p>
            </div>
          </div>
          <button onClick={() => setSelectedTechId(null)} className="p-1 text-[#667085] hover:text-[#172033]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Performance Summary Cards */}
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-3 rounded-xl bg-[#EFF5FC] border border-[#B3D1F2]">
              <span className="text-2xl font-extrabold text-[#004898]">{tech.activeJobsCount}</span>
              <p className="text-xs text-[#667085]">Active Jobs</p>
            </div>
            <div className="p-3 rounded-xl bg-[#ECFDF3] border border-[#ABE5C6]">
              <span className="text-2xl font-extrabold text-[#027A48]">{tech.completedJobsCount}</span>
              <p className="text-xs text-[#667085]">Completed</p>
            </div>
            <div className="p-3 rounded-xl bg-[#F8FAFC] border">
              <span className="text-2xl font-extrabold text-[#172033]">{tech.completionRate}</span>
              <p className="text-xs text-[#667085]">SLA Rate</p>
            </div>
          </div>



          {/* Onsite Installation Projects History */}
          <div className="space-y-2">
            <h4 className="font-bold text-xs uppercase tracking-wider text-[#667085] flex items-center justify-between">
              <span>Recent Installations ({techInstallations.length})</span>
            </h4>

            {techInstallations.length === 0 ? (
              <p className="text-xs text-[#667085] italic p-3 bg-[#F8FAFC] rounded-xl border">No previous installation records found.</p>
            ) : (
              techInstallations.map(inst => (
                <div key={inst.id} className="p-4 rounded-xl border border-[#E4E7EC] bg-[#F8FAFC] space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-extrabold text-[#004898]">{inst.projectCode} • {inst.projectName}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#ECFDF3] text-[#047857]">
                      {inst.status}
                    </span>
                  </div>

                  <div className="text-xs text-[#475569]">
                    <span className="font-bold text-[#172033]">{inst.customerName}</span> ({inst.roomName}) • Completed: {inst.completionDate}
                  </div>

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {inst.equipmentList?.map((eq, idx) => (
                      <span key={idx} className="px-2 py-0.5 rounded bg-white text-[#334155] text-[10px] font-semibold border border-[#CBD5E1]">
                        {eq.name} ({eq.serial})
                      </span>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Current Jobs Assigned */}
          <div className="space-y-2">
            <h4 className="font-bold text-xs uppercase tracking-wider text-[#667085]">
              Active Tickets ({currentJobs.length})
            </h4>
            {currentJobs.length === 0 ? (
              <p className="text-xs text-[#667085] italic p-3 bg-[#F8FAFC] rounded-xl border">No current active jobs.</p>
            ) : (
              currentJobs.map(t => (
                <div
                  key={t.id}
                  onClick={() => {
                    setSelectedTechId(null);
                    setSelectedTicketId(t.id);
                    setActivePage('requests');
                  }}
                  className="p-3 rounded-lg border hover:border-[#004898] hover:bg-[#EFF5FC] cursor-pointer flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="font-bold text-[#004898]">{t.id}</span> — <span className="font-semibold">{t.title}</span>
                    <p className="text-[#667085]">{t.customer} ({t.room})</p>
                  </div>
                  <StatusBadge status={t.status} />
                </div>
              ))
            )}
          </div>
        </div>

        <div className="p-4 bg-[#F8FAFC] border-t flex justify-end">
          <button onClick={() => setSelectedTechId(null)} className="btn btn-primary btn-sm">
            Close Profile
          </button>
        </div>
      </div>
    </div>
  );
};
