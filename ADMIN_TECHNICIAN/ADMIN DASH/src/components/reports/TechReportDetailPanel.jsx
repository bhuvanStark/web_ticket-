// One technician's work in the selected period — opened from the Reports
// leaderboard. Read-only: tickets (completed / handed off in the period plus
// everything still open) and project activities (scheduled or completed in
// the period plus any overdue). Side drawer on desktop, bottom sheet on
// phones; rendered into document.body so it sits above the app chrome.
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Ticket, FolderKanban, Star, Wifi, MapPin } from 'lucide-react';
import { fetchTechReportDetail } from '../../services/techReportApiService';
import { fmtDateTime, fmtHours, fmtRange, fmtDay, fmtPct, statusLabel } from './techReportFormat';

const BUCKET_CHIP = {
  completed: { label: 'Completed', cls: 'bg-[#ECFDF3] text-[#027A48]' },
  open: { label: 'Open', cls: 'bg-[#EFF8FF] text-[#175CD3]' },
  reassigned: { label: 'Reassigned', cls: 'bg-[#F2F4F7] text-[#475467]' }
};

const activityChip = (a) => {
  if (a.status === 'Completed') return a.onTime ? { label: 'On time', cls: 'bg-[#ECFDF3] text-[#027A48]' } : { label: 'Late', cls: 'bg-[#FFFAEB] text-[#B54708]' };
  if (a.overdue) return { label: 'Overdue', cls: 'bg-[#FEF3F2] text-[#B42318]' };
  return { label: a.status, cls: 'bg-[#EFF8FF] text-[#175CD3]' };
};

const resolutionHours = (t) => (t.completedAt && t.createdAt ? (new Date(t.completedAt) - new Date(t.createdAt)) / 3600000 : null);

