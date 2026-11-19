// Ops Pulse — a full-screen, read-only view of the admin dashboard's own
// numbers, meant for an office display. Admin only (mounted from
// AdminDashboard.jsx). It renders nothing the dashboard does not already
// show: every figure and ticker line is derived from the `tickets` the
// admin session has already loaded, refreshed by the existing 30s poll.
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../../context/AppContext';
import { X, Maximize2, Minimize2, Radio } from 'lucide-react';

const CLOSED = new Set(['Resolved', 'Closed', 'Completed', 'Customer Signed / Completed']);
const timeAgo = (iso) => {
  if (!iso) return '';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return hrs < 24 ? `${hrs}h ago` : `${Math.floor(hrs / 24)}d ago`;
};

export const OpsWallboard = ({ onClose }) => {
  const { tickets } = useApp();
  const [now, setNow] = useState(new Date());
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));

  useEffect(() => {
    const clock = setInterval(() => setNow(new Date()), 1000);
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      clearInterval(clock);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFs);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, [onClose]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };

  const open = tickets.filter((t) => !CLOSED.has(t.status));
  const unassigned = open.filter((t) => t.status === 'Unassigned' || !t.assignedTo);
  const active = tickets.filter((t) => t.status === 'Active');
  const pending = tickets.filter((t) => t.status === 'Pending');
  const today = now.toDateString();
  const completedToday = tickets.filter((t) => CLOSED.has(t.status) && t.completedAt && new Date(t.completedAt).toDateString() === today);
  const techsOnJob = new Set(active.map((t) => t.assignedToId).filter(Boolean)).size;

  // Most recent movements, newest first — the same fields the ticket lists show.
  const events = [
    ...completedToday.map((t) => ({ at: t.completedAt, text: `${t.id} completed${t.assignedTo ? ` by ${t.assignedTo}` : ''}` })),
    ...active.map((t) => ({ at: t.createdAt, text: `${t.id} in progress${t.assignedTo ? ` · ${t.assignedTo}` : ''}` })),
    ...unassigned.map((t) => ({ at: t.createdAt, text: `${t.id} raised · awaiting assignment` }))
  ]
    .filter((e) => e.at)
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, 10);

  const stats = [
    { label: 'Open', value: open.length, tone: '#FFFFFF' },
    { label: 'Unassigned', value: unassigned.length, tone: unassigned.length ? '#FDB022' : '#FFFFFF' },
    { label: 'Active', value: active.length, tone: '#53B1FD' },
    { label: 'Pending', value: pending.length, tone: '#FDB022' },
    { label: 'Done today', value: completedToday.length, tone: '#32D583' },
    { label: 'Technicians on job', value: techsOnJob, tone: '#FFFFFF' }
  ];

  // Portalled to <body>: the page <main> is its own stacking context (z-0),
  // so anything rendered inside it would sit under the sidebar and header.
  return createPortal(
    <div className="fixed inset-0 z-[300] bg-[#0B1220] text-white flex flex-col select-none tt-pop" role="dialog" aria-label="Ops Pulse wallboard">
      <div className="flex items-center justify-between px-8 pt-6">
        <div className="flex items-center gap-3">
          <img src={`${import.meta.env.BASE_URL}tasktel-logo.png`} alt="TaskTel" className="h-7 object-contain invert brightness-0" />
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-white/60">Ops Pulse</span>
          <span className="flex items-center gap-1.5 text-[11px] font-bold text-[#32D583]">
            <span className="w-2 h-2 rounded-full bg-[#32D583] tt-live" /> LIVE
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="font-mono text-2xl font-bold tabular-nums text-white/90">
            {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
          <button onClick={toggleFullscreen} title={isFullscreen ? 'Exit full screen' : 'Full screen'} className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10">
            {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
          </button>
          <button onClick={onClose} title="Close (Esc)" className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-center px-8 gap-10">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
          {stats.map((s) => (
            <div key={s.label} className="rounded-2xl bg-white/5 border border-white/10 p-6">
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/50">{s.label}</div>
              <div className="text-6xl font-black tabular-nums mt-2" style={{ color: s.tone }}>{s.value}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-2xl bg-white/5 border border-white/10 p-5">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/50 mb-3">In progress</div>
            {active.length === 0 ? (
              <p className="text-sm text-white/50">No technician is on a job right now.</p>
            ) : (
              <div className="space-y-2">
                {active.slice(0, 6).map((t) => (
                  <div key={t.id} className="flex items-center justify-between text-sm">
                    <span className="truncate"><span className="font-mono text-[#53B1FD] font-bold">{t.id}</span> <span className="text-white/80">{t.title}</span></span>
                    <span className="text-white/60 shrink-0 ml-4">{t.assignedTo || '—'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-2xl bg-white/5 border border-white/10 p-5">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/50 mb-3">Awaiting assignment</div>
            {unassigned.length === 0 ? (
              <p className="text-sm text-white/50">Everything is assigned.</p>
            ) : (
              <div className="space-y-2">
                {unassigned.slice(0, 6).map((t) => (
                  <div key={t.id} className="flex items-center justify-between text-sm">
                    <span className="truncate"><span className="font-mono text-[#FDB022] font-bold">{t.id}</span> <span className="text-white/80">{t.title}</span></span>
                    <span className="text-white/60 shrink-0 ml-4">{t.priority}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-white/10 bg-black/30 px-0 py-3 overflow-hidden whitespace-nowrap text-sm text-white/80 flex items-center">
        <span className="px-4 shrink-0 flex items-center gap-2 text-[#53B1FD] font-bold"><Radio className="w-4 h-4" /></span>
        <div className="flex-1 overflow-hidden">
          {events.length === 0 ? (
            <span className="text-white/50">No activity yet today.</span>
          ) : (
            <span className="tt-ticker">
              {events.map((e, i) => <span key={i} className="mx-8">{e.text} <span className="text-white/40">· {timeAgo(e.at)}</span></span>)}
            </span>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
