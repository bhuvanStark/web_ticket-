// TaskPro Sales Module V1 (TaskPro_Sales_RBAC_plan.md §3-9) — Admin's Leads
// management: list/filter/search (paged on the server), create/edit, single
// + bulk assignment (no common pool — unassigned leads wait here for Admin),
// status/Dead, Won-request approvals, the archive, history, and the Excel
// import wizard (Upload -> Validate -> Preview ->
// Confirm -> Transactional Import, §8). Self-contained (own fetch on mount),
// same pattern SalesRosterTab already uses — Leads never need to live in
// AppContext's global state, nothing else in the app reads them.
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Search, Plus, Pencil, Trash2, UserPlus, History as HistoryIcon, X, Check, MapPin,
  Upload, AlertTriangle, CheckCircle2, XCircle, FileSpreadsheet, UserX, Briefcase, Trophy, ArrowRightCircle,
  AlarmClock, Copy, TimerReset, Hourglass, Archive
} from 'lucide-react';
import { TableSkeleton } from '../common/SkeletonLoader';
import { fetchSalesInApi } from '../../services/salesApiService';
import {
  fetchLeads, fetchLead, createLead, updateLead, assignLeadsBulk, resolveExpiredLead, resolveWonRequest, deleteLead, deleteLeadsBulk,
  fetchLeadHistory,
  validateImport, confirmImport, subscribeToLeadEvents, fetchLeadsSummary, fetchLeadsAnalytics
} from '../../services/leadsApiService';
import { LeadStatCard, LeadStatGrid } from './LeadStatCards';
import { LeadStatusModal, LeadRemarks, ProposalFields, FollowUpForm, LeadHistoryList } from './LeadQuickActions';
import { useDuplicateAwareSave } from './useDuplicateAwareSave';
import { LeadTimerBattery } from './LeadTimerBattery';
import { LeadPagination } from './LeadPagination';
import { SalesModal, ModalHeader, ModalBody, ModalFooter, btnPrimary, btnSecondary, btnDanger } from './SalesModal';
import {
  ALL_STATUSES, ACTIVE_STATUSES, CLOSED_STATUSES, PROPOSAL_STAGES, STATUS_LABEL, STATUS_COLOR, LEADS_PAGE_SIZE,
  REF_ID_TEMPLATE, isRefIdTemplate, money, isAssignable, assignBlockReason, followUpInfo, STAGE_DAYS,
  pageCount, isWonPending, lostReasonLabel
} from './leadPipeline';

// ExcelJS cell → the text the sheet shows. Rich text, hyperlinks (Excel
// links typed emails automatically) and formulas arrive as objects, and
// String() used to store them as "[object Object]". The server applies the
// same rule (leadService.cellText) as a backstop.
const cellText = (value) => {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map((part) => part?.text ?? '').join('').trim();
    if ('text' in value) return cellText(value.text);
    if ('result' in value) return cellText(value.result);
    return '';
  }
  return String(value).trim();
};

