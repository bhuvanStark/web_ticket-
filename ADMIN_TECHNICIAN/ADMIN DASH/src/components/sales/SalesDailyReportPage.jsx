// Sales Daily Report (pipeline V2) — the Sales employee's own page. One
// report per day (India time, set by the server); only today's can be
// edited. A report lists today's work: existing leads (picked from the
// salesperson's own leads, shown with their current status + battery
// timer) and potential leads (company name typed in, no lead record), each
// with a comment. Isolated like MyLeadsPage: own fetches, nothing global.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Plus, Pencil, Download, X, Search, Sparkles, Trash2, ChevronDown, ChevronUp, FileText } from 'lucide-react';
import { fetchMine } from '../../services/leadsApiService';
import { fetchMyReports, createTodayReport, updateMyReport, fetchViewAsReports } from '../../services/salesDailyReportApiService';
import { generateSalesDailyReportPDF, formatReportDate } from '../../utils/salesDailyReportPdf';
import { LeadTimerBattery } from './LeadTimerBattery';
import { STATUS_LABEL, STATUS_COLOR } from './leadPipeline';

// Read-only list of a report's entries — shared with the Admin tab. Status
// and timer are frozen as of the report's last save.
export const ReportItemsList = ({ items }) => (
  <div className="divide-y divide-[#F2F4F7]">
    {items.map((item) => (
      <div key={item.id} className="py-3 flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4">
        <div className="sm:w-56 shrink-0 min-w-0">
          <div className="text-[13px] font-extrabold text-[#172033] truncate">{item.company}</div>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            {item.is_potential ? (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#F4F3FF] text-[#5925DC] inline-flex items-center gap-1"><Sparkles className="w-3 h-3" /> Potential</span>
            ) : item.lead ? (
              <>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${STATUS_COLOR[item.lead.status]}`}>{STATUS_LABEL[item.lead.status]}</span>
                <LeadTimerBattery lead={item.lead} now={Date.parse(item.lead.as_of)} />
              </>
            ) : (
              <span className="text-[11px] text-[#98A2B3] italic">Lead removed</span>
            )}
          </div>
        </div>
        <p className="text-xs text-[#344054] whitespace-pre-wrap flex-1">{item.comment}</p>
      </div>
    ))}
  </div>
);

let keySeq = 0;
const nextKey = () => `e${(keySeq += 1)}`;

const ReportFormModal = ({ report, onClose, onSaved, showToast }) => {
  const isEdit = !!report;
  // A line whose lead has since been deleted (lead_id null) is kept as a
  // potential-lead line with its company snapshot, so the report can still
  // be saved without losing it.
  const [entries, setEntries] = useState(() => (report?.items || []).map((i) => {
    const orphan = !i.is_potential && !i.lead_id;
    return {
      key: nextKey(), is_potential: i.is_potential || orphan, lead_id: orphan ? null : i.lead_id,
      company: i.company, comment: i.comment, lead: orphan ? null : i.lead
    };
  }));
  const [leads, setLeads] = useState([]);
  const [leadsError, setLeadsError] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);

  // Own leads (open first, then closed — a lead closed today can still be
  // reported), searched on the server so every lead is reachable.
  useEffect(() => {
    if (!pickerOpen) return undefined;
    let cancelled = false;
    const t = setTimeout(() => {
      Promise.all([
        fetchMine({ scope: 'active', q: query.trim() || undefined, limit: 30 }),
        fetchMine({ scope: 'closed', q: query.trim() || undefined, limit: 20 })
      ])
        .then(([open, closed]) => { if (!cancelled) { setLeads([...open.rows, ...closed.rows]); setLeadsError(null); } })
        .catch((err) => { if (!cancelled) setLeadsError(err.message); });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [pickerOpen, query]);

  const taken = new Set(entries.filter((e) => !e.is_potential).map((e) => e.lead_id));
  const options = leads.filter((l) => !taken.has(l.id));

  const update = (key, patch) => setEntries((list) => list.map((e) => (e.key === key ? { ...e, ...patch } : e)));
  const remove = (key) => setEntries((list) => list.filter((e) => e.key !== key));
  const addLead = (lead) => {
    setEntries((list) => [...list, { key: nextKey(), is_potential: false, lead_id: lead.id, company: lead.company, comment: '', lead }]);
    setPickerOpen(false);
    setQuery('');
  };
  const addPotential = () => setEntries((list) => [...list, { key: nextKey(), is_potential: true, lead_id: null, company: '', comment: '', lead: null }]);

  const problem = !entries.length ? 'Add at least one lead or potential lead.'
    : entries.some((e) => e.is_potential && !e.company.trim()) ? 'Enter the company name for each potential lead.'
    : entries.some((e) => !e.comment.trim()) ? 'Add a comment about today’s work for every entry.' : null;

  const submit = async (e) => {
    e.preventDefault();
    if (saving || problem) return;
    setSaving(true);
    try {
      const items = entries.map((en) => (en.is_potential
        ? { is_potential: true, company: en.company, comment: en.comment }
        : { lead_id: en.lead_id, comment: en.comment }));
      if (isEdit) await updateMyReport(report.id, items); else await createTodayReport(items);
      showToast(isEdit ? 'Report updated' : 'Report saved', 'success');
      onSaved();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl max-h-[92vh] rounded-xl bg-white shadow-xl border border-[#E4E7EC] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-[#E4E7EC] shrink-0">
          <div>
            <h3 className="text-lg font-bold text-[#172033]">{isEdit ? 'Edit Today’s Report' : 'Add Report'}</h3>
            <p className="text-xs text-[#667085]">{isEdit ? formatReportDate(report.report_date) : 'Today'} · one report per day</p>
          </div>
          <button onClick={onClose} className="text-[#667085] hover:text-[#172033]"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={submit} className="flex flex-col min-h-0 flex-1">
          <div className="p-5 space-y-3 overflow-y-auto flex-1">
            {entries.length === 0 && (
              <div className="rounded-xl border border-dashed border-[#D0D5DD] p-6 text-center text-sm text-[#667085]">
                Add the leads you worked on today, or a potential lead you found.
              </div>
            )}
            {entries.map((en, i) => (
              <div key={en.key} className={`rounded-xl border p-3 space-y-2 ${en.is_potential ? 'border-[#D9D6FE] bg-[#FAFAFF]' : 'border-[#E4E7EC] bg-white'}`}>
                <div className="flex items-start gap-2">
                  <span className="text-[11px] font-bold text-[#98A2B3] pt-1.5 w-4 shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    {en.is_potential ? (
                      <div>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#F4F3FF] text-[#5925DC] inline-flex items-center gap-1 mb-1.5"><Sparkles className="w-3 h-3" /> Potential lead</span>
                        <input value={en.company} onChange={(e) => update(en.key, { company: e.target.value })} maxLength={200} placeholder="Company name *" className="form-input text-sm" />
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-extrabold text-[#172033] truncate">{en.company}</span>
                        {en.lead && <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${STATUS_COLOR[en.lead.status]}`}>{STATUS_LABEL[en.lead.status]}</span>}
                        {en.lead && <LeadTimerBattery lead={en.lead} />}
                      </div>
                    )}
                  </div>
                  <button type="button" onClick={() => remove(en.key)} title="Remove" className="p-1.5 rounded-lg text-[#98A2B3] hover:text-[#D92D20] hover:bg-[#FEF3F2]"><Trash2 className="w-4 h-4" /></button>
                </div>
                <textarea value={en.comment} onChange={(e) => update(en.key, { comment: e.target.value })} rows={2} maxLength={2000} placeholder="What did you do on this today? *" className="form-input text-sm" />
              </div>
            ))}

            {pickerOpen && (
              <div className="rounded-xl border border-[#B3D1F2] bg-white shadow-sm">
                <div className="p-2 border-b border-[#E4E7EC] relative">
                  <Search className="w-4 h-4 text-[#98A2B3] absolute left-4 top-1/2 -translate-y-1/2" />
                  <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your leads…" className="w-full pl-8 pr-8 py-2 text-sm outline-none" />
                  <button type="button" onClick={() => { setPickerOpen(false); setQuery(''); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#98A2B3] hover:text-[#172033]"><X className="w-4 h-4" /></button>
                </div>
                <div className="max-h-56 overflow-y-auto divide-y divide-[#F2F4F7]">
                  {leadsError && <p className="p-3 text-xs text-[#B42318]">{leadsError}</p>}
                  {!leadsError && options.length === 0 && <p className="p-3 text-xs text-[#98A2B3] text-center">{query.trim() ? 'No matching leads.' : leads.length ? 'All your recent leads are already in the report — search for others.' : 'You have no leads yet.'}</p>}
                  {options.map((l) => (
                    <button type="button" key={l.id} onClick={() => addLead(l)} className="w-full px-3 py-2 flex items-center justify-between gap-3 text-left hover:bg-[#F8FAFC]">
                      <span className="min-w-0">
                        <span className="block text-sm font-bold text-[#172033] truncate">{l.company}</span>
                        <span className="block text-[11px] text-[#667085] truncate">{[l.person_to_contact, l.phone].filter(Boolean).join(' · ')}</span>
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_COLOR[l.status]}`}>{STATUS_LABEL[l.status]}</span>
                        <LeadTimerBattery lead={l} compact />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setPickerOpen(true)} className="px-3 py-2 text-xs font-bold rounded-lg border border-[#B3D1F2] bg-[#EFF5FC] text-[#004898] hover:bg-[#DCEBFA] inline-flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Existing Lead
              </button>
              <button type="button" onClick={addPotential} className="px-3 py-2 text-xs font-bold rounded-lg border border-[#D9D6FE] bg-[#F4F3FF] text-[#5925DC] hover:bg-[#EBE9FE] inline-flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Potential Lead
              </button>
            </div>
          </div>
          <div className="p-4 border-t border-[#E4E7EC] flex items-center justify-between gap-3 shrink-0">
            <span className="text-[11px] text-[#B54708] min-h-[1em]">{entries.length > 0 && problem}</span>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold rounded-lg border border-[#E4E7EC] bg-white text-[#344054] hover:bg-[#F8FAFC]">Cancel</button>
              <button type="submit" disabled={saving || !!problem} className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#004898] text-white hover:bg-[#00346E] disabled:opacity-50">
                {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Save Report'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

// One saved report as a row, expandable to show its entries.
export const ReportRow = ({ report, salesName, showSalesName = false, onEdit }) => {
  const [open, setOpen] = useState(false);
  const leadsCount = report.items.filter((i) => !i.is_potential).length;
  const potentialCount = report.items.length - leadsCount;
  return (
    <div className="border-b border-[#F2F4F7] last:border-b-0">
      <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
        <button onClick={() => setOpen((o) => !o)} className="flex-1 min-w-0 flex items-center gap-3 text-left">
          <span className="w-9 h-9 rounded-lg bg-[#EFF5FC] text-[#004898] flex items-center justify-center shrink-0"><FileText className="w-4 h-4" /></span>
          <span className="min-w-0">
            <span className="block text-[13px] font-extrabold text-[#172033]">
              {formatReportDate(report.report_date)}
              {report.editable && <span className="ml-2 px-1.5 py-0.5 rounded-full bg-[#ECFDF3] text-[#027A48] text-[10px] font-bold align-middle">Today</span>}
            </span>
            <span className="block text-[11px] text-[#667085] truncate">
              {showSalesName && <strong className="text-[#344054]">{report.sales_name || salesName} · </strong>}
              {leadsCount} lead{leadsCount === 1 ? '' : 's'}{potentialCount ? ` · ${potentialCount} potential` : ''} · updated {new Date(report.updated_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </span>
          {open ? <ChevronUp className="w-4 h-4 text-[#98A2B3] shrink-0" /> : <ChevronDown className="w-4 h-4 text-[#98A2B3] shrink-0" />}
        </button>
        <div className="flex items-center gap-2 shrink-0">
          {onEdit && report.editable && (
            <button onClick={() => onEdit(report)} className="px-3 py-1.5 rounded-lg border border-[#E4E7EC] bg-white text-[#172033] text-[11px] font-bold hover:bg-[#F8FAFC] inline-flex items-center gap-1"><Pencil className="w-3.5 h-3.5" /> Edit</button>
          )}
          <button onClick={() => generateSalesDailyReportPDF(report, report.sales_name || salesName)} className="px-3 py-1.5 rounded-lg border border-[#E4E7EC] bg-white text-[#004898] text-[11px] font-bold hover:bg-[#EFF5FC] hover:border-[#B3D1F2] inline-flex items-center gap-1"><Download className="w-3.5 h-3.5" /> Download PDF</button>
        </div>
      </div>
      {open && <div className="px-4 pb-3 sm:pl-16"><ReportItemsList items={report.items} /></div>}
    </div>
  );
};

export const SalesDailyReportPage = () => {
  const { currentUser, showToast, isViewingAsSales } = useApp();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // { report? } or null

  const load = useCallback(async () => {
    try {
      const data = isViewingAsSales ? await fetchViewAsReports(currentUser.id) : await fetchMyReports();
      setReports(Array.isArray(data) ? data : []);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [isViewingAsSales, currentUser?.id, showToast]);

  useEffect(() => { load(); }, [load]);

  const today = useMemo(() => reports.find((r) => r.editable), [reports]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold text-[#172033] tracking-tight">Daily Report</h2>
          <p className="text-xs md:text-sm text-[#667085] mt-0.5">One report per day — the leads you worked on and any potential leads.</p>
        </div>
        {!isViewingAsSales && (
          today ? (
            <button onClick={() => setModal({ report: today })} className="btn btn-primary text-xs font-bold self-start sm:self-auto">
              <Pencil className="w-4 h-4" /> Edit Today’s Report
            </button>
          ) : (
            <button onClick={() => setModal({})} className="btn btn-primary text-xs font-bold self-start sm:self-auto">
              <Plus className="w-4 h-4" /> Add Report
            </button>
          )
        )}
      </div>

      {loading ? (
        <div className="text-center text-sm text-[#667085] py-12">Loading…</div>
      ) : (
        <div className="card overflow-hidden border border-[#E4E7EC] shadow-xs">
          {reports.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#667085]">No reports yet{isViewingAsSales ? '.' : ' — add today’s report to get started.'}</div>
          ) : reports.map((r) => (
            <ReportRow key={r.id} report={r} salesName={currentUser?.name} onEdit={isViewingAsSales ? null : (report) => setModal({ report })} />
          ))}
        </div>
      )}

      {modal && (
        <ReportFormModal report={modal.report} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} showToast={showToast} />
      )}
    </div>
  );
};
