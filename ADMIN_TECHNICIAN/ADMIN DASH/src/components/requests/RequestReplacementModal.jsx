import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { X, UserX, AlertTriangle, Send } from 'lucide-react';

export const RequestReplacementModal = ({ isOpen, onClose, ticket }) => {
  const { requestTechnicianReplacement, currentUser } = useApp();

  const [reason, setReason] = useState('Emergency Schedule Conflict / Overrun on Previous Site');
  const [urgency, setUrgency] = useState('Immediate (< 30 Mins)');
  const [notes, setNotes] = useState('');

  if (!isOpen || !ticket) return null;

  const handleSubmit = (e) => {
    e.preventDefault();

    requestTechnicianReplacement(ticket.id || ticket.ticketNumber, {
      reason,
      urgency,
      notes: notes || 'Technician requested reassignment due to schedule overrun.',
      technicianName: currentUser?.name || ticket.assignedTo || 'Ravi Kumar'
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-[#E4E7EC] overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="p-5 border-b border-[#E4E7EC] bg-[#FEF3F2] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#D92D20] text-white flex items-center justify-center shadow-xs">
              <UserX className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-[#912018]">Request Technician Replacement</h3>
              <p className="text-xs text-[#B42318] font-medium">
                Notify Admin immediately to reassign ticket <span className="font-mono font-bold">{ticket.id || ticket.ticketNumber}</span>
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-[#98A2B3] hover:text-[#172033] rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Urgent Warning Banner */}
          <div className="p-3.5 bg-[#FFFAEB] border border-[#FDE68A] rounded-xl flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />
            <p className="text-xs text-[#B45309] font-medium leading-relaxed">
              Submitting this request will immediately alert the Admin Dispatch Desk with a high-priority notification to dispatch a replacement engineer.
            </p>
          </div>

          {/* Primary Reason */}
          <div>
            <label className="block text-xs font-bold text-[#172033] mb-1.5">
              Reason for Replacement Request *
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="form-select text-xs w-full py-2.5 px-3 border-[#D0D5DD] rounded-lg font-medium text-[#172033]"
            >
              <option value="Emergency Schedule Conflict / Overrun on Previous Site">Emergency Schedule Conflict / Overrun on Previous Site</option>
              <option value="Personal Illness / Emergency">Personal Illness / Emergency</option>
              <option value="Specialized Engineering Required (DSP / Control Systems)">Specialized Engineering Required (DSP / Control Systems)</option>
              <option value="Special Hardware / Testing Tools Required">Special Hardware / Testing Tools Required</option>
              <option value="Location / Access Constraint">Location / Access Constraint</option>
              <option value="Other Urgent Reason">Other Urgent Reason</option>
            </select>
          </div>

          {/* Urgency Level */}
          <div>
            <label className="block text-xs font-bold text-[#172033] mb-1.5">
              Replacement Urgency *
            </label>
            <div className="grid grid-cols-2 gap-2">
              {['Immediate (< 30 Mins)', 'Same Day'].map((level) => (
                <button
                  type="button"
                  key={level}
                  onClick={() => setUrgency(level)}
                  className={`py-2 px-3 text-xs font-bold rounded-lg border transition-all ${
                    urgency === level
                      ? 'bg-[#FEF3F2] border-[#FECDCA] text-[#B42318]'
                      : 'bg-white border-[#E4E7EC] text-[#667085] hover:bg-[#F8FAFC]'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          {/* Notes / Details */}
          <div>
            <label className="block text-xs font-bold text-[#172033] mb-1.5">
              Additional Notes for Service Coordinator *
            </label>
            <textarea
              required
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Provide context so Admin can quickly assign the right replacement engineer..."
              className="form-textarea text-xs w-full p-3 border-[#D0D5DD] rounded-lg text-[#172033]"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E4E7EC]">
            <button
              type="button"
              onClick={onClose}
              className="btn bg-white border border-[#D0D5DD] text-[#344054] hover:bg-[#F8FAFC] font-bold text-xs px-4 py-2.5 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn bg-[#D92D20] hover:bg-[#B42318] text-white font-extrabold text-xs px-5 py-2.5 rounded-lg flex items-center gap-2 shadow-xs"
            >
              <Send className="w-4 h-4" />
              <span>🚨 Submit Replacement Request to Admin</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
