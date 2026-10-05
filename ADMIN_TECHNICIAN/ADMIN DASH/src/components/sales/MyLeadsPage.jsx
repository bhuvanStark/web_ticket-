// TaskPro Sales Module — the Sales employee's own Leads page (pipeline V2).
// There is no common pool: Admin assigns leads to a salesperson, who works
// them New → Meeting → Proposal → Follow-up/Hold → Won/Lost. Each active
// lead shows a battery timer for its current stage; an overdue lead stays
// here (it is never taken away automatically). The list shows active leads
// by default (15 per page, paged and searched on the server so nothing is
// out of reach); Won/Lost and "Due today" follow-ups are filters. Strip
// counts come from the server summary, so they always cover every lead,
// not just the page on screen. Mirrors SalesDashboard.jsx's
// isolation — reads nothing from AppContext except currentUser/showToast,
// own fetch-on-mount, no global state.
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { Search, LogOut, History as HistoryIcon, X, Plus, Pencil, ArrowRightCircle, CalendarClock, Hourglass } from 'lucide-react';
import {
  fetchMine, releaseLead, createMyLead, updateMyLead, fetchMySummary, fetchViewAsSummary,
  fetchLead, fetchLeadHistory, subscribeToLeadEvents, fetchViewAsMine
} from '../../services/leadsApiService';
import { LeadStatusModal, LeadRemarks, ProposalFields, FollowUpForm, LeadHistoryList } from './LeadQuickActions';
import { useDuplicateAwareSave } from './useDuplicateAwareSave';
import { LeadTimerBattery } from './LeadTimerBattery';
import { PipelineSummaryBar } from './PipelineSummaryBar';
import { LeadPagination } from './LeadPagination';
import {
  STATUS_LABEL, STATUS_COLOR, CLOSED_STATUSES, PROPOSAL_STAGES, LEADS_PAGE_SIZE,
  REF_ID_TEMPLATE, isRefIdTemplate, money, stageTimer, followUpInfo, pageCount, isWonPending, lostReasonLabel
} from './leadPipeline';

