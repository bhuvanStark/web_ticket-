import React from 'react';

// Compact 3-way segmented control used to scope ticket lists to All / AV / EPABX.
// `value` is one of 'ALL' | 'av' | 'epabx' and is matched directly against a
// ticket's `supportCategory` field (the real support-line the ticket was raised
// under) — no hard-coded ticket data, just a filter over what's already there.
const OPTIONS = [
  { value: 'ALL', label: 'All' },
  { value: 'av', label: 'AV' },
  { value: 'epabx', label: 'EPABX' }
];

export const ServiceTypeToggle = ({ value, onChange, className = '' }) => (
  <div
    role="tablist"
    aria-label="Filter by service type"
    className={`inline-flex items-center gap-1 bg-[#F1F5F9] border border-[#E4E7EC] rounded-lg p-1 ${className}`}
  >
    {OPTIONS.map((opt) => (
      <button
        key={opt.value}
        type="button"
        role="tab"
        aria-selected={value === opt.value}
        onClick={() => onChange(opt.value)}
        className={`px-3.5 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
          value === opt.value
            ? 'bg-white text-[#004898] shadow-xs border border-[#B3D1F2]'
            : 'text-[#667085] hover:text-[#172033] border border-transparent'
        }`}
      >
        {opt.label}
      </button>
    ))}
  </div>
);
