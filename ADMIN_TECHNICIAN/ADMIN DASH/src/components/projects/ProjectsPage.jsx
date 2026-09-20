import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Plus, Search, Layers, CheckCircle2, Briefcase, Building2, MapPin, User, Eye } from 'lucide-react';
import { EmptyState } from '../common/EmptyState';
import { TableSkeleton } from '../common/SkeletonLoader';

// Main Project Category (V1) screen — header, Active/Planning vs Completed
// tabs, search, and a simple projects table. Integrated as a sibling of
// Service Requests, one level below it in the sidebar, per spec §8/§14.
export const ProjectsPage = () => {
  const {
    projects,
    isApiLoading,
    setSelectedProjectId,
    setIsNewProjectModalOpen,
    setProjectModalMode
  } = useApp();

  const [activeTab, setActiveTab] = useState('active'); // 'active' | 'completed'
  const [search, setSearch] = useState('');

  if (isApiLoading && (projects || []).length === 0) {
    return <TableSkeleton rows={5} />;
  }

  const tabScoped = (projects || []).filter((p) =>
    activeTab === 'completed' ? p.status === 'Completed' : p.status !== 'Completed'
  );

  const q = search.trim().toLowerCase();
  const filtered = !q ? tabScoped : tabScoped.filter((p) =>
    (p.name || '').toLowerCase().includes(q) ||
    (p.customer || '').toLowerCase().includes(q) ||
    (p.location || '').toLowerCase().includes(q) ||
    (p.id || '').toLowerCase().includes(q)
  );

  const activeCount = (projects || []).filter((p) => p.status !== 'Completed').length;
  const completedCount = (projects || []).filter((p) => p.status === 'Completed').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#172033] tracking-tight">Projects</h1>
          <p className="text-xs md:text-sm text-[#667085] mt-1">
            Long-running, multi-day work — tracked separately from Service Tickets.
          </p>
        </div>
        <button
          onClick={() => { setProjectModalMode('create'); setIsNewProjectModalOpen(true); }}
          className="btn btn-primary shadow-sm text-xs font-bold"
        >
          <Plus className="w-4 h-4" />
          <span>New Project</span>
        </button>
      </div>

      <div className="card p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 w-full md:w-auto">
          <button
            onClick={() => setActiveTab('active')}
            className={`px-3 py-2 rounded-lg text-xs font-extrabold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'active' ? 'bg-[#004898] text-white shadow-xs' : 'bg-[#F6F8FB] text-[#667085] hover:text-[#172033]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Active / Planning ({activeCount})</span>
          </button>
          <button
            onClick={() => setActiveTab('completed')}
            className={`px-3 py-2 rounded-lg text-xs font-extrabold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'completed' ? 'bg-[#004898] text-white shadow-xs' : 'bg-[#F6F8FB] text-[#667085] hover:text-[#172033]'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Completed ({completedCount})</span>
          </button>
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#98A2B3]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, customer, location, ID…"
            style={{ paddingLeft: '36px' }}
            className="form-input text-xs w-full"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={activeTab === 'completed' ? 'No Completed Projects' : 'No Active Projects'}
          subtitle={activeTab === 'completed' ? 'Completed projects will appear here.' : 'Create a project to start tracking daily activities.'}
          icon="inbox"
          actionBtn={
            activeTab === 'active' && (
              <button onClick={() => { setProjectModalMode('create'); setIsNewProjectModalOpen(true); }} className="btn btn-secondary btn-sm">
                <Plus className="w-3.5 h-3.5" /> New Project
              </button>
            )
          }
        />
      ) : (
        <div className="table-container shadow-sm border border-[#E4E7EC] rounded-2xl overflow-hidden bg-white">
          <table className="table w-full table-fixed">
            <thead>
              <tr className="bg-[#F8FAFC] border-b border-[#E4E7EC]">
                <th className="px-5 py-3.5 text-left font-extrabold text-[#475467] text-[11px] uppercase tracking-wider w-[22%]">Project</th>
                <th className="px-5 py-3.5 text-left font-extrabold text-[#475467] text-[11px] uppercase tracking-wider w-[18%]">Client & Location</th>
                <th className="px-5 py-3.5 text-left font-extrabold text-[#475467] text-[11px] uppercase tracking-wider w-[12%]">Expected End</th>
                <th className="px-5 py-3.5 text-left font-extrabold text-[#475467] text-[11px] uppercase tracking-wider w-[14%]">Responsible</th>
                <th className="px-5 py-3.5 text-left font-extrabold text-[#475467] text-[11px] uppercase tracking-wider w-[24%]">Current Daily Assignments</th>
                <th className="px-5 py-3.5 text-right font-extrabold text-[#475467] text-[11px] uppercase tracking-wider w-[10%]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F2F4F7]">
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-[#F8FAFC] transition-all align-top">
                  <td className="px-5 py-4" style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>
                    <div className="flex items-center gap-2 mb-1">
                      <Briefcase className="w-3.5 h-3.5 text-[#004898] shrink-0" />
                      <span className="text-xs font-bold text-[#172033]">{p.name}</span>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-[#EFF5FC] text-[#004898] font-mono font-bold text-[10px] border border-[#B3D1F2]">{p.id}</span>
                  </td>
                  <td className="px-5 py-4" style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>
                    <div className="flex items-center gap-1.5 font-bold text-[#172033] text-xs mb-1">
                      <Building2 className="w-3.5 h-3.5 text-[#004898] shrink-0" />
                      <span>{p.customer}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-[#667085]">
                      <MapPin className="w-3 h-3 shrink-0" />
                      <span>{p.location}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-xs text-[#475467] whitespace-nowrap">
                    {p.end_date ? new Date(p.end_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-[#172033]">
                      <User className="w-3.5 h-3.5 text-[#98A2B3]" />
                      <span className="truncate">{p.admin?.full_name || 'Unassigned'}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4" style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>
                    {(p.active_activities || []).length === 0 ? (
                      <span className="text-[11px] font-bold text-[#B54708] bg-[#FEF0C7] px-2 py-0.5 rounded-lg border border-[#FDE68A]">Unassigned</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {p.active_activities.slice(0, 4).map((a) => (
                          <span key={a.id} className="text-[10px] font-bold text-[#026AA2] bg-[#F0F9FF] px-2 py-0.5 rounded-lg border border-[#B9E6FE]">
                            {a.technician_name} · {new Date(a.scheduled_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                          </span>
                        ))}
                        {p.active_activities.length > 4 && (
                          <span className="text-[10px] font-bold text-[#667085]">+{p.active_activities.length - 4} more</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap text-right">
                    <button
                      onClick={() => setSelectedProjectId(p.id)}
                      className="p-2 rounded-lg bg-[#EFF5FC] hover:bg-[#D1E4F9] text-[#004898] border border-[#B3D1F2] transition-all cursor-pointer shadow-2xs inline-flex items-center justify-center"
                      title="View Project"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
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
