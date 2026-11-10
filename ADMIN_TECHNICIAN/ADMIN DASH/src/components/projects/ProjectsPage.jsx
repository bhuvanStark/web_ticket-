import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { Plus, Search, Layers, CheckCircle2, Briefcase, Building2, MapPin, Archive, RotateCcw, Hourglass, ChevronRight, Moon, Users } from 'lucide-react';
import { fetchArchivedProjects } from '../../services/projectApiService';
import { EmptyState } from '../common/EmptyState';
import { TableSkeleton } from '../common/SkeletonLoader';
import { ProjectStatusPill, AvatarStack } from './workspace/projectUi';
import { timeAgo, daysSince } from './workspace/projectFormat';

// A project with no update for this many days counts as "gone quiet".
const QUIET_DAYS = 3;
const OPEN = ['Planning', 'Active'];

// Admin Projects screen: KPIs, Active / Pending approval / Completed /
// Archived tabs, search, and the projects table. A row opens the project
// workspace (timeline, daily log, files, completion).
export const ProjectsPage = () => {
  const {
    projects,
    isApiLoading,
    setSelectedProjectId,
    setIsNewProjectModalOpen,
    setProjectModalMode,
    restoreProject,
    currentUser
  } = useApp();

  const all = projects || [];
  const pendingCount = all.filter((p) => p.status === 'Pending Approval').length;
  const isSuperAdmin = currentUser?.isSuperAdmin === true;

  // A Super Admin with approvals waiting lands on that queue.
  const [activeTab, setActiveTab] = useState('active'); // active | pending | completed | archived
  const [autoOpened, setAutoOpened] = useState(false);
  useEffect(() => {
    if (!autoOpened && isSuperAdmin && pendingCount > 0) { setActiveTab('pending'); setAutoOpened(true); }
  }, [autoOpened, isSuperAdmin, pendingCount]);

  const [search, setSearch] = useState('');
  const [quietOnly, setQuietOnly] = useState(false);
  // Archived projects aren't part of the polled `projects` list; fetched
  // only while the Archived tab is open.
  const [archived, setArchived] = useState([]);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [archivedError, setArchivedError] = useState(false);
  const [restoringId, setRestoringId] = useState(null);

  const loadArchived = useCallback(async () => {
    setArchivedLoading(true);
    setArchivedError(false);
    try {
      const data = await fetchArchivedProjects();
      setArchived(Array.isArray(data) ? data : []);
    } catch {
      setArchivedError(true);
    } finally {
      setArchivedLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'archived') loadArchived();
  }, [activeTab, loadArchived]);

  const handleRestore = async (projectId) => {
    setRestoringId(projectId);
    const ok = await restoreProject(projectId);
    setRestoringId(null);
    if (ok) setArchived((prev) => prev.filter((p) => p.id !== projectId));
  };

  if (isApiLoading && all.length === 0) {
    return <TableSkeleton rows={5} />;
  }

  const isQuiet = (p) => OPEN.includes(p.status) && daysSince(p.last_activity_at) >= QUIET_DAYS;
  const tabScoped = activeTab === 'archived' ? archived
    : activeTab === 'pending' ? all.filter((p) => p.status === 'Pending Approval')
    : activeTab === 'completed' ? all.filter((p) => p.status === 'Completed')
    : all.filter((p) => OPEN.includes(p.status) && (!quietOnly || isQuiet(p)));

  const q = search.trim().toLowerCase();
  const filtered = !q ? tabScoped : tabScoped.filter((p) =>
    (p.name || '').toLowerCase().includes(q) ||
    (p.customer || '').toLowerCase().includes(q) ||
    (p.location || '').toLowerCase().includes(q) ||
    (p.id || '').toLowerCase().includes(q) ||
    (p.managers || []).some((m) => (m.name || '').toLowerCase().includes(q))
  );

  const activeCount = all.filter((p) => OPEN.includes(p.status)).length;
  const completedCount = all.filter((p) => p.status === 'Completed').length;
  const quietCount = all.filter(isQuiet).length;
  const newProject = () => { setProjectModalMode('create'); setIsNewProjectModalOpen(true); };

  const tabs = [
    { id: 'active', label: 'Active / Planning', count: activeCount, icon: Layers },
    { id: 'pending', label: 'Pending approval', count: pendingCount, icon: Hourglass, alert: pendingCount > 0 },
    { id: 'completed', label: 'Completed', count: completedCount, icon: CheckCircle2 },
    { id: 'archived', label: 'Archived', icon: Archive }
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#172033] tracking-tight">Projects</h1>
          <p className="text-xs md:text-sm text-[#667085] mt-1">
            Long-running, multi-day work — managers, daily log, files and completion approval.
          </p>
        </div>
        <button onClick={newProject} className="btn btn-primary shadow-sm text-xs font-bold">
          <Plus className="w-4 h-4" />
          <span>New Project</span>
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Active / planning" value={activeCount} icon={Layers} tone="#004898" onClick={() => { setActiveTab('active'); setQuietOnly(false); }} />
        <Kpi label="Pending approval" value={pendingCount} icon={Hourglass} tone="#F79009" highlight={pendingCount > 0} onClick={() => setActiveTab('pending')} />
        <Kpi label={`Quiet ${QUIET_DAYS}+ days`} value={quietCount} icon={Moon} tone="#D92D20" highlight={quietCount > 0} onClick={() => { setActiveTab('active'); setQuietOnly(true); }} />
        <Kpi label="Completed" value={completedCount} icon={CheckCircle2} tone="#12B76A" onClick={() => setActiveTab('completed')} />
      </div>

      <div className="card p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 w-full md:w-auto max-md:overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => { setActiveTab(t.id); if (t.id !== 'active') setQuietOnly(false); }}
              className={`px-3 py-2 rounded-lg text-xs font-extrabold transition-all flex items-center gap-1.5 cursor-pointer max-md:shrink-0 max-md:whitespace-nowrap ${
                activeTab === t.id ? 'bg-[#004898] text-white shadow-xs' : 'bg-[#F6F8FB] text-[#667085] hover:text-[#172033]'
              }`}
            >
              <t.icon className="w-3.5 h-3.5" />
              <span>{t.label}{t.count !== undefined && ` (${t.count})`}</span>
              {t.alert && activeTab !== t.id && <span className="w-2 h-2 rounded-full bg-[#F79009]" />}
            </button>
          ))}
          {quietOnly && activeTab === 'active' && (
            <button onClick={() => setQuietOnly(false)} className="px-2.5 py-1.5 rounded-full bg-[#FEF3F2] text-[#B42318] text-[11px] font-bold border border-[#FECDCA] shrink-0">
              Quiet only ✕
            </button>
          )}
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#98A2B3]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, customer, manager, ID…"
            style={{ paddingLeft: '36px' }}
            className="form-input text-xs w-full"
          />
        </div>
      </div>

      {activeTab === 'archived' ? (
        <ArchivedProjectsTable
          rows={filtered}
          loading={archivedLoading}
          failed={archivedError}
          onRetry={loadArchived}
          onRestore={handleRestore}
          restoringId={restoringId}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={activeTab === 'pending' ? 'Nothing waiting for approval' : activeTab === 'completed' ? 'No Completed Projects' : quietOnly ? 'No quiet projects' : 'No Active Projects'}
          subtitle={activeTab === 'pending'
            ? 'Projects a manager marks complete appear here for a Super Admin to approve.'
            : activeTab === 'completed' ? 'Approved projects appear here.' : 'Create a project to start tracking daily work.'}
          icon="inbox"
          actionBtn={
            activeTab === 'active' && !quietOnly && (
              <button onClick={newProject} className="btn btn-secondary btn-sm">
                <Plus className="w-3.5 h-3.5" /> New Project
              </button>
            )
          }
        />
      ) : (
        <div className="table-container shadow-sm border border-[#E4E7EC] rounded-2xl overflow-hidden max-md:overflow-x-auto bg-white">
          {/* Mobile (<768px) only: keep the desktop column layout at a readable
              fixed width and scroll it horizontally instead of squeezing it. */}
          <table className="table w-full table-fixed max-md:min-w-[980px]">
            <thead>
              <tr className="bg-[#F8FAFC] border-b border-[#E4E7EC]">
                <th className="px-5 py-3.5 text-left font-extrabold text-[#475467] text-[11px] uppercase tracking-wider w-[25%]">Project</th>
                <th className="px-5 py-3.5 text-left font-extrabold text-[#475467] text-[11px] uppercase tracking-wider w-[18%]">Client & Location</th>
                <th className="px-5 py-3.5 text-left font-extrabold text-[#475467] text-[11px] uppercase tracking-wider w-[14%]">Managers</th>
                <th className="px-5 py-3.5 text-left font-extrabold text-[#475467] text-[11px] uppercase tracking-wider w-[9%]">Team</th>
                <th className="px-5 py-3.5 text-left font-extrabold text-[#475467] text-[11px] uppercase tracking-wider w-[12%]">Last Updated</th>
                <th className="px-5 py-3.5 text-left font-extrabold text-[#475467] text-[11px] uppercase tracking-wider w-[17%]">Open Assignments</th>
                <th className="px-5 py-3.5 w-[5%]" aria-label="Open" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F2F4F7]">
              {filtered.map((p) => {
                const quiet = isQuiet(p);
                return (
                  <tr key={p.id} onClick={() => setSelectedProjectId(p.id)} className="hover:bg-[#F8FAFC] transition-all align-top cursor-pointer group">
                    <td className="px-5 py-4" style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <Briefcase className="w-3.5 h-3.5 text-[#004898] shrink-0" />
                        <span className="text-xs font-bold text-[#172033]">{p.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="px-2 py-0.5 rounded bg-[#EFF5FC] text-[#004898] font-mono font-bold text-[10px] border border-[#B3D1F2]">{p.id}</span>
                        <ProjectStatusPill status={p.status} className="!py-0.5" />
                      </div>
                      {p.end_date && OPEN.includes(p.status) && (
                        <div className="text-[10px] text-[#98A2B3] mt-1.5">Ends {new Date(p.end_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                      )}
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
                    <td className="px-5 py-4">
                      <AvatarStack people={p.managers || []} max={3} />
                      {(p.managers || []).length === 1 && <div className="text-[10px] font-semibold text-[#475467] mt-1 truncate">{p.managers[0].name}</div>}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#344054]"><Users className="w-3.5 h-3.5 text-[#98A2B3]" />{p.team_size || 0}</span>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <div className={`text-xs font-bold ${quiet ? 'text-[#B42318]' : 'text-[#344054]'}`}>{timeAgo(p.last_activity_at)}</div>
                      <div className="text-[10px] text-[#98A2B3] mt-0.5">
                        {p.last_activity_at ? new Date(p.last_activity_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                      </div>
                      {quiet && <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold text-[#B42318]"><Moon className="w-3 h-3" />Gone quiet</span>}
                    </td>
                    <td className="px-5 py-4" style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>
                      {(p.active_activities || []).length === 0 ? (
                        <span className="text-[11px] font-bold text-[#98A2B3]">{p.status === 'Pending Approval' ? 'Paused for approval' : p.status === 'Completed' ? '—' : 'None scheduled'}</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {p.active_activities.slice(0, 3).map((a) => (
                            <span key={a.id} className="text-[10px] font-bold text-[#026AA2] bg-[#F0F9FF] px-2 py-0.5 rounded-lg border border-[#B9E6FE]">
                              {a.technician_name} · {new Date(a.scheduled_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                            </span>
                          ))}
                          {p.active_activities.length > 3 && (
                            <span className="text-[10px] font-bold text-[#667085]">+{p.active_activities.length - 3} more</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-4 text-right">
                      <ChevronRight className="w-4 h-4 text-[#98A2B3] group-hover:text-[#004898] inline" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const Kpi = ({ label, value, icon: Icon, tone, highlight, onClick }) => (
  <button onClick={onClick} className={`text-left bg-white rounded-2xl border p-4 transition-all hover:shadow-md ${highlight ? 'border-transparent ring-1' : 'border-[#E4E7EC]'}`} style={highlight ? { '--tw-ring-color': `${tone}55`, background: `linear-gradient(135deg, ${tone}0D, #fff 60%)` } : undefined}>
    <div className="flex items-center justify-between">
      <span className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${tone}14`, color: tone }}><Icon className="w-4 h-4" /></span>
      <span className="text-2xl font-black text-[#172033]">{value}</span>
    </div>
    <div className="text-[11px] font-bold text-[#667085] mt-2">{label}</div>
  </button>
);

const fmtDate = (value) => (value
  ? new Date(value).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—');

// Projects deleted together with their history: kept for 3 days, then
// purged by the backend. Restore puts one back exactly as it was.
const ArchivedProjectsTable = ({ rows, loading, failed, onRetry, onRestore, restoringId }) => {
  if (loading && rows.length === 0) return <TableSkeleton rows={3} />;
  if (failed) {
    return (
      <div className="card p-6 text-center text-xs text-[#B42318]">
        Could not load archived projects.{' '}
        <button onClick={onRetry} className="font-bold text-[#004898] hover:underline">Retry</button>
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No Archived Projects"
        subtitle="Projects deleted with their history stay here for 3 days and can be restored."
        icon="inbox"
      />
    );
  }
  return (
    <div className="table-container shadow-sm border border-[#E4E7EC] rounded-2xl overflow-hidden max-md:overflow-x-auto bg-white">
      <table className="table w-full table-fixed max-md:min-w-[760px]">
        <thead>
          <tr className="bg-[#F8FAFC] border-b border-[#E4E7EC]">
            <th className="px-5 py-3.5 text-left font-extrabold text-[#475467] text-[11px] uppercase tracking-wider w-[28%]">Project</th>
            <th className="px-5 py-3.5 text-left font-extrabold text-[#475467] text-[11px] uppercase tracking-wider w-[24%]">Client & Location</th>
            <th className="px-5 py-3.5 text-left font-extrabold text-[#475467] text-[11px] uppercase tracking-wider w-[17%]">Archived</th>
            <th className="px-5 py-3.5 text-left font-extrabold text-[#475467] text-[11px] uppercase tracking-wider w-[17%]">Deleted Permanently</th>
            <th className="px-5 py-3.5 text-right font-extrabold text-[#475467] text-[11px] uppercase tracking-wider w-[14%]">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#F2F4F7]">
          {rows.map((p) => (
            <tr key={p.id} className="align-top">
              <td className="px-5 py-4" style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>
                <div className="flex items-center gap-2 mb-1">
                  <Briefcase className="w-3.5 h-3.5 text-[#98A2B3] shrink-0" />
                  <span className="text-xs font-bold text-[#172033]">{p.name}</span>
                </div>
                <span className="px-2 py-0.5 rounded bg-[#F2F4F7] text-[#475467] font-mono font-bold text-[10px] border border-[#E4E7EC]">{p.id}</span>
              </td>
              <td className="px-5 py-4" style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>
                <div className="font-bold text-[#172033] text-xs mb-1">{p.customer}</div>
                <div className="text-[10px] text-[#667085]">{p.location}</div>
              </td>
              <td className="px-5 py-4 text-xs text-[#475467]">{fmtDate(p.archived_at)}</td>
              <td className="px-5 py-4 text-xs font-semibold text-[#B42318]">{fmtDate(p.purge_at)}</td>
              <td className="px-5 py-4 whitespace-nowrap text-right">
                <button
                  onClick={() => onRestore(p.id)}
                  disabled={restoringId === p.id}
                  className="btn btn-secondary btn-sm font-bold disabled:opacity-60"
                  title="Restore project and its history"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{restoringId === p.id ? 'Restoring…' : 'Restore'}</span>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
