import React from 'react';
import { useApp } from '../../context/AppContext';
import { Bell, CheckCheck, X, AlertTriangle, CheckCircle, Info } from 'lucide-react';

export const NotificationsDrawer = () => {
  const {
    isNotificationsOpen,
    setIsNotificationsOpen,
    notifications,
    role,
    setSelectedTicketId
  } = useApp();

  if (!isNotificationsOpen) return null;

  const roleNotifs = notifications.filter(n => !n.role || n.role === role || role === 'admin');

  return (
    <div className="absolute right-8 top-16 w-80 sm:w-96 bg-white rounded-xl shadow-xl border border-[#E4E7EC] z-40 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
      <div className="p-3.5 border-b border-[#E4E7EC] bg-[#F8FAFC] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-[#004898]" />
          <h3 className="font-bold text-xs uppercase tracking-wider text-[#172033]">
            {role === 'admin' ? 'Coordinator Notifications' : 'Technician Alerts'}
          </h3>
        </div>
        <button
          onClick={() => setIsNotificationsOpen(false)}
          className="p-1 text-[#667085] hover:text-[#172033] rounded-md"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="max-h-80 overflow-y-auto divide-y divide-[#F2F4F7]">
        {roleNotifs.length === 0 ? (
          <div className="p-6 text-center text-[#667085] text-xs">
            No notifications available right now.
          </div>
        ) : (
          roleNotifs.map((n) => (
            <div
              key={n.id}
              onClick={() => {
                if (n.ticketId) {
                  setSelectedTicketId(n.ticketId);
                  setIsNotificationsOpen(false);
                }
              }}
              className={`p-3.5 hover:bg-[#F8FAFC] cursor-pointer transition-all flex gap-3 ${n.type === 'urgent' ? 'bg-[#FEF3F2] border-l-4 border-l-[#D92D20]' : (!n.read || n.unread ? 'bg-[#EFF5FC]/50' : '')}`}
            >
              <div className="mt-0.5">
                {n.type === 'urgent' && <AlertTriangle className="w-4 h-4 text-[#D92D20] shrink-0" />}
                {n.type === 'warning' && <AlertTriangle className="w-4 h-4 text-[#F79009] shrink-0" />}
                {n.type === 'success' && <CheckCircle className="w-4 h-4 text-[#12B76A] shrink-0" />}
                {(!n.type || n.type === 'info') && <Info className="w-4 h-4 text-[#004898] shrink-0" />}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-xs text-[#172033]">{n.title}</h4>
                  <span className="text-[10px] text-[#98A2B3]">{n.time}</span>
                </div>
                <p className="text-xs text-[#475467] mt-1 leading-snug">{n.message}</p>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="p-2.5 bg-[#F8FAFC] border-t border-[#E4E7EC] text-center">
        <button
          onClick={() => setIsNotificationsOpen(false)}
          className="text-xs font-bold text-[#004898] hover:underline"
        >
          Close Drawer
        </button>
      </div>
    </div>
  );
};
