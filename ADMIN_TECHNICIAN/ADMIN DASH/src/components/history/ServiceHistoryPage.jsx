import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Search, Download, Eye, MapPin, ChevronDown, FileText, FileSpreadsheet, FileJson, Calendar as CalendarIcon } from 'lucide-react';
import { StatusBadge } from '../common/Badge';
import { TableSkeleton } from '../common/SkeletonLoader';

const localDateKey = (d) => {
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

export const ServiceHistoryPage = () => {
  const { tickets, setSelectedTicketId, simulatedLoading, showToast, role, currentUser } = useApp();
  const [search, setSearch] = useState('');
  const [isExportOpen, setIsExportOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Date view: default to today. Empty string = all dates.
  const [selectedDate, setSelectedDate] = useState(localDateKey(new Date()));
  const [companyFilter, setCompanyFilter] = useState('');
  const [techFilter, setTechFilter] = useState('');

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsExportOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (simulatedLoading) return <TableSkeleton rows={5} />;

  const CLOSED = ['Resolved', 'Closed', 'Cancelled', 'Customer Signed / Completed', 'Completed'];
  const loggedTechId = (currentUser?.id || '').toLowerCase().trim();

  // Every closed ticket the current user is allowed to see (admins: all;
  // technicians: only their own).
  const allHistory = tickets.filter(t => {
    if (!CLOSED.includes(t.status)) return false;
    if (role !== 'tech') return true;
    return loggedTechId && (t.assignedToId || '').toLowerCase().trim() === loggedTechId;
  });

  const completedKey = (t) => localDateKey(t.completedAt || t.actualCompletionDate || t.createdAt);

  // Distinct companies / technicians for the filter dropdowns.
  const companies = [...new Set(allHistory.map(t => t.customer).filter(Boolean))].sort();
  const techs = [...new Set(allHistory.map(t => t.assignedTo).filter(Boolean))].sort();

  // A company or technician filter shows ALL matching tickets to date (ignores
  // the date restriction). Otherwise the list is scoped to the selected date
  // (or all dates when the date field is cleared).
  const anyEntityFilter = !!companyFilter || !!techFilter;

  const dateScoped = allHistory.filter(t => {
    if (anyEntityFilter) return true;
    if (!selectedDate) return true;
    return completedKey(t) === selectedDate;
  });

  const filtered = dateScoped.filter(t => {
    if (companyFilter && t.customer !== companyFilter) return false;
    if (techFilter && t.assignedTo !== techFilter) return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      (t.ticketNumber || '').toLowerCase().includes(q) ||
      (t.customer || '').toLowerCase().includes(q) ||
      (t.room || '').toLowerCase().includes(q) ||
      (t.title || '').toLowerCase().includes(q) ||
      (t.assignedTo || '').toLowerCase().includes(q)
    );
  });

  const historyTickets = filtered;

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
              {anyEntityFilter ? 'Matching (all time)' : selectedDate ? 'On this date' : 'All archived'}
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
                    showToast('Exporting Service Audit Log to PDF...', 'info');
                    setIsExportOpen(false);
                  }}
                  className="w-full px-5 py-3 text-left text-sm font-semibold text-[#172033] hover:bg-[#F8FAFC] flex items-center gap-3 transition-colors"
                >
                  <FileText className="w-5 h-5 text-[#E3342F]" />
                  Export as PDF
                </button>
                <button
                  onClick={() => {
                    showToast('Exporting Service Audit Log to Excel...', 'info');
                    setIsExportOpen(false);
                  }}
                  className="w-full px-5 py-3 text-left text-sm font-semibold text-[#172033] hover:bg-[#F8FAFC] flex items-center gap-3 transition-colors"
                >
                  <FileSpreadsheet className="w-5 h-5 text-[#107C41]" />
                  Export as Excel
                </button>
                <button
                  onClick={() => {
                    showToast('Exporting Service Audit Log to CSV...', 'info');
                    setIsExportOpen(false);
                  }}
                  className="w-full px-5 py-3 text-left text-sm font-semibold text-[#172033] hover:bg-[#F8FAFC] flex items-center gap-3 transition-colors"
                >
                  <FileJson className="w-5 h-5 text-[#475467]" />
                  Export as CSV
                </button>
                <button
                  onClick={() => {
                    showToast('Exporting Service Audit Log to DOC...', 'info');
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

        <div className="flex items-center gap-2 shrink-0">
          <div className="relative">
            <CalendarIcon className="w-4 h-4 text-[#98A2B3] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              disabled={anyEntityFilter}
              className="pl-9 pr-3 py-2 border border-[#E4E7EC] rounded-lg text-xs font-semibold text-[#172033] outline-none focus:border-[#004898] disabled:opacity-50"
            />
          </div>
          {selectedDate && !anyEntityFilter && (
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

        {(companyFilter || techFilter) && (
          <button
            onClick={() => { setCompanyFilter(''); setTechFilter(''); }}
            className="text-xs font-bold text-[#D92D20] hover:underline shrink-0"
          >
            Clear filters
          </button>
        )}
      </div>

      {anyEntityFilter && (
        <p className="text-xs text-[#667085] -mt-2">
          Showing all matching tickets to date (date filter ignored while a company or technician filter is active).
        </p>
      )}

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
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-12 text-center text-[#667085] text-sm">
                    No history found matching your search.
                  </td>
                </tr>
              ) : (
                filtered.map((t) => (
                  <tr 
                    key={t.id} 
                    onClick={() => setSelectedTicketId(t.id)}
                    className="hover:bg-[#F8FAFC] transition-colors cursor-pointer group"
                  >
                    <td className="py-4 px-6">
                      <span className="font-mono text-xs font-bold text-[#004898]">{t.id}</span>
                    </td>
                    <td className="py-4 px-6">
                      <h4 className="text-sm font-extrabold text-[#172033]">{t.customer}</h4>
                      <div className="flex items-center gap-1 mt-0.5 text-[#667085] text-xs">
                        <MapPin className="w-3 h-3" />
                        <span className="truncate max-w-[200px]">{[t.location, t.room].filter(Boolean).join(' • ') || '—'}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <p className="text-sm font-bold text-[#172033] truncate max-w-[220px]" title={t.title}>{t.title}</p>
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
                      <button className="w-8 h-8 rounded-full flex items-center justify-center text-[#98A2B3] group-hover:bg-[#004898] group-hover:text-white transition-all cursor-pointer">
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

