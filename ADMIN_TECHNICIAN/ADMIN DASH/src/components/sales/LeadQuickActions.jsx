// Lead pieces shared by the Admin Leads tab and the Sales employee's My
// Leads page: the Change Status modal and the Remarks editor (Lead Details
// popup). The backend enforces every rule shown here — allowed moves, Won
// only from Proposal onwards and needs all lead fields + Ref ID + a value
// above ₹0, Proposal onwards needs Value + Ref ID, Lost/Dead need a reason,
// Dead is Admin-only, closed leads are locked for Sales — the UI only
// mirrors them so users see why before submitting.
import React, { useEffect, useState } from 'react';
import { X, AlertTriangle, Copy, Hourglass } from 'lucide-react';
import { updateLeadStatus, updateLeadRemarks, addFollowUp } from '../../services/leadsApiService';
import {
  STATUS_LABEL, STATUS_COLOR, PROPOSAL_STAGES, CLOSED_STATUSES, REF_ID_TEMPLATE, LOST_REASONS,
  isRefIdTemplate, nextStatuses, todayKey, isWonPending, keepsStageClock, money
} from './leadPipeline';
import { LeadTimerBattery } from './LeadTimerBattery';

// Mirrors leadService.WON_REQUIRED_FIELDS.
const WON_REQUIRED = [
  ['company', 'Company'], ['phone', 'Phone'], ['person_to_contact', 'Person to Contact'], ['email', 'Email'],
  ['value_estimate', 'Value Estimate'], ['ref_id', 'Ref ID']
];

const isBlank = (v) => v == null || String(v).trim() === '';
const missingWonFields = (lead) => WON_REQUIRED
  .filter(([key]) => isBlank(lead?.[key]) || (key === 'value_estimate' && !(Number(lead[key]) > 0)))
  .map(([key, label]) => (key === 'value_estimate' && !isBlank(lead?.[key]) ? 'Value Estimate (must be more than ₹0)' : label));

// Value Estimate + Ref ID inputs, shared by the status modal and the lead
// edit forms. The Ref ID starts as the editable example when empty.
export const ProposalFields = ({ valueEstimate, setValueEstimate, refId, setRefId, required }) => {
  const refIsTemplate = isRefIdTemplate(refId);
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-bold text-[#344054] mb-1">Value Estimate (₹){required && ' *'}</label>
        <input type="number" min="0" step="any" required={required} value={valueEstimate} onChange={(e) => setValueEstimate(e.target.value)} className="form-input text-sm" />
      </div>
      <div>
        <label className="block text-xs font-bold text-[#344054] mb-1">Ref ID{required && ' *'}</label>
        <input required={required} value={refId} onChange={(e) => setRefId(e.target.value)} placeholder={REF_ID_TEMPLATE} maxLength={120} className={`form-input text-sm font-mono ${refIsTemplate ? 'border-[#FDB022]' : ''}`} />
        <p className={`text-[11px] mt-1 ${refIsTemplate ? 'text-[#B54708] font-semibold' : 'text-[#667085]'}`}>
          {refIsTemplate ? 'This is the example format — edit it to this proposal’s real reference.' : `Format e.g. ${REF_ID_TEMPLATE}`}
        </p>
      </div>
    </div>
  );
};

