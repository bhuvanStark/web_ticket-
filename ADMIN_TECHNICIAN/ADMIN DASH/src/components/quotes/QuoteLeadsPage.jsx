// Quote Leads — the customers/projects Quote Managers build quotations for.
// Separate from Sales leads; nothing here reads or writes the Sales pipeline.
// Shared by every Quote Manager: a lead is unique on customer + project and
// holds one quotation (revisions are versions of it).
import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Search, Pencil, Trash2, X, Users, Building2, MapPin, FilePlus2, CheckCircle2, AlertTriangle, FileText, Loader2, ArrowRight } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { fetchQuoteLeads, createQuoteLead, updateQuoteLead, deleteQuoteLead, createQuote, fetchAccountManagers } from '../../services/quoteApiService';
import { formatDate, QUOTE_STATUS } from './quoteShared';

const LeadFormModal = ({ lead, onClose, onSaved, onShowExisting, showToast }) => {
  const isEdit = Boolean(lead?.id);
  const [form, setForm] = useState({
    customer: lead?.customer || '', project: lead?.project || '', site_location: lead?.site_location || '',
    contact_person: lead?.contact_person || '', account_manager_id: lead?.account_manager_id || ''
  });
  const [managers, setManagers] = useState([]);
  useEffect(() => { fetchAccountManagers().then(setManagers).catch(() => {}); }, []);
  const manager = managers.find((m) => m.id === form.account_manager_id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [existingId, setExistingId] = useState(null);
  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setError(''); setExistingId(null); };

  const save = async (e) => {
    e.preventDefault();
    if (!form.customer.trim()) return setError('Customer is required');
    if (!form.project.trim()) return setError('Project is required');
    setBusy(true);
    try {
      const saved = isEdit ? await updateQuoteLead(lead.id, form) : await createQuoteLead(form);
      showToast(isEdit ? 'Lead updated' : 'Lead added', 'success');
      onSaved(saved);
    } catch (err) {
      setError(err.message);
      setExistingId(err.details?.code === 'DUPLICATE_LEAD' ? err.details.lead_id : null);
    } finally {
      setBusy(false);
    }
  };

  const input = 'w-full px-3 py-2 border border-[#E4E7EC] rounded-lg text-sm text-[#172033] outline-none focus:border-[#004898] focus:ring-2 focus:ring-[#004898]/10';
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-[#E4E7EC] overflow-hidden">
        <div className="p-5 border-b border-[#E4E7EC] bg-[#F8FAFC] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#004898] text-white flex items-center justify-center"><Users className="w-5 h-5" /></div>
            <h3 className="font-extrabold text-lg text-[#172033]">{isEdit ? 'Edit Lead' : 'New Quote Lead'}</h3>
          </div>
          <button onClick={onClose} disabled={busy} className="p-1 text-[#667085] hover:text-[#172033] rounded-lg hover:bg-white"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={save} className="p-6 space-y-4">
          <div>
            <label className="form-label">Customer *</label>
            <input autoFocus value={form.customer} onChange={set('customer')} placeholder="e.g. Internexus-Reliance" className={`${input} font-bold`} />
          </div>
          <div>
            <label className="form-label">Project *</label>
            <input value={form.project} onChange={set('project')} placeholder="e.g. Audio-Visual Solutions – Investment Summary" className={input} />
          </div>
          <div>
            <label className="form-label">Location / Site</label>
            <input value={form.site_location} onChange={set('site_location')} placeholder="e.g. Bengaluru – Whitefield campus" className={input} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="form-label">Contact Person</label>
              <input value={form.contact_person} onChange={set('contact_person')} placeholder="Customer-side contact" className={input} />
            </div>
            <div>
              <label className="form-label">Account Manager</label>
              <select value={form.account_manager_id} onChange={set('account_manager_id')} className={`${input} bg-white`}>
                <option value="">Not assigned</option>
                {/* Keeps a removed manager visible on an existing lead until it is changed. */}
                {form.account_manager_id && !manager && lead?.account_manager_name && <option value={form.account_manager_id}>{lead.account_manager_name}</option>}
                {managers.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
              </select>
              {form.account_manager_id && (
                <p className="text-[11px] text-[#667085] mt-1">Phone: {(manager ? manager.phone : lead?.account_manager_phone) || '—'}</p>
              )}
            </div>
          </div>
          {error && (
            <div className="text-xs font-semibold text-[#DC2626] flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span className="flex-1">{error}</span>
              {existingId && (
                <button type="button" onClick={() => onShowExisting(existingId)} className="shrink-0 text-[#004898] font-bold hover:underline inline-flex items-center gap-1">
                  Show it<ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
          <div className="pt-3 border-t border-[#E4E7EC] flex justify-end gap-3">
            <button type="button" onClick={onClose} disabled={busy} className="btn btn-secondary">Cancel</button>
            <button type="submit" disabled={busy} className="btn btn-primary disabled:opacity-70"><CheckCircle2 className="w-4 h-4" />{busy ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Lead'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const QuoteLeadsPage = ({ readOnly, onOpenQuote }) => {
  const { showToast } = useApp();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [creatingFor, setCreatingFor] = useState(null);
  const [highlight, setHighlight] = useState(null);

  const load = useCallback(async () => {
    try { setLeads(await fetchQuoteLeads()); } catch (err) { showToast(err.message, 'error'); } finally { setLoading(false); }
  }, [showToast]);
  useEffect(() => { load(); }, [load]);

  const term = search.trim().toLowerCase();
  const filtered = highlight
    ? leads.filter((l) => l.id === highlight)
    : leads.filter((l) => !term || [l.customer, l.project, l.site_location].some((v) => (v || '').toLowerCase().includes(term)));
  const totalQuotes = leads.reduce((n, l) => n + l.quote_count, 0);
  const totalWon = leads.reduce((n, l) => n + l.won_count, 0);

  const newQuote = async (lead) => {
    setCreatingFor(lead.id);
    try {
      const { id } = await createQuote(lead.id);
      showToast(`Quotation V1 created for ${lead.customer}`, 'success');
      onOpenQuote(id);
    } catch (err) {
      setCreatingFor(null);
      // Someone else started it a moment ago: open theirs.
      if (err.details?.code === 'QUOTE_EXISTS' && err.details.quote_id) {
        showToast(err.message, 'info');
        onOpenQuote(err.details.quote_id);
      } else {
        showToast(err.message, 'error');
        load();
      }
    }
  };

  const remove = async (lead) => {
    if (!window.confirm(`Delete the lead "${lead.customer}"?`)) return;
    try {
      await deleteQuoteLead(lead.id);
      showToast('Lead deleted', 'success');
      load();
    } catch (err) { showToast(err.message, 'error'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-[#172033] tracking-tight">Quote Leads</h2>
          <p className="text-xs md:text-sm text-[#667085] mt-0.5">Customers and projects you prepare quotations for.</p>
        </div>
        {!readOnly && (
          <button onClick={() => setModal({})} className="btn btn-primary shadow-sm text-xs font-bold"><Plus className="w-4 h-4" />New Lead</button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          ['Leads', leads.length, Users, 'text-[#004898] bg-[#EFF5FC]'],
          ['Quotations', totalQuotes, FileText, 'text-[#4F46E5] bg-[#EEF2FF]'],
          ['Won', totalWon, CheckCircle2, 'text-[#027A48] bg-[#ECFDF3]']
        ].map(([label, value, Icon, tone]) => (
          <div key={label} className="card bg-white border border-[#E4E7EC] shadow-xs p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${tone}`}><Icon className="w-5 h-5" /></div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#667085]">{label}</p>
              <p className="text-xl font-extrabold text-[#172033] tabular-nums">{value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="card bg-white border border-[#E4E7EC] shadow-xs overflow-hidden">
        <div className="p-4 border-b border-[#F2F4F7]">
          <div className="relative w-full sm:w-96">
            <Search className="w-4 h-4 text-[#98A2B3] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input value={search} onChange={(e) => { setSearch(e.target.value); setHighlight(null); }} placeholder="Search customer, project or site…"
              className="w-full pl-9 pr-3 py-2 text-xs border border-[#E4E7EC] rounded-lg outline-none focus:border-[#004898]" />
          </div>
          {highlight && (
            <button onClick={() => setHighlight(null)} className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold text-[#004898] bg-[#EFF5FC] px-2.5 py-1 rounded-full">
              Showing the existing lead<X className="w-3 h-3" />
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-[#F8FAFC] text-[#667085] uppercase font-bold text-[10px] tracking-wider border-b border-[#E4E7EC]">
              <tr>
                <th className="px-5 py-3">Customer</th>
                <th className="px-5 py-3">Project</th>
                <th className="px-5 py-3">Location / Site</th>
                <th className="px-5 py-3">Quotations</th>
                <th className="px-5 py-3">Last activity</th>
                <th className="px-5 py-3 text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F2F4F7]">
              {loading ? (
                [...Array(4)].map((_, i) => <tr key={i}><td colSpan={6} className="px-5 py-4"><div className="h-4 bg-[#F2F4F7] rounded animate-pulse" /></td></tr>)
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="py-16 text-center">
                  <Building2 className="w-10 h-10 text-[#D0D5DD] mx-auto" />
                  <p className="text-sm font-bold text-[#172033] mt-3">{term ? 'No leads match your search' : 'No quote leads yet'}</p>
                  {!readOnly && !term && <button onClick={() => setModal({})} className="btn btn-primary text-xs mt-4"><Plus className="w-4 h-4" />Add your first lead</button>}
                </td></tr>
              ) : filtered.map((lead) => (
                <tr key={lead.id} className="group hover:bg-[#F8FAFC] transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-[#EFF5FC] text-[#004898] font-extrabold flex items-center justify-center shrink-0">{lead.customer.slice(0, 1).toUpperCase()}</div>
                      <div className="min-w-0">
                        <div className="font-extrabold text-[13px] text-[#172033] truncate">{lead.customer}</div>
                        {lead.created_by_name && <div className="text-[11px] text-[#98A2B3]">by {lead.created_by_name}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-[#475467] font-medium max-w-xs">{lead.project || '—'}</td>
                  <td className="px-5 py-3.5 text-[#475467]">
                    {lead.site_location ? <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-[#98A2B3]" />{lead.site_location}</span> : '—'}
                  </td>
                  <td className="px-5 py-3.5">
                    {lead.quote_id ? (
                      <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border ${QUOTE_STATUS[lead.quote_status].cls}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${QUOTE_STATUS[lead.quote_status].dot}`} />{QUOTE_STATUS[lead.quote_status].label}
                      </span>
                    ) : <span className="text-[#98A2B3]">None yet</span>}
                  </td>
                  <td className="px-5 py-3.5 text-[#667085]">{formatDate(lead.last_quote_at || lead.updated_at)}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-1.5">
                      {lead.quote_id ? (
                        <button onClick={() => onOpenQuote(lead.quote_id)}
                          className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#004898] bg-[#EFF5FC] hover:bg-[#DCEBFB] px-3 py-1.5 rounded-lg">
                          <FileText className="w-3.5 h-3.5" />Open Quotation
                        </button>
                      ) : !readOnly && (
                        <button onClick={() => newQuote(lead)} disabled={creatingFor === lead.id}
                          className="inline-flex items-center gap-1.5 text-[11px] font-bold text-white bg-[#004898] hover:bg-[#003774] px-3 py-1.5 rounded-lg shadow-xs disabled:opacity-70">
                          {creatingFor === lead.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FilePlus2 className="w-3.5 h-3.5" />}New Quotation
                        </button>
                      )}
                      {!readOnly && (<>
                        <button onClick={() => setModal({ lead })} title="Edit" className="p-1.5 rounded-lg text-[#475467] hover:bg-white hover:text-[#004898] border border-transparent hover:border-[#E4E7EC]"><Pencil className="w-3.5 h-3.5" /></button>
                        {!lead.quote_id && <button onClick={() => remove(lead)} title="Delete" className="p-1.5 rounded-lg text-[#475467] hover:bg-white hover:text-[#D92D20] border border-transparent hover:border-[#E4E7EC]"><Trash2 className="w-3.5 h-3.5" /></button>}
                      </>)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <LeadFormModal lead={modal.lead} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} showToast={showToast}
          onShowExisting={(id) => { setModal(null); setSearch(''); setHighlight(id); load(); }} />
      )}
    </div>
  );
};
