// TaskPro Sales Module V1 (TaskPro_Sales_RBAC_plan.md §3-9) — the Sales
// employee's own Leads page: the common pool (Accept) and their own leads
// (add/edit, quick status, remarks, follow-ups, release, history). Mirrors SalesDashboard.jsx's
// isolation — reads nothing from AppContext except currentUser/showToast,
// own fetch-on-mount, no global state.
import React, { useEffect, useState, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { Search, LogOut, History as HistoryIcon, X, CheckCircle2, Plus, Pencil, ListChecks } from 'lucide-react';
import {
  fetchPool, fetchMine, acceptLead, releaseLead, createMyLead, updateMyLead,
  fetchLead, fetchLeadHistory, updateLeadStatus, addFollowUp, subscribeToLeadEvents,
  fetchViewAsPool, fetchViewAsMine
} from '../../services/leadsApiService';
import { LeadStatusModal, LeadRemarks } from './LeadQuickActions';

// Dead is deliberately excluded — plan §6 "Only an Admin explicitly marks a
// lead Dead."
const STATUS_OPTIONS = ['new', 'meeting', 'proposal', 'follow_up', 'won', 'lost'];
const STATUS_LABEL = { new: 'New', meeting: 'Meeting', proposal: 'Proposal', follow_up: 'Follow-up', won: 'Won', lost: 'Lost', dead: 'Dead' };
const STATUS_COLOR = {
  new: 'bg-[#EFF5FC] text-[#004898]', meeting: 'bg-[#FFFAEB] text-[#B54708]', proposal: 'bg-[#F4F3FF] text-[#5925DC]',
  follow_up: 'bg-[#ECFDF3] text-[#027A48]', won: 'bg-[#ECFDF3] text-[#027A48]', lost: 'bg-[#FEF3F2] text-[#B42318]', dead: 'bg-[#F2F4F7] text-[#475467]'
};
const money = (v) => (v == null ? '—' : `₹${Number(v).toLocaleString('en-IN')}`);
// Sales can't edit or change the status of a closed lead (backend-enforced).
const CLOSED = ['won', 'lost', 'dead'];

// Add (lead = undefined) or edit one of the Sales employee's own open leads.
// A new lead is assigned to its creator by the backend — never the pool.
const LeadFormModal = ({ lead, onClose, onSaved, showToast }) => {
  const isEdit = !!lead;
  const [company, setCompany] = useState(lead?.company || '');
  const [personToContact, setPersonToContact] = useState(lead?.person_to_contact || '');
  const [email, setEmail] = useState(lead?.email || '');
  const [phone, setPhone] = useState(lead?.phone || '');
  const [valueEstimate, setValueEstimate] = useState(lead?.value_estimate ?? '');
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const payload = {
        company, person_to_contact: personToContact || null, email: email || null,
        phone, value_estimate: valueEstimate === '' ? null : Number(valueEstimate)
      };
      if (isEdit) await updateMyLead(lead.id, payload);
      else await createMyLead({ ...payload, remarks: remarks || null });
      showToast(isEdit ? 'Lead updated' : 'Lead added to My Leads', 'success');
      onSaved();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
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
          <div>
            <label className="block text-xs font-bold text-[#344054] mb-1">Value Estimate (₹)</label>
            <input type="number" min="0" step="any" value={valueEstimate} onChange={(e) => setValueEstimate(e.target.value)} placeholder="Can be added later" className="form-input text-sm" />
          </div>
          {!isEdit && (
            <div>
              <label className="block text-xs font-bold text-[#344054] mb-1">Remarks</label>
              <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} maxLength={5000} className="form-input text-sm" />
            </div>
          )}
          <p className="text-[11px] text-[#667085]">
            {isEdit ? '' : 'This lead will be assigned to you. '}All fields, including value, must be filled before the lead can be marked Won.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold rounded-lg border border-[#E4E7EC] bg-white text-[#344054] hover:bg-[#F8FAFC]">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#004898] text-white hover:bg-[#00346E] disabled:opacity-60">
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Lead'}
            </button>
          </div>
        </form>
      </div>
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
      showToast('Lead released back to the pool', 'success');
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
          <p className="text-sm text-[#667085]">Release <span className="font-semibold text-[#172033]">{lead.company}</span> back to the common pool. A reason is required.</p>
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
// `initialLead` is the table row; the popup re-fetches the lead so remarks
// and other fields always show the latest saved values.
const DetailModal = ({ lead: initialLead, onClose, onChanged, showToast, readOnly = false }) => {
  const [lead, setLead] = useState(initialLead);
  const [history, setHistory] = useState([]);
  const [status, setStatus] = useState(initialLead.status);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [fresh, events] = await Promise.all([fetchLead(initialLead.id), fetchLeadHistory(initialLead.id)]);
      if (fresh) { setLead(fresh); setStatus(fresh.status); }
      setHistory(events);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }, [initialLead.id, showToast]);

  useEffect(() => { load(); }, [load]);

  const applyStatus = async () => {
    if (!status || status === lead.status || busy) return;
    setBusy(true);
    try {
      await updateLeadStatus(lead.id, status);
      showToast('Status updated', 'success');
      await load();
      onChanged();
    } catch (err) {
      showToast(err.message, 'error');
      setStatus(lead.status);
    } finally {
      setBusy(false);
    }
  };

  const submitFollowUp = async (e) => {
    e.preventDefault();
    if (!note.trim() || busy) return;
    setBusy(true);
    try {
      await addFollowUp(lead.id, note.trim());
      setNote('');
      showToast('Follow-up added', 'success');
      await load();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] rounded-xl bg-white shadow-xl border border-[#E4E7EC] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-[#E4E7EC] shrink-0">
          <h3 className="text-lg font-bold text-[#172033]">{lead.company}</h3>
          <button onClick={onClose} className="text-[#667085] hover:text-[#172033]"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 overflow-y-auto space-y-5">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-[#667085]">Phone</span><div className="font-semibold text-[#172033]">{lead.phone}</div></div>
            <div><span className="text-[#667085]">Contact</span><div className="font-semibold text-[#172033]">{lead.person_to_contact || '—'}</div></div>
            <div><span className="text-[#667085]">Email</span><div className="font-semibold text-[#172033]">{lead.email || '—'}</div></div>
            <div><span className="text-[#667085]">Value Estimate</span><div className="font-semibold text-[#172033]">{money(lead.value_estimate)}</div></div>
          </div>

          <LeadRemarks lead={lead} readOnly={readOnly} onSaved={() => { load(); onChanged(); }} showToast={showToast} />

          {!readOnly && (<>
          <div className="flex items-center gap-2">
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="form-input text-sm flex-1">
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
            <button onClick={applyStatus} disabled={busy || status === lead.status} className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#004898] text-white hover:bg-[#00346E] disabled:opacity-50 whitespace-nowrap">
              Update
            </button>
          </div>

          <form onSubmit={submitFollowUp} className="flex items-center gap-2">
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a follow-up note…" className="form-input text-sm flex-1" />
            <button type="submit" disabled={busy || !note.trim()} className="px-4 py-2 text-sm font-semibold rounded-lg border border-[#E4E7EC] bg-white text-[#344054] hover:bg-[#F8FAFC] disabled:opacity-50 whitespace-nowrap">Add</button>
          </form>
          </>)}

          <div>
            <h4 className="text-xs font-bold text-[#667085] uppercase tracking-wider mb-2">History</h4>
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {history.map((h) => (
                <div key={h.id} className="text-xs border-l-2 border-[#E4E7EC] pl-3 py-1">
                  <div className="font-semibold text-[#172033]">{h.event_type.replace(/_/g, ' ')}</div>
                  {h.details?.note && <div className="text-[#667085]">{h.details.note}</div>}
                  {h.event_type === 'remarks_updated' && <div className="text-[#667085] whitespace-pre-wrap">{h.details?.remarks || 'Remarks cleared'}</div>}
                  {h.details?.from && h.details?.to && <div className="text-[#667085]">{h.details.from} → {h.details.to}</div>}
                  <div className="text-[#98A2B3]">{new Date(h.created_at).toLocaleString()}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const MyLeadsPage = () => {
  const { currentUser, showToast, isViewingAsSales } = useApp();
  const [tab, setTab] = useState('mine');
  const [pool, setPool] = useState([]);
  const [mine, setMine] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [acceptingId, setAcceptingId] = useState(null);
  const [releaseTarget, setReleaseTarget] = useState(null);
  const [detailLead, setDetailLead] = useState(null);
  const [statusLead, setStatusLead] = useState(null);
  const [formModal, setFormModal] = useState(null); // { lead? } or null

  const load = useCallback(async () => {
    try {
      // Super Admin "View as": same data via the read-only view-as routes
      // (the admin JWT can't call the Sales-only /pool and /mine).
      const [p, m] = isViewingAsSales
        ? await Promise.all([fetchViewAsPool(currentUser.id), fetchViewAsMine(currentUser.id)])
        : await Promise.all([fetchPool(), fetchMine()]);
      setPool(Array.isArray(p) ? p : []);
      setMine(Array.isArray(m) ? m : []);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast, isViewingAsSales, currentUser?.id]);

  useEffect(() => { load(); }, [load]);

  // Realtime (Phase 7) — so a lead someone else just claimed disappears from
  // the pool quickly, plus a poll fallback per §5.
  useEffect(() => {
    const source = subscribeToLeadEvents(() => load());
    const poll = setInterval(load, 15000);
    return () => { source?.close(); clearInterval(poll); };
  }, [load]);

  const handleAccept = async (lead) => {
    if (acceptingId) return;
    setAcceptingId(lead.id);
    try {
      await acceptLead(lead.id);
      showToast(`You accepted ${lead.company}`, 'success');
      load();
    } catch (err) {
      // §5: the exact message when someone else won the race.
      showToast(err.message, 'error');
      load();
    } finally {
      setAcceptingId(null);
    }
  };

  const list = tab === 'pool' ? pool : mine;
  const filtered = list.filter((l) => (l.company || '').toLowerCase().includes(search.toLowerCase()) || (l.phone || '').includes(search));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold text-[#172033] tracking-tight">My Leads</h2>
          <p className="text-xs md:text-sm text-[#667085] mt-0.5">Welcome back, <strong className="text-[#004898]">{currentUser.name}</strong>.</p>
        </div>
        {!isViewingAsSales && (
          <button onClick={() => setFormModal({})} className="btn btn-primary text-xs font-bold self-start sm:self-auto">
            <Plus className="w-4 h-4" /> Add Lead
          </button>
        )}
      </div>

      <div className="flex items-center gap-1 border-b border-[#E4E7EC]">
        {[{ id: 'mine', label: `My Leads (${mine.length})` }, { id: 'pool', label: `Available Pool (${pool.length})` }].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-colors -mb-px ${tab === t.id ? 'border-[#004898] text-[#004898]' : 'border-transparent text-[#667085] hover:text-[#172033]'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="relative w-full sm:w-80">
        <Search className="w-4 h-4 text-[#98A2B3] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search company or phone…" style={{ paddingLeft: '36px' }} className="form-input text-xs" />
      </div>

      {loading ? (
        <div className="text-center text-sm text-[#667085] py-12">Loading…</div>
      ) : (
        <div className="card overflow-hidden border border-[#E4E7EC] shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse bg-white">
              <thead className="bg-[#F8FAFC] text-[#667085] uppercase font-bold text-[10px] tracking-wider border-b border-[#E4E7EC]">
                <tr>
                  <th className="px-6 py-4">Company</th>
                  <th className="px-6 py-4">Phone</th>
                  <th className="px-6 py-4">Value</th>
                  {tab === 'mine' && <th className="px-6 py-4">Status</th>}
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F2F4F7]">
                {filtered.length === 0 ? (
                  <tr><td colSpan={tab === 'mine' ? 5 : 4} className="p-8 text-center text-[#667085]">{tab === 'pool' ? 'No leads available right now.' : 'You have no leads yet — add one or accept one from the pool.'}</td></tr>
                ) : filtered.map((l) => (
                  <tr key={l.id} className="hover:bg-[#F8FAFC] transition-all">
                    <td className="px-6 py-4 align-middle">
                      <div className="font-extrabold text-[13px] text-[#172033]">{l.company}</div>
                      {l.person_to_contact && <div className="text-[11px] text-[#667085]">{l.person_to_contact}</div>}
                    </td>
                    <td className="px-6 py-4 align-middle text-[#475467] font-medium">{l.phone}</td>
                    <td className="px-6 py-4 align-middle text-[#475467] font-medium">{money(l.value_estimate)}</td>
                    {tab === 'mine' && (
                      <td className="px-6 py-4 align-middle">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${STATUS_COLOR[l.status]}`}>{STATUS_LABEL[l.status]}</span>
                      </td>
                    )}
                    <td className="px-6 py-4 align-middle">
                      <div className="flex items-center justify-end gap-2">
                        {isViewingAsSales && tab === 'pool' ? (
                          <span className="text-[11px] text-[#98A2B3] italic">View only</span>
                        ) : tab === 'pool' ? (
                          <button onClick={() => handleAccept(l)} disabled={acceptingId === l.id} className="px-3 py-1.5 rounded-lg bg-[#004898] text-white text-[11px] font-bold hover:bg-[#00346E] disabled:opacity-60 inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> {acceptingId === l.id ? 'Accepting…' : 'Accept'}
                          </button>
                        ) : (
                          <>
                            {!isViewingAsSales && (
                              <button
                                onClick={() => setStatusLead(l)}
                                disabled={CLOSED.includes(l.status)}
                                title={CLOSED.includes(l.status) ? `This lead is ${STATUS_LABEL[l.status]} — only an Admin can change it` : 'Change status'}
                                className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-[#EFF5FC] text-[#004898] border border-[#E4E7EC] hover:border-[#B3D1F2] text-[11px] font-bold inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                              ><ListChecks className="w-3.5 h-3.5" /> Status</button>
                            )}
                            <button onClick={() => setDetailLead(l)} title="Details, remarks, follow-ups & history" className="p-1.5 rounded-lg bg-white hover:bg-[#F8FAFC] text-[#172033] border border-[#E4E7EC]"><HistoryIcon className="w-4 h-4" /></button>
                            {!isViewingAsSales && (
                              <button
                                onClick={() => setFormModal({ lead: l })}
                                disabled={CLOSED.includes(l.status)}
                                title={CLOSED.includes(l.status) ? `${STATUS_LABEL[l.status]} leads can't be edited` : 'Edit lead'}
                                className="p-1.5 rounded-lg bg-white hover:bg-[#F8FAFC] text-[#172033] border border-[#E4E7EC] disabled:opacity-40 disabled:cursor-not-allowed"
                              ><Pencil className="w-4 h-4" /></button>
                            )}
                            {!isViewingAsSales && <button onClick={() => setReleaseTarget(l)} title="Release back to pool" className="p-1.5 rounded-lg bg-white hover:bg-[#FEF3F2] text-[#D92D20] border border-[#E4E7EC] hover:border-[#FDA29B]"><LogOut className="w-4 h-4" /></button>}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {releaseTarget && (
        <ReleaseModal lead={releaseTarget} onClose={() => setReleaseTarget(null)} onDone={() => { setReleaseTarget(null); load(); }} showToast={showToast} />
      )}
      {detailLead && (
        <DetailModal lead={detailLead} onClose={() => setDetailLead(null)} onChanged={load} showToast={showToast} readOnly={isViewingAsSales} />
      )}
      {statusLead && (
        <LeadStatusModal lead={statusLead} statusOptions={STATUS_OPTIONS} onClose={() => setStatusLead(null)} onDone={() => { setStatusLead(null); load(); }} showToast={showToast} />
      )}
      {formModal && (
        <LeadFormModal lead={formModal.lead} onClose={() => setFormModal(null)} onSaved={() => { setFormModal(null); load(); }} showToast={showToast} />
      )}
    </div>
  );
};