// Reason (required) + note for a move to Lost or Dead.
const CloseReasonFields = ({ reason, setReason, note, setNote }) => (
  <div className="rounded-lg border border-[#FECDCA] bg-[#FFFBFA] p-3 space-y-2">
    <label className="block text-xs font-bold text-[#344054]">Reason *</label>
    <select value={reason} onChange={(e) => setReason(e.target.value)} required className="form-input text-sm">
      <option value="">Choose a reason…</option>
      {Object.entries(LOST_REASONS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
    </select>
    <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000}
      placeholder={reason === 'other' ? 'Explain the reason *' : 'Add a note (optional)'} className="form-input text-sm" />
  </div>
);

export const LeadStatusModal = ({ lead, isAdmin = false, onClose, onDone, showToast }) => {
  const pending = isWonPending(lead);
  const options = pending ? [] : nextStatuses(lead.status, isAdmin);
  const [status, setStatus] = useState(options[0] || lead.status);
  const [valueEstimate, setValueEstimate] = useState(lead.value_estimate ?? '');
  const [refId, setRefId] = useState(lead.ref_id || REF_ID_TEMPLATE);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [wonConfirmed, setWonConfirmed] = useState(false);
  const [duplicateWon, setDuplicateWon] = useState(null); // DUPLICATE_WON warning (Admin)
  const [busy, setBusy] = useState(false);

  const needsProposal = PROPOSAL_STAGES.includes(status);
  const closing = ['lost', 'dead'].includes(status);
  const proposalProblem = needsProposal && (isBlank(valueEstimate) ? 'Enter the value estimate.'
    : isBlank(refId) ? 'Enter the Ref ID.'
    : isRefIdTemplate(refId) ? 'Replace the example Ref ID with the real reference.' : null);
  const closeProblem = closing && (!reason ? 'Choose a reason.' : reason === 'other' && !note.trim() ? 'Explain the reason in the note.' : null);
  const missingWon = status === 'won' ? missingWonFields(lead) : [];
  const unassignedWon = status === 'won' && !lead.assigned_to;
  const blocked = busy || status === lead.status || !!proposalProblem || !!closeProblem || missingWon.length > 0 || unassignedWon
    || (status === 'won' && !wonConfirmed);

  const send = async (confirmDuplicate = false) => {
    setBusy(true);
    try {
      const fields = needsProposal ? { value_estimate: valueEstimate === '' ? null : Number(valueEstimate), ref_id: refId }
        : closing ? { lost_reason: reason, lost_note: note.trim() || null } : {};
      const result = await updateLeadStatus(lead.id, status, { ...fields, ...(confirmDuplicate ? { confirm_duplicate: true } : {}) });
      if (result?.won_request_pending) {
        showToast('Won request sent — another lead exists for this customer, so an Admin will approve it. The timer is paused meanwhile.', 'info');
      } else if (result?.auto_closed) {
        showToast(`Marked Won — ${result.auto_closed} other lead${result.auto_closed === 1 ? '' : 's'} for this customer closed as Lost (duplicate).`, 'success');
      } else {
        showToast(`Status updated to ${STATUS_LABEL[status]}`, 'success');
      }
      onDone();
    } catch (err) {
      if (err.code === 'DUPLICATE_WON' && !confirmDuplicate) setDuplicateWon(err);
      else showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    if (!blocked) send();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md max-h-[90vh] rounded-xl bg-white shadow-xl border border-[#E4E7EC] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-[#E4E7EC] shrink-0">
          <h3 className="text-lg font-bold text-[#172033]">Change Status</h3>
          <button onClick={onClose} className="text-[#667085] hover:text-[#172033]"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4 overflow-y-auto">
          <div className="flex items-center justify-between gap-3 rounded-lg bg-[#F8FAFC] border border-[#E4E7EC] px-3 py-2">
            <div className="min-w-0">
              <div className="text-sm font-bold text-[#172033] truncate">{lead.company}</div>
              <span className={`mt-0.5 inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${STATUS_COLOR[lead.status]}`}>{STATUS_LABEL[lead.status]}</span>
            </div>
            <LeadTimerBattery lead={lead} />
          </div>

          {pending ? (
            <p className="text-sm text-[#5925DC] bg-[#F4F3FF] border border-[#D9D6FE] rounded-lg px-3 py-2 flex gap-2">
              <Hourglass className="w-4 h-4 shrink-0 mt-0.5" />
              {isAdmin
                ? 'A Won request is waiting for your decision — use “Review Won request” on this lead to approve or reject it.'
                : 'Your Won request is waiting for an Admin. The status can’t be changed until they decide; the timer is paused.'}
            </p>
          ) : options.length === 0 ? (
            <p className="text-sm text-[#667085]">This lead is {STATUS_LABEL[lead.status]} and can’t be moved further.</p>
          ) : (
            <div>
              <label className="block text-xs font-bold text-[#344054] mb-2">Move to</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {options.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => { setStatus(s); setWonConfirmed(false); }}
                    aria-pressed={status === s}
                    className={`px-3 py-2 rounded-lg border text-xs font-bold transition-all ${
                      status === s ? 'border-[#004898] ring-1 ring-[#004898]/30 ' + STATUS_COLOR[s] : 'border-[#E4E7EC] bg-white text-[#344054] hover:border-[#B3D1F2]'
                    }`}
                  >
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
              {!isAdmin && ['new', 'meeting'].includes(lead.status) && (
                <p className="text-[11px] text-[#667085] mt-2">A lead can be marked Won once it has reached Proposal.</p>
              )}
            </div>
          )}

          {!pending && needsProposal && (
            <div className="rounded-lg border border-[#D9D6FE] bg-[#FAFAFF] p-3">
              <p className="text-[11px] font-bold text-[#5925DC] uppercase tracking-wider mb-2">Required from Proposal onwards</p>
              <ProposalFields valueEstimate={valueEstimate} setValueEstimate={setValueEstimate} refId={refId} setRefId={setRefId} required />
            </div>
          )}
          {!pending && keepsStageClock(lead.status, status) && (
            <p className="text-[11px] text-[#667085]">The stage timer keeps running — moving between Follow-up and Hold doesn’t restart it.</p>
          )}

          {!pending && closing && <CloseReasonFields reason={reason} setReason={setReason} note={note} setNote={setNote} />}

          {unassignedWon && (
            <p className="text-xs text-[#B42318] bg-[#FEF3F2] border border-[#FECDCA] rounded-lg px-3 py-2">Assign this lead to a salesperson before marking it Won.</p>
          )}
          {missingWon.length > 0 && (
            <p className="text-xs text-[#B42318] bg-[#FEF3F2] border border-[#FECDCA] rounded-lg px-3 py-2 flex gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Fill in all lead details before marking it Won. Missing: {missingWon.join(', ')}.</span>
            </p>
          )}
          {proposalProblem && <p className="text-xs text-[#B54708]">{proposalProblem}</p>}
          {status === 'won' && missingWon.length === 0 && !unassignedWon && (
            <label className="flex items-start gap-2 rounded-lg border border-[#ABEFC6] bg-[#F6FEF9] px-3 py-2 text-xs text-[#344054] cursor-pointer">
              <input type="checkbox" checked={wonConfirmed} onChange={(e) => setWonConfirmed(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#027A48]" />
              <span>I confirm this deal is won. A Won lead is final — it can’t be moved, reassigned or archived afterwards{isAdmin ? '' : ', and if another lead exists for this customer an Admin approves it first'}.</span>
            </label>
          )}
          {status === 'lost' && <p className="text-xs text-[#667085]">A Lost lead is closed — only an Admin can reopen it.</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold rounded-lg border border-[#E4E7EC] bg-white text-[#344054] hover:bg-[#F8FAFC]">Cancel</button>
            {options.length > 0 && (
              <button type="submit" disabled={blocked} className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#004898] text-white hover:bg-[#00346E] disabled:opacity-50">
                {busy ? 'Updating…' : `Move to ${STATUS_LABEL[status]}`}
              </button>
            )}
          </div>
        </form>
      </div>
      {duplicateWon && (
        <DuplicateWarningModal
          title="Customer already Won"
          message={duplicateWon.message}
          note="Continue only if this is separate (repeat) business — both leads will count as Won."
          continueLabel="Mark Won anyway"
          duplicates={duplicateWon.duplicates || []}
          saving={busy}
          onEdit={() => setDuplicateWon(null)}
          editLabel="Cancel"
          onContinue={() => { setDuplicateWon(null); send(true); }}
        />
      )}
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

// Shown when a create/edit returns DUPLICATE_LEAD (same Company + Phone, or
// the same phone under another company name) — and, re-titled, for an
// Admin Won on an already-Won customer. Informational: the user can go back
// or continue. When one lead for a customer is Won, the others still open
// are closed as Lost automatically.
export const DuplicateWarningModal = ({
  duplicates, saving, onEdit, onContinue,
  title = 'Lead already exists',
  message = '⚠️ A lead for this customer already exists and may be being worked on by another salesperson.',
  note = 'You can still create it — each lead is worked independently. When one of them is Won, the others are closed as Lost.',
  continueLabel = 'Continue Anyway',
  editLabel = 'Edit Details'
}) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
    <div className="w-full max-w-md rounded-xl bg-white shadow-xl border border-[#E4E7EC]">
      <div className="flex items-start gap-3 p-5">
        <div className="shrink-0 w-10 h-10 rounded-full bg-[#FFFAEB] flex items-center justify-center"><Copy className="w-5 h-5 text-[#B54708]" /></div>
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-[#172033]">{title}</h3>
          <p className="mt-1 text-sm text-[#667085]">{message}</p>
          <div className="mt-3 rounded-lg border border-[#E4E7EC] divide-y divide-[#F2F4F7] max-h-48 overflow-y-auto">
            {duplicates.map((d) => (
              <div key={d.id} className="px-3 py-2 flex items-center justify-between gap-2 text-xs">
                <span className="min-w-0">
                  <span className="block font-bold text-[#172033] truncate">{d.company}</span>
                  <span className="block text-[#667085]">{d.phone} · {d.owner}{d.match === 'phone' ? ' · same phone only' : ''}</span>
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold shrink-0 ${STATUS_COLOR[d.status]}`}>{STATUS_LABEL[d.status]}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-[#667085]">{note}</p>
        </div>
      </div>
      <div className="flex justify-end gap-2 px-5 py-4 border-t border-[#E4E7EC] bg-[#F9FAFB] rounded-b-xl">
        <button type="button" onClick={onEdit} className="px-4 py-2 text-sm font-semibold rounded-lg border border-[#E4E7EC] bg-white text-[#344054] hover:bg-[#F8FAFC]">{editLabel}</button>
        <button type="button" onClick={onContinue} disabled={saving} className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#B54708] text-white hover:bg-[#93370D] disabled:opacity-60">
          {saving ? 'Saving…' : continueLabel}
        </button>
      </div>
    </div>
  </div>
);

// Log a follow-up note and/or set the next follow-up date (drives "Due
// today"). The date starts at the lead's current one; clearing it removes
// the reminder. Dates can only be set on active leads.
export const FollowUpForm = ({ lead, onSaved, showToast, disabled = false }) => {
  const isActive = !CLOSED_STATUSES.includes(lead.status);
  const current = lead.next_follow_up_date || '';
  const [note, setNote] = useState('');
  const [date, setDate] = useState(current);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setDate(lead.next_follow_up_date || ''); }, [lead.id, lead.next_follow_up_date]);

  const dateChanged = isActive && date !== current;
  const canSave = !disabled && !busy && (note.trim() || dateChanged);

  const submit = async (e) => {
    e.preventDefault();
    if (!canSave) return;
    setBusy(true);
    try {
      await addFollowUp(lead.id, note.trim(), dateChanged ? (date || null) : undefined);
      setNote('');
      showToast(dateChanged ? (date ? 'Follow-up saved' : 'Follow-up date cleared') : 'Note added', 'success');
      onSaved?.();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-2">
      <h4 className="text-xs font-bold text-[#667085] uppercase tracking-wider">Follow-up</h4>
      <input value={note} onChange={(e) => setNote(e.target.value)} disabled={disabled} placeholder="What happened? (optional if only changing the date)" className="form-input text-sm" />
      <div className="flex flex-wrap items-center gap-2">
        {isActive && (
          <label className="text-xs font-bold text-[#344054] flex items-center gap-2">
            Next follow-up
            <input type="date" value={date} min={todayKey()} onChange={(e) => setDate(e.target.value)} disabled={disabled} className="form-input text-sm w-auto" />
          </label>
        )}
        {isActive && date && <button type="button" onClick={() => setDate('')} disabled={disabled} className="text-[11px] font-semibold text-[#667085] hover:text-[#B42318]">Clear date</button>}
        <button type="submit" disabled={!canSave} className="ml-auto px-4 py-2 text-sm font-semibold rounded-lg bg-[#004898] text-white hover:bg-[#00346E] disabled:opacity-50 whitespace-nowrap">
          {busy ? 'Saving…' : 'Save Follow-up'}
        </button>
      </div>
    </form>
  );
};

const EVENT_LABEL = {
  won_requested: 'Won requested — awaiting Admin approval',
  won_request_rejected: 'Won request rejected',
  remarks_updated: 'Remarks updated',
  follow_up: 'Follow-up',
  status_changed: 'Status changed',
  deactivation_reassigned: 'Returned to Admin (salesperson deactivated)'
};
const FIELD_LABEL = {
  company: 'Company', person_to_contact: 'Contact', email: 'Email', phone: 'Phone',
  value_estimate: 'Value', ref_id: 'Ref ID', demand: 'Demand'
};
const showValue = (key, v) => (v == null || v === '' ? '—' : key === 'value_estimate' ? money(v) : String(v));

// Lead history, shared by the Admin and Sales lead popups. `salesName`
// (Admin only) turns salesperson ids into names; `showActor` adds who did it.
export const LeadHistoryList = ({ history, salesName, showActor = false }) => (
  <div className="space-y-2 max-h-56 overflow-y-auto">
    {history.map((h) => {
      const d = h.details || {};
      return (
        <div key={h.id} className="text-xs border-l-2 border-[#E4E7EC] pl-3 py-1">
          <div className="font-semibold text-[#172033]">
            {EVENT_LABEL[h.event_type] || h.event_type.replace(/_/g, ' ')}
            {showActor && h.actor_name ? <span className="text-[#667085] font-normal"> — {h.actor_name}</span> : null}
          </div>
          {h.event_type === 'status_changed' && d.from && d.to && (
            <div className="text-[#667085]">
              {STATUS_LABEL[d.from] || d.from} → {STATUS_LABEL[d.to] || d.to}
              {d.reason === 'duplicate_won' && ' (another lead for this customer was Won)'}
              {d.approved_request && ' (Won request approved)'}
              {d.clock_kept && ' · timer kept'}
            </div>
          )}
          {d.lost_reason && <div className="text-[#667085]">Reason: {LOST_REASONS[d.lost_reason] || d.lost_reason}{d.lost_note ? ` — ${d.lost_note}` : ''}</div>}
          {d.reason && h.event_type !== 'status_changed' && <div className="text-[#667085]">Reason: {d.reason}</div>}
          {d.note && <div className="text-[#667085]">{d.note}</div>}
          {h.event_type === 'follow_up' && 'next_action_date' in d && (
            <div className="text-[#667085]">{d.next_action_date ? `Next follow-up: ${d.next_action_date}` : 'Follow-up date cleared'}</div>
          )}
          {h.event_type === 'edited' && d.changes && Object.entries(d.changes).map(([key, change]) => (
            <div key={key} className="text-[#667085]">{FIELD_LABEL[key] || key}: {showValue(key, change.from)} → {showValue(key, change.to)}</div>
          ))}
          {h.event_type === 'edited' && !d.changes && Array.isArray(d.fields) && <div className="text-[#667085]">{d.fields.map((f) => FIELD_LABEL[f] || f).join(', ')}</div>}
          {h.event_type === 'remarks_updated' && <div className="text-[#667085] whitespace-pre-wrap">{d.remarks || 'Remarks cleared'}</div>}
          {d.duplicate_confirmed && <div className="text-[#B54708]">Created as a confirmed duplicate</div>}
          {salesName && d.copied_from && <div className="text-[#667085]">New lead given from an expired lead</div>}
          {salesName && h.event_type === 'expiry_reassigned' && <div className="text-[#667085]">New lead given to {salesName(d.to)}</div>}
          {salesName && h.event_type === 'assigned' && <div className="text-[#667085]">{d.from ? `${salesName(d.from)} → ` : ''}{salesName(d.to)}</div>}
          <div className="text-[#98A2B3]">{new Date(h.created_at).toLocaleString()}</div>
        </div>
      );
    })}
  </div>
);
