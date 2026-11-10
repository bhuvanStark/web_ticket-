import React, { useState } from 'react';
import {
  CalendarCheck2, ClipboardList, FolderOpen, Users, ArrowRightLeft, Ban, Loader2, CalendarDays, Building2, MapPin, ArrowRight
} from 'lucide-react';
import { Avatar } from '../../common/Avatar';
import { reassignProjectWork, cancelProjectWork } from '../../../services/projectApiService';
import { SectionCard, RoleTag, WorkStatusTag, Empty } from './projectUi';
import { fmtDay, fmtDateTime, timeAgo } from './projectFormat';

export const OverviewTab = ({ data, onChanged, showToast, onOpenTab }) => {
  const { project, members, activities, files, events, access } = data;
  const open = activities.filter((a) => a.status === 'Assigned' || a.status === 'Accepted')
    .sort((a, b) => (a.scheduled_date + a.scheduled_time).localeCompare(b.scheduled_date + b.scheduled_time));
  const done = activities.filter((a) => a.status === 'Completed');
  const daysWorked = new Set(done.map((a) => a.scheduled_date)).size;
  const canEditWork = access.canManage && ['Planning', 'Active'].includes(project.status);

  const byDate = open.reduce((m, a) => ({ ...m, [a.scheduled_date]: [...(m[a.scheduled_date] || []), a] }), {});
  const managers = members.filter((m) => m.role === 'manager');
  const team = members.filter((m) => m.role === 'viewer');

  const recent = [
    ...done.map((a) => ({ id: a.id, at: a.completed_at, who: a.technician_name, text: a.completion_notes, kind: 'work' })),
    ...events.map((e) => ({ id: e.id, at: e.created_at, who: e.actor_name, text: e.message, kind: 'event' }))
  ].sort((x, y) => new Date(y.at) - new Date(x.at)).slice(0, 6);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-4 items-start">
      <div className="space-y-4 min-w-0">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat icon={CalendarCheck2} label="Days worked" value={daysWorked} tone="#004898" />
          <Stat icon={ClipboardList} label="Entries completed" value={done.length} tone="#12B76A" />
          <Stat icon={CalendarDays} label="Open assignments" value={open.length} tone="#F79009" />
          <Stat icon={FolderOpen} label="Files" value={files.length} tone="#7A5AF8" />
        </div>

        <SectionCard
          title="Upcoming & open work"
          subtitle="Assigned or accepted, not yet completed · unaccepted work is cancelled after 36 hours"
          bodyClassName="p-0"
        >
          {open.length === 0 ? (
            <Empty icon={CalendarDays} title="No open assignments" text={canEditWork ? 'Use “Assign work” to schedule the team.' : 'Nothing scheduled right now.'} />
          ) : (
            <div className="divide-y divide-[#F2F4F7]">
              {Object.entries(byDate).map(([day, list]) => (
                <div key={day} className="px-5 py-4">
                  <div className="text-[11px] font-black uppercase tracking-wider text-[#004898] mb-2.5">
                    {fmtDay(day, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
                  </div>
                  <div className="space-y-2">
                    {list.map((a) => (
                      <OpenRow key={a.id} activity={a} project={project} members={members} canEdit={canEditWork} onChanged={onChanged} showToast={showToast} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Recent activity"
          action={<button onClick={() => onOpenTab('timeline')} className="text-xs font-bold text-[#004898] hover:underline inline-flex items-center gap-1">Timeline <ArrowRight className="w-3.5 h-3.5" /></button>}
          bodyClassName="p-0"
        >
          {recent.length === 0 ? <p className="px-5 py-6 text-xs text-[#98A2B3]">Nothing yet.</p> : (
            <ul className="divide-y divide-[#F2F4F7]">
              {recent.map((r) => (
                <li key={r.id} className="px-5 py-3 flex gap-3">
                  <Avatar name={r.who || '?'} className="w-7 h-7" textClassName="text-[10px]" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-[#344054] leading-relaxed break-words line-clamp-2">
                      <strong className="text-[#172033]">{r.who || 'Someone'}</strong>
                      {r.kind === 'work' ? <> completed the day — {r.text}</> : <> — {r.text}</>}
                    </p>
                    <p className="text-[10px] text-[#98A2B3] mt-0.5">{timeAgo(r.at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <div className="space-y-4">
        <SectionCard title="Team" subtitle={`${members.length} people · managers assign the daily work`} bodyClassName="p-0">
          {members.length === 0 ? (
            <Empty icon={Users} title="No team yet" text={access.isAdmin ? 'Edit the project to add managers and the view-only team.' : 'An admin adds the team.'} />
          ) : (
            <ul className="divide-y divide-[#F2F4F7]">
              {[...managers, ...team].map((m) => (
                <li key={m.id} className="px-5 py-2.5 flex items-center gap-3">
                  <Avatar src={m.avatar_url} name={m.name} className="w-8 h-8" textClassName="text-[10px]" />
                  <div className="min-w-0 flex-1">
                    <div className={`text-xs font-bold truncate ${m.is_active ? 'text-[#172033]' : 'text-[#98A2B3] line-through'}`}>{m.name}</div>
                    <div className="text-[10px] text-[#667085] truncate">{m.role_title || 'Technician'}</div>
                  </div>
                  <RoleTag role={m.role} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Details">
          <dl className="space-y-3 text-xs">
            <Detail icon={Building2} label="Customer" value={project.customer} />
            <Detail icon={MapPin} label="Location" value={project.location} />
            <Detail icon={CalendarDays} label="Schedule" value={`${fmtDay(project.start_date)} → ${fmtDay(project.end_date)}`} />
            <Detail icon={ClipboardList} label="Last updated" value={fmtDateTime(project.last_activity_at)} />
          </dl>
          {project.description && (
            <div className="mt-4 pt-4 border-t border-[#F2F4F7]">
              <div className="text-[10px] font-black uppercase tracking-wider text-[#98A2B3] mb-1.5">Scope</div>
              <p className="text-xs text-[#344054] leading-relaxed whitespace-pre-wrap break-words">{project.description}</p>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
};

const Stat = ({ icon: Icon, label, value, tone }) => (
  <div className="bg-white rounded-2xl border border-[#E4E7EC] p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
    <div className="w-8 h-8 rounded-xl flex items-center justify-center mb-3" style={{ background: `${tone}14`, color: tone }}>
      <Icon className="w-4 h-4" />
    </div>
    <div className="text-2xl font-black text-[#172033] leading-none">{value}</div>
    <div className="text-[11px] font-semibold text-[#667085] mt-1">{label}</div>
  </div>
);

const Detail = ({ icon: Icon, label, value }) => (
  <div className="flex items-start gap-2.5">
    <Icon className="w-3.5 h-3.5 text-[#98A2B3] mt-0.5 shrink-0" />
    <div className="min-w-0">
      <dt className="text-[10px] font-black uppercase tracking-wider text-[#98A2B3]">{label}</dt>
      <dd className="font-semibold text-[#172033] break-words">{value || '—'}</dd>
    </div>
  </div>
);

const OpenRow = ({ activity: a, project, members, canEdit, onChanged, showToast }) => {
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const others = members.filter((m) => m.is_active && m.id !== a.technician_id);

  const run = async (fn, okMsg) => {
    setBusy(true);
    try {
      await fn();
      showToast(okMsg, 'success');
      setPicking(false);
      onChanged();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-[#F8FAFC] border border-[#F2F4F7]">
      <div className="flex items-center gap-2.5 min-w-0">
        <Avatar name={a.technician_name} className="w-7 h-7" textClassName="text-[10px]" />
        <span className="text-xs font-bold text-[#172033] truncate">{a.technician_name}</span>
        <span className="text-[11px] text-[#667085]">{a.scheduled_time}</span>
        <WorkStatusTag status={a.status} />
      </div>
      {canEdit && (busy ? <Loader2 className="w-4 h-4 animate-spin text-[#004898]" /> : picking ? (
        <div className="flex items-center gap-1.5">
          <select
            autoFocus
            defaultValue=""
            onChange={(e) => e.target.value && run(() => reassignProjectWork(project.id, a.id, e.target.value), 'Work moved.')}
            className="text-[11px] font-semibold border border-[#E4E7EC] rounded-lg px-2 py-1.5 outline-none focus:border-[#004898] bg-white"
          >
            <option value="">Move to…</option>
            {others.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <button onClick={() => setPicking(false)} className="text-[11px] font-bold text-[#667085] px-1.5">Cancel</button>
        </div>
      ) : (
        <div className="flex items-center gap-0.5">
          <button onClick={() => setPicking(true)} disabled={!others.length} className="p-1.5 rounded-lg text-[#667085] hover:text-[#004898] hover:bg-white disabled:opacity-30" title="Move to someone else" aria-label="Reassign">
            <ArrowRightLeft className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => window.confirm(`Cancel ${a.technician_name}'s work on ${fmtDay(a.scheduled_date)}?`) && run(() => cancelProjectWork(project.id, a.id), 'Assignment cancelled.')}
            className="p-1.5 rounded-lg text-[#667085] hover:text-[#D92D20] hover:bg-white"
            title="Cancel this assignment"
            aria-label="Cancel assignment"
          >
            <Ban className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
