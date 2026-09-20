import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { X, Pencil, UserPlus, History, CheckCircle2, Trash2, Calendar, Building2, MapPin, User, ArrowRightLeft } from 'lucide-react';
import { StatusBadge } from '../common/Badge';
import { ProjectActivityHistoryView } from './ProjectActivityHistoryView';

// Reassign one active activity to a different technician — a small inline
// picker rather than a whole separate modal, per §14's "keep V1 simple".
const ReassignRow = ({ activity, technicians, onReassign }) => {
  const [picking, setPicking] = useState(false);
  const [techId, setTechId] = useState('');

  if (!picking) {
    return (
      <button
        onClick={() => setPicking(true)}
        className="p-1.5 rounded-lg text-[#667085] hover:text-[#004898] hover:bg-[#EFF5FC] transition-all cursor-pointer"
        title="Reassign to a different technician"
      >
        <ArrowRightLeft className="w-3.5 h-3.5" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={techId}
        onChange={(e) => setTechId(e.target.value)}
        className="text-[11px] border border-[#E4E7EC] rounded-lg px-1.5 py-1 outline-none focus:border-[#004898]"
      >
        <option value="">Select tech…</option>
        {technicians
          .filter((t) => t.id !== activity.technician_id)
          .map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      <button
        onClick={async () => { if (techId) { await onReassign(activity.id, techId); setPicking(false); setTechId(''); } }}
        disabled={!techId}
        className="text-[11px] font-bold text-white bg-[#004898] hover:bg-[#003673] disabled:opacity-40 rounded-lg px-2 py-1 cursor-pointer"
      >
        Go
      </button>
      <button onClick={() => setPicking(false)} className="text-[11px] text-[#667085] hover:text-[#172033] cursor-pointer px-1">
        ✕
      </button>
    </div>
  );
};

export const ProjectDetailsModal = () => {
  const {
    selectedProject,
    setSelectedProjectId,
    role,
    technicians,
    setIsNewProjectModalOpen,
    setProjectModalMode,
    setIsAssignProjectTeamModalOpen,
    markProjectComplete,
    deleteProject,
    reassignActivity
  } = useApp();

  const [showHistory, setShowHistory] = useState(false);

  // Admins see this everywhere; there's no technician-facing project detail
  // view in V1 (technicians work from their dashboard/jobs page instead).
  if (!selectedProject || role !== 'admin') return null;
  const p = selectedProject;

  const activeByDate = (p.active_activities || []).reduce((groups, a) => {
    const key = a.scheduled_date;
    if (!groups[key]) groups[key] = [];
    groups[key].push(a);
    return groups;
  }, {});

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden my-8 max-h-[90vh] flex flex-col transform scale-100 animate-in zoom-in-95 duration-200">

        <div className="px-8 pt-8 pb-6 border-b border-[#E4E7EC] bg-white flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div className="flex-1 pr-4">
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <span className="text-sm font-extrabold text-[#004898] font-mono px-2.5 py-1 bg-[#EFF5FC] rounded-md">{p.id}</span>
              <StatusBadge status={p.status} />
            </div>
            <h2 className="text-2xl md:text-3xl font-black text-[#172033] tracking-tight leading-tight">{p.name}</h2>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              onClick={() => { setProjectModalMode('edit'); setIsNewProjectModalOpen(true); }}
              className="btn bg-white hover:bg-[#F8FAFC] text-[#475467] border border-[#E4E7EC] font-bold shadow-sm"
              title="Edit project"
            >
              <Pencil className="w-4 h-4" />
            </button>
            {p.status !== 'Completed' && (
              <>
                <button
                  onClick={() => setIsAssignProjectTeamModalOpen(true)}
                  className="btn btn-primary font-bold shadow-sm"
                  title="Assign technicians for a date"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Assign Team</span>
                </button>
                <button
                  onClick={async () => {
                    if (window.confirm(`Mark ${p.id} as Completed? This requires no active daily activities remaining.`)) {
                      await markProjectComplete(p.id);
                    }
                  }}
                  className="btn bg-white hover:bg-[#ECFDF3] text-[#027A48] border border-[#A6F4C5] font-bold shadow-sm"
                  title="Mark project complete"
                >
                  <CheckCircle2 className="w-4 h-4" />
                </button>
              </>
            )}
            <button
              onClick={async () => {
                if (window.confirm(`Delete project ${p.id}? This cannot be undone.`)) {
                  const ok = await deleteProject(p.id);
                  if (ok) setSelectedProjectId(null);
                }
              }}
              className="btn bg-white hover:bg-[#FEF2F2] text-[#B91C1C] border border-[#FCA5A5] font-bold shadow-sm"
              title="Delete project"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setSelectedProjectId(null)}
              className="w-10 h-10 flex items-center justify-center text-[#667085] hover:text-[#172033] hover:bg-[#F8FAFC] rounded-xl transition-colors border border-transparent hover:border-[#E4E7EC]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-8 overflow-y-auto space-y-6 flex-1 bg-[#F8FAFC]">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              [Building2, 'Customer', p.customer],
              [MapPin, 'Location', p.location],
              [Calendar, 'Expected End', p.end_date ? new Date(p.end_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'],
              [User, 'Responsible Admin', p.admin?.full_name || 'Unassigned']
            ].map(([Icon, label, value]) => (
              <div key={label} className="bg-white rounded-xl border border-[#E4E7EC] p-3">
                <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-[#667085] mb-1">
                  <Icon className="w-3 h-3" /> {label}
                </div>
                <div className="text-sm font-bold text-[#172033] truncate">{value}</div>
              </div>
            ))}
          </div>

          {p.description && (
            <div className="bg-white p-4 rounded-xl border border-[#E4E7EC]">
              <h3 className="text-[11px] font-black uppercase tracking-widest text-[#667085] mb-1.5">Description / Scope</h3>
              <p className="text-sm text-[#344054] leading-relaxed">{p.description}</p>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-[#E4E7EC] shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E4E7EC] bg-[#F8FAFC]">
              <h3 className="font-extrabold text-[#172033] text-sm">Current Daily Assignments</h3>
              <p className="text-xs text-[#667085] mt-0.5">Assigned or accepted — not yet completed</p>
            </div>
            <div className="divide-y divide-[#E4E7EC]">
              {Object.keys(activeByDate).length === 0 ? (
                <div className="p-6 text-center text-xs text-[#667085]">Unassigned — no active daily assignments.</div>
              ) : (
                Object.entries(activeByDate).map(([date, activities]) => (
                  <div key={date} className="p-4">
                    <div className="text-xs font-bold text-[#004898] mb-2">
                      {new Date(date).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
                    </div>
                    <div className="space-y-2">
                      {activities.map((a) => (
                        <div key={a.id} className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E4E7EC]">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs font-bold text-[#172033] truncate">{a.technician_name || '—'}</span>
                            <span className="text-[10px] text-[#667085] shrink-0">{a.scheduled_time}</span>
                            <StatusBadge status={a.status} />
                          </div>
                          <ReassignRow
                            activity={a}
                            technicians={technicians || []}
                            onReassign={reassignActivity}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <button
              onClick={() => setShowHistory((v) => !v)}
              className="text-xs font-bold text-[#004898] hover:underline flex items-center gap-1.5"
            >
              <History className="w-3.5 h-3.5" />
              {showHistory ? 'Hide Activity History' : 'View Activity History'}
            </button>
            {showHistory && (
              <div className="mt-3 bg-white rounded-2xl border border-[#E4E7EC] shadow-sm p-4">
                <ProjectActivityHistoryView projectId={p.id} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
