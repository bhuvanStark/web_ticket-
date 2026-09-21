import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Search, Download, Eye, MapPin, ChevronDown, FileText, FileSpreadsheet, FileJson, Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { StatusBadge } from '../common/Badge';
import { TableSkeleton } from '../common/SkeletonLoader';
import { ServiceTypeToggle } from '../common/ServiceTypeToggle';
import { exportServiceHistory } from '../../utils/serviceHistoryExport';
import { localDateKey } from '../../utils/dateKey';
import { INDIA_STATES } from '../../utils/indiaStates';

const PAGE_SIZE = 15;

export const ServiceHistoryPage = () => {
  const {
    tickets, setSelectedTicketId, simulatedLoading, showToast, role, currentUser, myProjectActivities,
    pendingHistoryDate, setPendingHistoryDate
  } = useApp();
  const [search, setSearch] = useState('');
  const [isExportOpen, setIsExportOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Empty string = all dates (default — do not scope to today), unless the
  // "Completed Today" dashboard card set a pending date for this mount.
  const [selectedDate, setSelectedDate] = useState(pendingHistoryDate || '');
  const [companyFilter, setCompanyFilter] = useState('');
  const [techFilter, setTechFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [serviceTypeFilter, setServiceTypeFilter] = useState('ALL');
  // Same 36 India States/UTs list and 'ALL' sentinel as ServiceRequestsPage's
  // Location filter, so the two pages behave identically.
  const [locationFilter, setLocationFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsExportOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Consume the dashboard's "today" date exactly once, then clear it so a
  // later sidebar nav to this page isn't stuck defaulting to today.
  useEffect(() => {
    if (pendingHistoryDate) {
      setSelectedDate(pendingHistoryDate);
      setPendingHistoryDate(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, serviceTypeFilter, selectedDate, companyFilter, techFilter, locationFilter]);

  if (simulatedLoading) return <TableSkeleton rows={5} />;

  // History = every ticket that has reached a terminal / on-hold state.
  const HISTORY_STATUSES = ['Completed', 'Pending', 'Reassigned', 'Cancelled', 'Resolved', 'Closed'];
  const loggedTechId = (currentUser?.id || '').toLowerCase().trim();

  // Project Category (V1) — a technician's own completed/cancelled Daily
  // Project Activities, normalized to the same shape this page already
  // reads for tickets, so they merge into the same list. Derived entirely
  // from `myProjectActivities`, never from `tickets` — a Projects API
  // problem only means this list is empty, it can never affect ticket
  // history. Admin-only (all-projects) history stays out of scope for V1;
  // see ProjectDetailsModal's own Activity History for that.
  const projectHistory = role === 'tech'
    ? (myProjectActivities || [])
        .filter(a => a.status === 'Completed' || a.status === 'Cancelled')
        .map(a => ({
          id: a.id,
          // Shown in the "Ticket" column in place of the raw activity uuid —
          // tickets never set this field, so their column is unaffected.
          displayId: a.project?.id || a.id,
          customer: a.project?.customer || '—',
          location: a.project?.location || '',
          room: '',
          area: '',
          title: a.project?.name || 'Project Activity',
          assignedTo: currentUser?.name || 'You',
          assignedToId: loggedTechId,
          status: a.status,
          completedAt: a.completed_at,
          createdAt: a.created_at,
          createdDate: a.created_at,
          supportCategory: null, // not applicable — excluded from AV/EPABX-scoped views
          serviceReport: { workDone: a.completion_notes || '' },
          recordType: 'project_activity'
        }))
    : [];

  // Tickets the current user is allowed to see (admins: all; technicians: only
  // the ones assigned to them — so a tech's Reassigned jobs stay in their
  // history), merged with their own project activity history above.
  const allHistory = [...tickets, ...projectHistory].filter(t => {
    if (!HISTORY_STATUSES.includes(t.status)) return false;
    if (role !== 'tech') return true;
    return loggedTechId && (t.assignedToId || '').toLowerCase().trim() === loggedTechId;
  });

  const completedKey = (t) => localDateKey(t.completedAt || t.actualCompletionDate || t.createdAt);

  // Distinct companies / technicians for the filter dropdowns.
  const companies = [...new Set(allHistory.map(t => t.customer).filter(Boolean))].sort();
  const techs = [...new Set(allHistory.map(t => t.assignedTo).filter(Boolean))].sort();

  const statusScoped = statusFilter === 'ALL'
    ? allHistory
    : allHistory.filter(t => t.status === statusFilter);

  const dateScoped = statusScoped.filter(t => {
    if (!selectedDate) return true;
    return completedKey(t) === selectedDate;
  });

  // AV / EPABX — the real support line the ticket was raised under.
  const serviceTypeScoped = dateScoped.filter(t =>
    serviceTypeFilter === 'ALL' || t.supportCategory === serviceTypeFilter
  );

  // By state — same match rule as ServiceRequestsPage's Location filter
  // (substring match against the free-text location field).
  const locationScoped = serviceTypeScoped.filter(t =>
    locationFilter === 'ALL' || (t.location || '').toLowerCase().includes(locationFilter.toLowerCase())
  );

  const filtered = locationScoped.filter(t => {
    if (companyFilter && t.customer !== companyFilter) return false;
    if (techFilter && t.assignedTo !== techFilter) return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      (t.ticketNumber || '').toLowerCase().includes(q) ||
      (t.customer || '').toLowerCase().includes(q) ||
      (t.location || '').toLowerCase().includes(q) ||
      (t.area || '').toLowerCase().includes(q) ||
      (t.room || '').toLowerCase().includes(q) ||
      (t.title || '').toLowerCase().includes(q) ||
      (t.issueType || '').toLowerCase().includes(q) ||
      (t.assignedTo || '').toLowerCase().includes(q) ||
      (t.serviceReport?.workDone || '').toLowerCase().includes(q)
    );
  });

  const historyTickets = filtered;

  // Pagination — same 15-per-page / numbered / Prev-Next / ellipsis pattern
  // as ServiceRequestsPage.jsx. Exports below always use `filtered` (the
  // full filtered set), never `pageTickets` — pagination only affects what's
  // shown in the table.
  const totalPages = Math.max(1, Math.ceil(historyTickets.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pageTickets = historyTickets.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const pageNumbers = (() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages = new Set([1, 2, totalPages - 1, totalPages, safePage - 1, safePage, safePage + 1]);
    return [...pages].filter(p => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  })();

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-2xl font-black text-[#172033] tracking-tight">Service History</h2>
          <p className="text-sm text-[#667085] mt-1 max-w-xl leading-relaxed">
            Archive of resolved work orders, diagnostic sign-offs, and closed tickets.
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="bg-[#EFF8FF] border border-[#B3D1F2] rounded-xl px-4 py-2.5 flex flex-col justify-center">
            <span className="text-[10px] font-bold text-[#175CD3] uppercase tracking-wider">
              {selectedDate ? 'On this date' : 'All archived'}
            </span>
            <span className="text-lg font-black text-[#004898] leading-none mt-0.5">{historyTickets.length}</span>
          </div>

          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setIsExportOpen(!isExportOpen)}
              className="h-11 px-6 bg-white border border-[#E4E7EC] hover:border-[#B3D1F2] hover:bg-[#F8FAFC] text-[#004898] rounded-full flex items-center gap-2 transition-all font-bold text-sm shadow-sm cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Export</span>
              <ChevronDown className="w-4 h-4 text-[#172033] ml-1" />
            </button>

            {isExportOpen && (
              <div className="absolute right-0 mt-2 w-52 bg-white rounded-2xl shadow-xl border border-[#E4E7EC] overflow-hidden z-20 animate-in fade-in slide-in-from-top-2 duration-200 py-2">
                <button
                  onClick={() => {
                    exportServiceHistory(filtered, 'pdf');
                    showToast(`Exporting ${filtered.length} record${filtered.length === 1 ? '' : 's'} to PDF...`, 'info');
                    setIsExportOpen(false);
                  }}
                  className="w-full px-5 py-3 text-left text-sm font-semibold text-[#172033] hover:bg-[#F8FAFC] flex items-center gap-3 transition-colors"
                >
                  <FileText className="w-5 h-5 text-[#E3342F]" />
                  Export as PDF
                </button>
                <button
                  onClick={() => {
                    exportServiceHistory(filtered, 'excel');
                    showToast(`Exporting ${filtered.length} record${filtered.length === 1 ? '' : 's'} to Excel...`, 'info');
                    setIsExportOpen(false);
                  }}
                  className="w-full px-5 py-3 text-left text-sm font-semibold text-[#172033] hover:bg-[#F8FAFC] flex items-center gap-3 transition-colors"
                >
                  <FileSpreadsheet className="w-5 h-5 text-[#107C41]" />
                  Export as Excel
                </button>
                <button
                  onClick={() => {
                    exportServiceHistory(filtered, 'csv');
                    showToast(`Exporting ${filtered.length} record${filtered.length === 1 ? '' : 's'} to CSV...`, 'info');
                    setIsExportOpen(false);
                  }}
                  className="w-full px-5 py-3 text-left text-sm font-semibold text-[#172033] hover:bg-[#F8FAFC] flex items-center gap-3 transition-colors"
                >
                  <FileJson className="w-5 h-5 text-[#475467]" />
                  Export as CSV
                </button>
                <button
                  onClick={() => {
                    exportServiceHistory(filtered, 'doc');
                    showToast(`Exporting ${filtered.length} record${filtered.length === 1 ? '' : 's'} to DOC...`, 'info');
                    setIsExportOpen(false);
                  }}
                  className="w-full px-5 py-3 text-left text-sm font-semibold text-[#172033] hover:bg-[#F8FAFC] flex items-center gap-3 transition-colors"
                >
                  <FileText className="w-5 h-5 text-[#2B579A]" />
                  Export as DOC
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* AV / EPABX Filter */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <span className="text-xs font-bold text-[#667085] uppercase tracking-wider">Filter by Service Type</span>
        <ServiceTypeToggle value={serviceTypeFilter} onChange={setServiceTypeFilter} />
      </div>

      {/* Filter bar: search + date + company + technician */}
      <div className="bg-white p-3 rounded-2xl border border-[#E4E7EC] shadow-sm flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="flex-1 relative">
          <Search className="w-5 h-5 text-[#98A2B3] absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search ticket, customer, room, technician…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-11 pr-4 py-2 bg-transparent text-sm font-semibold focus:outline-none placeholder:font-medium placeholder:text-[#98A2B3]"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-[#E4E7EC] rounded-lg text-xs font-semibold text-[#172033] outline-none focus:border-[#004898] shrink-0"
        >
          <option value="ALL">All statuses</option>
          <option value="Completed">Completed</option>
          <option value="Pending">Pending</option>
          <option value="Reassigned">Reassigned</option>
          <option value="Cancelled">Cancelled</option>
        </select>

        <div className="flex items-center gap-2 shrink-0">
          <div className="relative">
            <CalendarIcon className="w-4 h-4 text-[#98A2B3] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="pl-9 pr-3 py-2 border border-[#E4E7EC] rounded-lg text-xs font-semibold text-[#172033] outline-none focus:border-[#004898]"
            />
          </div>
          {selectedDate && (
            <button
              onClick={() => setSelectedDate('')}
              className="text-xs font-bold text-[#004898] hover:underline"
            >
              All dates
            </button>
          )}
        </div>

        <select
          value={companyFilter}
          onChange={(e) => setCompanyFilter(e.target.value)}
          className="px-3 py-2 border border-[#E4E7EC] rounded-lg text-xs font-semibold text-[#172033] outline-none focus:border-[#004898] shrink-0"
        >
          <option value="">All companies</option>
          {companies.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select
          value={techFilter}
          onChange={(e) => setTechFilter(e.target.value)}
          className="px-3 py-2 border border-[#E4E7EC] rounded-lg text-xs font-semibold text-[#172033] outline-none focus:border-[#004898] shrink-0"
        >
          <option value="">All technicians</option>
          {techs.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        {/* Location — by state, same 36 India States/UTs list and 'ALL'
            sentinel as ServiceRequestsPage's Location filter. */}
        <select
          value={locationFilter}
          onChange={(e) => setLocationFilter(e.target.value)}
          className="px-3 py-2 border border-[#E4E7EC] rounded-lg text-xs font-semibold text-[#172033] outline-none focus:border-[#004898] shrink-0"
        >
          <option value="ALL">All Locations</option>
          {INDIA_STATES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        {(companyFilter || techFilter || statusFilter !== 'ALL' || selectedDate || serviceTypeFilter !== 'ALL' || locationFilter !== 'ALL') && (
          <button
            onClick={() => { setCompanyFilter(''); setTechFilter(''); setStatusFilter('ALL'); setSelectedDate(''); setServiceTypeFilter('ALL'); setLocationFilter('ALL'); }}
            className="text-xs font-bold text-[#D92D20] hover:underline shrink-0"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Modern Table/List View */}
      <div className="bg-white rounded-2xl border border-[#E4E7EC] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-[#F8FAFC] border-b border-[#E4E7EC]">
                <th className="py-4 px-6 text-[10px] font-bold uppercase tracking-wider text-[#667085] w-24">Ticket</th>
                <th className="py-4 px-6 text-[10px] font-bold uppercase tracking-wider text-[#667085]">Customer & Location</th>
                <th className="py-4 px-6 text-[10px] font-bold uppercase tracking-wider text-[#667085] w-64">Resolution Summary</th>
                <th className="py-4 px-6 text-[10px] font-bold uppercase tracking-wider text-[#667085]">Technician</th>
                <th className="py-4 px-6 text-[10px] font-bold uppercase tracking-wider text-[#667085] w-32">Date</th>
                <th className="py-4 px-6 text-[10px] font-bold uppercase tracking-wider text-[#667085] w-32">Status</th>
                <th className="py-4 px-6 text-[10px] font-bold uppercase tracking-wider text-[#667085] text-right w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E7EC]">
              {historyTickets.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-12 text-center text-[#667085] text-sm">
                    No history found matching your search.
                  </td>
                </tr>
              ) : (
                pageTickets.map((t) => {
                  const isProjectActivity = t.recordType === 'project_activity';
                  return (
                  <tr
                    key={t.id}
                    onClick={isProjectActivity ? undefined : () => setSelectedTicketId(t.id)}
                    className={`transition-colors group ${isProjectActivity ? '' : 'hover:bg-[#F8FAFC] cursor-pointer'}`}
                  >
                    <td className="py-4 px-6">
                      <span className="font-mono text-xs font-bold text-[#004898]">{t.displayId || t.id}</span>
                    </td>
                    <td className="py-4 px-6">
                      <h4 className="text-sm font-extrabold text-[#172033]">{t.customer}</h4>
                      <div className="flex items-center gap-1 mt-0.5 text-[#667085] text-xs">
                        <MapPin className="w-3 h-3" />
                        <span className="truncate max-w-[200px]">{[t.location, t.room].filter(Boolean).join(' • ') || '—'}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-bold text-[#172033] truncate max-w-[220px]" title={t.title}>{t.title}</p>
                        {isProjectActivity && (
                          <span className="text-[9px] font-bold text-[#004898] bg-[#EFF5FC] border border-[#B3D1F2] px-1.5 py-0.5 rounded-full shrink-0">Project</span>
                        )}
                      </div>
                      <p className="text-xs text-[#667085] truncate max-w-[220px] mt-0.5" title={t.serviceReport?.workDone}>
                        {t.serviceReport?.workDone || '—'}
                      </p>
                    </td>
                    <td className="py-4 px-6">
                      <span className="text-sm font-bold text-[#172033]">{t.assignedTo || '—'}</span>
                    </td>
                    <td className="py-4 px-6 text-sm text-[#667085] font-medium">
                      {completedKey(t) || (t.createdDate || '').split(',')[0] || '—'}
                    </td>
                    <td className="py-4 px-6">
                      <StatusBadge status={t.status} />
                    </td>
                    <td className="py-4 px-6 text-right">
                      {!isProjectActivity && (
                        <button className="w-8 h-8 rounded-full flex items-center justify-center text-[#98A2B3] group-hover:bg-[#004898] group-hover:text-white transition-all cursor-pointer">
                          <Eye className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination — same pattern as ServiceRequestsPage.jsx (15/page,
          numbered, Prev/Next, ellipsis). Exports above always use the full
          `filtered` set, unaffected by the current page. */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 flex-wrap px-1">
          <span className="text-xs text-[#667085]">
            Page <strong className="text-[#172033]">{safePage}</strong> of {totalPages}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={safePage === 1}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#E4E7EC] text-[#667085] hover:border-[#B3D1F2] hover:text-[#004898] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {pageNumbers.map((p, idx) => {
              const prev = pageNumbers[idx - 1];
              const showGap = prev !== undefined && p - prev > 1;
              return (
                <React.Fragment key={p}>
                  {showGap && <span className="px-1 text-xs text-[#98A2B3]">…</span>}
                  <button
                    onClick={() => setCurrentPage(p)}
                    className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-bold transition-colors ${
                      p === safePage ? 'bg-[#004898] text-white' : 'border border-[#E4E7EC] text-[#475467] hover:border-[#B3D1F2] hover:text-[#004898]'
                    }`}
                  >
                    {p}
                  </button>
                </React.Fragment>
              );
            })}

            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              className="h-8 px-3 flex items-center gap-1 rounded-lg border border-[#E4E7EC] text-xs font-bold text-[#667085] hover:border-[#B3D1F2] hover:text-[#004898] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <span>Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

