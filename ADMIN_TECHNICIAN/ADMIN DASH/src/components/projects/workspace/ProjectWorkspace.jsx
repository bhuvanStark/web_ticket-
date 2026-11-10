import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft, CalendarPlus, Pencil, Trash2, Building2, MapPin, Clock, AlertOctagon, Hourglass, Loader2,
  LayoutGrid, GanttChartSquare, MessageSquareText, FolderOpen, ClipboardCheck, RefreshCw, Eye
} from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { fetchProjectWorkspace } from '../../../services/projectApiService';
import { ProjectStatusPill, AvatarStack } from './projectUi';
import { timeAgo } from './projectFormat';
import { OverviewTab } from './OverviewTab';
import { TimelineTab } from './TimelineTab';
import { DailyLogTab } from './DailyLogTab';
import { FilesTab } from './FilesTab';
import { CompletionTab } from './CompletionTab';
import { AssignWorkDialog } from './AssignWorkDialog';
import { ReviewDialog } from './ReviewDialog';

const TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'timeline', label: 'Timeline', icon: GanttChartSquare },
  { id: 'log', label: 'Daily log', icon: MessageSquareText },
  { id: 'files', label: 'Files', icon: FolderOpen },
  { id: 'completion', label: 'Completion', icon: ClipboardCheck }
];

