import React from 'react';

export const StatusBadge = ({ status }) => {
  const safeStatus = status || '';
  let badgeClasses = 'bg-[#F1F5F9] text-[#475467] border-[#E2E8F0]';
  let dotColor = 'bg-[#94A3B8]';
  let label = safeStatus || 'Unknown';

  if (safeStatus.includes('Sign') || safeStatus.includes('Pending')) {
    badgeClasses = 'bg-[#FEF0C7] text-[#B54708] border-[#FDE68A]';
    dotColor = 'bg-[#F79009]';
    label = 'Pending';
  } else if (status.includes('Progress')) {
    badgeClasses = 'bg-[#EFF8FF] text-[#175CD3] border-[#B2DDFF]';
    dotColor = 'bg-[#2E90FA]';
    label = 'Active';
  } else if (status.includes('Way')) {
    badgeClasses = 'bg-[#FDF2FA] text-[#C11574] border-[#FCCCE5]';
    dotColor = 'bg-[#EE46BC]';
    label = 'Enroute';
  } else if (status.includes('Completed') || status.includes('Resolved') || status.includes('Closed')) {
    badgeClasses = 'bg-[#ECFDF3] text-[#027A48] border-[#A6F4C5]';
    dotColor = 'bg-[#12B76A]';
    label = 'Resolved';
  } else if (status.includes('Review') || status.includes('Received')) {
    badgeClasses = 'bg-[#FFF4ED] text-[#B93815] border-[#FFD6B8]';
    dotColor = 'bg-[#FB6514]';
    label = 'Reviewing';
  } else if (status.includes('Requested')) {
    badgeClasses = 'bg-[#FEF3F2] text-[#B42318] border-[#FECDCA]';
    dotColor = 'bg-[#F04438]';
    label = 'Requested';
  } else if (status === 'Assigned') {
    badgeClasses = 'bg-[#F0F9FF] text-[#026AA2] border-[#B9E6FE]';
    dotColor = 'bg-[#0BA5EC]';
    label = 'Assigned';
  } else {
    badgeClasses = 'bg-[#F8FAFC] text-[#475467] border-[#E2E8F0]';
    dotColor = 'bg-[#94A3B8]';
    label = 'Unassigned';
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
