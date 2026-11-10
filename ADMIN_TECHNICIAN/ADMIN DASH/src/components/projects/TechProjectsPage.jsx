import React, { useCallback, useEffect, useState } from 'react';
import { Briefcase, Building2, MapPin, Clock, CalendarDays, ChevronRight, AlertOctagon, Eye, Crown } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { fetchMyProjects } from '../../services/projectApiService';
import { EmptyState } from '../common/EmptyState';
import { TableSkeleton } from '../common/SkeletonLoader';
import { ProjectStatusPill, AvatarStack } from './workspace/projectUi';
import { timeAgo } from './workspace/projectFormat';

// Technician's projects: the ones they manage and the ones they're on
// (view-only). Opening one shows the full workspace.
export const TechProjectsPage = () => {
  const { baseRole, currentUser, pollTick, selectedProjectId, setSelectedProjectId } = useApp();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('open');

  // An admin in "view as technician" reads that technician's list.
  const technicianId = baseRole === 'admin' ? currentUser?.id : undefined;
  const load = useCallback(async () => {
    try {
      const data = await fetchMyProjects(technicianId);
      setRows(Array.isArray(data) ? data : []);
      setError('');
    } catch (err) {
      setError(err.message);
      setRows((r) => r || []);
    }
  }, [technicianId]);

  useEffect(() => { load(); }, [load, pollTick]);
  // Refresh when the workspace closes (assignments/approval may have changed).
  useEffect(() => { if (!selectedProjectId) load(); }, [selectedProjectId, load]);

  if (rows === null) return <TableSkeleton rows={4} />;

  const open = rows.filter((p) => p.status !== 'Completed');
  const done = rows.filter((p) => p.status === 'Completed');
  const shown = tab === 'open' ? open : done;
  const managing = rows.filter((p) => p.my_role === 'manager' && p.status !== 'Completed').length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-[#172033] tracking-tight">Projects</h1>
        <p className="text-xs md:text-sm text-[#667085] mt-1">
          {managing > 0 ? `You manage ${managing} active project${managing === 1 ? '' : 's'}. ` : ''}See every day&apos;s work, files and progress on your projects.
        </p>
      </div>

      <div className="flex gap-2">
        {[['open', `Active (${open.length})`], ['done', `Completed (${done.length})`]].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-3.5 py-2 rounded-lg text-xs font-extrabold transition-all ${tab === id ? 'bg-[#004898] text-white shadow-xs' : 'bg-white border border-[#E4E7EC] text-[#667085] hover:text-[#172033]'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p className="text-xs font-semibold text-[#B42318]">{error}</p>}

      {shown.length === 0 ? (
        <EmptyState
          title={tab === 'open' ? 'No active projects' : 'No completed projects'}
          subtitle="Projects you're added to — as a manager or part of the team — show up here."
          icon="inbox"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {shown.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedProjectId(p.id)}
              className="group text-left bg-white rounded-2xl border border-[#E4E7EC] p-5 hover:shadow-lg hover:border-[#B3D1F2] transition-all flex flex-col"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 rounded bg-[#EFF5FC] text-[#004898] font-mono font-bold text-[10px] border border-[#B3D1F2]">{p.id}</span>
                  <ProjectStatusPill status={p.status} className="!py-0.5" />
                </div>
                {p.my_role === 'manager' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#004898] text-white text-[10px] font-black uppercase tracking-wider shrink-0"><Crown className="w-3 h-3" />Manager</span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#F2F4F7] text-[#475467] text-[10px] font-black uppercase tracking-wider shrink-0"><Eye className="w-3 h-3" />Team</span>
                )}
              </div>
              <h3 className="text-base font-extrabold text-[#172033] leading-snug flex items-start gap-2">
                <Briefcase className="w-4 h-4 text-[#004898] mt-0.5 shrink-0" />{p.name}
              </h3>
              <div className="mt-2 space-y-1 text-xs text-[#667085]">
                <div className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5 shrink-0" />{p.customer}</div>
                <div className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 shrink-0" />{p.location}</div>
              </div>

              {p.status === 'Active' && p.rejection_reason && p.my_role === 'manager' && (
                <div className="mt-3 flex items-start gap-1.5 p-2 rounded-lg bg-[#FEF3F2] text-[#B42318] text-[11px] font-semibold">
                  <AlertOctagon className="w-3.5 h-3.5 mt-px shrink-0" /> Completion sent back: {p.rejection_reason}
                </div>
              )}

              <div className="mt-auto pt-4 flex items-end justify-between gap-3">
                <div className="space-y-1.5">
                  <AvatarStack people={p.managers || []} max={3} size="w-6 h-6" />
                  <div className="flex items-center gap-3 text-[11px] text-[#667085]">
                    <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{timeAgo(p.last_activity_at)}</span>
                    {p.my_open_activities > 0 && (
                      <span className="inline-flex items-center gap-1 font-bold text-[#B54708]"><CalendarDays className="w-3 h-3" />{p.my_open_activities} for you</span>
                    )}
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-[#98A2B3] group-hover:text-[#004898] group-hover:translate-x-0.5 transition-all" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
