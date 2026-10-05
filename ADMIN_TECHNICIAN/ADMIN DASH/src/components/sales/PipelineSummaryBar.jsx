// Compact pipeline strip: New › Meeting › Proposal › Follow-up › Hold ›
// Won/Lost. Each stage shows its count plus a red overdue badge; with
// `onSelect` the stages become filter buttons (click again to clear).
// Presentational only — callers pass counts they already have.
import React from 'react';
import { ChevronRight } from 'lucide-react';
import { ACTIVE_STATUSES, STATUS_LABEL } from './leadPipeline';

const ACCENT = {
  new: 'bg-[#004898]', meeting: 'bg-[#F79009]', proposal: 'bg-[#7A5AF8]', follow_up: 'bg-[#12B76A]', hold: 'bg-[#667085]', closed: 'bg-[#344054]'
};

// stages: { new: { count, overdue }, ... }; closed: { won, lost } (optional).
export const PipelineSummaryBar = ({ stages, closed, selected, onSelect }) => {
  const items = [
    ...ACTIVE_STATUSES.map((s) => ({ id: s, label: STATUS_LABEL[s], count: stages?.[s]?.count ?? 0, overdue: stages?.[s]?.overdue ?? 0 })),
    ...(closed ? [{ id: 'closed', label: 'Won / Lost', count: null, won: closed.won ?? 0, lost: closed.lost ?? 0 }] : [])
  ];
  const interactive = typeof onSelect === 'function';

  return (
    <div className={`grid grid-cols-3 ${items.length === 6 ? 'md:grid-cols-6' : 'md:grid-cols-5'} gap-2`}>
      {items.map((item, i) => {
        const active = selected === item.id;
        const Tag = interactive ? 'button' : 'div';
        return (
          <div key={item.id} className="relative flex items-center">
            <Tag
              type={interactive ? 'button' : undefined}
              onClick={interactive ? () => onSelect(active ? null : item.id) : undefined}
              aria-pressed={interactive ? active : undefined}
              className={`group w-full rounded-xl border px-3 py-2.5 text-left transition-all ${
                active ? 'border-[#004898] bg-[#EFF5FC] shadow-sm ring-1 ring-[#004898]/20' : 'border-[#E4E7EC] bg-white'
              } ${interactive ? 'hover:border-[#B3D1F2] hover:shadow-sm cursor-pointer' : ''}`}
            >
              <div className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${ACCENT[item.id]}`} />
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#667085] truncate">{item.label}</span>
              </div>
              {item.id === 'closed' ? (
                <div className="mt-1 flex items-baseline gap-2 text-sm font-extrabold">
                  <span className="text-[#027A48]">{item.won}<span className="ml-0.5 text-[10px] font-bold text-[#667085]">W</span></span>
                  <span className="text-[#B42318]">{item.lost}<span className="ml-0.5 text-[10px] font-bold text-[#667085]">L</span></span>
                </div>
              ) : (
                <div className="mt-1 flex items-center justify-between gap-1">
                  <span className="text-xl font-extrabold leading-none text-[#172033]">{item.count}</span>
                  {item.overdue > 0 && (
                    <span className="rounded-full bg-[#FEF3F2] px-1.5 py-0.5 text-[10px] font-bold text-[#B42318]" title={`${item.overdue} overdue`}>
                      {item.overdue} overdue
                    </span>
                  )}
                </div>
              )}
            </Tag>
            {i < items.length - 1 && (
              <ChevronRight className="hidden md:block absolute -right-[11px] z-10 w-3.5 h-3.5 text-[#D0D5DD] pointer-events-none" />
            )}
          </div>
        );
      })}
    </div>
  );
};
