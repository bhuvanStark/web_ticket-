import React from 'react';

export const StatusBadge = ({ status }) => {
  const safeStatus = status || '';
  let badgeClasses = 'bg-[#F8FAFC] text-[#475467] border-[#E2E8F0]';
  let dotColor = 'bg-[#94A3B8]';
  let label = 'Unassigned';

  // Workflow: Unassigned -> Assigned -> Active -> (Pending) -> Completed / Reassigned.
  // Legacy label fragments are still recognised so historical rows render sensibly.
  if (safeStatus === 'Reassigned') {
    badgeClasses = 'bg-[#F2F4F7] text-[#475467] border-[#E4E7EC]';
    dotColor = 'bg-[#98A2B3]';
    label = 'Reassigned';
  } else if (safeStatus === 'Pending' || safeStatus.includes('Pending') || safeStatus.includes('Awaiting') || safeStatus.includes('Sign')) {
    badgeClasses = 'bg-[#FFFAEB] text-[#B54708] border-[#FEDF89]';
    dotColor = 'bg-[#F79009]';
    label = 'Pending';
  } else if (safeStatus.includes('Completed') || safeStatus.includes('Resolved') || safeStatus.includes('Closed')) {
    badgeClasses = 'bg-[#ECFDF3] text-[#027A48] border-[#A6F4C5]';
    dotColor = 'bg-[#12B76A]';
    label = 'Completed';
  } else if (safeStatus === 'Active' || safeStatus.includes('Progress') || safeStatus.includes('Way')) {
    badgeClasses = 'bg-[#EFF8FF] text-[#175CD3] border-[#B2DDFF]';
    dotColor = 'bg-[#2E90FA]';
    label = 'Active';
  } else if (safeStatus === 'Assigned') {
    badgeClasses = 'bg-[#F0F9FF] text-[#026AA2] border-[#B9E6FE]';
    dotColor = 'bg-[#0BA5EC]';
    label = 'Assigned';
  } else if (safeStatus === 'Cancelled') {
    badgeClasses = 'bg-[#FEF3F2] text-[#B42318] border-[#FECDCA]';
    dotColor = 'bg-[#F04438]';
    label = 'Cancelled';
  }

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold border ${badgeClasses}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`}></span>
      {label}
    </span>
  );
};

export const PriorityBadge = ({ priority }) => {
  let priorityClass = 'bg-[#F1F5F9] text-[#475467]';

  switch (priority) {
    case 'Critical':
      priorityClass = 'bg-[#FEF3F2] text-[#B42318]';
      break;
    case 'High':
      priorityClass = 'bg-[#FFF4ED] text-[#B93815]';
      break;
    case 'Medium':
      priorityClass = 'bg-[#FEF0C7] text-[#B54708]';
      break;
    case 'Low':
      priorityClass = 'bg-[#ECFDF3] text-[#027A48]';
      break;
    default:
      priorityClass = 'bg-[#F1F5F9] text-[#475467]';
  }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${priorityClass}`}>
      {priority}
    </span>
  );
};
