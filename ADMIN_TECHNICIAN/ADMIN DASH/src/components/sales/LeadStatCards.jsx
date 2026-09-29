// Summary cards for the Sales module — count + total ₹ value — shared by the
// Admin Leads tab, the Analytics tab, and the Sales employee's dashboard.
// Same visual language as AdminDashboard's KPI cards. Purely presentational:
// each caller fetches its own numbers (leadsApiService.js).
import React from 'react';
import { formatInr } from './leadFormat';

const TONES = {
  blue: { border: 'border-l-[#004898]', chip: 'bg-[#EFF5FC] text-[#004898]', text: 'text-[#004898]' },
  amber: { border: 'border-l-[#F79009]', chip: 'bg-[#FEF0C7] text-[#B54708]', text: 'text-[#B54708]' },
  green: { border: 'border-l-[#12B76A]', chip: 'bg-[#ECFDF3] text-[#027A48]', text: 'text-[#027A48]' },
  red: { border: 'border-l-[#F04438]', chip: 'bg-[#FEF3F2] text-[#B42318]', text: 'text-[#B42318]' },
  violet: { border: 'border-l-[#7A5AF8]', chip: 'bg-[#F4F3FF] text-[#5925DC]', text: 'text-[#5925DC]' }
};

// `stat` is the backend's { count, value, missingValue } shape; null while
// loading. `children` replaces the default count/value body (Analytics uses
// it for the conversion-rate card).
export const LeadStatCard = ({ label, icon: Icon, tone = 'blue', stat, hint, onClick, children }) => {
  const t = TONES[tone] || TONES.blue;
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      onClick={onClick}
      className={`card p-5 border-l-4 ${t.border} text-left w-full ${onClick ? 'hover:shadow-md transition-shadow cursor-pointer' : ''}`}
    >
      <div className="flex items-center justify-between text-[#667085] mb-2">
        <span className="text-xs font-bold uppercase tracking-wider">{label}</span>
        {Icon && (
          <div className={`p-2 rounded-lg ${t.chip}`}>
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>
      {children || (
        stat ? (
          <>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className={`text-3xl font-extrabold ${t.text}`}>{stat.count}</span>
              <span className="text-sm font-bold text-[#344054]">{formatInr(stat.value)}</span>
            </div>
            {stat.missingValue > 0 && (
              <p className="text-[11px] text-[#98A2B3] mt-1">{stat.missingValue} without a value estimate</p>
            )}
          </>
        ) : (
          <div className="h-9 w-24 rounded-md bg-[#F2F4F7] animate-pulse" />
        )
      )}
      {hint && <p className="text-[11px] text-[#667085] mt-1">{hint}</p>}
    </Wrapper>
  );
};

export const LeadStatGrid = ({ children }) => (
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">{children}</div>
);
