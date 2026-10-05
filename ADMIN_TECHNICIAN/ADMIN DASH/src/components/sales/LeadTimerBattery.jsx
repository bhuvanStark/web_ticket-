// Battery-style stage timer: green, amber when <24h is left, red when
// overdue. Four cells fill with the share of the stage window left; overdue
// empties the battery. Closed leads show a quiet "Final" tag, and a lead
// waiting on a Won request shows that its timer is paused. `now`
// freezes the timer at a past moment (daily reports: the submission time).
import React from 'react';
import { stageTimer, isWonPending, STATUS_LABEL } from './leadPipeline';

const LEVEL = {
  ok: { cell: 'bg-[#12B76A]', shell: 'border-[#6CE9A6]', text: 'text-[#027A48]' },
  soon: { cell: 'bg-[#F79009]', shell: 'border-[#FEC84B]', text: 'text-[#B54708]' },
  overdue: { cell: 'bg-[#F04438]', shell: 'border-[#F04438]', text: 'text-[#B42318]' }
};

export const LeadTimerBattery = ({ lead, compact = false, now }) => {
  if (isWonPending(lead)) {
    return <span className="text-[11px] font-semibold text-[#5925DC]" title="Timer paused while an Admin reviews the Won request">Won · awaiting approval</span>;
  }
  const timer = stageTimer(lead, now ?? Date.now());
  if (!timer) {
    return <span className="text-[11px] font-semibold text-[#98A2B3]">Final</span>;
  }
  const tone = LEVEL[timer.level];
  const filled = timer.overdue ? 0 : Math.max(1, Math.ceil(timer.fraction * 4));
  const due = new Date(timer.deadline).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  const title = `${STATUS_LABEL[lead.status]}: ${timer.days}-day window · ${timer.overdue ? 'was due' : 'due'} ${due}${now ? ' · as submitted' : ''}`;

  return (
    <div className="inline-flex items-center gap-2" title={title} aria-label={`${timer.label}. ${title}`}>
      <span className={`relative inline-flex items-center gap-[2px] rounded-[4px] border-2 p-[2px] ${tone.shell} ${timer.overdue ? 'bg-[#FEF3F2]' : 'bg-white'}`}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`block h-2.5 w-1.5 rounded-[1px] ${i < filled ? tone.cell : 'bg-[#F2F4F7]'}`} />
        ))}
        <span className={`absolute -right-[5px] top-1/2 -translate-y-1/2 h-1.5 w-[3px] rounded-r-sm ${timer.overdue ? 'bg-[#F04438]' : 'bg-[#D0D5DD]'}`} />
      </span>
      {!compact && <span className={`text-[11px] font-bold whitespace-nowrap ${tone.text}`}>{timer.label}</span>}
    </div>
  );
};