const LeadFormModal = ({ lead, onClose, onSaved, showToast }) => {
  const isEdit = !!lead;
  const isClosed = isEdit && CLOSED_STATUSES.includes(lead.status);
  const inProposal = isEdit && PROPOSAL_STAGES.includes(lead.status);
  const [company, setCompany] = useState(lead?.company || '');
  const [personToContact, setPersonToContact] = useState(lead?.person_to_contact || '');
  const [email, setEmail] = useState(lead?.email || '');
  const [phone, setPhone] = useState(lead?.phone || '');
  const [valueEstimate, setValueEstimate] = useState(lead?.value_estimate ?? '');
  const [refId, setRefId] = useState(lead?.ref_id || (inProposal ? REF_ID_TEMPLATE : ''));
  const [demand, setDemand] = useState(lead?.demand || '');
  const [remarks, setRemarks] = useState(lead?.remarks || '');
  // A same Company + Phone match returns a warning; Admin can edit or continue.
  const { run, saving, warning } = useDuplicateAwareSave(
    (payload) => (isEdit ? updateLead(lead.id, payload) : createLead(payload)),
    { onSaved: () => { showToast(isEdit ? 'Lead updated' : 'Lead created — select it in the list to assign a salesperson', 'success'); onSaved(); }, showToast }
  );

  const submit = (e) => {
    e.preventDefault();
    if (inProposal && isRefIdTemplate(refId)) {
      showToast('Replace the example Ref ID with the real reference.', 'error');
      return;
    }
    run({
      company, person_to_contact: personToContact || null, email: email || null,
      phone, value_estimate: valueEstimate === '' ? null : Number(valueEstimate),
      remarks: remarks || null,
      // Ref ID and Demand are only editable while the lead is active.
      ...(isClosed ? {} : { demand: demand || null }),
      ...(inProposal ? { ref_id: refId } : {})
    });
  };

  return (
    <SalesModal onClose={onClose} onSubmit={submit} size="lg">
      <ModalHeader title={isEdit ? 'Edit Lead' : 'Add Lead'} subtitle={isEdit ? lead.company : 'Starts Unassigned — assign a salesperson from the list.'} onClose={onClose} />
      <ModalBody className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-[#344054] mb-1">Company *</label>
            <input required value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Acme Pvt Ltd" className="form-input text-sm" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#344054] mb-1">Phone *</label>
              <input required type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" className="form-input text-sm" />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#344054] mb-1">Person to Contact</label>
              <input value={personToContact} onChange={(e) => setPersonToContact(e.target.value)} className="form-input text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-[#344054] mb-1">Email</label>
            <input type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" className="form-input text-sm" />
          </div>
          {inProposal ? (
            <ProposalFields valueEstimate={valueEstimate} setValueEstimate={setValueEstimate} refId={refId} setRefId={setRefId} required />
          ) : (
            <div>
              <label className="block text-xs font-bold text-[#344054] mb-1">Value Estimate</label>
              <input type="number" inputMode="decimal" min="0" step="any" value={valueEstimate} onChange={(e) => setValueEstimate(e.target.value)} className="form-input text-sm" />
            </div>
          )}
          {isClosed && lead.ref_id && (
            <div>
              <label className="block text-xs font-bold text-[#344054] mb-1">Ref ID</label>
              <div className="text-sm font-mono text-[#475467]">{lead.ref_id}</div>
            </div>
          )}
          <div>
            <label className="block text-xs font-bold text-[#344054] mb-1">Demand</label>
            <textarea value={demand} onChange={(e) => setDemand(e.target.value)} disabled={isClosed} rows={3} maxLength={2000} className="form-input text-sm resize-none disabled:bg-[#F8FAFC]" />
            {isClosed && <p className="text-[11px] text-[#667085] mt-1">Locked — this lead is {STATUS_LABEL[lead.status]}.</p>}
          </div>
          <div>
            <label className="block text-xs font-bold text-[#344054] mb-1">Remarks</label>
            <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={3} maxLength={5000} className="form-input text-sm resize-none" />
          </div>
          {isEdit && lead.status === 'won' && (
            <p className="text-[11px] text-[#B54708] bg-[#FFFAEB] border border-[#FEDF89] rounded-lg px-3 py-2">This lead is Won — every change is recorded in its history with the old and new value, and the value must stay above ₹0.</p>
          )}
      </ModalBody>
      <ModalFooter>
        <button type="button" onClick={onClose} className={btnSecondary}>Cancel</button>
        <button type="submit" disabled={saving} className={btnPrimary}>
          {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Lead'}
        </button>
      </ModalFooter>
      {warning}
    </SalesModal>
  );
};

const initials = (name) => (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

// Searchable sales-team list with each person's open-lead count — shared by
// Assign Salesperson and the Expired-lead review. `exclude` hides one person.
const SalesPicker = ({ roster, value, onChange, exclude }) => {
  const [search, setSearch] = useState('');
  const [activeLoad, setActiveLoad] = useState(null); // { salesId: open leads }

  // Optional: if the counts fail to load the list simply shows none.
  useEffect(() => {
    let cancelled = false;
    fetchLeadsAnalytics('all')
      .then((data) => {
        if (cancelled) return;
        setActiveLoad(Object.fromEntries((data?.leaderboard || []).map((e) => [
          e.salesId, Object.values(e.pipeline || {}).reduce((n, st) => n + st.count, 0)
        ])));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const q = search.trim().toLowerCase();
  const people = roster
    .filter((s) => s.id !== exclude)
    .filter((s) => !q || [s.full_name, s.email, s.location].some((v) => (v || '').toLowerCase().includes(q)));

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="w-4 h-4 text-[#98A2B3] absolute left-3 top-1/2 -translate-y-1/2" />
        <input autoFocus={window.matchMedia?.('(min-width: 768px)').matches} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search sales team by name, email or location…" className="w-full pl-9 pr-3 py-2 border border-[#E4E7EC] rounded-lg text-sm outline-none focus:border-[#004898]" />
      </div>
      {people.length === 0 && (
        <p className="text-xs text-[#98A2B3] text-center py-4">{search ? `No salesperson matches “${search}”.` : 'No other active salespeople.'}</p>
      )}
      {people.map((s) => {
        const selected = s.id === value;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onChange(s.id)}
            className={`w-full p-3 rounded-xl border transition-all flex items-center gap-3 text-left ${selected ? 'border-[#004898] bg-[#EFF5FC] ring-1 ring-[#004898]/20' : 'border-[#E4E7EC] bg-white hover:border-[#B3D1F2] hover:shadow-sm'}`}
          >
            <span className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-extrabold shrink-0 ${selected ? 'bg-[#004898] text-white' : 'bg-[#EFF5FC] text-[#004898]'}`}>
              {selected ? <Check className="w-4 h-4" /> : initials(s.full_name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold text-sm text-[#172033] truncate">{s.full_name}</span>
              <span className="block text-xs text-[#667085] truncate">
                {s.location ? <><MapPin className="inline w-3 h-3 -mt-0.5" /> {s.location}</> : s.email}
              </span>
            </span>
            {activeLoad && <span className="text-[11px] font-semibold text-[#667085] shrink-0">{activeLoad[s.id] || 0} open</span>}
          </button>
        );
      })}
    </div>
  );
};

// Assign one or many leads to a salesperson — searchable team list (same
// pattern as Assign Technician), pick a person, confirm.
const AssignSalesModal = ({ leads, roster, onClose, onSaved, showToast }) => {
  const single = leads.length === 1 ? leads[0] : null;
  const [salesId, setSalesId] = useState(single?.assigned_to || '');
  const [saving, setSaving] = useState(false);
  const chosen = roster.find((s) => s.id === salesId);

  const submit = async () => {
    if (!salesId || saving) return;
    setSaving(true);
    try {
      const result = await assignLeadsBulk(leads.map((l) => l.id), salesId);
      const msg = result.skipped
        ? `${result.assigned} assigned to ${chosen?.full_name}; ${result.skipped} skipped (only New or Unassigned leads can be assigned)`
        : `${result.assigned} lead${result.assigned === 1 ? '' : 's'} assigned to ${chosen?.full_name}`;
      showToast(msg, result.skipped ? 'info' : 'success');
      onSaved();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SalesModal onClose={onClose} size="lg" tall>
      <ModalHeader title="Assign Salesperson" subtitle={single ? single.company : `${leads.length} leads selected`} onClose={onClose}>
        {!single && (
          <div className="mt-2 flex flex-wrap gap-1">
            {leads.slice(0, 6).map((l) => <span key={l.id} className="rounded-full bg-[#F8FAFC] border border-[#E4E7EC] px-2 py-0.5 text-[10px] font-semibold text-[#344054]">{l.company}</span>)}
            {leads.length > 6 && <span className="text-[10px] font-semibold text-[#667085] px-1">+{leads.length - 6} more</span>}
          </div>
        )}
      </ModalHeader>
      <ModalBody>
        <SalesPicker roster={roster} value={salesId} onChange={setSalesId} />
      </ModalBody>
      <ModalFooter>
        <button type="button" onClick={onClose} className={btnSecondary}>Cancel</button>
        <button type="button" onClick={submit} disabled={!salesId || saving} className={btnPrimary}>
          {saving ? 'Assigning…' : chosen ? `Assign ${single ? '' : `${leads.length} `}to ${chosen.full_name.split(' ')[0]}` : 'Choose a salesperson'}
        </button>
      </ModalFooter>
    </SalesModal>
  );
};

// Admin decision on a lead whose stage timer expired. The lead stays with its
// salesperson whatever Admin picks:
//   Give back  — same salesperson, back to New with a fresh timer.
//   Give to …  — another salesperson gets a new lead for this customer; the
//                current one keeps theirs (first Won freezes the other).
//   Ignore     — leave it; it returns here only if a later stage expires.
const ExpiredLeadModal = ({ lead, roster, salesName, onClose, onDone, showToast }) => {
  const owner = salesName(lead.assigned_to);
  const [choice, setChoice] = useState('restart');
  const [salesId, setSalesId] = useState('');
  const [saving, setSaving] = useState(false);
  const target = roster.find((s) => s.id === salesId);

  const options = [
    { id: 'restart', title: `Give back to ${owner}`, hint: `Restarts at New with a fresh ${STAGE_DAYS.new}-day timer. Value, Ref ID and history are kept.` },
    { id: 'reassign', title: 'Give to another salesperson', hint: `They get a new lead for this customer with a fresh timer. ${owner} keeps theirs — the first one Won freezes the other.` },
    { id: 'ignore', title: 'Ignore', hint: `Leave it with ${owner}, still overdue. It comes back here only if a later stage also expires.` }
  ];

  const submit = async () => {
    if (saving || (choice === 'reassign' && !salesId)) return;
    setSaving(true);
    try {
      await resolveExpiredLead(lead.id, choice, choice === 'reassign' ? salesId : undefined);
      showToast(
        choice === 'restart' ? `Given back to ${owner} with a fresh timer`
          : choice === 'reassign' ? `New lead given to ${target?.full_name}`
          : 'Expired lead ignored',
        'success'
      );
      onDone();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SalesModal onClose={onClose} size="lg">
      <ModalHeader title="Review Expired Lead" subtitle={<span className="font-bold text-[#172033]">{lead.company}</span>} onClose={onClose}>
        <div className="mt-1 flex items-center gap-3 flex-wrap text-xs text-[#667085]">
          <span>{owner}</span>
          <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${STATUS_COLOR[lead.status]}`}>{STATUS_LABEL[lead.status]}</span>
          <LeadTimerBattery lead={lead} />
        </div>
      </ModalHeader>
      <ModalBody className="space-y-2">
          {options.map((o) => (
            <label key={o.id} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer ${choice === o.id ? 'border-[#004898] bg-[#EFF5FC]' : 'border-[#E4E7EC] hover:border-[#B3D1F2]'}`}>
              <input type="radio" name="expiry-choice" checked={choice === o.id} onChange={() => setChoice(o.id)} className="mt-1 accent-[#004898]" />
              <span>
                <span className="block text-sm font-bold text-[#172033]">{o.title}</span>
                <span className="block text-xs text-[#667085]">{o.hint}</span>
              </span>
            </label>
          ))}
          {choice === 'reassign' && (
            <div className="pt-2">
              <SalesPicker roster={roster} value={salesId} onChange={setSalesId} exclude={lead.assigned_to} />
            </div>
          )}
      </ModalBody>
      <ModalFooter>
        <button type="button" onClick={onClose} className={btnSecondary}>Cancel</button>
        <button type="button" onClick={submit} disabled={saving || (choice === 'reassign' && !salesId)} className={btnPrimary}>
          {saving ? 'Saving…'
            : choice === 'restart' ? `Give back to ${owner.split(' ')[0]}`
            : choice === 'reassign' ? (target ? `Give to ${target.full_name.split(' ')[0]}` : 'Choose a salesperson')
            : 'Ignore'}
        </button>
      </ModalFooter>
    </SalesModal>
  );
};

// Admin decision on a Sales Won request (the lead has duplicates). Approve:
// the lead becomes Won for its salesperson and the other open leads for the
// customer close as Lost. Reject: needs a reason; the salesperson gets the
// lead back with the timer time it had left.
const WonRequestModal = ({ lead, salesName, onClose, onDone, showToast }) => {
  const [choice, setChoice] = useState('approve');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const owner = salesName(lead.assigned_to);

  const submit = async () => {
    if (saving || (choice === 'reject' && !reason.trim())) return;
    setSaving(true);
    try {
      const result = await resolveWonRequest(lead.id, choice, choice === 'reject' ? reason.trim() : undefined);
      showToast(choice === 'approve'
        ? `Marked Won for ${owner}${result?.autoClosed ? ` — ${result.autoClosed} other lead${result.autoClosed === 1 ? '' : 's'} closed as Lost` : ''}`
        : 'Won request rejected', 'success');
      onDone();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SalesModal onClose={onClose} size="lg">
      <ModalHeader title="Review Won Request" subtitle={<span className="font-bold text-[#172033]">{lead.company}</span>} onClose={onClose}>
        <p className="text-xs text-[#667085] mt-0.5">
          {owner} · {STATUS_LABEL[lead.status]} · {money(lead.value_estimate)} · requested {new Date(lead.won_requested_at).toLocaleString()}
        </p>
      </ModalHeader>
      <ModalBody className="space-y-3">
          <p className="text-xs text-[#344054] bg-[#FFFAEB] border border-[#FEDF89] rounded-lg px-3 py-2">
            {lead.duplicate_count > 0
              ? `${lead.duplicate_count} other lead${lead.duplicate_count === 1 ? '' : 's'} exist for this customer (same company and phone).`
              : 'Other leads exist for this customer.'} Check the deal is genuine before approving.
          </p>
          {[
            { id: 'approve', title: 'Approve — mark Won', hint: `Credited to ${owner}. Other open leads for this customer are closed as Lost (duplicate).` },
            { id: 'reject', title: 'Reject', hint: `${owner} keeps the lead in ${STATUS_LABEL[lead.status]}; the paused timer resumes.` }
          ].map((o) => (
            <label key={o.id} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer ${choice === o.id ? 'border-[#004898] bg-[#EFF5FC]' : 'border-[#E4E7EC] hover:border-[#B3D1F2]'}`}>
              <input type="radio" name="won-request-choice" checked={choice === o.id} onChange={() => setChoice(o.id)} className="mt-1 accent-[#004898]" />
              <span>
                <span className="block text-sm font-bold text-[#172033]">{o.title}</span>
                <span className="block text-xs text-[#667085]">{o.hint}</span>
              </span>
            </label>
          ))}
          {choice === 'reject' && (
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={1000} placeholder="Why is it rejected? (shown in the lead's history) *" className="form-input text-sm resize-none" />
          )}
      </ModalBody>
      <ModalFooter>
        <button type="button" onClick={onClose} className={btnSecondary}>Cancel</button>
        <button type="button" onClick={submit} disabled={saving || (choice === 'reject' && !reason.trim())} className={`px-4 py-2.5 sm:py-2 text-sm font-semibold rounded-lg text-white disabled:opacity-50 transition-colors ${choice === 'approve' ? 'bg-[#027A48] hover:bg-[#05603A]' : 'bg-[#D92D20] hover:bg-[#B42318]'}`}>
          {saving ? 'Saving…' : choice === 'approve' ? 'Approve Won' : 'Reject Request'}
        </button>
      </ModalFooter>
    </SalesModal>
  );
};

const DetailModal = ({ leadId, roster, onClose, onChanged, onChangeStatus, showToast }) => {
  const [lead, setLead] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  // `loading` only covers the first fetch; a refresh after a save keeps the
  // current content on screen instead of flashing "Loading…".
  const load = useCallback(async () => {
    try {
      const [found, events] = await Promise.all([fetchLead(leadId), fetchLeadHistory(leadId)]);
      setLead(found || null);
      setHistory(events);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [leadId, showToast]);

  useEffect(() => { load(); }, [load]);

  const salesName = (id) => roster.find((s) => s.id === id)?.full_name || '—';

  return (
    <SalesModal onClose={onClose} size="2xl" closeOnBackdrop tall>
      <ModalHeader title={lead?.company || 'Lead'} onClose={onClose}>
        {lead && (
          <div className="mt-1.5 flex items-center gap-3 flex-wrap">
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${STATUS_COLOR[lead.status]}`}>{STATUS_LABEL[lead.status]}</span>
            {lead.assigned_to && <LeadTimerBattery lead={lead} />}
            {followUpInfo(lead) && <span className={`text-[11px] font-bold ${followUpInfo(lead).due ? 'text-[#B54708]' : 'text-[#667085]'}`}>{followUpInfo(lead).label}</span>}
          </div>
        )}
      </ModalHeader>
        {loading || !lead ? (
          <ModalBody className="space-y-3">
            {[0, 1, 2].map((i) => <div key={i} className="h-12 rounded-lg bg-[#F2F4F7] animate-pulse" />)}
          </ModalBody>
        ) : (
          <ModalBody className="space-y-5">
            {lead.archived_at && (
              <p className="text-xs text-[#344054] bg-[#F2F4F7] border border-[#E4E7EC] rounded-lg px-3 py-2 flex gap-2">
                <Archive className="w-4 h-4 shrink-0" /> Archived {new Date(lead.archived_at).toLocaleDateString()} — read-only.
              </p>
            )}
            {isWonPending(lead) && (
              <p className="text-xs text-[#5925DC] bg-[#F4F3FF] border border-[#D9D6FE] rounded-lg px-3 py-2 flex gap-2">
                <Hourglass className="w-4 h-4 shrink-0" /> {salesName(lead.assigned_to)} asked to mark this lead Won. Review it from the lead list (Won Requests).
              </p>
            )}
            {lead.duplicate_count > 0 && (
              <p className="text-xs text-[#344054] bg-[#F2F4F7] border border-[#E4E7EC] rounded-lg px-3 py-2 flex gap-2">
                <Copy className="w-4 h-4 shrink-0" />
                {`${lead.duplicate_count} other lead${lead.duplicate_count === 1 ? ' has' : 's have'} the same company and phone.`}
              </p>
            )}
            {lostReasonLabel(lead) && (
              <p className="text-xs text-[#344054] bg-[#F8FAFC] border border-[#E4E7EC] rounded-lg px-3 py-2">
                <strong>{STATUS_LABEL[lead.status]}:</strong> {lostReasonLabel(lead)}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3 text-sm rounded-xl bg-[#F8FAFC] border border-[#E4E7EC] p-3">
              <div><span className="text-[#667085] text-xs">Phone</span><div className="font-semibold text-[#172033]"><a href={`tel:${lead.phone}`} className="hover:text-[#004898]">{lead.phone}</a></div></div>
              <div><span className="text-[#667085] text-xs">Contact</span><div className="font-semibold text-[#172033]">{lead.person_to_contact || '—'}</div></div>
              <div><span className="text-[#667085] text-xs">Email</span><div className="font-semibold text-[#172033] break-all">{lead.email || '—'}</div></div>
              <div><span className="text-[#667085] text-xs">Value Estimate</span><div className="font-semibold text-[#172033]">{money(lead.value_estimate)}</div></div>
              <div><span className="text-[#667085] text-xs">Assigned To</span><div className="font-semibold text-[#172033]">{lead.assigned_to ? salesName(lead.assigned_to) : 'Unassigned'}</div></div>
              <div><span className="text-[#667085] text-xs">Ref ID</span><div className="font-semibold text-[#172033] font-mono text-xs break-all">{lead.ref_id || '—'}</div></div>
              <div className="col-span-2"><span className="text-[#667085] text-xs">Demand</span><div className="font-semibold text-[#172033] whitespace-pre-wrap">{lead.demand || '—'}</div></div>
            </div>

            {lead.status !== 'won' && !lead.archived_at && !isWonPending(lead) && (
              <button onClick={() => onChangeStatus(lead)} className="w-full px-4 py-2 text-sm font-semibold rounded-lg bg-[#004898] text-white hover:bg-[#00346E] inline-flex items-center justify-center gap-2">
                <ArrowRightCircle className="w-4 h-4" /> Change Status
              </button>
            )}

            {!lead.archived_at && <FollowUpForm lead={lead} onSaved={() => { load(); onChanged(); }} showToast={showToast} />}

            <LeadRemarks lead={lead} readOnly={!!lead.archived_at} onSaved={() => { load(); onChanged(); }} showToast={showToast} />

            <div>
              <h4 className="text-xs font-bold text-[#667085] uppercase tracking-wider mb-2">History</h4>
              <LeadHistoryList history={history} salesName={salesName} showActor />
            </div>
          </ModalBody>
        )}
    </SalesModal>
  );
};

// Upload -> Validate -> Preview -> Confirm -> Transactional Import (§8).
const ImportModal = ({ onClose, onImported, showToast }) => {
  const [includeDuplicates, setIncludeDuplicates] = useState(false);
  const [step, setStep] = useState('upload'); // upload | preview | done
  const [rows, setRows] = useState([]);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const fileInputRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const workbook = new ExcelJS.Workbook();
      const buffer = await file.arrayBuffer();
      await workbook.xlsx.load(buffer);
      const sheet = workbook.worksheets[0];
      if (!sheet) throw new Error('No sheet found in this file');

      // First row is the header; map by header name (case-insensitive),
      // not by fixed column position — more forgiving of column reordering.
      const headerRow = sheet.getRow(1).values; // 1-indexed, [0] is empty
      const colIndex = {};
      headerRow.forEach((h, i) => {
        const key = String(h || '').trim().toLowerCase().replace(/\s+/g, '_');
        if (key) colIndex[key] = i;
      });
      const find = (...names) => names.map((n) => colIndex[n]).find((i) => i != null);
      const companyCol = find('company');
      const phoneCol = find('phone');
      const contactCol = find('person_to_contact', 'contact', 'person');
      const emailCol = find('email');
      const valueCol = find('value_estimate', 'value', 'estimate');
      const demandCol = find('demand');

      const parsedRows = [];
      const text = (row, col) => (col ? cellText(row.getCell(col).value) : '');
      for (let r = 2; r <= sheet.rowCount; r += 1) {
        const row = sheet.getRow(r);
        if (row.values.length <= 1) continue; // blank row
        const valueCell = valueCol ? row.getCell(valueCol).value : '';
        parsedRows.push({
          company: text(row, companyCol),
          phone: text(row, phoneCol),
          person_to_contact: text(row, contactCol),
          email: text(row, emailCol),
          // Numbers stay numbers; formulas use their result; anything else as shown.
          value_estimate: typeof valueCell === 'number' ? valueCell
            : valueCell && typeof valueCell === 'object' && typeof valueCell.result === 'number' ? valueCell.result
            : cellText(valueCell),
          demand: text(row, demandCol)
        });
      }
      if (!parsedRows.length) throw new Error('No data rows found — check the file has a header row plus at least one lead.');

      setRows(parsedRows);
      const result = await validateImport(parsedRows);
      setPreview(result);
      setStep('preview');
    } catch (err) {
      showToast(err.message || 'Could not read this file', 'error');
    } finally {
      setBusy(false);
    }
  };

  const doConfirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const outcome = await confirmImport(rows, includeDuplicates);
      setResult(outcome);
      setStep('done');
      onImported();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SalesModal onClose={onClose} size="2xl">
      <ModalHeader title="Import Leads from Excel" onClose={onClose} />

        {step === 'upload' && (
          <ModalBody className="text-center space-y-4 py-8">
            <FileSpreadsheet className="w-12 h-12 text-[#B3D1F2] mx-auto" />
            <p className="text-sm text-[#667085]">
              Upload an .xlsx file with columns <strong>Company</strong> and <strong>Phone</strong> (required), plus optional
              Person to Contact, Email, Value Estimate and Demand. Imported leads start Unassigned — select them in the list and assign a salesperson.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              onChange={(e) => handleFile(e.target.files?.[0])}
              disabled={busy}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#004898] text-white text-sm font-semibold hover:bg-[#00346E] disabled:opacity-60"
            >
              <Upload className="w-4 h-4" /> {busy ? 'Reading file…' : 'Choose File'}
            </button>
          </ModalBody>
        )}

        {step === 'preview' && preview && (
          <>
            <div className="px-4 sm:px-5 py-3 flex flex-wrap gap-x-4 gap-y-1 text-sm border-b border-[#E4E7EC] shrink-0">
              <span className="text-[#027A48] font-semibold flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> {preview.valid.length} ready to import</span>
              <span className="text-[#B42318] font-semibold flex items-center gap-1"><XCircle className="w-4 h-4" /> {preview.failed.length} failed</span>
              <span className="text-[#B54708] font-semibold flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> {preview.duplicates.length} possible duplicate</span>
            </div>
            <ModalBody>
              <table className="w-full text-xs text-left border-collapse">
                <thead className="text-[#667085] uppercase font-bold text-[10px] border-b border-[#E4E7EC]">
                  <tr><th className="py-2 pr-2">Row</th><th className="py-2 pr-2">Company</th><th className="py-2 pr-2">Phone</th><th className="py-2">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-[#F2F4F7]">
                  {preview.rows.map((r) => (
                    <tr key={r.row}>
                      <td className="py-2 pr-2">{r.row}</td>
                      <td className="py-2 pr-2">{r.company || '—'}</td>
                      <td className="py-2 pr-2">{r.phone || '—'}</td>
                      <td className="py-2">
                        {r.errors.length ? (
                          <span className="text-[#B42318]">{r.errors.join(', ')}</span>
                        ) : r.duplicateOf ? (
                          <span className="text-[#B54708]">Possible duplicate — {r.duplicateOf.includes('same phone') ? r.duplicateOf : `same company & phone (${r.duplicateOf})`}</span>
                        ) : (
                          <span className="text-[#027A48]">Ready</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.duplicates.length > 0 && (
                <label className="mt-3 flex items-start gap-2 text-xs text-[#344054] cursor-pointer">
                  <input type="checkbox" checked={includeDuplicates} onChange={(e) => setIncludeDuplicates(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#B54708]" />
                  <span>Also import the {preview.duplicates.length} possible duplicate(s). Check them first — duplicates are allowed, but once one is Won the others still open are closed as Lost.</span>
                </label>
              )}
              {preview.failed.length > 0 && (
                <p className="text-xs text-[#667085] mt-3">Failed rows will be skipped — fix and re-upload them separately.</p>
              )}
            </ModalBody>
            <ModalFooter>
              <button type="button" onClick={() => setStep('upload')} className={btnSecondary}>Back</button>
              <button
                type="button"
                onClick={doConfirm}
                disabled={busy || !(preview.valid.length + (includeDuplicates ? preview.duplicates.length : 0))}
                className={btnPrimary}
              >
                {busy ? 'Importing…' : `Confirm Import (${preview.valid.length + (includeDuplicates ? preview.duplicates.length : 0)})`}
              </button>
            </ModalFooter>
          </>
        )}

        {step === 'done' && result && (
          <ModalBody className="text-center space-y-3 py-8">
            <CheckCircle2 className="w-12 h-12 text-[#12B76A] mx-auto" />
            <p className="text-sm font-semibold text-[#172033]">{result.imported} lead(s) imported successfully.</p>
            {result.imported > 0 && <p className="text-xs text-[#667085]">They are Unassigned — turn on “Unassigned only”, select them and use Assign Salesperson.</p>}
            {(result.failed.length > 0 || result.duplicates.length > 0) && (
              <p className="text-xs text-[#667085]">{result.failed.length} failed{includeDuplicates ? '' : `, ${result.duplicates.length} possible duplicate(s) skipped`} — not imported.</p>
            )}
            <button onClick={onClose} className="px-5 py-2.5 rounded-lg bg-[#004898] text-white text-sm font-semibold hover:bg-[#00346E]">Done</button>
          </ModalBody>
        )}
    </SalesModal>
  );
};

export const AdminLeadsTab = () => {
  const { showToast } = useApp();
  const [list, setList] = useState({ rows: [], total: 0 }); // the current page
  const [roster, setRoster] = useState([]); // everyone, incl. deactivated (for names)
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState(''); // debounced search sent to the server
  const [statusFilter, setStatusFilter] = useState('');
  const [salesFilter, setSalesFilter] = useState('');
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [expiredOnly, setExpiredOnly] = useState(false);
  const [wonRequestsOnly, setWonRequestsOnly] = useState(false);
  const [archivedOnly, setArchivedOnly] = useState(false);
  const [expiredLead, setExpiredLead] = useState(null);
  const [wonRequestLead, setWonRequestLead] = useState(null);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(() => new Map()); // id -> lead, kept across pages
  const [formModal, setFormModal] = useState(null); // { lead? } or null
  const [assignTargets, setAssignTargets] = useState(null); // [lead, ...] or null
  const [detailId, setDetailId] = useState(null);
  const [statusLead, setStatusLead] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null); // [lead, ...] or null
  const [deleting, setDeleting] = useState(false);
  const [summary, setSummary] = useState(null);
  const requestSeq = useRef(0);
  const leads = list.rows;
  const activeRoster = roster.filter((s) => s.is_active);

  // Search runs on the server, 300ms after typing stops.
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // The roster (incl. deactivated people, for names on their old leads).
  const loadRoster = useCallback(() => {
    fetchSalesInApi({ includeInactive: true })
      .then((data) => setRoster(Array.isArray(data) ? data : []))
      .catch((err) => console.warn('Sales roster unavailable:', err));
  }, []);
  useEffect(() => { loadRoster(); }, [loadRoster]);

  const load = useCallback(async () => {
    // Only the newest request may update the table, so a slow response for
    // an earlier filter or page can never overwrite the current one.
    const seq = ++requestSeq.current;
    // Summary cards are fetched on their own: a stats failure leaves the
    // cards at their last value and never blocks the lead table.
    fetchLeadsSummary().then((data) => { if (seq === requestSeq.current) setSummary(data); })
      .catch((err) => console.warn('Lead summary unavailable:', err));
    try {
      // Filters, search and paging all run on the server, so they cover
      // every lead.
      const data = await fetchLeads({
        status: statusFilter || undefined,
        assigned_to: unassignedOnly ? undefined : salesFilter || undefined,
        unassigned: unassignedOnly,
        overdue: overdueOnly,
        expired: expiredOnly,
        wonRequests: wonRequestsOnly,
        archived: archivedOnly,
        q: query || undefined,
        limit: LEADS_PAGE_SIZE,
        offset: (page - 1) * LEADS_PAGE_SIZE
      });
      if (seq !== requestSeq.current) return;
      // A refresh that empties the current page steps back a page.
      if (!data.rows.length && page > 1) { setPage(pageCount(data.total)); return; }
      setList(data);
    } catch (err) {
      if (seq === requestSeq.current) showToast(err.message, 'error');
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [statusFilter, salesFilter, unassignedOnly, overdueOnly, expiredOnly, wonRequestsOnly, archivedOnly, query, page, showToast]);

  useEffect(() => { load(); }, [load]);

  // Realtime (Phase 7): refresh on lead events (coalesced), with a 20s poll
  // as the API-refresh fallback the plan requires in case the stream drops.
  useEffect(() => {
    const source = subscribeToLeadEvents(() => load());
    const poll = setInterval(load, 20000);
    return () => { source?.close(); clearInterval(poll); };
  }, [load]);

  // A filter or search change starts again on page 1 with nothing selected,
  // so a selection never includes leads outside the current filter.
  useEffect(() => { setPage(1); setSelected(new Map()); }, [statusFilter, salesFilter, unassignedOnly, overdueOnly, expiredOnly, wonRequestsOnly, archivedOnly, query]);

  const salesName = (id) => {
    const person = roster.find((s) => s.id === id);
    if (!person) return '—';
    return person.is_active ? person.full_name : `${person.full_name} (inactive)`;
  };

  // Any non-archived lead can be selected (for bulk delete); bulk Assign
  // only acts on the selected leads that are New/Unassigned.
  const selectable = leads.filter((l) => !l.archived_at);
  const selectedLeads = [...selected.values()];
  const assignableSelected = selectedLeads.filter(isAssignable);
  const allSelected = selectable.length > 0 && selectable.every((l) => selected.has(l.id));
  const someSelected = selectable.some((l) => selected.has(l.id));
  const alreadyOwned = assignableSelected.filter((l) => l.assigned_to).length;

  // Refresh the stored copy of each selected lead on this page (so the
  // assignable check stays current) and drop any that became archived.
  useEffect(() => {
    setSelected((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const lead of leads) {
        if (!next.has(lead.id)) continue;
        if (lead.archived_at) next.delete(lead.id); else next.set(lead.id, lead);
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [leads]);

  const toggle = (lead) => setSelected((prev) => {
    const next = new Map(prev);
    if (next.has(lead.id)) next.delete(lead.id); else next.set(lead.id, lead);
    return next;
  });
  // The header checkbox selects / clears every selectable row on this page.
  const toggleAll = () => setSelected((prev) => {
    const next = new Map(prev);
    if (allSelected) selectable.forEach((l) => next.delete(l.id));
    else selectable.forEach((l) => next.set(l.id, l));
    return next;
  });

  const wonToDelete = pendingDelete ? pendingDelete.filter((l) => l.status === 'won').length : 0;
  const confirmDelete = async () => {
    if (!pendingDelete?.length || deleting) return;
    setDeleting(true);
    try {
      if (pendingDelete.length === 1) {
        const result = await deleteLead(pendingDelete[0].id);
        showToast(result.message || 'Lead removed', 'success');
      } else {
        const r = await deleteLeadsBulk(pendingDelete.map((l) => l.id));
        const parts = [];
        if (r.deleted) parts.push(`${r.deleted} deleted`);
        if (r.archived) parts.push(`${r.archived} archived (had history)`);
        if (r.skipped) parts.push(`${r.skipped} skipped (already removed or just changed)`);
        showToast(parts.join(', ') || 'Nothing to delete', r.skipped ? 'info' : 'success');
      }
      setSelected((prev) => {
        const next = new Map(prev);
        pendingDelete.forEach((l) => next.delete(l.id));
        return next;
      });
      setPendingDelete(null);
      load();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setDeleting(false);
    }
  };

  // Mutually exclusive "queue" views: Won requests and the archive.
  const toggleQueue = (which) => {
    setWonRequestsOnly((v) => (which === 'won' ? !v : false));
    setArchivedOnly((v) => (which === 'archived' ? !v : false));
  };

  const chip = (active) => `shrink-0 whitespace-nowrap px-3 py-2 text-xs font-bold rounded-lg border inline-flex items-center gap-1.5 ${active ? 'border-[#004898] bg-[#EFF5FC] text-[#004898]' : 'border-[#E4E7EC] bg-white text-[#344054] hover:bg-[#F8FAFC]'}`;
  const selectCls = 'text-xs font-semibold text-[#172033] border border-[#E4E7EC] rounded-lg px-3 py-2 bg-white outline-none focus:border-[#004898]';
  const iconCls = 'p-1.5 rounded-lg bg-white hover:bg-[#F8FAFC] text-[#172033] border border-[#E4E7EC] disabled:opacity-40 disabled:cursor-not-allowed';

  const emptyMessage = query ? 'No leads match your search.'
    : wonRequestsOnly ? 'No Won requests waiting.'
    : archivedOnly ? 'No archived leads.'
    : expiredOnly ? 'No expired leads waiting for a decision.'
    : overdueOnly ? 'No overdue leads — nice.'
    : 'No leads match the selected filters.';

  if (loading) return <TableSkeleton rows={4} />;

  return (
    <div className="sales-module space-y-4">
      {/* Company-wide totals — independent of the filters/search below. */}
      <LeadStatGrid>
        <LeadStatCard
          label="Unassigned"
          icon={UserX}
          tone={summary?.unassigned?.count ? 'red' : 'blue'}
          stat={summary?.unassigned}
          hint={unassignedOnly ? 'Showing unassigned only — click to show all' : 'Click to show only these'}
          onClick={() => { setSalesFilter(''); setUnassignedOnly((v) => !v); }}
        />
        <LeadStatCard label="Open Leads" icon={Briefcase} tone="amber" stat={summary?.taken} hint="Assigned and still in the pipeline" />
        <LeadStatCard label="Won Leads" icon={Trophy} tone="green" stat={summary?.won} />
      </LeadStatGrid>

      {summary?.wonRequests > 0 && !wonRequestsOnly && (
        <button onClick={() => toggleQueue('won')} className="w-full text-left text-xs text-[#5925DC] bg-[#F4F3FF] border border-[#D9D6FE] rounded-lg px-3 py-2 flex items-center gap-2 hover:bg-[#EBE9FE]">
          <Hourglass className="w-4 h-4 shrink-0" />
          <span><strong>{summary.wonRequests} Won request{summary.wonRequests === 1 ? '' : 's'}</strong> waiting for your approval — click to review.</span>
        </button>
      )}

      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setFormModal({})} className="btn btn-primary text-xs font-bold flex-1 sm:flex-none">
            <Plus className="w-4 h-4" /> Add Lead
          </button>
          <button onClick={() => setImportOpen(true)} className="flex-1 sm:flex-none justify-center px-3 py-2.5 sm:py-2 text-xs font-bold rounded-lg border border-[#E4E7EC] bg-white text-[#344054] hover:bg-[#F8FAFC] inline-flex items-center gap-1.5">
            <Upload className="w-3.5 h-3.5" /> Import Excel
          </button>
        </div>
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 min-w-0">
          <div className="relative w-full sm:w-60">
            <Search className="w-4 h-4 text-[#98A2B3] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search company, phone, contact or Ref ID…" style={{ paddingLeft: '36px' }} className="form-input text-xs" />
          </div>
          <div className="grid grid-cols-2 sm:flex gap-2">
            <select value={unassignedOnly ? '' : salesFilter} onChange={(e) => { setUnassignedOnly(false); setSalesFilter(e.target.value); }} className={`${selectCls} min-w-0`} aria-label="Salesperson">
              <option value="">All Salespeople</option>
              {roster.map((s) => <option key={s.id} value={s.id}>{s.full_name}{s.is_active ? '' : ' (inactive)'}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${selectCls} min-w-0`} aria-label="Status">
              <option value="">All Statuses</option>
              {ALL_STATUSES.map((st) => <option key={st} value={st}>{STATUS_LABEL[st]}</option>)}
            </select>
          </div>
          {/* Phones: one swipeable row of filter chips instead of a wrapped wall. */}
          <div className="sales-scroll-x -mx-4 px-4 sm:mx-0 sm:px-0 flex items-center gap-2 overflow-x-auto sm:overflow-visible sm:flex-wrap">
          <button onClick={() => { setSalesFilter(''); setUnassignedOnly((v) => !v); }} aria-pressed={unassignedOnly} className={chip(unassignedOnly)}>
            <UserX className="w-3.5 h-3.5" /> Unassigned
          </button>
          <button onClick={() => setOverdueOnly((v) => !v)} aria-pressed={overdueOnly} className={chip(overdueOnly)}>
            <AlarmClock className="w-3.5 h-3.5" /> Overdue
          </button>
          <button onClick={() => setExpiredOnly((v) => !v)} aria-pressed={expiredOnly} className={chip(expiredOnly)} title="Expired stages waiting for your decision">
            <TimerReset className="w-3.5 h-3.5" /> Expired
            <span className={`rounded-full px-1.5 text-[10px] ${summary?.expired ? 'bg-[#B42318] text-white' : 'bg-[#F2F4F7] text-[#667085]'}`}>{summary?.expired ?? 0}</span>
          </button>
          <button onClick={() => toggleQueue('won')} aria-pressed={wonRequestsOnly} className={chip(wonRequestsOnly)} title="Sales Won requests waiting for your approval">
            <Hourglass className="w-3.5 h-3.5" /> Won Requests
            <span className={`rounded-full px-1.5 text-[10px] ${summary?.wonRequests ? 'bg-[#5925DC] text-white' : 'bg-[#F2F4F7] text-[#667085]'}`}>{summary?.wonRequests ?? 0}</span>
          </button>
          <button onClick={() => toggleQueue('archived')} aria-pressed={archivedOnly} className={chip(archivedOnly)} title="Archived leads (read-only)">
            <Archive className="w-3.5 h-3.5" /> Archived
          </button>
          </div>
        </div>
      </div>

      {/* Phones: one card per lead. */}
      <div className="md:hidden space-y-2.5">
        {leads.length > 0 && selectable.length > 0 && (
          <label className="flex items-center gap-2 px-1 text-xs font-semibold text-[#475467]">
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
              onChange={toggleAll}
              className="w-4 h-4 accent-[#004898]"
            />
            Select all leads on this page
          </label>
        )}
        {leads.length === 0 ? (
          <div className="card p-8 text-center text-sm text-[#667085]">{emptyMessage}</div>
        ) : leads.map((l) => {
          const isSelected = selected.has(l.id);
          const isWon = l.status === 'won';
          const archived = !!l.archived_at;
          const pending = isWonPending(l);
          const blockReason = archived ? 'Archived leads are read-only' : assignBlockReason(l);
          const followUp = followUpInfo(l);
          const closeReason = CLOSED_STATUSES.includes(l.status) ? lostReasonLabel(l) : null;
          return (
            <div key={l.id} className={`rounded-2xl border bg-white shadow-xs transition-colors ${isSelected ? 'border-[#004898] bg-[#F5F9FE]' : 'border-[#E4E7EC]'}`}>
              <div className="p-3.5 flex items-start gap-3">
                {!archived && (
                  <input
                    type="checkbox"
                    aria-label={`Select ${l.company}`}
                    checked={isSelected}
                    onChange={() => toggle(l)}
                    className="mt-1 w-4 h-4 accent-[#004898] shrink-0"
                  />
                )}
                <button onClick={() => setDetailId(l.id)} className="min-w-0 flex-1 text-left">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-extrabold text-[14px] text-[#172033] truncate">{l.company}</span>
                    {l.duplicate_count > 0 && <Copy className="w-3.5 h-3.5 text-[#667085] shrink-0" aria-label="Duplicate" />}
                  </div>
                  <div className="text-[12px] text-[#667085] truncate">
                    {[l.person_to_contact, l.phone].filter(Boolean).join(' · ')}
                  </div>
                  {followUp && <div className={`text-[11px] font-bold ${followUp.due ? 'text-[#B54708]' : 'text-[#98A2B3]'}`}>{followUp.label}</div>}
                </button>
                <span className="text-sm font-extrabold text-[#172033] shrink-0">{money(l.value_estimate)}</span>
              </div>

              <div className="px-3.5 pb-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${STATUS_COLOR[l.status]}`}>{STATUS_LABEL[l.status]}</span>
                  {archived && <span className="text-[11px] font-semibold text-[#667085]">Archived</span>}
                  {!archived && l.assigned_to && ACTIVE_STATUSES.includes(l.status) && <LeadTimerBattery lead={l} />}
                </div>
                <span className="text-[12px] font-semibold text-[#475467] truncate max-w-[50%]">
                  {l.assigned_to ? salesName(l.assigned_to) : <span className="rounded-full bg-[#FEF3F2] px-2 py-0.5 text-[11px] font-bold text-[#B42318]">Unassigned</span>}
                </span>
              </div>

              {closeReason && <p className="px-3.5 pb-3 -mt-1 text-[11px] text-[#667085]">{closeReason}</p>}

              {!archived && (pending || l.expired) && (
                <div className="px-3.5 pb-3 flex flex-wrap gap-2">
                  {pending && (
                    <button onClick={() => setWonRequestLead(l)} className="inline-flex items-center gap-1 rounded-lg bg-[#F4F3FF] border border-[#D9D6FE] px-2.5 py-1.5 text-[11px] font-bold text-[#5925DC]">
                      <Hourglass className="w-3.5 h-3.5" /> Won request · Review
                    </button>
                  )}
                  {l.expired && (
                    <button onClick={() => setExpiredLead(l)} className="inline-flex items-center gap-1 rounded-lg bg-[#FEF3F2] border border-[#FECDCA] px-2.5 py-1.5 text-[11px] font-bold text-[#B42318]">
                      <TimerReset className="w-3.5 h-3.5" /> Expired · Review
                    </button>
                  )}
                </div>
              )}

              <div className="px-3.5 py-2.5 border-t border-[#F2F4F7] flex items-center gap-2">
                {!archived && (
                  <button
                    onClick={() => setStatusLead(l)}
                    disabled={isWon || pending}
                    className="flex-1 justify-center px-2.5 py-2 rounded-lg bg-[#004898] text-white text-[12px] font-bold inline-flex items-center gap-1.5 disabled:opacity-40"
                  ><ArrowRightCircle className="w-4 h-4" /> Change Status</button>
                )}
                <button onClick={() => setDetailId(l.id)} aria-label="Details" className={`${iconCls} p-2 ${archived ? 'flex-1 inline-flex justify-center' : ''}`}><HistoryIcon className="w-4 h-4" /></button>
                {!archived && (
                  <>
                    <button onClick={() => setAssignTargets([l])} disabled={!!blockReason} aria-label="Assign salesperson" className={`${iconCls} p-2`}><UserPlus className="w-4 h-4" /></button>
                    <button onClick={() => setFormModal({ lead: l })} aria-label="Edit" className={`${iconCls} p-2`}><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => setPendingDelete([l])} aria-label="Delete" className={`${iconCls} p-2 text-[#D92D20]`}><Trash2 className="w-4 h-4" /></button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="hidden md:block card overflow-hidden border border-[#E4E7EC] shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse bg-white">
            <thead className="bg-[#F8FAFC] text-[#667085] uppercase font-bold text-[10px] tracking-wider border-b border-[#E4E7EC]">
              <tr>
                <th className="pl-4 pr-2 py-4 w-8">
                  <input
                    type="checkbox"
                    aria-label="Select all leads on this page"
                    title="Select all leads on this page"
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                    onChange={toggleAll}
                    disabled={!selectable.length}
                    className="w-4 h-4 accent-[#004898] cursor-pointer align-middle disabled:opacity-30"
                  />
                </th>
                <th className="px-4 py-4">Company</th>
                <th className="px-4 py-4">Phone</th>
                <th className="px-4 py-4">Value</th>
                <th className="px-4 py-4">Status</th>
                <th className="px-4 py-4">Assigned To</th>
                <th className="px-4 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F2F4F7]">
              {leads.length === 0 ? (
                <tr><td colSpan="7" className="p-8 text-center text-[#667085]">{emptyMessage}</td></tr>
              ) : leads.map((l) => {
                const isSelected = selected.has(l.id);
                const isWon = l.status === 'won';
                const archived = !!l.archived_at;
                const pending = isWonPending(l);
                const blockReason = archived ? 'Archived leads are read-only' : assignBlockReason(l);
                const followUp = followUpInfo(l);
                const closeReason = CLOSED_STATUSES.includes(l.status) ? lostReasonLabel(l) : null;
                return (
                  <tr key={l.id} className={`transition-all ${isSelected ? 'bg-[#EFF5FC]' : 'hover:bg-[#F8FAFC]'}`}>
                    <td className="pl-4 pr-2 py-4 align-middle">
                      <input
                        type="checkbox"
                        aria-label={`Select ${l.company}`}
                        checked={isSelected}
                        onChange={() => toggle(l)}
                        disabled={archived}
                        title={archived ? 'Archived leads are read-only' : undefined}
                        className="w-4 h-4 accent-[#004898] cursor-pointer disabled:cursor-not-allowed disabled:opacity-30 align-middle"
                      />
                    </td>
                    <td className="px-4 py-4 align-middle">
                      <button onClick={() => setDetailId(l.id)} className="font-extrabold text-[13px] text-[#004898] hover:underline text-left">{l.company}</button>
                      {l.duplicate_count > 0 && (
                        <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-[#F2F4F7] px-2 py-0.5 text-[10px] font-bold text-[#475467] align-middle"
                          title={`${l.duplicate_count} other lead(s) with the same company and phone`}>
                          <Copy className="w-3 h-3" /> Duplicate
                        </span>
                      )}
                      {l.person_to_contact && <div className="text-[11px] text-[#667085]">{l.person_to_contact}</div>}
                      {followUp && <div className={`text-[11px] font-bold ${followUp.due ? 'text-[#B54708]' : 'text-[#98A2B3]'}`}>{followUp.label}</div>}
                    </td>
                    <td className="px-4 py-4 align-middle text-[#475467] font-medium">{l.phone}</td>
                    <td className="px-4 py-4 align-middle text-[#475467] font-medium">{money(l.value_estimate)}</td>
                    <td className="px-4 py-4 align-middle">
                      <div className="flex flex-col items-start gap-1">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${STATUS_COLOR[l.status]}`}>{STATUS_LABEL[l.status]}</span>
                        {archived && <span className="text-[11px] font-semibold text-[#667085]">Archived</span>}
                        {!archived && l.assigned_to && ACTIVE_STATUSES.includes(l.status) && <LeadTimerBattery lead={l} />}
                        {closeReason && <span className="text-[11px] text-[#667085] max-w-[180px] truncate" title={closeReason}>{closeReason}</span>}
                        {!archived && pending && (
                          <button onClick={() => setWonRequestLead(l)} className="inline-flex items-center gap-1 rounded-lg bg-[#F4F3FF] border border-[#D9D6FE] px-2 py-1 text-[11px] font-bold text-[#5925DC] hover:bg-[#EBE9FE]">
                            <Hourglass className="w-3.5 h-3.5" /> Won request · Review
                          </button>
                        )}
                        {!archived && l.expired && (
                          <button onClick={() => setExpiredLead(l)} className="inline-flex items-center gap-1 rounded-lg bg-[#FEF3F2] border border-[#FECDCA] px-2 py-1 text-[11px] font-bold text-[#B42318] hover:bg-[#FEE4E2]">
                            <TimerReset className="w-3.5 h-3.5" /> Expired · Review
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 align-middle text-[#475467] font-medium">{l.assigned_to ? salesName(l.assigned_to) : <span className="inline-flex items-center gap-1 rounded-full bg-[#FEF3F2] px-2 py-0.5 text-[11px] font-bold text-[#B42318]">Unassigned</span>}</td>
                    <td className="px-4 py-4 align-middle">
                      <div className="flex items-center justify-end gap-2">
                        {!archived && (
                          <button
                            onClick={() => setStatusLead(l)}
                            disabled={isWon || pending}
                            title={isWon ? 'A Won lead is final' : pending ? 'Approve or reject the Won request first' : 'Change status'}
                            className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-[#EFF5FC] text-[#004898] border border-[#E4E7EC] hover:border-[#B3D1F2] text-[11px] font-bold inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                          ><ArrowRightCircle className="w-3.5 h-3.5" /> Change Status</button>
                        )}
                        <button onClick={() => setDetailId(l.id)} title="Details, follow-ups, remarks & history" className={iconCls}><HistoryIcon className="w-4 h-4" /></button>
                        {!archived && (
                          <>
                            <button onClick={() => setAssignTargets([l])} disabled={!!blockReason} title={blockReason || 'Assign salesperson'} className={iconCls}><UserPlus className="w-4 h-4" /></button>
                            <button onClick={() => setFormModal({ lead: l })} title={isWon ? 'Edit (changes are recorded in history)' : 'Edit'} className={iconCls}><Pencil className="w-4 h-4" /></button>
                            <button
                              onClick={() => setPendingDelete([l])}
                              title="Delete"
                              className={`${iconCls} hover:bg-[#FEF3F2] text-[#D92D20] hover:border-[#FDA29B]`}
                            ><Trash2 className="w-4 h-4" /></button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <LeadPagination page={page} totalPages={pageCount(list.total)} count={list.total} onChange={setPage} />

      {/* Floating bulk-action bar — appears while any lead is selected. */}
      {selectedLeads.length > 0 && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-xl">
          <div className="flex items-center gap-3 rounded-2xl bg-[#172033] text-white shadow-2xl px-4 py-3">
            <span className="flex items-center justify-center w-7 h-7 rounded-full bg-[#004898] text-xs font-extrabold shrink-0">{selectedLeads.length}</span>
            <span className="text-sm font-semibold flex-1 min-w-0 truncate">
              lead{selectedLeads.length === 1 ? '' : 's'} selected{pageCount(list.total) > 1 ? ' (across pages)' : ''}
              {assignableSelected.length < selectedLeads.length && <span className="block text-[11px] font-normal text-white/70">{assignableSelected.length ? `Assign applies to the ${assignableSelected.length} New / Unassigned` : 'None can be assigned (only New / Unassigned)'}</span>}
              {alreadyOwned > 0 && <span className="block text-[11px] font-normal text-white/70">{alreadyOwned} already assigned — will move to the new salesperson</span>}
            </span>
            <button
              onClick={() => setAssignTargets(assignableSelected)}
              disabled={!assignableSelected.length}
              title={assignableSelected.length ? undefined : 'Only New or Unassigned leads can be assigned'}
              className="px-3 py-2 rounded-lg bg-white text-[#004898] text-xs font-extrabold hover:bg-[#EFF5FC] inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <UserPlus className="w-4 h-4" /> Assign<span className="hidden sm:inline"> Salesperson</span>
            </button>
            <button onClick={() => setPendingDelete(selectedLeads)} className="px-3 py-2 rounded-lg bg-[#D92D20] text-white text-xs font-extrabold hover:bg-[#B42318] inline-flex items-center gap-1.5 whitespace-nowrap">
              <Trash2 className="w-4 h-4" /> Delete
            </button>
            <button onClick={() => setSelected(new Map())} title="Clear selection" className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {formModal && (
        <LeadFormModal lead={formModal.lead} onClose={() => setFormModal(null)} onSaved={() => { setFormModal(null); load(); }} showToast={showToast} />
      )}
      {assignTargets && (
        <AssignSalesModal
          leads={assignTargets}
          roster={activeRoster}
          onClose={() => setAssignTargets(null)}
          onSaved={() => { setAssignTargets(null); setSelected(new Map()); load(); }}
          showToast={showToast}
        />
      )}
      {detailId && (
        <DetailModal
          leadId={detailId}
          roster={roster}
          onClose={() => setDetailId(null)}
          onChanged={load}
          onChangeStatus={(lead) => { setDetailId(null); setStatusLead(lead); }}
          showToast={showToast}
        />
      )}
      {expiredLead && (
        <ExpiredLeadModal
          lead={expiredLead}
          roster={activeRoster}
          salesName={salesName}
          onClose={() => setExpiredLead(null)}
          onDone={() => { setExpiredLead(null); load(); }}
          showToast={showToast}
        />
      )}
      {wonRequestLead && (
        <WonRequestModal
          lead={wonRequestLead}
          salesName={salesName}
          onClose={() => setWonRequestLead(null)}
          onDone={() => { setWonRequestLead(null); load(); }}
          showToast={showToast}
        />
      )}
      {statusLead && (
        <LeadStatusModal lead={statusLead} isAdmin onClose={() => setStatusLead(null)} onDone={() => { setStatusLead(null); load(); }} showToast={showToast} />
      )}
      {importOpen && (
        <ImportModal onClose={() => setImportOpen(false)} onImported={load} showToast={showToast} />
      )}
      {pendingDelete && (
        <SalesModal onClose={() => { if (!deleting) setPendingDelete(null); }}>
            <ModalBody>
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-10 h-10 rounded-full bg-[#FEF3F2] flex items-center justify-center"><AlertTriangle className="w-5 h-5 text-[#D92D20]" /></div>
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-[#172033]">{pendingDelete.length === 1 ? 'Delete Lead' : `Delete ${pendingDelete.length} Leads`}</h3>
                <p className="mt-1 text-sm text-[#667085]">
                  {pendingDelete.length === 1
                    ? <>Delete <span className="font-semibold text-[#172033]">{pendingDelete[0].company}</span>?</>
                    : <>Delete these <span className="font-semibold text-[#172033]">{pendingDelete.length} leads</span>?</>}
                  {' '}A lead that was never assigned and has no activity is removed permanently and can’t be recovered;
                  any other lead is archived instead, so its history is kept (see the Archived filter).
                </p>
                {pendingDelete.length > 1 && (
                  <p className="mt-2 text-xs text-[#475467] truncate" title={pendingDelete.map((l) => l.company).join(', ')}>
                    {pendingDelete.slice(0, 5).map((l) => l.company).join(', ')}{pendingDelete.length > 5 ? ` +${pendingDelete.length - 5} more` : ''}
                  </p>
                )}
                {wonToDelete > 0 && (
                  <p className="mt-2 rounded-lg bg-[#FFFAEB] border border-[#FEDF89] px-3 py-2 text-xs font-semibold text-[#B54708]">
                    {pendingDelete.length === 1 ? 'This is a Won lead.' : `${wonToDelete} of these ${wonToDelete === 1 ? 'is a Won lead' : 'are Won leads'}.`}
                    {' '}Won leads are archived, which removes them from Won counts and sales analytics.
                  </p>
                )}
              </div>
            </div>
            </ModalBody>
            <ModalFooter>
              <button onClick={() => setPendingDelete(null)} disabled={deleting} className={btnSecondary}>Cancel</button>
              <button onClick={confirmDelete} disabled={deleting} className={btnDanger}>{deleting ? 'Deleting…' : 'Delete'}</button>
            </ModalFooter>
        </SalesModal>
      )}
    </div>
  );
};
