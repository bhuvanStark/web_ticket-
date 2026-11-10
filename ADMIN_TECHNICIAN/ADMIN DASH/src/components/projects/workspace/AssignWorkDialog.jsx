import React, { useMemo, useState } from 'react';
import { X, CalendarPlus, AlertCircle, Loader2, Check } from 'lucide-react';
import { Avatar } from '../../common/Avatar';
import { assignProjectWork } from '../../../services/projectApiService';
import { RoleTag } from './projectUi';
import { dateKey, fmtDay } from './projectFormat';

// Assign a day's work to people on the project's team (managers can pick
// themselves). One entry per person; all-or-nothing on the server.
export const AssignWorkDialog = ({ data, onClose, onDone, showToast }) => {
  const { project, members, activities, access } = data;
  const [date, setDate] = useState(dateKey());
  const [time, setTime] = useState('09:30');
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const team = members.filter((m) => m.is_active);
  const busyThatDay = useMemo(() => new Set(
    activities.filter((a) => a.scheduled_date === date && a.status !== 'Cancelled').map((a) => a.technician_id)
  ), [activities, date]);

  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const available = team.filter((m) => !busyThatDay.has(m.id));

  const assign = async () => {
    setBusy(true);
    setError('');
    try {
      await assignProjectWork(project.id, { date, time, technicianIds: picked });
      showToast(`Assigned ${picked.length} for ${fmtDay(date, { day: '2-digit', month: 'short' })}.`, 'success');
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-[#0B1220]/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4" onClick={() => !busy && onClose()}>
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-[#F2F4F7] flex items-center justify-between">
          <div>
            <h3 className="text-base font-extrabold text-[#172033]">Assign daily work</h3>
            <p className="text-xs text-[#667085] mt-0.5">{project.name} · only this project&apos;s team can be picked</p>
          </div>
          <button onClick={onClose} disabled={busy} className="p-2 rounded-full hover:bg-[#F2F4F7] text-[#667085]" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-[#FEF3F2] border border-[#FECDCA] text-[#B42318]">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /><p className="text-xs font-semibold">{error}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-bold text-[#172033] mb-1">Date</span>
              <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setPicked([]); }} className="w-full px-3 py-2.5 border border-[#E4E7EC] rounded-xl text-sm outline-none focus:border-[#004898]" />
            </label>
            <label className="block">
              <span className="block text-xs font-bold text-[#172033] mb-1">Start time</span>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-full px-3 py-2.5 border border-[#E4E7EC] rounded-xl text-sm outline-none focus:border-[#004898]" />
            </label>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-[#172033]">Who&apos;s going? {picked.length > 0 && <span className="text-[#004898]">({picked.length})</span>}</span>
              {available.length > 1 && (
                <button
                  onClick={() => setPicked(picked.length === available.length ? [] : available.map((m) => m.id))}
                  className="text-[11px] font-bold text-[#004898] hover:underline"
                >
                  {picked.length === available.length ? 'Clear' : 'Select all'}
                </button>
              )}
            </div>
            {team.length === 0 ? (
              <div className="p-4 rounded-xl bg-[#FFFAEB] border border-[#FEDF89] text-xs font-semibold text-[#B54708]">
                This project has no team yet. {access.isAdmin ? 'Edit the project to add managers and team members.' : 'Ask an admin to add the team.'}
              </div>
            ) : (
              <div className="space-y-1.5">
                {team.map((m) => {
                  const taken = busyThatDay.has(m.id);
                  const on = picked.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      disabled={taken}
                      onClick={() => toggle(m.id)}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-xl border text-left transition-all ${taken ? 'opacity-50 cursor-not-allowed border-[#F2F4F7]' : on ? 'border-[#004898] bg-[#EFF5FC]' : 'border-[#E4E7EC] hover:border-[#B3D1F2]'}`}
                    >
                      <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${on ? 'bg-[#004898] border-[#004898] text-white' : 'border-[#D0D5DD]'}`}>
                        {on && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                      </span>
                      <Avatar src={m.avatar_url} name={m.name} className="w-8 h-8" textClassName="text-[10px]" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-[#172033] truncate">{m.name}</span>
                          {m.id === access.actorId && access.actorRole === 'technician' && <span className="text-[10px] font-bold text-[#004898]">(you)</span>}
                        </div>
                        <div className="text-[10px] text-[#667085]">{taken ? 'Already has work here that day' : m.role_title || 'Technician'}</div>
                      </div>
                      <RoleTag role={m.role} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-[#F2F4F7] flex justify-end gap-2 bg-[#FCFCFD]">
          <button onClick={onClose} disabled={busy} className="px-4 py-2.5 text-xs font-bold text-[#475467] hover:bg-[#F2F4F7] rounded-xl">Cancel</button>
          <button
            onClick={assign}
            disabled={busy || !date || !time || picked.length === 0}
            className="px-5 py-2.5 bg-[#004898] hover:bg-[#003673] text-white text-xs font-extrabold rounded-xl shadow-xs flex items-center gap-2 disabled:opacity-40"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarPlus className="w-4 h-4" />}
            Assign {picked.length > 0 ? picked.length : ''}
          </button>
        </div>
      </div>
    </div>
  );
};
