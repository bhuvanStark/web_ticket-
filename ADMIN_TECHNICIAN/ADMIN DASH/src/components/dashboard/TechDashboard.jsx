import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Ticket,
  Clock,
  CheckCircle2,
  MapPin,
  Calendar,
  Building2,
  Tv,
  ArrowRight,
  Eye,
  UserCheck
} from 'lucide-react';
import { StatusBadge, PriorityBadge } from '../common/Badge';
import { TechJobDetailsModal } from '../requests/TechJobDetailsModal';

export const TechDashboard = () => {
  const {
    tickets,
    currentUser,
    selectedTicketId,
    setSelectedTicketId,
    activePage,
    setActivePage,
    updateTicketStatus
  } = useApp();

  // Match strictly on the assigned technician's id. Matching on names (even
  // partially) leaks other technicians' jobs — e.g. "Balaji M" would match a
  // ticket assigned to "Balaji".
  const loggedTechId = (currentUser?.id || '').toLowerCase().trim();

  const myTickets = loggedTechId
    ? tickets.filter(t => (t.assignedToId || '').toLowerCase().trim() === loggedTechId)
    : [];

  const [statusFilter, setStatusFilter] = useState('All');

  let todaysJobs = myTickets;
  
  if (statusFilter !== 'All') {
    todaysJobs = todaysJobs.filter(t => {
      if (statusFilter === 'In Progress') {
        return t.status === 'Service In Progress' || t.status === 'Technician On The Way';
      }
      return t.status === statusFilter;
    });
  }

  const inProgressCount = myTickets.filter(t => t.status === 'Service In Progress' || t.status === 'Technician On The Way').length;
  const completedCount = myTickets.filter(t => t.status === 'Resolved' || t.status === 'Closed').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-extrabold text-[#172033] tracking-tight">My Field Dashboard</h2>
        <p className="text-xs md:text-sm text-[#667085] mt-0.5">
          Welcome back, <strong className="text-[#004898]">{currentUser.name}</strong>. Here are your assigned service calls for today.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl p-6 border border-[#E4E7EC] shadow-sm relative overflow-hidden group hover:border-[#B3D1F2] transition-colors">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Ticket className="w-16 h-16 text-[#004898]" />
          </div>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 rounded-xl bg-[#EFF5FC] text-[#004898]">
              <Ticket className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#667085]">Assigned Jobs</span>
          </div>
          <div className="text-4xl font-black text-[#172033] mb-1">{myTickets.length}</div>
          <p className="text-xs font-medium text-[#667085]">Scheduled field slots</p>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-[#E4E7EC] shadow-sm relative overflow-hidden group hover:border-[#BAE6FD] transition-colors">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Clock className="w-16 h-16 text-[#0284C7]" />
          </div>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 rounded-xl bg-[#F0F9FF] text-[#0284C7]">
              <Clock className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#667085]">In Progress</span>
          </div>
          <div className="text-4xl font-black text-[#172033] mb-1">{inProgressCount}</div>
          <p className="text-xs font-medium text-[#667085]">Active site service</p>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-[#E4E7EC] shadow-sm relative overflow-hidden group hover:border-[#ABE5C6] transition-colors">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <CheckCircle2 className="w-16 h-16 text-[#12B76A]" />
          </div>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 rounded-xl bg-[#F0FDF4] text-[#12B76A]">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#667085]">Completed</span>
          </div>
          <div className="text-4xl font-black text-[#172033] mb-1">{completedCount}</div>
          <p className="text-xs font-medium text-[#667085]">Resolved & signed off</p>
        </div>
      </div>

      {/* Today's Jobs List */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-4">
          <div>
            <h3 className="text-lg font-extrabold text-[#172033]">Assigned Field Jobs</h3>
            <p className="text-xs text-[#667085]">Service tickets assigned to your technician account</p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs font-bold border border-[#E4E7EC] text-[#172033] bg-white rounded-lg px-3 py-1.5 hover:border-[#B3D1F2] focus:outline-none focus:ring-2 focus:ring-[#004898]/20 transition-all cursor-pointer"
            >
              <option value="All">All Statuses</option>
              <option value="Assigned">Assigned</option>
              <option value="In Progress">In Progress</option>
              <option value="Resolved">Resolved</option>
              <option value="Closed">Closed</option>
            </select>
            <button
              onClick={() => setActivePage('my-jobs')}
              className="text-xs font-bold text-[#004898] hover:text-[#00346E] hover:underline flex items-center gap-1"
            >
              View All My Jobs <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {todaysJobs.map((t) => (
            <div 
              key={t.id} 
              className="group bg-white border border-[#E4E7EC] hover:border-[#004898] rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all shadow-sm hover:shadow-md cursor-pointer"
              onClick={() => {
                setSelectedTicketId(t.id);
                setActivePage('my-jobs');
              }}
            >
              {/* Left Content Area */}
              <div className="flex flex-col gap-2.5 flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-[13px] font-extrabold text-[#004898] font-mono">{t.id}</span>
                  <h4 className="text-[15px] font-extrabold text-[#172033] group-hover:text-[#004898] transition-colors truncate">
                    {t.title}
                  </h4>
                  <PriorityBadge priority={t.priority} />
                </div>
                
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-[#667085]">
                  <span className="flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5 text-[#98A2B3]" /> 
                    <span className="text-[#475467]">{t.customer}</span>
                  </span>
                  <span className="w-1 h-1 bg-[#D0D5DD] rounded-full mx-1"></span>
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-[#98A2B3]" /> 
                    <span className="text-[#475467]">{t.location || 'N/A'}</span>
                  </span>
                  <span className="w-1 h-1 bg-[#D0D5DD] rounded-full mx-1"></span>
                  <span className="flex items-center gap-1">
                    <Tv className="w-3.5 h-3.5 text-[#98A2B3]" /> 
                    <span className="text-[#475467]">{t.room}</span>
                  </span>
                </div>
              </div>

              {/* Right Action Area */}
              <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between gap-3 shrink-0 pt-3 sm:pt-0 border-t sm:border-t-0 border-[#F2F4F7]">
                <div className="flex items-center gap-2.5">
                  <StatusBadge status={t.status} />
                  <span className="flex items-center gap-1 text-[11px] font-bold text-[#667085] bg-[#F8FAFC] border border-[#E4E7EC] px-2 py-0.5 rounded-md">
                    <Clock className="w-3 h-3" /> 
                    {t.assignedTime || '09:30 AM'}
                  </span>
                </div>
                
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedTicketId(t.id);
                    setActivePage('my-jobs');
                  }}
                  className="bg-[#F8FAFC] hover:bg-[#004898] text-[#004898] hover:text-white border border-[#E4E7EC] hover:border-[#004898] rounded-xl px-4 py-2 text-xs font-extrabold flex items-center gap-2 transition-all"
                >
                  Execute Job <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
    </div>
  );
};