export const TechReportDetailPanel = ({ row, range, onClose }) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('tickets');

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    fetchTechReportDetail(row.technicianId, range)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [row.technicianId, range]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const tickets = data?.tickets || [];
  const activities = data?.activities || [];
  const { tickets: tk, projects: pj } = row;

  const stats = [
    { label: 'Tickets done', value: tk.owned + tk.assisted, sub: tk.assisted ? `${tk.owned} owned · ${tk.assisted} assisted` : 'owned' },
    { label: 'Avg resolution', value: fmtHours(tk.avgResolutionHours), sub: 'owned tickets' },
    { label: 'Rating', value: tk.avgRating == null ? '—' : tk.avgRating.toFixed(1), sub: tk.ratingCount ? `${tk.ratingCount} rating${tk.ratingCount === 1 ? '' : 's'}` : 'no ratings' },
    { label: 'Project work', value: `${pj.completed}/${pj.scheduled}`, sub: `done / scheduled · ${fmtPct(pj.onTimeRate)} on time` }
  ];

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end md:items-stretch md:justify-end bg-[#0F172A]/40" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`${row.name} — work report`}
        className="tech-report-panel w-full md:w-[600px] max-h-[92dvh] md:max-h-none md:h-full bg-white shadow-2xl flex flex-col rounded-t-2xl md:rounded-none"
      >
        <div className="md:hidden flex justify-center pt-2" aria-hidden="true"><span className="h-1 w-10 rounded-full bg-[#D0D5DD]" /></div>
        <header className="px-5 pt-3 md:pt-5 pb-4 border-b border-[#E4E7EC] shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-lg font-extrabold text-[#172033] truncate">{row.name}</h3>
              <p className="text-xs text-[#667085] mt-0.5">
                {[row.location, row.specialization].filter(Boolean).join(' · ') || 'Technician'} · {fmtRange(range)}
                {!row.isActive && <span className="ml-1 font-semibold text-[#B42318]">· Inactive</span>}
              </p>
            </div>
            <button onClick={onClose} aria-label="Close" className="-mr-1 p-2 rounded-lg text-[#667085] hover:bg-[#F2F4F7] hover:text-[#172033]"><X className="w-5 h-5" /></button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
            {stats.map((s) => (
              <div key={s.label} className="rounded-xl border border-[#E4E7EC] bg-[#F8FAFC] px-3 py-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#667085]">{s.label}</div>
                <div className="text-lg font-extrabold text-[#172033] tabular-nums leading-tight mt-0.5">{s.value}</div>
                <div className="text-[10px] text-[#98A2B3] truncate">{s.sub}</div>
              </div>
            ))}
          </div>
          <div className="flex gap-1 mt-4 -mb-4 shadow-[inset_0_-1px_0_#E4E7EC]">
            {[
              { id: 'tickets', label: 'Tickets', icon: Ticket, count: tickets.length },
              { id: 'projects', label: 'Project work', icon: FolderKanban, count: activities.length }
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-2.5 text-sm font-bold border-b-2 transition-colors ${tab === t.id ? 'border-[#004898] text-[#004898]' : 'border-transparent text-[#667085] hover:text-[#172033]'}`}
              >
                <t.icon className="w-4 h-4" /> {t.label}
                {data && <span className="rounded-full bg-[#F2F4F7] px-1.5 text-[10px] text-[#475467]">{t.count}</span>}
              </button>
            ))}
          </div>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 md:p-5 space-y-2">
          {error ? (
            <p className="text-sm text-[#B42318] text-center py-8">{error}</p>
          ) : !data ? (
            [0, 1, 2, 3].map((i) => <div key={i} className="h-16 rounded-xl bg-[#F2F4F7] animate-pulse" />)
          ) : tab === 'tickets' ? (
            tickets.length === 0 ? (
              <p className="text-sm text-[#98A2B3] text-center py-8">No tickets completed in this period and nothing open.</p>
            ) : tickets.map((t) => {
              const chip = BUCKET_CHIP[t.bucket];
              const hours = t.bucket === 'completed' ? resolutionHours(t) : null;
              return (
                <div key={`${t.id}-${t.role}`} className="rounded-xl border border-[#E4E7EC] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] font-mono text-[#667085]">{t.ticketNumber || '—'}</div>
                      <div className="text-sm font-bold text-[#172033] truncate">{t.title}</div>
                      <div className="text-xs text-[#667085] truncate">{[t.customer, t.category && statusLabel(t.category)].filter(Boolean).join(' · ')}</div>
                    </div>
                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-bold ${chip.cls}`}>{chip.label}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#475467]">
                    <span className={`font-semibold ${t.role === 'owned' ? 'text-[#004898]' : 'text-[#5925DC]'}`}>{t.role === 'owned' ? 'Owner' : 'Assisted'}</span>
                    <span className="inline-flex items-center gap-1">{t.mode === 'remote_support' ? <><Wifi className="w-3 h-3" /> Remote</> : <><MapPin className="w-3 h-3" /> On-site</>}</span>
                    {t.bucket === 'open' && <span>Status: {statusLabel(t.status)}</span>}
                    <span>Created {fmtDateTime(t.createdAt)}</span>
                    {t.completedAt && <span>{t.bucket === 'reassigned' ? 'Handed off' : 'Done'} {fmtDateTime(t.completedAt)}</span>}
                    {hours != null && hours >= 0 && <span className="font-semibold">⏱ {fmtHours(hours)}</span>}
                    {t.rating > 0 && <span className="inline-flex items-center gap-0.5 font-semibold text-[#B54708]"><Star className="w-3 h-3 fill-current" /> {t.rating}</span>}
                  </div>
                </div>
              );
            })
          ) : activities.length === 0 ? (
            <p className="text-sm text-[#98A2B3] text-center py-8">No project work scheduled or completed in this period.</p>
          ) : activities.map((a) => {
            const chip = activityChip(a);
            return (
              <div key={a.id} className="rounded-xl border border-[#E4E7EC] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-[#172033] truncate">{a.projectName || 'Project'}</div>
                    {a.projectCustomer && <div className="text-xs text-[#667085] truncate">{a.projectCustomer}</div>}
                  </div>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-bold ${chip.cls}`}>{chip.label}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[#475467]">
                  {a.scheduledDate && <span>Scheduled {fmtDay(a.scheduledDate, true)}{a.scheduledTime ? `, ${String(a.scheduledTime).slice(0, 5)}` : ''}</span>}
                  {a.completedAt && <span>Completed {fmtDateTime(a.completedAt)}</span>}
                </div>
                {a.notes && <p className="mt-2 text-xs text-[#344054] bg-[#F8FAFC] rounded-lg px-2.5 py-1.5 whitespace-pre-wrap">{a.notes}</p>}
              </div>
            );
          })}
        </div>
      </aside>
    </div>,
    document.body
  );
};
