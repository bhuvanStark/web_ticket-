import React from 'react';
import { useApp } from '../../context/AppContext';
import {
  Ticket,
  AlertCircle,
  Clock,
  CheckCircle2,
  ArrowRight,
  UserCheck,
  Calendar,
  ChevronRight,
  Plus
} from 'lucide-react';
import { StatusBadge, PriorityBadge } from '../common/Badge';

export const AdminDashboard = () => {
  const {
    tickets,
    technicians,
    setSelectedTicketId,
    setIsAssignModalOpen,
    setIsCreateTicketOpen,
    setActivePage,
    globalSearchQuery
  } = useApp();

  const searchQuery = (globalSearchQuery || '').trim().toLowerCase();

  // Metrics
  const isClosed = (t) => ['Resolved', 'Closed', 'Customer Signed / Completed', 'Completed'].includes(t.status);
  // "Total Requests" = every ticket raised, all time.
  const totalRequestsCount = tickets.length;
  const unassignedCount = tickets.filter(t => !isClosed(t) && (t.status === 'Unassigned' || !t.assignedTo)).length;
  const inProgressCount = tickets.filter(t => t.status === 'Service In Progress' || t.status === 'Technician On The Way').length;
  const today = new Date().toDateString();
  const completedTodayCount = tickets.filter(t =>
    isClosed(t) &&
    (t.completedAt || t.actualCompletionDate) &&
    new Date(t.completedAt || t.actualCompletionDate).toDateString() === today
  ).length;

  // Search Matcher Helper
  const matchesSearch = (t) => {
    if (!searchQuery) return true;
    return (
      (t.id || '').toLowerCase().includes(searchQuery) ||
      (t.ticketNumber || '').toLowerCase().includes(searchQuery) ||
      (t.title || '').toLowerCase().includes(searchQuery) ||
      (t.customer || '').toLowerCase().includes(searchQuery) ||
      (t.room || '').toLowerCase().includes(searchQuery) ||
      (t.location || '').toLowerCase().includes(searchQuery) ||
      (t.assignedTo || '').toLowerCase().includes(searchQuery) ||
      (t.equipment || '').toLowerCase().includes(searchQuery)
    );
  };

  // Sort tickets by timestamp (newest first)
  const sortTicketsByTime = (list) => {
    return [...list].sort((a, b) => {
      const timeA = a.createdDate ? new Date(a.createdDate).getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
      const timeB = b.createdDate ? new Date(b.createdDate).getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
      if (timeA && timeB && timeA !== timeB) return timeB - timeA;
      const numA = parseInt((a.id || a.ticketNumber || '').toString().replace(/\D/g, '')) || 0;
      const numB = parseInt((b.id || b.ticketNumber || '').toString().replace(/\D/g, '')) || 0;
      return numB - numA;
    });
  };

  // Sections data with live search query filtering and timestamp sorting.
  // Completed tickets never appear on the dashboard — they live in Service History.
  const activeJobs = sortTicketsByTime(tickets.filter(t => !isClosed(t) && (t.status === 'Assigned' || t.status === 'Technician On The Way' || t.status === 'Service In Progress' || t.status === 'Awaiting Customer Signature') && matchesSearch(t)));
  const unassignedRequests = sortTicketsByTime(tickets.filter(t => !isClosed(t) && (t.status === 'Unassigned' || !t.assignedTo) && matchesSearch(t)));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-[#172033] tracking-tight">Good Morning, Admin</h2>
          <p className="text-xs md:text-sm text-[#667085] mt-0.5">
            Here's what's happening with your service operations today.
          </p>
        </div>
        <button
          onClick={() => setIsCreateTicketOpen(true)}
          className="inline-flex items-center gap-2 bg-[#004898] hover:bg-[#003673] text-white font-bold text-xs px-4 py-2.5 rounded-lg transition-all shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Create Service Request</span>
        </button>
      </div>

      {/* KPI Cards (4 metrics as specified) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-5 border-l-4 border-l-[#004898]">
          <div className="flex items-center justify-between text-[#667085] mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Total Requests</span>
            <div className="p-2 rounded-lg bg-[#EFF5FC] text-[#004898]">
              <Ticket className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-[#004898]">{totalRequestsCount}</div>
        </div>

        <div className="card p-5 border-l-4 border-l-[#F79009]">
          <div className="flex items-center justify-between text-[#667085] mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Unassigned</span>
            <div className="p-2 rounded-lg bg-[#FEF0C7] text-[#B54708]">
              <AlertCircle className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-[#B54708]">{unassignedCount}</div>
        </div>

        <div className="card p-5 border-l-4 border-l-[#0284C7]">
          <div className="flex items-center justify-between text-[#667085] mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">In Progress</span>
            <div className="p-2 rounded-lg bg-[#F0F9FF] text-[#026AA7]">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-[#026AA7]">{inProgressCount}</div>
        </div>

        <button
          type="button"
          onClick={() => setActivePage('history')}
          title="View today's completed jobs in Service History"
          className="card p-5 border-l-4 border-l-[#12B76A] text-left w-full hover:shadow-md hover:border-l-[#0E9384] transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between text-[#667085] mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Completed Today</span>
            <div className="p-2 rounded-lg bg-[#ECFDF3] text-[#027A48]">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-[#027A48]">{completedTodayCount}</div>
          <div className="text-[11px] font-semibold text-[#027A48] mt-1">View in Service History &rarr;</div>
        </button>
      </div>

      {/* Main Grid Sections */}
      <div className="grid grid-cols-1 gap-6">
        {/* Full Width Lists */}
        <div className="space-y-6 min-w-0">
          {/* Section: Unassigned Requests */}
          <div className="card overflow-hidden">
            <div className="card-header bg-[#FFFAEB]/50 px-5 py-4 border-b border-[#FEE68A]">
              <div>
                <h3 className="card-title text-[#B54708] flex items-center gap-2 text-base font-extrabold">
                  <AlertCircle className="w-4 h-4 text-[#F79009]" />
                  <span>Unassigned Service Requests</span>
                </h3>
                <p className="text-xs text-[#667085] mt-0.5">Requests awaiting field technician assignment</p>
              </div>
              <button
                onClick={() => setActivePage('requests')}
                className="text-xs font-bold text-[#004898] hover:underline flex items-center gap-1 shrink-0"
              >
                View All ({unassignedCount})
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="divide-y divide-[#E4E7EC]">
              {unassignedRequests.length === 0 ? (
                <div className="p-6 text-center text-xs text-[#667085]">
                  All service requests have been assigned. Good job!
                </div>
              ) : (
                unassignedRequests.map((t) => (
                  <div key={t.id} className="p-4 hover:bg-[#F8FAFC] transition-all flex flex-col md:flex-row md:items-center justify-between gap-4">
                    {/* Left: Ticket ID & Issue Title */}
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-xs bg-[#EFF5FC] text-[#004898] px-2 py-0.5 rounded border border-[#B3D1F2]">
                          {t.id}
                        </span>
                        <h4 className="font-extrabold text-sm text-[#172033]">{t.title}</h4>
                        <PriorityBadge priority={t.priority} />
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#004898] bg-[#EFF5FC] px-2 py-0.5 rounded border border-[#B3D1F2] ml-auto">
                          <Clock className="w-3 h-3 text-[#004898]" />
                          <span>{t.createdDate || t.createdAt || t.preferredTime || '12:23 PM'}</span>
                        </span>
                      </div>
                      <div className="text-xs text-[#475467] flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-[#004898]">{t.customer}</span>
                        <span>•</span>
                        <span className="font-semibold text-[#172033]">{t.room}</span>
                        <span className="text-[#667085]">({t.location})</span>
                      </div>
                    </div>

                    {/* Right: Assign Tech Action Button */}
                    <button
                      onClick={() => {
                        setSelectedTicketId(t.id);
                        setIsAssignModalOpen(true);
                      }}
                      className="btn btn-primary btn-sm text-xs font-bold shrink-0 self-start md:self-center bg-[#004898] hover:bg-[#00346E] text-white px-4 py-2 rounded-lg shadow-xs"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>Assign Tech</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Section: Active Service Jobs */}
          <div className="card overflow-hidden">
            <div className="card-header px-5 py-4">
              <div>
                <h3 className="card-title text-base font-extrabold">Active Field Service Jobs</h3>
                <p className="text-xs text-[#667085] mt-0.5">Currently assigned and in-progress field tickets</p>
              </div>
              <button
                onClick={() => setActivePage('requests')}
                className="text-xs font-bold text-[#004898] hover:underline flex items-center gap-1 shrink-0"
              >
                Manage Requests
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="divide-y divide-[#E4E7EC]">
              {activeJobs.map((t) => (
                <div
                  key={t.id}
                  onClick={() => setSelectedTicketId(t.id)}
                  className="p-4 hover:bg-[#EFF5FC]/50 cursor-pointer transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 group"
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-xs bg-[#EFF5FC] text-[#004898] px-2 py-0.5 rounded border border-[#B3D1F2]">
                        {t.id}
                      </span>
                      <h4 className="font-extrabold text-sm text-[#172033] group-hover:text-[#004898] transition-colors">{t.title}</h4>
                      <StatusBadge status={t.status} />
                    </div>
                    <div className="text-xs text-[#667085]">
                      Customer: <span className="font-semibold text-[#172033]">{t.customer}</span> ({t.room})
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right text-xs">
                      <div className="font-bold text-[#172033]">{t.assignedTo || 'Unassigned'}</div>
                      <div className="text-[11px] text-[#667085]">{t.assignedToRole || 'AV Engineer'}</div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-[#98A2B3] group-hover:text-[#004898]" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

