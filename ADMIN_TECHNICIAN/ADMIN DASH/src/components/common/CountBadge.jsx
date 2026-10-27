import React from 'react';

// Red notification-style count pill. Renders nothing at 0 so a visible
// badge always means "there is work waiting". Caps at 99+.
export const CountBadge = ({ count, className = '' }) => {
  if (!count || count <= 0) return null;
  return (
    <span
      aria-label={`${count} open`}
      className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-[#F04438] text-white text-[10px] font-extrabold leading-none tabular-nums shadow-xs ring-2 ring-white ${className}`}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
};
