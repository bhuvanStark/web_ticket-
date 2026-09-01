import React from 'react';
import { Inbox, CheckCircle2, CalendarX, ShieldCheck } from 'lucide-react';

export const EmptyState = ({
  title = "No Data Found",
  subtitle = "There are no records matching your request.",
  icon = "inbox",
  actionBtn = null
}) => {
  return (
    <div className="p-12 text-center bg-white border border-[#E4E7EC] rounded-xl my-4">
      <div className="w-14 h-14 rounded-full bg-[#EFF5FC] text-[#004898] flex items-center justify-center mx-auto mb-3">
        {icon === "check" && <CheckCircle2 className="w-7 h-7 text-[#12B76A]" />}
        {icon === "calendar" && <CalendarX className="w-7 h-7 text-[#F79009]" />}
        {icon === "shield" && <ShieldCheck className="w-7 h-7 text-[#004898]" />}
        {icon === "inbox" && <Inbox className="w-7 h-7 text-[#004898]" />}
      </div>
      <h3 className="text-base font-bold text-[#172033] mb-1">{title}</h3>
      <p className="text-xs text-[#667085] max-w-sm mx-auto mb-4">{subtitle}</p>
      {actionBtn}
    </div>
  );
};
