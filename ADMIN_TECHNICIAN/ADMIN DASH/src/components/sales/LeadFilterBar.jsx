// Building blocks for the Sales lead-list toolbars (Admin Leads tab and the
// Sales employee's My Leads page), so both lists share one layout:
//   ViewTabs   — which list you're looking at (All / Unassigned / …)
//   SearchField, ToggleChip, FilterDivider — the filter row underneath
// Purely presentational; callers own all filter state.
import React from 'react';
import { Search, X } from 'lucide-react';

// Underlined tabs across the top of the list panel. Swipeable on phones.
// tabs: [{ id, label, icon?, count?, countTone? }]; countTone colors a
// non-zero badge (e.g. 'bg-[#5925DC] text-white').
export const ViewTabs = ({ tabs, value, onChange }) => (
  <div role="tablist" className="sales-scroll-x flex items-center gap-1 overflow-x-auto px-2 sm:px-3 border-b border-[#E4E7EC]">
    {tabs.map((t) => {
      const active = value === t.id;
      const Icon = t.icon;
      return (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={active}
          onClick={() => onChange(t.id)}
          className={`shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-3 -mb-px border-b-2 text-[13px] font-bold transition-colors ${
            active ? 'border-[#004898] text-[#004898]' : 'border-transparent text-[#667085] hover:text-[#172033]'
          }`}
        >
          {Icon && <Icon className="w-4 h-4" />}
          {t.label}
          {t.count != null && (
            <span className={`min-w-[20px] rounded-full px-1.5 py-px text-center text-[10px] font-bold ${
              t.count && t.countTone ? t.countTone : active ? 'bg-[#DCEBFA] text-[#004898]' : 'bg-[#F2F4F7] text-[#667085]'
            }`}>{t.count}</span>
          )}
        </button>
      );
    })}
  </div>
);

export const SearchField = ({ value, onChange, placeholder = 'Search company, phone, contact or Ref ID…', className = '' }) => (
  <div className={`relative ${className}`}>
    <Search className="w-4 h-4 text-[#98A2B3] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label="Search leads"
      className="form-input text-xs !py-2 !pr-8"
    />
    {value && (
      <button type="button" onClick={() => onChange('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-[#98A2B3] hover:text-[#344054]">
        <X className="w-3.5 h-3.5" />
      </button>
    )}
  </div>
);

// A filter on/off pill. `count` shows a badge; `activeTone` overrides the
// selected colors (defaults to brand blue).
export const ToggleChip = ({ active, onClick, icon: Icon, label, count, countTone, activeTone, title }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    title={title}
    className={`shrink-0 whitespace-nowrap px-3 py-2 text-xs font-bold rounded-lg border inline-flex items-center gap-1.5 transition-colors ${
      active ? (activeTone || 'border-[#004898] bg-[#EFF5FC] text-[#004898]') : 'border-[#E4E7EC] bg-white text-[#344054] hover:bg-[#F8FAFC]'
    }`}
  >
    {Icon && <Icon className="w-3.5 h-3.5" />}
    {label}
    {count != null && (
      <span className={`rounded-full px-1.5 text-[10px] ${count && countTone ? countTone : 'bg-[#F2F4F7] text-[#667085]'}`}>{count}</span>
    )}
  </button>
);

export const FilterDivider = () => <span className="hidden lg:block h-6 w-px bg-[#E4E7EC] shrink-0" aria-hidden="true" />;

// The bordered panel that holds tabs, filters and the list itself.
export const ListPanel = ({ children, className = '' }) => (
  <div className={`rounded-xl border border-[#E4E7EC] bg-white shadow-xs ${className}`}>{children}</div>
);
