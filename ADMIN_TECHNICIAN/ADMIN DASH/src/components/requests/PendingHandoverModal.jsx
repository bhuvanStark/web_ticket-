import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { X, Clock, AlertTriangle, Send, FileText, ArrowRight, User } from 'lucide-react';

export const PendingHandoverModal = ({ isOpen, onClose, ticketId }) => {
  const { tickets, currentUser, markTicketPendingHandover } = useApp();

  const [reason, setReason] = useState('Waiting for Spare Parts Delivery');
  const [workCompleted, setWorkCompleted] = useState('');
  const [handoverNotes, setHandoverNotes] = useState('');
  const [nextVisitDate, setNextVisitDate] = useState('Tomorrow Morning');

  if (!isOpen || !ticketId) return null;

  const ticket = tickets.find(t => t.id === ticketId || t.ticketNumber === ticketId);

  const handleSubmit = (e) => {
    e.preventDefault();
    markTicketPendingHandover(ticketId, {
      reason,
      workCompleted: workCompleted || 'Initial diagnostics and hardware testing completed on site.',
      handoverNotes: handoverNotes || 'Pending next engineer visit for final installation & testing.',
      nextVisitDate
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-[#E4E7EC] overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 bg-[#FFFAEB] border-b border-[#FDE68A] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#FEF0C7] text-[#B54708] rounded-xl border border-[#FDE68A]">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-[#B54708]">Mark Job Pending / Handover Notes</h3>
              <p className="text-xs text-[#B54708]/80">
                Log incomplete status & instructions for the next technician (<span className="font-mono font-bold">{ticketId}</span>)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#B54708] hover:bg-[#FEF0C7] rounded-lg transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Current Engineer Info */}
          <div className="p-3 bg-[#F8FAFC] rounded-xl border border-[#E4E7EC] flex items-center justify-between text-xs">
            <div className="flex items-center gap-2.5">
              <img
                src={currentUser?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'}
                alt={currentUser?.name}
                className="w-8 h-8 rounded-full object-cover border border-[#004898]"
              />
              <div>
                <div className="font-bold text-[#172033]">{currentUser?.name}</div>
                <div className="text-[10px] text-[#667085]">{currentUser?.roleLabel || 'AV Field Engineer'}</div>
              </div>
            </div>
            <span className="text-[11px] font-bold text-[#B54708] bg-[#FEF0C7] px-2.5 py-1 rounded-full border border-[#FDE68A]">
              Logging Work Handover
            </span>
          </div>

          {/* Pending Reason */}
          <div>
            <label className="text-xs font-extrabold text-[#344054] block mb-1">
              Primary Pending Reason <span className="text-red-500">*</span>
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full p-2.5 bg-[#F8FAFC] border border-[#E4E7EC] rounded-lg text-xs font-semibold text-[#172033] focus:border-[#004898] focus:outline-none"
            >
              <option value="Waiting for Spare Parts Delivery">📦 Waiting for Spare Parts Delivery</option>
              <option value="Complex Cabling / Rack Wiring Needed">🔌 Complex Cabling / Rack Wiring Needed</option>
              <option value="Customer Room Occupied / Access Delayed">🚪 Customer Room Occupied / Access Delayed</option>
              <option value="Awaiting Network / VLAN / IT Clearance">🌐 Awaiting Network / VLAN / IT Clearance</option>
              <option value="Requires OEM Factory Calibration">🛠️ Requires OEM Factory Calibration</option>
              <option value="Time Shift Limit / Scheduled Next Day Visit">⏰ Time Shift Limit / Scheduled Next Day Visit</option>
            </select>
          </div>

          {/* Work Completed Today */}
          <div>
            <label className="text-xs font-extrabold text-[#344054] block mb-1">
              Work Completed Today <span className="text-red-500">*</span>
            </label>
            <textarea
              required
              rows={3}
              value={workCompleted}
              onChange={(e) => setWorkCompleted(e.target.value)}
              placeholder="e.g. Diagnosed main Extron switcher HDMI port failure. Unmounted faulty unit from rack slot 4 and traced Cat6 cable run."
              className="w-full p-2.5 bg-[#F8FAFC] border border-[#E4E7EC] rounded-lg text-xs text-[#172033] placeholder-[#98A2B3] focus:border-[#004898] focus:outline-none"
            />
          </div>

          {/* Handover Instructions for Next Engineer */}
          <div>
            <label className="text-xs font-extrabold text-[#004898] block mb-1 flex items-center gap-1">
              <FileText className="w-3.5 h-3.5" />
              Handover Instructions for Next Technician <span className="text-red-500">*</span>
            </label>
            <textarea
              required
              rows={3}
              value={handoverNotes}
              onChange={(e) => setHandoverNotes(e.target.value)}
              placeholder="e.g. Cable #4 is tagged with blue tape. New Extron matrix switcher unit is arriving via courier tomorrow morning. Mount unit, connect Cat6 #4, and run 4K test pattern."
              className="w-full p-2.5 bg-[#EFF5FC] border border-[#B3D1F2] rounded-lg text-xs font-medium text-[#172033] placeholder-[#667085] focus:border-[#004898] focus:outline-none"
            />
          </div>

          {/* Estimated Next Visit */}
          <div>
            <label className="text-xs font-extrabold text-[#344054] block mb-1">
              Estimated Next Visit Timing
            </label>
            <input
              type="text"
              value={nextVisitDate}
              onChange={(e) => setNextVisitDate(e.target.value)}
              placeholder="e.g. Tomorrow 10:00 AM"
              className="w-full p-2.5 bg-[#F8FAFC] border border-[#E4E7EC] rounded-lg text-xs text-[#172033]"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-[#E4E7EC] flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-white border border-[#E4E7EC] rounded-lg text-xs font-bold text-[#344054] hover:bg-[#F8FAFC]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 bg-[#B54708] hover:bg-[#93370D] text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-xs"
            >
              <Send className="w-4 h-4" />
              <span>Save Handover & Mark Pending</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
