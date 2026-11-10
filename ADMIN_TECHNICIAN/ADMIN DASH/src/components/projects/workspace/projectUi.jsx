import React from 'react';
import { Avatar } from '../../common/Avatar';
import { PROJECT_STATUS, WORK_STATUS } from './projectFormat';

// Small shared components for the Projects workspace.

export const ProjectStatusPill = ({ status, className = '' }) => {
  const s = PROJECT_STATUS[status] || PROJECT_STATUS.Planning;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold whitespace-nowrap ${s.cls} ${className}`}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.dot }} />
      {s.label}
    </span>
  );
};

export const WorkStatusTag = ({ status }) => {
  const s = WORK_STATUS[status] || WORK_STATUS.Assigned;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wide whitespace-nowrap"
      style={{ background: s.bg, color: s.fg, borderColor: s.border }}
    >
      {s.label}
    </span>
  );
};

export const RoleTag = ({ role }) => (role === 'manager' ? (
  <span className="px-1.5 py-0.5 rounded-md bg-[#004898] text-white text-[9px] font-black uppercase tracking-wider">Manager</span>
) : (
  <span className="px-1.5 py-0.5 rounded-md bg-[#F2F4F7] text-[#475467] text-[9px] font-black uppercase tracking-wider border border-[#E4E7EC]">View only</span>
));

export const AvatarStack = ({ people = [], max = 4, size = 'w-7 h-7' }) => {
  if (!people.length) return <span className="text-xs font-semibold text-[#98A2B3]">None yet</span>;
  return (
    <div className="flex items-center">
      <div className="flex -space-x-2">
        {people.slice(0, max).map((p) => (
          <div key={p.id} className="ring-2 ring-white rounded-full" title={p.name}>
            <Avatar src={p.avatar_url} name={p.name} className={size} textClassName="text-[10px]" />
          </div>
        ))}
      </div>
      {people.length > max && <span className="ml-1.5 text-[11px] font-bold text-[#667085]">+{people.length - max}</span>}
    </div>
  );
};

export const SectionCard = ({ title, subtitle, action, children, className = '', bodyClassName = '' }) => (
  <section className={`bg-white rounded-2xl border border-[#E4E7EC] shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${className}`}>
    {(title || action) && (
      <header className="px-5 py-4 border-b border-[#F2F4F7] flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-extrabold text-[#172033]">{title}</h3>
          {subtitle && <p className="text-xs text-[#667085] mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </header>
    )}
    <div className={bodyClassName || 'p-5'}>{children}</div>
  </section>
);

export const Empty = ({ icon: Icon, title, text, children }) => (
  <div className="py-10 px-6 text-center">
    {Icon && (
      <div className="w-11 h-11 mx-auto rounded-2xl bg-[#F2F4F7] text-[#98A2B3] flex items-center justify-center mb-3">
        <Icon className="w-5 h-5" />
      </div>
    )}
    <p className="text-sm font-bold text-[#172033]">{title}</p>
    {text && <p className="text-xs text-[#667085] mt-1 max-w-sm mx-auto">{text}</p>}
    {children && <div className="mt-4">{children}</div>}
  </div>
);