// One project, full screen — shared by admins, project managers and the
// view-only team. What each person can do comes from the server (`access`).
export const ProjectWorkspace = ({ projectId, onClose }) => {
  const {
    showToast, pollTick, role, projects, refreshProjects,
    setProjectModalMode, setIsNewProjectModalOpen, deleteProject
  } = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('overview');
  const [assigning, setAssigning] = useState(false);
  const [reviewing, setReviewing] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setRefreshing(true);
    try {
      const next = await fetchProjectWorkspace(projectId);
      setData(next);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setRefreshing(false);
    }
  }, [projectId]);

  useEffect(() => { setData(null); setTab('overview'); load(); }, [load]);
  // Live: follow the app's shared 30s poll, and reload after an admin edit.
  const listEntry = (projects || []).find((p) => p.id === projectId);
  useEffect(() => { if (pollTick) load({ quiet: true }); }, [pollTick, load]);
  useEffect(() => { if (listEntry?.updated_at) load({ quiet: true }); }, [listEntry?.updated_at, load]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !assigning && !reviewing && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, assigning, reviewing]);

  const changed = useCallback(() => {
    load({ quiet: true });
    if (role === 'admin') refreshProjects();
  }, [load, role, refreshProjects]);

  if (!data) {
    return (
      <Shell onClose={onClose}>
        <div className="flex-1 flex items-center justify-center p-8">
          {error ? (
            <div className="text-center">
              <p className="text-sm font-bold text-[#172033]">Could not open this project</p>
              <p className="text-xs text-[#667085] mt-1">{error}</p>
              <button onClick={() => load()} className="mt-4 px-4 py-2 bg-[#004898] text-white text-xs font-bold rounded-xl">Try again</button>
            </div>
          ) : <Loader2 className="w-8 h-8 animate-spin text-[#004898]" />}
        </div>
      </Shell>
    );
  }

  const { project, access, members, activities, files } = data;
  const managers = members.filter((m) => m.role === 'manager');
  const open = ['Planning', 'Active'].includes(project.status);
  const counts = {
    log: activities.length,
    files: files.length
  };

  return (
    <Shell onClose={onClose}>
      <header className="bg-white border-b border-[#E4E7EC] shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4 sm:pt-5">
          <div className="flex items-start gap-3">
            <button onClick={onClose} className="mt-0.5 p-2 -ml-2 rounded-xl text-[#475467] hover:bg-[#F2F4F7]" aria-label="Back to projects">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                <span className="px-2 py-0.5 rounded-md bg-[#EFF5FC] text-[#004898] font-mono font-bold text-[11px] border border-[#B3D1F2]">{project.id}</span>
                <ProjectStatusPill status={project.status} />
                {!access.isAdmin && (
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${access.canManage ? 'bg-[#004898] text-white' : 'bg-[#F2F4F7] text-[#475467]'}`}>
                    {access.canManage ? 'You manage this' : <><Eye className="w-3 h-3" /> View only</>}
                  </span>
                )}
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-[#172033] tracking-tight leading-tight break-words">{project.name}</h1>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-[#667085]">
                <span className="inline-flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" />{project.customer}</span>
                <span className="inline-flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />{project.location}</span>
                <span className="inline-flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />Updated {timeAgo(project.last_activity_at)}</span>
              </div>
            </div>

            <div className="hidden md:flex flex-col items-end gap-2 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-[#98A2B3]">Managers</span>
                <AvatarStack people={managers} />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-4">
            {access.canManage && open && (
              <button onClick={() => setAssigning(true)} className="px-4 py-2 bg-[#004898] hover:bg-[#003673] text-white text-xs font-extrabold rounded-xl shadow-xs inline-flex items-center gap-2">
                <CalendarPlus className="w-4 h-4" /> Assign work
              </button>
            )}
            {access.isAdmin && (
              <button onClick={() => { setProjectModalMode('edit'); setIsNewProjectModalOpen(true); }} className="px-3.5 py-2 bg-white border border-[#E4E7EC] hover:bg-[#F8FAFC] text-[#344054] text-xs font-bold rounded-xl inline-flex items-center gap-2">
                <Pencil className="w-3.5 h-3.5" /> Edit & team
              </button>
            )}
            <button onClick={() => load()} className="p-2 rounded-xl border border-[#E4E7EC] text-[#667085] hover:bg-[#F8FAFC]" title="Refresh" aria-label="Refresh">
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            {access.isAdmin && (
              <button
                onClick={async () => {
                  if (!window.confirm(`Delete project ${project.id}?`)) return;
                  if (await deleteProject(project.id)) onClose();
                }}
                className="ml-auto p-2 rounded-xl border border-[#FECDCA] text-[#D92D20] hover:bg-[#FEF3F2]"
                title="Delete project"
                aria-label="Delete project"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>

          <nav className="flex gap-1 mt-4 -mb-px overflow-x-auto" role="tablist">
            {TABS.map((t) => {
              const active = tab === t.id;
              const badge = t.id === 'completion' && project.status === 'Pending Approval';
              return (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(t.id)}
                  className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold border-b-2 transition-colors ${active ? 'border-[#004898] text-[#004898]' : 'border-transparent text-[#667085] hover:text-[#172033]'}`}
                >
                  <t.icon className="w-4 h-4" />
                  {t.label}
                  {counts[t.id] > 0 && <span className={`px-1.5 rounded-full text-[10px] ${active ? 'bg-[#EFF5FC]' : 'bg-[#F2F4F7]'}`}>{counts[t.id]}</span>}
                  {badge && <span className="w-2 h-2 rounded-full bg-[#F79009]" />}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 space-y-4 pb-24 md:pb-8">
          {project.status === 'Pending Approval' && (
            <Banner tone="amber" icon={Hourglass} title="Waiting for Super Admin approval"
              text={`Submitted by ${project.submitted_by_name || '—'} ${timeAgo(project.submitted_at)}. New assignments are paused until it's decided.`}
              action={access.canApprove && <button onClick={() => setReviewing('approve')} className="px-3.5 py-2 bg-[#172033] text-white text-xs font-bold rounded-xl">Review</button>} />
          )}
          {open && project.rejection_reason && (
            <Banner tone="red" icon={AlertOctagon} title={`Completion was sent back${project.reviewed_by_name ? ` by ${project.reviewed_by_name}` : ''}`}
              text={project.rejection_reason}
              action={access.canManage && <button onClick={() => setTab('completion')} className="px-3.5 py-2 bg-white border border-[#FDA29B] text-[#B42318] text-xs font-bold rounded-xl">Fix & resubmit</button>} />
          )}

          {tab === 'overview' && <OverviewTab data={data} onChanged={changed} showToast={showToast} onOpenTab={setTab} />}
          {tab === 'timeline' && <TimelineTab data={data} />}
          {tab === 'log' && <DailyLogTab data={data} />}
          {tab === 'files' && <FilesTab data={data} onChanged={changed} showToast={showToast} />}
          {tab === 'completion' && <CompletionTab data={data} onChanged={changed} showToast={showToast} />}
        </div>
      </main>

      {assigning && <AssignWorkDialog data={data} onClose={() => setAssigning(false)} onDone={() => { setAssigning(false); changed(); }} showToast={showToast} />}
      {reviewing && <ReviewDialog projectId={project.id} decision={reviewing} onClose={() => setReviewing(null)} onDone={() => { setReviewing(null); changed(); }} showToast={showToast} />}
    </Shell>
  );
};

const Shell = ({ children }) => (
  <div className="fixed inset-0 z-50 bg-[#F6F8FB] flex flex-col animate-in fade-in duration-150" role="dialog" aria-modal="true">
    {children}
  </div>
);

const Banner = ({ tone, icon: Icon, title, text, action }) => {
  const styles = tone === 'red'
    ? 'bg-[#FEF3F2] border-[#FECDCA] text-[#B42318]'
    : 'bg-[#FFFAEB] border-[#FEDF89] text-[#B54708]';
  return (
    <div className={`rounded-2xl border px-4 py-3.5 flex flex-wrap items-center gap-3 ${styles}`}>
      <Icon className="w-5 h-5 shrink-0" />
      <div className="flex-1 min-w-[200px]">
        <p className="text-sm font-extrabold">{title}</p>
        <p className="text-xs mt-0.5 opacity-90 break-words">{text}</p>
      </div>
      {action}
    </div>
  );
};
