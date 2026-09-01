import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Search,
  Filter,
  Plus,
  Eye,
  UserPlus,
  ChevronDown,
  X,
  Ticket,
  MapPin,
  Building2,
  Tv,
  CheckCircle2,
  Clock,
  Layers,
  Trash2
} from 'lucide-react';
import { StatusBadge, PriorityBadge } from '../common/Badge';
import { Avatar } from '../common/Avatar';
import { TableSkeleton } from '../common/SkeletonLoader';
import { ErrorState } from '../common/ErrorState';
import { EmptyState } from '../common/EmptyState';

export const ServiceRequestsPage = () => {
  const {
    tickets,
    customers,
    deleteTicket,
    locations,
    technicians,
    setSelectedTicketId,
    setIsAssignModalOpen,
    setIsCreateTicketOpen,
    simulatedLoading,
    simulatedError,
    setSimulatedError
  } = useApp();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [locationFilter, setLocationFilter] = useState('ALL');
  const [techFilter, setTechFilter] = useState('ALL');
  const [issueFilter, setIssueFilter] = useState('ALL');
  const [customerFilter, setCustomerFilter] = useState('ALL');

  if (simulatedLoading) {
    return <TableSkeleton rows={6} />;
  }

  if (simulatedError) {
    return (
      <ErrorState
        title="Unable to Load Requests"
        message="A network or server error occurred while retrieving service requests."
        onRetry={() => setSimulatedError(false)}
      />
    );
  }

  const filteredTickets = tickets.filter((t) => {
    const matchesSearch =
      (t.id || '').toLowerCase().includes(search.toLowerCase()) ||
      (t.customer || '').toLowerCase().includes(search.toLowerCase()) ||
      (t.room || '').toLowerCase().includes(search.toLowerCase()) ||
      (t.title || '').toLowerCase().includes(search.toLowerCase()) ||
      (t.assignedTo || '').toLowerCase().includes(search.toLowerCase());

    const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter;
    const matchesPriority = priorityFilter === 'ALL' || t.priority === priorityFilter;

    const matchesCustomer =
      customerFilter === 'ALL' ||
      (t.customerId && t.customerId === customerFilter) ||
      (t.customer || '').toLowerCase().includes(customerFilter.toLowerCase());

    const matchesLocation =
      locationFilter === 'ALL' ||
      (t.location || '').toLowerCase().includes(locationFilter.toLowerCase());

    const matchesTech =
      techFilter === 'ALL' ||
      (techFilter === 'Unassigned' && !t.assignedTo) ||
      (t.assignedTo || '').toLowerCase().includes(techFilter.toLowerCase());

    const matchesIssue =
      issueFilter === 'ALL' ||
      (t.issueType || '').toLowerCase().includes(issueFilter.toLowerCase());

    return matchesSearch && matchesStatus && matchesPriority && matchesCustomer && matchesLocation && matchesTech && matchesIssue;
  });

  const sortedTickets = [...filteredTickets].sort((a, b) => {
    const timeA = a.createdDate ? new Date(a.createdDate).getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
    const timeB = b.createdDate ? new Date(b.createdDate).getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
    if (timeA && timeB && timeA !== timeB) return timeB - timeA;
    const numA = parseInt((a.id || a.ticketNumber || '').toString().replace(/\D/g, '')) || 0;
    const numB = parseInt((b.id || b.ticketNumber || '').toString().replace(/\D/g, '')) || 0;
    return numB - numA;
  });

  const hasActiveFilters =
    search ||
    statusFilter !== 'ALL' ||
    priorityFilter !== 'ALL' ||
    customerFilter !== 'ALL' ||
    locationFilter !== 'ALL' ||
    techFilter !== 'ALL' ||
    issueFilter !== 'ALL';

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('ALL');
    setPriorityFilter('ALL');
    setCustomerFilter('ALL');
    setLocationFilter('ALL');
    setTechFilter('ALL');
    setIssueFilter('ALL');
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#172033] tracking-tight">
            Service Requests (AV & EPABX Support)
          </h1>
          <p className="text-xs md:text-sm text-[#667085] mt-1">
            Track customer service tickets, technician dispatches, priority levels, and real-time field progress.
          </p>
        </div>

        <button
          onClick={() => setIsCreateTicketOpen(true)}
          className="btn btn-primary shadow-sm text-xs font-bold"
        >
          <Plus className="w-4 h-4" />
          <span>Create Service Request</span>
        </button>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="card p-4 bg-white space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search Box */}
          <div className="relative sm:col-span-2">
            <Search className="w-4 h-4 text-[#98A2B3] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ticket #, customer, room or issue..."
              style={{ paddingLeft: '40px' }}
              className="form-input text-xs"
            />
          </div>

          {/* Customer Filter */}
          <select
            value={customerFilter}
            onChange={(e) => setCustomerFilter(e.target.value)}
            className="form-select text-xs font-bold text-[#004898]"
          >
            <option value="ALL">All Corporate Clients</option>
            {(customers || []).map(c => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="form-select text-xs font-semibold"
          >
            <option value="ALL">All Statuses</option>
            <option value="Unassigned">Unassigned</option>
            <option value="Assigned">Assigned</option>
            <option value="Service In Progress">Service In Progress</option>
            <option value="Resolved">Resolved</option>
          </select>

          {/* Priority Filter */}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="form-select text-xs font-semibold"
          >
            <option value="ALL">All Priorities</option>
            <option value="High">High</option>
            <option value="Low">Low</option>
          </select>

          {/* Location Filter */}
          <select
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            className="form-select text-xs font-semibold"
          >
            <option value="ALL">All Locations</option>
            <option value="Bengaluru">Bengaluru HQ</option>
            <option value="Chennai">Chennai Office</option>
            <option value="Hyderabad">Hyderabad Office</option>
          </select>
        </div>

        {hasActiveFilters && (
          <div className="flex items-center justify-between pt-2.5 border-t border-[#E4E7EC] text-xs">
            <span className="text-[#667085]">
              Showing <strong className="text-[#004898]">{filteredTickets.length}</strong> of {tickets.length} total tickets
            </span>
            <button
              onClick={clearFilters}
              className="text-[#F04438] font-bold hover:underline flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" />
              <span>Clear Filters</span>
            </button>
          </div>
        )}
      </div>

      {/* Main Spacious Table */}
      {filteredTickets.length === 0 ? (
        <EmptyState
          title="No Service Requests Found"
          subtitle="No tickets match your active filter criteria."
          icon="inbox"
          actionBtn={
            hasActiveFilters && (
              <button onClick={clearFilters} className="btn btn-secondary btn-sm">
                Clear Filters
              </button>
            )
          }
        />
      ) : (
        <div className="table-container shadow-sm border border-[#E4E7EC] rounded-2xl overflow-hidden bg-white">
          <table className="table w-full">
            <thead>
              <tr className="bg-[#F8FAFC] border-b border-[#E4E7EC]">
                <th className="px-5 py-3.5 text-left font-extrabold text-[#475467] text-[11px] uppercase tracking-wider w-[25%]">Ticket Details</th>
                <th className="px-5 py-3.5 text-left font-extrabold text-[#475467] text-[11px] uppercase tracking-wider w-[30%]">Client & Location</th>
                <th className="px-5 py-3.5 text-left font-extrabold text-[#475467] text-[11px] uppercase tracking-wider w-[10%]">Priority</th>
                <th className="px-5 py-3.5 text-left font-extrabold text-[#475467] text-[11px] uppercase tracking-wider w-[15%]">Assigned Tech</th>
                <th className="px-5 py-3.5 text-left font-extrabold text-[#475467] text-[11px] uppercase tracking-wider w-[10%]">Status</th>
                <th className="px-5 py-3.5 text-right font-extrabold text-[#475467] text-[11px] uppercase tracking-wider w-[10%]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F2F4F7]">
              {sortedTickets.map((t) => (
                <tr key={t.id} className="hover:bg-[#F8FAFC] transition-all">
                  
                  {/* Ticket Details (Title + ID + Date) */}
                  <td className="px-5 py-4">
                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs font-bold text-[#172033] line-clamp-1" title={t.title}>
                        {t.title}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setSelectedTicketId(t.id)}
                          className="px-2 py-0.5 rounded bg-[#EFF5FC] text-[#004898] hover:bg-[#D6E6F7] font-mono font-bold text-[10px] transition-all border border-[#B3D1F2] cursor-pointer"
                        >
                          {t.id}
                        </button>
                        <span className="text-[10px] text-[#98A2B3] font-medium">
                          {t.createdDate?.split(',')[0] || '18 Aug 2026'}
                        </span>
                      </div>
                    </div>
                  </td>

                  {/* Client & Location (Customer + Room/Building) */}
                  <td className="px-5 py-4">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5 font-bold text-[#172033] text-xs">
                        <Building2 className="w-3.5 h-3.5 text-[#004898] shrink-0" />
                        <span className="truncate">{t.customer}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-[#667085]">
                        <MapPin className="w-3.5 h-3.5 text-[#98A2B3] shrink-0 opacity-0" />
                        <span className="truncate">{t.room} • {t.location}</span>
                      </div>
                    </div>
                  </td>

                  {/* Priority */}
                  <td className="px-5 py-4 whitespace-nowrap">
                    <PriorityBadge priority={t.priority} />
                  </td>

                  {/* Assigned Engineer (Clickable to Reassign) */}
                  <td className="px-5 py-4 whitespace-nowrap">
                    {t.assignedTo ? (
                      <button
                        onClick={() => {
                          setSelectedTicketId(t.id);
                          setIsAssignModalOpen(true);
                        }}
                        className="flex items-center gap-2 text-xs font-bold text-[#172033] bg-[#F8FAFC] hover:bg-[#EFF5FC] hover:border-[#004898] px-2.5 py-1 rounded-lg border border-[#E4E7EC] transition-all cursor-pointer group"
                        title="Click to reassign to a different technician for tomorrow"
                      >
                        <Avatar src={t.assignedToAvatar} name={t.assignedTo} className="w-5 h-5" textClassName="text-[9px]" />
                        <span className="truncate group-hover:text-[#004898]">{t.assignedTo}</span>
                        <UserPlus className="w-3 h-3 text-[#98A2B3] group-hover:text-[#004898] ml-0.5" />
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setSelectedTicketId(t.id);
                          setIsAssignModalOpen(true);
                        }}
                        className="text-[11px] font-bold text-[#B54708] bg-[#FEF0C7] hover:bg-[#FDE68A] border border-[#FDE68A] px-2.5 py-1 rounded-lg transition-all cursor-pointer"
                      >
                        + Assign Tech
                      </button>
                    )}
                  </td>

                  {/* Status */}
                  <td className="px-5 py-4 whitespace-nowrap">
                    <StatusBadge status={t.status} />
                  </td>

                  {/* Actions (Icon-Only Buttons) */}
                  <td className="px-5 py-4 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => setSelectedTicketId(t.id)}
                        className="p-2 rounded-lg bg-[#EFF5FC] hover:bg-[#D1E4F9] text-[#004898] border border-[#B3D1F2] transition-all cursor-pointer shadow-2xs flex items-center justify-center"
                        title="View Ticket Details"
                      >
                        <Eye className="w-4 h-4 text-[#004898]" />
                      </button>

                      <button
                        onClick={() => {
                          setSelectedTicketId(t.id);
                          setIsAssignModalOpen(true);
                        }}
                        className={`p-2 rounded-lg transition-all cursor-pointer shadow-2xs flex items-center justify-center ${
                          t.assignedTo
                            ? 'bg-white hover:bg-[#EFF5FC] text-[#004898] border border-[#B3D1F2]'
                            : 'bg-[#004898] hover:bg-[#002D62] text-white border border-[#004898]'
                        }`}
                        title={t.assignedTo ? `Reassign Technician (Currently: ${t.assignedTo})` : "Assign Technician"}
                      >
                        <UserPlus className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => {
                          if (window.confirm(`Are you sure you want to delete ticket ${t.id}? This action cannot be undone.`)) {
                            deleteTicket(t.id);
                          }
                        }}
                        className="p-2 rounded-lg bg-white hover:bg-[#FEF3F2] text-[#F04438] border border-[#FEE4E2] transition-all cursor-pointer shadow-2xs flex items-center justify-center"
                        title="Delete Ticket"
                      >
                        <Trash2 className="w-4 h-4 text-[#F04438]" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
