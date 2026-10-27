// Summary cards for the Sales module — count + total ₹ value — shared by the
// Admin Leads tab, the Analytics tab, and the Sales employee's dashboard.
// Compact by design: icon + label on one line, the numbers, then one hint
// line. Purely presentational: each caller fetches its own numbers
// (leadsApiService.js).
//
// Styled with utilities rather than the global `.card` class — `.card` is
// unlayered CSS, so it overrides Tailwind's border utilities and hid the
// left accent stripe.
import React from 'react';
import { formatInr } from './leadFormat';

const TONES = {
  blue: { stripe: 'bg-[#004898]', chip: 'bg-[#EFF5FC] text-[#004898]', text: 'text-[#004898]', ring: 'ring-[#004898]' },
  amber: { stripe: 'bg-[#F79009]', chip: 'bg-[#FEF0C7] text-[#B54708]', text: 'text-[#B54708]', ring: 'ring-[#F79009]' },
  green: { stripe: 'bg-[#12B76A]', chip: 'bg-[#ECFDF3] text-[#027A48]', text: 'text-[#027A48]', ring: 'ring-[#12B76A]' },
  red: { stripe: 'bg-[#F04438]', chip: 'bg-[#FEF3F2] text-[#B42318]', text: 'text-[#B42318]', ring: 'ring-[#F04438]' },
  violet: { stripe: 'bg-[#7A5AF8]', chip: 'bg-[#F4F3FF] text-[#5925DC]', text: 'text-[#5925DC]', ring: 'ring-[#7A5AF8]' }
};

// `stat` is the backend's { count, value, missingValue } shape; null while
// loading. `children` replaces the default count/value body (Analytics uses
// it for the conversion-rate card). `active` marks a card whose filter is on.
export const LeadStatCard = ({ label, icon: Icon, tone = 'blue', stat, hint, onClick, active = false, children }) => {
  const t = TONES[tone] || TONES.blue;
  const Wrapper = onClick ? 'button' : 'div';
  const notes = [stat?.missingValue > 0 ? `${stat.missingValue} without a value estimate` : null, hint].filter(Boolean);
  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-pressed={onClick ? active : undefined}
      className={`relative overflow-hidden rounded-xl border border-[#E4E7EC] bg-white shadow-xs pl-5 pr-4 py-3.5 text-left w-full transition-shadow ${
        active ? `ring-2 ${t.ring}` : ''
      } ${onClick ? 'hover:shadow-md cursor-pointer' : ''}`}
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${t.stripe}`} aria-hidden="true" />
      <div className="flex items-center gap-2">
        {Icon && (
          <span className={`p-1.5 rounded-lg ${t.chip}`}>
            <Icon className="w-4 h-4" />
          </span>
        )}
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#667085] truncate">{label}</span>
      </div>
      {children ? <div className="mt-2">{children}</div> : (
        stat ? (
          <div className="mt-2 flex items-baseline gap-2 flex-wrap">
            <span className={`text-2xl font-extrabold leading-none ${t.text}`}>{stat.count}</span>
            <span className="text-sm font-bold text-[#344054]">{formatInr(stat.value)}</span>
          </div>
        ) : (
          <div className="mt-2 h-6 w-24 rounded-md bg-[#F2F4F7] animate-pulse" />
        )
      )}
      {!children && notes.length > 0 && (
        <p className="text-[11px] text-[#667085] mt-1.5 truncate" title={notes.join(' · ')}>{notes.join(' · ')}</p>
      )}
      {children && hint && <p className="text-[11px] text-[#667085] mt-1.5">{hint}</p>}
    </Wrapper>
  );
};

export const LeadStatGrid = ({ children }) => (
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">{children}</div>
);
