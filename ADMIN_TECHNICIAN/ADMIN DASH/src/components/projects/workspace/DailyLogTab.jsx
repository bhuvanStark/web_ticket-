import React, { useMemo, useState } from 'react';
import { Search, Download, ChevronDown, FileText, FileSpreadsheet, FileJson, MessageSquareText } from 'lucide-react';
import { Avatar } from '../../common/Avatar';
import { exportProjectActivityHistory } from '../../../utils/projectActivityExport';
import { WorkStatusTag, Empty } from './projectUi';
import { fmtDay, fmtDateTime } from './projectFormat';

// Every day's comments on the project, newest first, grouped by date. Full
// width so long comments read comfortably (they used to be squeezed into a
// table cell inside a popup).
export const DailyLogTab = ({ data }) => {
  const { activities, members } = data;
  const [tech, setTech] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [exportOpen, setExportOpen] = useState(false);

  const people = useMemo(() => {
    const map = new Map(members.map((m) => [m.id, m.name]));
    activities.forEach((a) => map.set(a.technician_id, a.technician_name));
    return [...map].sort((a, b) => a[1].localeCompare(b[1]));
  }, [activities, members]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return activities.filter((a) => {
      if (tech && a.technician_id !== tech) return false;
      if (status && a.status !== status) return false;
      if (from && a.scheduled_date < from) return false;
      if (to && a.scheduled_date > to) return false;
      if (needle && !`${a.completion_notes || ''} ${a.technician_name}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [activities, tech, status, q, from, to]);

  const groups = useMemo(() => {
    const map = new Map();
    for (const a of filtered) {
      if (!map.has(a.scheduled_date)) map.set(a.scheduled_date, []);
      map.get(a.scheduled_date).push(a);
    }
    return [...map];
  }, [filtered]);

  const withComments = activities.filter((a) => a.completion_notes).length;
  const anyFilter = tech || status || q || from || to;
  const input = 'h-9 px-3 border border-[#E4E7EC] rounded-lg text-xs font-semibold text-[#172033] outline-none focus:border-[#004898] bg-white';

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-[#E4E7EC] p-3 sm:p-4 flex flex-col lg:flex-row lg:items-center gap-2.5">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#98A2B3]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search comments…" className={`${input} w-full pl-9`} />
        </div>
        <div className="grid grid-cols-2 sm:flex gap-2">
          <select value={tech} onChange={(e) => setTech(e.target.value)} className={input}>
            <option value="">Everyone</option>
            {people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={input}>
            <option value="">Any status</option>
            <option value="Completed">Done</option>
            <option value="Accepted">On it</option>
            <option value="Assigned">Assigned</option>
            <option value="Cancelled">Cancelled</option>
          </select>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={input} aria-label="From date" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={input} aria-label="To date" />
        </div>
        <div className="flex items-center gap-2 justify-end">
          {anyFilter && (
            <button onClick={() => { setTech(''); setStatus(''); setQ(''); setFrom(''); setTo(''); }} className="text-[11px] font-bold text-[#004898] hover:underline whitespace-nowrap">
              Clear
            </button>
          )}
          <div className="relative">
            <button onClick={() => setExportOpen((v) => !v)} className="h-9 px-3 bg-white border border-[#E4E7EC] hover:bg-[#F8FAFC] text-[#004898] rounded-lg flex items-center gap-1.5 font-bold text-xs">
              <Download className="w-3.5 h-3.5" /> Export <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {exportOpen && (
              <div className="absolute right-0 mt-1 w-44 bg-white rounded-xl shadow-xl border border-[#E4E7EC] overflow-hidden z-20 py-1">
                {[['pdf', 'PDF', FileText, '#E3342F'], ['excel', 'Excel', FileSpreadsheet, '#107C41'], ['csv', 'CSV', FileJson, '#475467'], ['doc', 'DOC', FileText, '#2B579A']].map(([fmt, label, Icon, color]) => (
                  <button
                    key={fmt}
                    onClick={() => { exportProjectActivityHistory(filtered, fmt); setExportOpen(false); }}
                    className="w-full px-3 py-2 text-left text-xs font-semibold text-[#172033] hover:bg-[#F8FAFC] flex items-center gap-2"
                  >
                    <Icon className="w-4 h-4" style={{ color }} /> Export as {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <p className="text-xs text-[#667085] px-1">
        {filtered.length} entr{filtered.length === 1 ? 'y' : 'ies'} · {withComments} with comments
      </p>

      {groups.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E4E7EC]">
          <Empty icon={MessageSquareText} title={anyFilter ? 'No entries match these filters' : 'No daily work yet'} text="Each technician adds a comment when they complete their day: what was done and what is still pending." />
        </div>
      ) : (
        <ol className="relative space-y-5 before:absolute before:left-[15px] before:top-2 before:bottom-2 before:w-px before:bg-[#E4E7EC]">
          {groups.map(([day, list]) => (
            <li key={day} className="relative pl-10">
              <span className="absolute left-[9px] top-1.5 w-[13px] h-[13px] rounded-full bg-white border-[3px] border-[#004898]" />
              <h4 className="text-xs font-black uppercase tracking-wider text-[#004898] mb-2">
                {fmtDay(day, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
              </h4>
              <div className="space-y-2.5">
                {list.map((a) => (
                  <article key={a.id} className="bg-white rounded-xl border border-[#E4E7EC] shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
                    <header className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <Avatar name={a.technician_name} className="w-7 h-7" textClassName="text-[10px]" />
                        <span className="text-sm font-bold text-[#172033] truncate">{a.technician_name}</span>
                        <WorkStatusTag status={a.status} />
                      </div>
                      <span className="text-[11px] font-semibold text-[#98A2B3]">
                        {a.scheduled_time}{a.completed_at && <> → {fmtDateTime(a.completed_at)}</>}
                      </span>
                    </header>
                    <div className="px-4 pb-3.5 pt-2">
                      {a.completion_notes ? (
                        <p className="text-[13px] leading-relaxed text-[#344054] whitespace-pre-wrap break-words">{a.completion_notes}</p>
                      ) : (
                        <p className="text-xs italic text-[#98A2B3]">{a.status === 'Cancelled' ? 'Cancelled.' : 'Comment is added when the day is completed.'}</p>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};
