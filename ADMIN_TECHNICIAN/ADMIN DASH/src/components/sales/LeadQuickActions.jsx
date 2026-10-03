// Lead pieces shared by the Admin Leads tab and the Sales employee's My
// Leads page: the quick Status modal (Actions column) and the Remarks editor
// (Lead Details popup). The backend enforces every rule shown here — Won
// needs all lead fields, Dead is Admin-only, closed leads are locked for
// Sales — the UI only mirrors them so users see why before submitting.
import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { updateLeadStatus, updateLeadRemarks } from '../../services/leadsApiService';

const STATUS_LABEL = { new: 'New', meeting: 'Meeting', proposal: 'Proposal', follow_up: 'Follow-up', won: 'Won', lost: 'Lost', dead: 'Dead' };

// Mirrors leadService.WON_REQUIRED_FIELDS.
const WON_REQUIRED = [
  ['company', 'Company'], ['phone', 'Phone'], ['person_to_contact', 'Person to Contact'], ['email', 'Email'], ['value_estimate', 'Value Estimate']
];

const missingWonFields = (lead) =>
  WON_REQUIRED.filter(([key]) => lead?.[key] == null || String(lead[key]).trim() === '').map(([, label]) => label);

export const LeadStatusModal = ({ lead, statusOptions, onClose, onDone, showToast }) => {
  const [status, setStatus] = useState(lead.status);
  const [busy, setBusy] = useState(false);
  const missing = status === 'won' ? missingWonFields(lead) : [];
  // The lead's current status is always selectable, even when it isn't in
  // statusOptions (e.g. a Sales user viewing a Dead lead).
  const options = statusOptions.includes(lead.status) ? statusOptions : [lead.status, ...statusOptions];

  const submit = async (e) => {
    e.preventDefault();
    if (busy || status === lead.status || missing.length) return;
    setBusy(true);
    try {
      await updateLeadStatus(lead.id, status);
      showToast(`Status updated to ${STATUS_LABEL[status]}`, 'success');
      onDone();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white shadow-xl border border-[#E4E7EC]">
        <div className="flex items-center justify-between p-5 border-b border-[#E4E7EC]">
          <h3 className="text-lg font-bold text-[#172033]">Change Status</h3>
          <button onClick={onClose} className="text-[#667085] hover:text-[#172033]"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3">
          <p className="text-sm text-[#667085]">
            <span className="font-semibold text-[#172033]">{lead.company}</span> is currently <span className="font-semibold text-[#172033]">{STATUS_LABEL[lead.status]}</span>.
          </p>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="form-input text-sm">
            {options.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
          {missing.length > 0 && (
            <p className="text-xs text-[#B42318] bg-[#FEF3F2] border border-[#FECDCA] rounded-lg px-3 py-2">
              Fill in all lead details before marking it Won. Missing: {missing.join(', ')}.
            </p>
          )}
          {status === 'won' && missing.length === 0 && status !== lead.status && (
            <p className="text-xs text-[#667085]">A Won lead is final — it can't be edited, reassigned or moved to another status afterwards.</p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold rounded-lg border border-[#E4E7EC] bg-white text-[#344054] hover:bg-[#F8FAFC]">Cancel</button>
            <button type="submit" disabled={busy || status === lead.status || missing.length > 0} className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#004898] text-white hover:bg-[#00346E] disabled:opacity-50">
              {busy ? 'Updating…' : 'Update Status'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Remarks section of the Lead Details popup. Shows the latest saved value;
// `readOnly` renders it as text only (Super Admin "View as").
export const LeadRemarks = ({ lead, readOnly = false, onSaved, showToast }) => {
  const saved = lead.remarks || '';
  const [value, setValue] = useState(saved);
  const [busy, setBusy] = useState(false);

  // Resync when the lead is reloaded (after a save, or a realtime refresh).
  useEffect(() => { setValue(lead.remarks || ''); }, [lead.id, lead.remarks]);

  const save = async () => {
    if (busy || value.trim() === saved.trim()) return;
    setBusy(true);
    try {
      await updateLeadRemarks(lead.id, value);
      showToast('Remarks saved', 'success');
      onSaved?.();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h4 className="text-xs font-bold text-[#667085] uppercase tracking-wider mb-2">Remarks</h4>
      {readOnly ? (
        <p className="text-sm text-[#172033] whitespace-pre-wrap">{saved || <span className="text-[#98A2B3] italic">No remarks</span>}</p>
      ) : (
        <div className="space-y-2">
          <textarea value={value} onChange={(e) => setValue(e.target.value)} rows={3} maxLength={5000} placeholder="Add remarks about this lead…" className="form-input text-sm" />
          <div className="flex justify-end">
            <button type="button" onClick={save} disabled={busy || value.trim() === saved.trim()} className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#004898] text-white hover:bg-[#00346E] disabled:opacity-50 whitespace-nowrap">
              {busy ? 'Saving…' : 'Save Remarks'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
