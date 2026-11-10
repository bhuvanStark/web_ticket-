import React, { useState } from 'react';
import { X, Check, XCircle, Loader2 } from 'lucide-react';
import { reviewProjectCompletion } from '../../../services/projectApiService';

// Super Admin's approve / reject. A rejection needs a reason — it is shown to
// the managers on the project.
export const ReviewDialog = ({ projectId, decision: initial, onClose, onDone, showToast }) => {
  const [decision, setDecision] = useState(initial);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const rejecting = decision === 'reject';
  const ready = !rejecting || reason.trim().length >= 3;

  const confirm = async () => {
    setBusy(true);
    try {
      await reviewProjectCompletion(projectId, decision, rejecting ? reason.trim() : undefined);
      showToast(rejecting ? 'Sent back to the project with your reason.' : `${projectId} approved and completed.`, rejecting ? 'info' : 'success');
      onDone();
    } catch (err) {
      showToast(err.message, 'error');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-[#0B1220]/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4" onClick={() => !busy && onClose()}>
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-[#F2F4F7] flex items-center justify-between">
          <h3 className="text-base font-extrabold text-[#172033]">Review completion — {projectId}</h3>
          <button onClick={onClose} disabled={busy} className="p-2 rounded-full hover:bg-[#F2F4F7] text-[#667085]" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setDecision('approve')} className={`p-3 rounded-xl border-2 text-left ${!rejecting ? 'border-[#12B76A] bg-[#ECFDF3]' : 'border-[#E4E7EC]'}`}>
              <Check className={`w-5 h-5 ${!rejecting ? 'text-[#027A48]' : 'text-[#98A2B3]'}`} />
              <div className="text-sm font-extrabold text-[#172033] mt-1">Approve</div>
              <div className="text-[11px] text-[#667085]">Move to Completed</div>
            </button>
            <button onClick={() => setDecision('reject')} className={`p-3 rounded-xl border-2 text-left ${rejecting ? 'border-[#F04438] bg-[#FEF3F2]' : 'border-[#E4E7EC]'}`}>
              <XCircle className={`w-5 h-5 ${rejecting ? 'text-[#B42318]' : 'text-[#98A2B3]'}`} />
              <div className="text-sm font-extrabold text-[#172033] mt-1">Reject</div>
              <div className="text-[11px] text-[#667085]">Back to Active</div>
            </button>
          </div>
          {rejecting && (
            <div>
              <label className="block text-xs font-bold text-[#172033] mb-1">Reason (shown to the managers) *</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                maxLength={500}
                autoFocus
                placeholder="e.g. Customer seal is missing on the completion page"
                className="w-full px-3 py-2.5 border border-[#E4E7EC] rounded-xl text-sm outline-none focus:border-[#004898] resize-none"
              />
            </div>
          )}
        </div>
        <div className="px-5 py-4 border-t border-[#F2F4F7] flex justify-end gap-2 bg-[#FCFCFD]">
          <button onClick={onClose} disabled={busy} className="px-4 py-2.5 text-xs font-bold text-[#475467] hover:bg-[#F2F4F7] rounded-xl">Cancel</button>
          <button
            onClick={confirm}
            disabled={!ready || busy}
            className={`px-5 py-2.5 text-white text-xs font-extrabold rounded-xl flex items-center gap-2 disabled:opacity-40 ${rejecting ? 'bg-[#D92D20] hover:bg-[#B42318]' : 'bg-[#12B76A] hover:bg-[#039855]'}`}
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {rejecting ? 'Reject' : 'Approve & complete'}
          </button>
        </div>
      </div>
    </div>
  );
};
