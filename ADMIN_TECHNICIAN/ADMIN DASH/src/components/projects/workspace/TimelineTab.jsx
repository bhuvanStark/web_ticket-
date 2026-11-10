import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  Check, Clock, X as XIcon, ChevronLeft, ChevronRight, MessageSquareText, Users, Flag,
  FileUp, Send, BadgeCheck, CircleSlash, UserCog, CalendarDays
} from 'lucide-react';
import { Avatar } from '../../common/Avatar';
import { WorkStatusTag, RoleTag, Empty } from './projectUi';
import { WORK_STATUS, dateKey, keyToDate, addDays, fmtDay, fmtDateTime } from './projectFormat';

const CELL_W = 46;
const NAME_W_DESKTOP = 200;
const NAME_W_PHONE = 118;
const RANGES = [
  { id: 14, label: '2 weeks' },
  { id: 31, label: 'Month' },
  { id: 'all', label: 'All' }
];

const EVENT_ICON = {
  file: FileUp, submitted: Send, approved: BadgeCheck, rejected: CircleSlash,
  team: UserCog, assigned: CalendarDays, reassigned: CalendarDays, cancelled: CircleSlash, expired: Clock,
  created: Flag, edited: Flag
};

// The "what happened on which day, and who was there" view: one row per
// person, one column per day. Gaps (past days nobody worked) stand out in
// the crew row, so a new technician can see at a glance where the trail
// breaks before reading the day's comments.
export const TimelineTab = ({ data }) => {
  const { project, members, activities, events } = data;
  const today = dateKey();
  // Phones: a slimmer name column leaves room for more days.
  const NAME_W = typeof window !== 'undefined' && window.innerWidth < 640 ? NAME_W_PHONE : NAME_W_DESKTOP;

  const byKey = useMemo(() => {
    const map = new Map();
    for (const a of activities) {
      const k = `${a.technician_id}|${a.scheduled_date}`;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(a);
    }
    return map;
  }, [activities]);

  const eventsByDay = useMemo(() => {
    const map = new Map();
    for (const e of events) {
      const k = dateKey(new Date(e.created_at));
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(e);
    }
    return map;
  }, [events]);

  // Rows: managers, then the team, then anyone who worked here but is no
  // longer on the team (kept so history never disappears).
  const rows = useMemo(() => {
    const seen = new Set(members.map((m) => m.id));
    const former = new Map();
    for (const a of activities) {
      if (!seen.has(a.technician_id) && !former.has(a.technician_id)) {
        former.set(a.technician_id, { id: a.technician_id, name: a.technician_name, role: 'former' });
      }
    }
    return [...members, ...former.values()];
  }, [members, activities]);

  // Full span of the project.
  const span = useMemo(() => {
    const keys = activities.map((a) => a.scheduled_date);
    const created = dateKey(new Date(project.created_at));
    const first = [project.start_date, created, ...keys].filter(Boolean).sort()[0] || today;
    const lastWork = keys.sort().at(-1) || today;
    let last = lastWork > today ? lastWork : today;
    if (project.end_date && project.end_date > last && project.end_date <= addDays(today, 45)) last = project.end_date;
    return { first: first < last ? first : last, last };
  }, [activities, project, today]);

  const totalDays = Math.round((keyToDate(span.last) - keyToDate(span.first)) / 86400000) + 1;
  const [range, setRange] = useState(totalDays <= 31 ? 'all' : 31);
  const [endKey, setEndKey] = useState(span.last);
  useEffect(() => { setEndKey(span.last); }, [span.last]);

  const days = useMemo(() => {
    const start = range === 'all' ? span.first : addDays(endKey, -(range - 1));
    const end = range === 'all' ? span.last : endKey;
    const out = [];
    for (let k = start; k <= end; k = addDays(k, 1)) out.push(k);
    return out;
  }, [range, endKey, span]);

  const defaultDay = useMemo(() => {
    const worked = activities.filter((a) => a.scheduled_date <= today).map((a) => a.scheduled_date).sort();
    return worked.at(-1) || today;
  }, [activities, today]);
  const [selected, setSelected] = useState(defaultDay);
  useEffect(() => { setSelected(defaultDay); }, [defaultDay]);

  // Open with today (or the last day in range) near the right edge, so the
  // most recent work is in view rather than empty future days.
  const scroller = useRef(null);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const anchor = days.includes(today) ? days.indexOf(today) : days.length - 1;
    el.scrollLeft = Math.max(0, (anchor + 2) * CELL_W - (el.clientWidth - NAME_W));
  }, [days, today, NAME_W]);

  const crewOn = (k) => new Set(
    activities.filter((a) => a.scheduled_date === k && a.status !== 'Cancelled').map((a) => a.technician_id)
  ).size;
  const inProject = (k) => k >= span.first && k <= today;

  if (!rows.length && !activities.length) {
    return (
      <div className="bg-white rounded-2xl border border-[#E4E7EC]">
        <Empty icon={CalendarDays} title="Nothing on the timeline yet" text="Once work is assigned, every day shows up here — who was on site and what they reported." />
      </div>
    );
  }

  const shift = (dir) => setEndKey((k) => addDays(k, dir * (range === 'all' ? 0 : range)));
  const canGoBack = range !== 'all' && days[0] > span.first;
  const canGoForward = range !== 'all' && endKey < span.last;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-[#E4E7EC] shadow-[0_1px_2px_rgba(16,24,40,0.04)] overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 border-b border-[#F2F4F7] flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-extrabold text-[#172033]">Work timeline</h3>
            <p className="text-xs text-[#667085] mt-0.5">
              {fmtDay(days[0], { day: '2-digit', month: 'short' })} – {fmtDay(days.at(-1))} · tap a day to read what happened
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-[#F2F4F7] rounded-lg p-0.5">
              {RANGES.map((r) => (
                <button
                  key={r.id}
                  onClick={() => { setRange(r.id); setEndKey(span.last); }}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all ${range === r.id ? 'bg-white text-[#004898] shadow-xs' : 'text-[#667085] hover:text-[#172033]'}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            {range !== 'all' && (
              <div className="flex">
                <button onClick={() => shift(-1)} disabled={!canGoBack} className="p-1.5 rounded-l-lg border border-[#E4E7EC] text-[#475467] hover:bg-[#F8FAFC] disabled:opacity-40" aria-label="Earlier">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button onClick={() => shift(1)} disabled={!canGoForward} className="p-1.5 rounded-r-lg border border-l-0 border-[#E4E7EC] text-[#475467] hover:bg-[#F8FAFC] disabled:opacity-40" aria-label="Later">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        <Legend />

        <div ref={scroller} className="overflow-x-auto overscroll-x-contain">
          <div style={{ width: NAME_W + days.length * CELL_W, minWidth: '100%' }}>
            {/* Month + day header */}
            <div className="flex sticky top-0 z-10 bg-white border-b border-[#E4E7EC]">
              <div className="sticky left-0 z-20 bg-white border-r border-[#E4E7EC] flex items-end px-4 pb-2 text-[10px] font-black uppercase tracking-wider text-[#98A2B3]" style={{ width: NAME_W, minWidth: NAME_W }}>
                People
              </div>
              {days.map((k, i) => {
                const d = keyToDate(k);
                const weekend = d.getDay() === 0;
                const showMonth = i === 0 || d.getDate() === 1;
                const isSel = k === selected;
                return (
                  <button
                    key={k}
                    onClick={() => setSelected(k)}
                    className={`relative flex flex-col items-center justify-end pt-4 pb-1.5 border-r border-[#F2F4F7] transition-colors ${isSel ? 'bg-[#004898] text-white' : weekend ? 'bg-[#FAFAFB] hover:bg-[#EFF5FC]' : 'hover:bg-[#EFF5FC]'}`}
                    style={{ width: CELL_W, minWidth: CELL_W }}
                  >
                    {showMonth && (
                      <span className={`absolute top-1 left-1 text-[9px] font-black uppercase tracking-wider ${isSel ? 'text-white/80' : 'text-[#004898]'}`}>
                        {d.toLocaleDateString('en-GB', { month: 'short' })}
                      </span>
                    )}
                    <span className={`text-[9px] font-bold uppercase ${isSel ? 'text-white/80' : 'text-[#98A2B3]'}`}>
                      {d.toLocaleDateString('en-GB', { weekday: 'narrow' })}
                    </span>
                    <span className={`text-xs font-extrabold ${isSel ? 'text-white' : k === today ? 'text-[#004898]' : 'text-[#344054]'}`}>{d.getDate()}</span>
                    {k === today && !isSel && <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-[#004898]" />}
                  </button>
                );
              })}
            </div>

            {/* One row per person */}
            {rows.map((person) => (
              <div key={person.id} className="flex border-b border-[#F2F4F7] group">
                <div className="sticky left-0 z-10 bg-white group-hover:bg-[#FCFCFD] border-r border-[#E4E7EC] flex items-center gap-2.5 px-3 sm:px-4" style={{ width: NAME_W, minWidth: NAME_W, height: 52 }}>
                  <Avatar src={person.avatar_url} name={person.name} className="w-7 h-7 max-sm:hidden" textClassName="text-[10px]" />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[#172033] truncate">{person.name}</div>
                    {person.role === 'former'
                      ? <span className="text-[9px] font-bold uppercase tracking-wider text-[#98A2B3]">Not on team</span>
                      : <RoleTag role={person.role} />}
                  </div>
                </div>
                {days.map((k) => (
                  <Cell
                    key={k}
                    items={byKey.get(`${person.id}|${k}`)}
                    selected={k === selected}
                    weekend={keyToDate(k).getDay() === 0}
                    onClick={() => setSelected(k)}
                  />
                ))}
              </div>
            ))}

            {/* Crew on site per day — gaps are past days nobody worked */}
            <div className="flex border-b border-[#F2F4F7] bg-[#FCFCFD]">
              <div className="sticky left-0 z-10 bg-[#FCFCFD] border-r border-[#E4E7EC] flex items-center gap-2 px-3 sm:px-4 text-[11px] font-extrabold text-[#475467]" style={{ width: NAME_W, minWidth: NAME_W, height: 40 }}>
                <Users className="w-3.5 h-3.5 text-[#98A2B3] max-sm:hidden" /> Crew on site
              </div>
              {days.map((k) => {
                const n = crewOn(k);
                const gap = n === 0 && inProject(k) && keyToDate(k).getDay() !== 0;
                return (
                  <button
                    key={k}
                    onClick={() => setSelected(k)}
                    title={gap ? 'Nobody worked this day' : `${n} on site`}
                    className={`flex items-center justify-center border-r border-[#F2F4F7] text-[11px] font-extrabold ${k === selected ? 'ring-2 ring-inset ring-[#004898]' : ''}`}
                    style={{
                      width: CELL_W, minWidth: CELL_W, height: 40,
                      background: gap ? 'repeating-linear-gradient(45deg,#FEF3F2,#FEF3F2 4px,#FFFFFF 4px,#FFFFFF 8px)' : undefined
                    }}
                  >
                    {n > 0 ? <span className="text-[#004898]">{n}</span> : gap ? <span className="text-[#F04438]">–</span> : null}
                  </button>
                );
              })}
            </div>

            {/* Project events (files, approvals, team changes) */}
            <div className="flex">
              <div className="sticky left-0 z-10 bg-white border-r border-[#E4E7EC] flex items-center gap-2 px-4 text-[11px] font-extrabold text-[#475467]" style={{ width: NAME_W, minWidth: NAME_W, height: 40 }}>
                <Flag className="w-3.5 h-3.5 text-[#98A2B3] max-sm:hidden" /> Events
              </div>
              {days.map((k) => {
                const list = eventsByDay.get(k) || [];
                const top = list.find((e) => ['approved', 'rejected', 'submitted'].includes(e.event_type)) || list[0];
                const Icon = top ? EVENT_ICON[top.event_type] || Flag : null;
                const tone = top?.event_type === 'approved' ? 'text-[#027A48] bg-[#ECFDF3]'
                  : top?.event_type === 'rejected' ? 'text-[#B42318] bg-[#FEF3F2]'
                  : top?.event_type === 'submitted' ? 'text-[#B54708] bg-[#FFFAEB]' : 'text-[#475467] bg-[#F2F4F7]';
                return (
                  <button
                    key={k}
                    onClick={() => setSelected(k)}
                    title={list.map((e) => e.message).join('\n')}
                    className={`flex items-center justify-center border-r border-[#F2F4F7] ${k === selected ? 'ring-2 ring-inset ring-[#004898]' : ''}`}
                    style={{ width: CELL_W, minWidth: CELL_W, height: 40 }}
                  >
                    {Icon && (
                      <span className={`relative w-6 h-6 rounded-full flex items-center justify-center ${tone}`}>
                        <Icon className="w-3.5 h-3.5" />
                        {list.length > 1 && <span className="absolute -top-1 -right-1.5 text-[8px] font-black bg-[#172033] text-white rounded-full px-1 leading-3">{list.length}</span>}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <DayDetail
        day={selected}
        entries={activities.filter((a) => a.scheduled_date === selected)}
        events={eventsByDay.get(selected) || []}
        gap={crewOn(selected) === 0 && inProject(selected)}
        onPrev={() => setSelected((k) => addDays(k, -1))}
        onNext={() => setSelected((k) => addDays(k, 1))}
      />
    </div>
  );
};

const Legend = () => (
  <div className="px-4 sm:px-5 py-2.5 border-b border-[#F2F4F7] flex flex-wrap items-center gap-x-4 gap-y-1.5 bg-[#FCFCFD]">
    {['Completed', 'Accepted', 'Assigned', 'Cancelled'].map((s) => (
      <span key={s} className="flex items-center gap-1.5 text-[11px] font-semibold text-[#475467]">
        <span className="w-3.5 h-3.5 rounded" style={{ background: WORK_STATUS[s].bg, border: `1.5px ${s === 'Assigned' ? 'dashed' : 'solid'} ${WORK_STATUS[s].border}` }} />
        {s === 'Accepted' ? 'Accepted / on it' : s}
      </span>
    ))}
    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[#475467]">
      <MessageSquareText className="w-3.5 h-3.5 text-[#004898]" /> Has a comment
    </span>
    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[#475467]">
      <span className="w-3.5 h-3.5 rounded" style={{ background: 'repeating-linear-gradient(45deg,#FEE4E2,#FEE4E2 2px,#FFFFFF 2px,#FFFFFF 4px)' }} />
      Nobody on site
    </span>
  </div>
);

const pick = (items) => items.find((a) => a.status === 'Completed') || items.find((a) => a.status !== 'Cancelled') || items[0];

const Cell = ({ items, selected, weekend, onClick }) => {
  const a = items?.length ? pick(items) : null;
  const s = a ? WORK_STATUS[a.status] : null;
  const Icon = !a ? null : a.status === 'Completed' ? Check : a.status === 'Cancelled' ? XIcon : Clock;
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center border-r border-[#F2F4F7] transition-colors ${selected ? 'bg-[#EFF5FC]' : weekend ? 'bg-[#FAFAFB]' : ''} hover:bg-[#EFF5FC]`}
      style={{ width: CELL_W, minWidth: CELL_W, height: 52 }}
      title={a ? `${a.technician_name} · ${a.status}${a.completion_notes ? `\n${a.completion_notes}` : ''}` : ''}
    >
      {a && (
        <span
          className="relative w-8 h-8 rounded-lg flex items-center justify-center shadow-[0_1px_1px_rgba(16,24,40,0.05)]"
          style={{ background: s.bg, color: s.fg, border: `1.5px ${a.status === 'Assigned' ? 'dashed' : 'solid'} ${s.border}` }}
        >
          <Icon className="w-4 h-4" strokeWidth={2.5} />
          {a.completion_notes && (
            <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-[#004898] text-white flex items-center justify-center ring-2 ring-white">
              <MessageSquareText className="w-2 h-2" />
            </span>
          )}
        </span>
      )}
    </button>
  );
};

const DayDetail = ({ day, entries, events, gap, onPrev, onNext }) => (
  <div className="bg-white rounded-2xl border border-[#E4E7EC] shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
    <div className="px-4 sm:px-5 py-3.5 border-b border-[#F2F4F7] flex items-center justify-between gap-3">
      <div>
        <div className="text-[10px] font-black uppercase tracking-widest text-[#98A2B3]">Day detail</div>
        <h3 className="text-base font-extrabold text-[#172033]">{fmtDay(day, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</h3>
      </div>
      <div className="flex">
        <button onClick={onPrev} className="p-2 rounded-l-lg border border-[#E4E7EC] text-[#475467] hover:bg-[#F8FAFC]" aria-label="Previous day"><ChevronLeft className="w-4 h-4" /></button>
        <button onClick={onNext} className="p-2 rounded-r-lg border border-l-0 border-[#E4E7EC] text-[#475467] hover:bg-[#F8FAFC]" aria-label="Next day"><ChevronRight className="w-4 h-4" /></button>
      </div>
    </div>
    <div className="p-4 sm:p-5 space-y-3">
      {entries.length === 0 && events.length === 0 && (
        <div className={`rounded-xl px-4 py-5 text-center text-xs font-semibold ${gap ? 'bg-[#FEF3F2] text-[#B42318]' : 'bg-[#F8FAFC] text-[#667085]'}`}>
          {gap ? 'Nobody worked on this project this day.' : 'Nothing recorded for this day.'}
        </div>
      )}
      {entries.map((a) => (
        <article key={a.id} className="rounded-xl border border-[#E4E7EC] overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-[#FCFCFD] border-b border-[#F2F4F7]">
            <div className="flex items-center gap-2.5 min-w-0">
              <Avatar name={a.technician_name} className="w-7 h-7" textClassName="text-[10px]" />
              <span className="text-sm font-bold text-[#172033] truncate">{a.technician_name}</span>
              <WorkStatusTag status={a.status} />
            </div>
            <div className="text-[11px] text-[#667085] font-semibold">
              Scheduled {a.scheduled_time}{a.completed_at && <> · done {fmtDateTime(a.completed_at)}</>}
            </div>
          </div>
          <div className="px-4 py-3">
            {a.completion_notes
              ? <p className="text-[13px] leading-relaxed text-[#344054] whitespace-pre-wrap break-words">{a.completion_notes}</p>
              : <p className="text-xs italic text-[#98A2B3]">{a.status === 'Cancelled' ? 'Cancelled — no work recorded.' : 'No comment yet — added when the day is completed.'}</p>}
          </div>
        </article>
      ))}
      {events.length > 0 && (
        <ul className="pt-1 space-y-2">
          {events.map((e) => {
            const Icon = EVENT_ICON[e.event_type] || Flag;
            return (
              <li key={e.id} className="flex items-start gap-2.5 text-xs text-[#475467]">
                <span className="w-6 h-6 shrink-0 rounded-full bg-[#F2F4F7] text-[#475467] flex items-center justify-center"><Icon className="w-3.5 h-3.5" /></span>
                <span className="pt-1">
                  <strong className="text-[#172033]">{e.actor_name || 'System'}</strong> — {e.message}
                  <span className="text-[#98A2B3]"> · {new Date(e.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  </div>
);