// Add (lead = undefined) or edit one of the Sales employee's own open leads.
// A new lead is assigned to its creator by the backend. From Proposal
// onwards the form also carries the (required) Value Estimate and Ref ID.
const LeadFormModal = ({ lead, onClose, onSaved, showToast }) => {
  const isEdit = !!lead;
  const inProposal = isEdit && PROPOSAL_STAGES.includes(lead.status);
  const [company, setCompany] = useState(lead?.company || '');
  const [personToContact, setPersonToContact] = useState(lead?.person_to_contact || '');
  const [email, setEmail] = useState(lead?.email || '');
  const [phone, setPhone] = useState(lead?.phone || '');
  const [valueEstimate, setValueEstimate] = useState(lead?.value_estimate ?? '');
  const [refId, setRefId] = useState(lead?.ref_id || (inProposal ? REF_ID_TEMPLATE : ''));
  const [demand, setDemand] = useState(lead?.demand || '');
  const [remarks, setRemarks] = useState(lead?.remarks || '');
  // A same Company + Phone match returns a warning; the user can edit or continue.
  const { run, saving, warning } = useDuplicateAwareSave(
    (payload) => (isEdit ? updateMyLead(lead.id, payload) : createMyLead(payload)),
    { onSaved: () => { showToast(isEdit ? 'Lead updated' : 'Lead added to My Leads', 'success'); onSaved(); }, showToast }
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
      demand: demand || null, remarks: remarks || null,
      ...(inProposal ? { ref_id: refId } : {})
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md max-h-[90vh] rounded-xl bg-white shadow-xl border border-[#E4E7EC] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-[#E4E7EC] shrink-0">
          <h3 className="text-lg font-bold text-[#172033]">{isEdit ? 'Edit Lead' : 'Add Lead'}</h3>
          <button onClick={onClose} className="text-[#667085] hover:text-[#172033]"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3 overflow-y-auto">
          <div>
            <label className="block text-xs font-bold text-[#344054] mb-1">Company *</label>
            <input required value={company} onChange={(e) => setCompany(e.target.value)} className="form-input text-sm" />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#344054] mb-1">Phone *</label>
            <input required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" className="form-input text-sm" />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#344054] mb-1">Person to Contact</label>
            <input value={personToContact} onChange={(e) => setPersonToContact(e.target.value)} className="form-input text-sm" />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#344054] mb-1">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="form-input text-sm" />
          </div>
          {inProposal ? (
            <ProposalFields valueEstimate={valueEstimate} setValueEstimate={setValueEstimate} refId={refId} setRefId={setRefId} required />
          ) : (
            <div>
              <label className="block text-xs font-bold text-[#344054] mb-1">Value Estimate (₹)</label>
              <input type="number" min="0" step="any" value={valueEstimate} onChange={(e) => setValueEstimate(e.target.value)} placeholder="Required from Proposal onwards" className="form-input text-sm" />
            </div>
          )}
          <div>
            <label className="block text-xs font-bold text-[#344054] mb-1">Demand</label>
            <textarea value={demand} onChange={(e) => setDemand(e.target.value)} rows={2} maxLength={2000} placeholder="What the customer needs…" className="form-input text-sm" />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#344054] mb-1">Remarks</label>
            <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} maxLength={5000} className="form-input text-sm" />
          </div>
          <p className="text-[11px] text-[#667085]">
            {isEdit ? '' : 'This lead will be assigned to you. '}A lead can be marked Won once it reaches Proposal and every field is filled — including Ref ID and a value above ₹0.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold rounded-lg border border-[#E4E7EC] bg-white text-[#344054] hover:bg-[#F8FAFC]">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#004898] text-white hover:bg-[#00346E] disabled:opacity-60">
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Lead'}
            </button>
          </div>
        </form>
      </div>
      {warning}
    </div>
  );
};

const ReleaseModal = ({ lead, onClose, onDone, showToast }) => {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!reason.trim() || busy) return;
    setBusy(true);
    try {
      await releaseLead(lead.id, reason.trim());
      showToast('Lead released — it is back with Admin as a New lead', 'success');
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
          <h3 className="text-lg font-bold text-[#172033]">Release Lead</h3>
          <button onClick={onClose} className="text-[#667085] hover:text-[#172033]"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3">
          <p className="text-sm text-[#667085]">Give <span className="font-semibold text-[#172033]">{lead.company}</span> back to Admin. It returns as a <strong>New, unassigned</strong> lead and leaves your list; its history and your notes are kept. A reason is required.</p>
          <textarea required value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="form-input text-sm" placeholder="Why are you releasing this lead?" />
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold rounded-lg border border-[#E4E7EC] bg-white text-[#344054] hover:bg-[#F8FAFC]">Cancel</button>
            <button type="submit" disabled={busy || !reason.trim()} className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#D92D20] text-white hover:bg-[#B42318] disabled:opacity-60">
              {busy ? 'Releasing…' : 'Release'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// readOnly: Super Admin "View as" — details/remarks/history only, no writes.
// `initialLead` is the list row; the popup re-fetches the lead so remarks
// and other fields always show the latest saved values. Status changes go
// through the Change Status modal (it collects the Proposal fields).
const DetailModal = ({ lead: initialLead, onClose, onChanged, onChangeStatus, showToast, readOnly = false }) => {
  const [lead, setLead] = useState(initialLead);
  const [history, setHistory] = useState([]);

  const load = useCallback(async () => {
    try {
      const [fresh, events] = await Promise.all([fetchLead(initialLead.id), fetchLeadHistory(initialLead.id)]);
      if (fresh) setLead(fresh);
      setHistory(events);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }, [initialLead.id, showToast]);

  useEffect(() => { load(); }, [load]);

  const pending = isWonPending(lead);
  const followUp = followUpInfo(lead);
  const closeReason = lostReasonLabel(lead);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] rounded-xl bg-white shadow-xl border border-[#E4E7EC] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-[#E4E7EC] shrink-0">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-[#172033] truncate">{lead.company}</h3>
            <div className="mt-1 flex items-center gap-3 flex-wrap">
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${STATUS_COLOR[lead.status]}`}>{STATUS_LABEL[lead.status]}</span>
              <LeadTimerBattery lead={lead} />
              {followUp && <span className={`text-[11px] font-bold ${followUp.due ? 'text-[#B54708]' : 'text-[#667085]'}`}>{followUp.label}</span>}
            </div>
          </div>
          <button onClick={onClose} className="text-[#667085] hover:text-[#172033]"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 overflow-y-auto space-y-5">
          {pending && (
            <p className="text-xs text-[#5925DC] bg-[#F4F3FF] border border-[#D9D6FE] rounded-lg px-3 py-2 flex gap-2">
              <Hourglass className="w-4 h-4 shrink-0" /> Won request sent — an Admin is reviewing it because another lead exists for this customer. Status and details are locked and the timer is paused; notes and remarks still work.
            </p>
          )}
          {closeReason && (
            <p className="text-xs text-[#344054] bg-[#F8FAFC] border border-[#E4E7EC] rounded-lg px-3 py-2">
              <strong>{STATUS_LABEL[lead.status]}:</strong> {closeReason}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-[#667085]">Phone</span><div className="font-semibold text-[#172033]">{lead.phone}</div></div>
            <div><span className="text-[#667085]">Contact</span><div className="font-semibold text-[#172033]">{lead.person_to_contact || '—'}</div></div>
            <div><span className="text-[#667085]">Email</span><div className="font-semibold text-[#172033] break-all">{lead.email || '—'}</div></div>
            <div><span className="text-[#667085]">Value Estimate</span><div className="font-semibold text-[#172033]">{money(lead.value_estimate)}</div></div>
            <div><span className="text-[#667085]">Ref ID</span><div className="font-semibold text-[#172033] font-mono text-xs break-all">{lead.ref_id || '—'}</div></div>
            <div className="col-span-2"><span className="text-[#667085]">Demand</span><div className="font-semibold text-[#172033] whitespace-pre-wrap">{lead.demand || '—'}</div></div>
          </div>

          {!readOnly && !pending && !CLOSED_STATUSES.includes(lead.status) && (
            <button onClick={() => onChangeStatus(lead)} className="w-full px-4 py-2 text-sm font-semibold rounded-lg bg-[#004898] text-white hover:bg-[#00346E] inline-flex items-center justify-center gap-2">
              <ArrowRightCircle className="w-4 h-4" /> Change Status
            </button>
          )}

          {!readOnly && <FollowUpForm lead={lead} onSaved={() => { load(); onChanged(); }} showToast={showToast} />}

          <LeadRemarks lead={lead} readOnly={readOnly} onSaved={() => { load(); onChanged(); }} showToast={showToast} />

          <div>
            <h4 className="text-xs font-bold text-[#667085] uppercase tracking-wider mb-2">History</h4>
            <LeadHistoryList history={history} />
          </div>
        </div>
      </div>
    </div>
  );
};

const iconBtn = 'p-1.5 rounded-lg bg-white border border-[#E4E7EC] disabled:opacity-40 disabled:cursor-not-allowed';

// Which server list a strip filter needs: Won/Lost and Due today are their
// own lists; everything else filters the active list.
const scopeFor = (filter) => (filter === 'closed' ? 'closed' : filter === 'due' ? 'due' : 'active');

export const MyLeadsPage = () => {
  const { currentUser, showToast, isViewingAsSales } = useApp();
  const [list, setList] = useState(null); // { rows, total } for the current page; null while loading
  const [summary, setSummary] = useState(null);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState(''); // debounced search sent to the server
  const [stageFilter, setStageFilter] = useState(null); // an active status, 'closed', 'due', or null
  const [page, setPage] = useState(1);
  const [releaseTarget, setReleaseTarget] = useState(null);
  const [detailLead, setDetailLead] = useState(null);
  const [statusLead, setStatusLead] = useState(null);
  const [formModal, setFormModal] = useState(null); // { lead? } or null
  const scope = scopeFor(stageFilter);
  const stageStatus = stageFilter && !['closed', 'due'].includes(stageFilter) ? stageFilter : undefined;
  const requestSeq = useRef(0);

  // Search runs on the server, 300ms after typing stops.
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Back to page 1 (and a clean list) whenever the filter or search changes.
  useEffect(() => { setPage(1); setList(null); }, [stageFilter, query]);

  const load = useCallback(async () => {
    // Only the newest request may update the list, so a slow response for
    // an earlier filter can never overwrite the current one.
    const seq = ++requestSeq.current;
    // Summary (strip counts) is fetched on its own so a failure there never
    // blocks the list, and vice versa.
    (isViewingAsSales ? fetchViewAsSummary(currentUser.id) : fetchMySummary())
      .then((data) => { if (seq === requestSeq.current) setSummary(data); })
      .catch((err) => console.warn('Lead summary unavailable:', err));
    const options = { scope, status: stageStatus, q: query || undefined, limit: LEADS_PAGE_SIZE, offset: (page - 1) * LEADS_PAGE_SIZE };
    try {
      // Super Admin "View as": same data via the read-only view-as route.
      const data = isViewingAsSales ? await fetchViewAsMine(currentUser.id, options) : await fetchMine(options);
      if (seq !== requestSeq.current) return;
      // A refresh that leaves the current page empty (e.g. the last lead on
      // it was closed) steps back a page.
      if (!data.rows.length && page > 1) { setPage(pageCount(data.total)); return; }
      setList(data);
    } catch (err) {
      if (seq === requestSeq.current) {
        showToast(err.message, 'error');
        setList((prev) => prev || { rows: [], total: 0 });
      }
    }
  }, [showToast, isViewingAsSales, currentUser?.id, scope, stageStatus, query, page]);

  useEffect(() => { load(); }, [load]);

  // Realtime (Phase 7) plus a poll fallback; the poll also keeps the
  // battery timers current.
  useEffect(() => {
    const source = subscribeToLeadEvents(() => load());
    const poll = setInterval(load, 15000);
    return () => { source?.close(); clearInterval(poll); };
  }, [load]);

  const overdueTotal = summary?.overdue?.count || 0;
  const dueToday = summary?.dueToday || 0;
  const rows = list?.rows || [];
  const total = list?.total || 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold text-[#172033] tracking-tight">My Leads</h2>
          <p className="text-xs md:text-sm text-[#667085] mt-0.5">
            Welcome back, <strong className="text-[#004898]">{currentUser.name}</strong>.
            {overdueTotal > 0 && <span className="ml-1 font-semibold text-[#B42318]">{overdueTotal} lead{overdueTotal === 1 ? ' is' : 's are'} overdue.</span>}
          </p>
        </div>
        {!isViewingAsSales && (
          <button onClick={() => setFormModal({})} className="btn btn-primary text-xs font-bold self-start sm:self-auto">
            <Plus className="w-4 h-4" /> Add Lead
          </button>
        )}
      </div>

      <PipelineSummaryBar
        stages={summary?.stages}
        closed={{ won: summary?.won?.count ?? 0, lost: summary?.lost ?? 0 }}
        selected={stageFilter === 'due' ? null : stageFilter}
        onSelect={setStageFilter}
      />

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-[#98A2B3] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search company, phone, contact or Ref ID…" style={{ paddingLeft: '36px' }} className="form-input text-xs" />
        </div>
        <button
          onClick={() => setStageFilter((f) => (f === 'due' ? null : 'due'))}
          aria-pressed={stageFilter === 'due'}
          className={`self-start px-3 py-2 text-xs font-bold rounded-lg border inline-flex items-center gap-1.5 ${stageFilter === 'due' ? 'border-[#B54708] bg-[#FFFAEB] text-[#B54708]' : 'border-[#E4E7EC] bg-white text-[#344054] hover:bg-[#F8FAFC]'}`}
        >
          <CalendarClock className="w-3.5 h-3.5" /> Due Today
          <span className={`rounded-full px-1.5 text-[10px] ${dueToday ? 'bg-[#B54708] text-white' : 'bg-[#F2F4F7] text-[#667085]'}`}>{dueToday}</span>
        </button>
        {stageFilter && (
          <button onClick={() => setStageFilter(null)} className="self-start inline-flex items-center gap-1 rounded-full bg-[#EFF5FC] px-3 py-1 text-[11px] font-bold text-[#004898] hover:bg-[#DCEBFA]">
            {stageFilter === 'closed' ? 'Won / Lost / Dead' : stageFilter === 'due' ? 'Due Today' : STATUS_LABEL[stageFilter]} <X className="w-3 h-3" /> Show open leads
          </button>
        )}
      </div>

      {!list ? (
        <div className="text-center text-sm text-[#667085] py-12">Loading…</div>
      ) : (
        <>
        <div className="card overflow-hidden border border-[#E4E7EC] shadow-xs divide-y divide-[#F2F4F7]">
          {rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#667085]">
              {query ? 'No leads match your search.'
                : stageFilter === 'due' ? 'No follow-ups due today.'
                : stageFilter === 'closed' ? 'No Won, Lost or Dead leads yet.'
                : !stageFilter ? 'No open leads — Admin will assign leads to you, or add your own.'
                : 'No leads match this filter.'}
            </div>
          ) : rows.map((l) => {
            const isClosed = CLOSED_STATUSES.includes(l.status);
            const pending = isWonPending(l);
            const locked = isClosed || pending;
            const lockReason = pending ? 'Waiting for Admin to approve the Won request' : `This lead is ${STATUS_LABEL[l.status]} — only an Admin can change it`;
            const overdue = stageTimer(l)?.overdue;
            const followUp = followUpInfo(l);
            return (
              <div key={l.id} className={`px-4 py-3 flex flex-col md:flex-row md:items-center gap-3 hover:bg-[#F8FAFC] transition-colors ${overdue ? 'border-l-4 border-l-[#F04438]' : 'border-l-4 border-l-transparent'}`}>
                <button onClick={() => setDetailLead(l)} className="min-w-0 flex-1 text-left">
                  <div className="font-extrabold text-[13px] text-[#172033] truncate">{l.company}</div>
                  <div className="text-[11px] text-[#667085] truncate">
                    {[l.person_to_contact, l.phone, l.value_estimate != null ? money(l.value_estimate) : null].filter(Boolean).join(' · ')}
                  </div>
                  {(followUp || l.ref_id || l.demand || (isClosed && l.lost_reason)) && (
                    <div className="text-[11px] text-[#98A2B3] truncate">
                      {followUp && <span className={`font-bold ${followUp.due ? 'text-[#B54708]' : 'text-[#667085]'}`}>{followUp.label}</span>}
                      {followUp && (l.ref_id || l.demand) && ' · '}
                      {l.ref_id && <span className="font-mono">{l.ref_id}</span>}
                      {l.ref_id && l.demand && ' · '}
                      {l.demand}
                      {isClosed && l.lost_reason && <span>{(followUp || l.ref_id || l.demand) ? ' · ' : ''}{lostReasonLabel(l)}</span>}
                    </div>
                  )}
                </button>
                <div className="flex items-center gap-4 md:w-[230px] shrink-0">
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${STATUS_COLOR[l.status]} w-[76px] text-center`}>{STATUS_LABEL[l.status]}</span>
                  <LeadTimerBattery lead={l} />
                </div>
                <div className="flex items-center gap-2 shrink-0 md:justify-end md:w-[230px]">
                  {!isViewingAsSales && (
                    <button
                      onClick={() => setStatusLead(l)}
                      disabled={locked}
                      title={locked ? lockReason : 'Change status'}
                      className="px-2.5 py-1.5 rounded-lg bg-[#004898] hover:bg-[#00346E] text-white text-[11px] font-bold inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                    ><ArrowRightCircle className="w-3.5 h-3.5" /> Change Status</button>
                  )}
                  {!isViewingAsSales && (
                    <button onClick={() => setFormModal({ lead: l })} disabled={locked} title={locked ? lockReason : 'Edit lead'} className={`${iconBtn} hover:bg-[#F8FAFC] text-[#172033]`}><Pencil className="w-4 h-4" /></button>
                  )}
                  <button onClick={() => setDetailLead(l)} title="Details, follow-ups, remarks & history" className={`${iconBtn} hover:bg-[#F8FAFC] text-[#172033]`}><HistoryIcon className="w-4 h-4" /></button>
                  {!isViewingAsSales && (
                    <button onClick={() => setReleaseTarget(l)} disabled={locked} title={locked ? lockReason : 'Release back to Admin'} className={`${iconBtn} hover:bg-[#FEF3F2] text-[#D92D20] hover:border-[#FDA29B]`}><LogOut className="w-4 h-4" /></button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <LeadPagination page={page} totalPages={pageCount(total)} count={total} onChange={setPage} />
        </>
      )}

      {releaseTarget && (
        <ReleaseModal lead={releaseTarget} onClose={() => setReleaseTarget(null)} onDone={() => { setReleaseTarget(null); load(); }} showToast={showToast} />
      )}
      {detailLead && (
        <DetailModal
          lead={detailLead}
          onClose={() => setDetailLead(null)}
          onChanged={load}
          onChangeStatus={(lead) => { setDetailLead(null); setStatusLead(lead); }}
          showToast={showToast}
          readOnly={isViewingAsSales}
        />
      )}
      {statusLead && (
        <LeadStatusModal lead={statusLead} onClose={() => setStatusLead(null)} onDone={() => { setStatusLead(null); load(); }} showToast={showToast} />
      )}
      {formModal && (
        <LeadFormModal lead={formModal.lead} onClose={() => setFormModal(null)} onSaved={() => { setFormModal(null); load(); }} showToast={showToast} />
      )}
    </div>
  );
};
