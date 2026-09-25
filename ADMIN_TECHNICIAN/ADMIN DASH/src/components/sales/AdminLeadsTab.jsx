// TaskPro Sales Module V1 (TaskPro_Sales_RBAC_plan.md §3-9) — Admin's Leads
// management: list/filter, create/edit, direct assignment, status/Dead,
// history, and the Excel import wizard (Upload -> Validate -> Preview ->
// Confirm -> Transactional Import, §8). Self-contained (own fetch on mount),
// same pattern SalesRosterTab already uses — Leads never need to live in
// AppContext's global state, nothing else in the app reads them.
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Search, Plus, Pencil, Trash2, UserPlus, History as HistoryIcon, X,
  Upload, AlertTriangle, CheckCircle2, XCircle, FileSpreadsheet
} from 'lucide-react';
import { TableSkeleton } from '../common/SkeletonLoader';
import { fetchSalesInApi } from '../../services/salesApiService';
import {
  fetchLeads, fetchLead, createLead, updateLead, assignLead, deleteLead,
  fetchLeadHistory, updateLeadStatus, addFollowUp,
  validateImport, confirmImport, subscribeToLeadEvents
} from '../../services/leadsApiService';

const STATUS_OPTIONS = ['new', 'meeting', 'proposal', 'follow_up', 'won', 'lost', 'dead'];
const STATUS_LABEL = { new: 'New', meeting: 'Meeting', proposal: 'Proposal', follow_up: 'Follow-up', won: 'Won', lost: 'Lost', dead: 'Dead' };
const STATUS_COLOR = {
  new: 'bg-[#EFF5FC] text-[#004898]',
  meeting: 'bg-[#FFFAEB] text-[#B54708]',
  proposal: 'bg-[#F4F3FF] text-[#5925DC]',
  follow_up: 'bg-[#ECFDF3] text-[#027A48]',
  won: 'bg-[#ECFDF3] text-[#027A48]',
  lost: 'bg-[#FEF3F2] text-[#B42318]',
  dead: 'bg-[#F2F4F7] text-[#475467]'
};

const money = (v) => (v == null ? '—' : `₹${Number(v).toLocaleString('en-IN')}`);

const LeadFormModal = ({ lead, onClose, onSaved, showToast }) => {
  const isEdit = !!lead;
  const [company, setCompany] = useState(lead?.company || '');
  const [personToContact, setPersonToContact] = useState(lead?.person_to_contact || '');
  const [email, setEmail] = useState(lead?.email || '');
  const [phone, setPhone] = useState(lead?.phone || '');
  const [valueEstimate, setValueEstimate] = useState(lead?.value_estimate ?? '');
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
      if (isEdit) await updateLead(lead.id, payload); else await createLead(payload);
      showToast(isEdit ? 'Lead updated' : 'Lead created', 'success');
      onSaved();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl border border-[#E4E7EC]">
        <div className="flex items-center justify-between p-5 border-b border-[#E4E7EC]">
          <h3 className="text-lg font-bold text-[#172033]">{isEdit ? 'Edit Lead' : 'Add Lead'}</h3>
          <button onClick={onClose} className="text-[#667085] hover:text-[#172033]"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3">
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
            <label className="block text-xs font-bold text-[#344054] mb-1">Value Estimate</label>
            <input type="number" min="0" value={valueEstimate} onChange={(e) => setValueEstimate(e.target.value)} className="form-input text-sm" />
          </div>
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

const AssignModal = ({ lead, roster, onClose, onSaved, showToast }) => {
  const [salesId, setSalesId] = useState(lead.assigned_to || '');
  const [saving, setSaving] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!salesId || saving) return;
    setSaving(true);
    try {
      await assignLead(lead.id, salesId);
      showToast('Lead assigned', 'success');
      onSaved();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white shadow-xl border border-[#E4E7EC]">
        <div className="flex items-center justify-between p-5 border-b border-[#E4E7EC]">
          <h3 className="text-lg font-bold text-[#172033]">Assign Lead</h3>
          <button onClick={onClose} className="text-[#667085] hover:text-[#172033]"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3">
          <p className="text-sm text-[#667085]">Assign <span className="font-semibold text-[#172033]">{lead.company}</span> directly to a salesperson.</p>
          <select required value={salesId} onChange={(e) => setSalesId(e.target.value)} className="form-input text-sm">
            <option value="">Select salesperson…</option>
            {roster.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold rounded-lg border border-[#E4E7EC] bg-white text-[#344054] hover:bg-[#F8FAFC]">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#004898] text-white hover:bg-[#00346E] disabled:opacity-60">
              {saving ? 'Assigning…' : 'Assign'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const DetailModal = ({ leadId, roster, onClose, onChanged, showToast }) => {
  const [lead, setLead] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const found = await fetchLead(leadId);
      setLead(found || null);
      setStatus(found?.status || '');
      setHistory(await fetchLeadHistory(leadId));
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [leadId, showToast]);

  useEffect(() => { load(); }, [load]);

  const applyStatus = async () => {
    if (!status || status === lead.status || busy) return;
    setBusy(true);
    try {
      await updateLeadStatus(leadId, status);
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
      await addFollowUp(leadId, note.trim());
      setNote('');
      showToast('Follow-up added', 'success');
      await load();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const salesName = (id) => roster.find((s) => s.id === id)?.full_name || '—';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] rounded-xl bg-white shadow-xl border border-[#E4E7EC] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-[#E4E7EC] shrink-0">
          <h3 className="text-lg font-bold text-[#172033]">{lead?.company || 'Lead'}</h3>
          <button onClick={onClose} className="text-[#667085] hover:text-[#172033]"><X className="w-5 h-5" /></button>
        </div>
        {loading || !lead ? (
          <div className="p-8 text-center text-[#667085] text-sm">Loading…</div>
        ) : (
          <div className="p-5 overflow-y-auto space-y-5">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-[#667085]">Phone</span><div className="font-semibold text-[#172033]">{lead.phone}</div></div>
              <div><span className="text-[#667085]">Contact</span><div className="font-semibold text-[#172033]">{lead.person_to_contact || '—'}</div></div>
              <div><span className="text-[#667085]">Email</span><div className="font-semibold text-[#172033]">{lead.email || '—'}</div></div>
              <div><span className="text-[#667085]">Value Estimate</span><div className="font-semibold text-[#172033]">{money(lead.value_estimate)}</div></div>
              <div><span className="text-[#667085]">Assigned To</span><div className="font-semibold text-[#172033]">{lead.assigned_to ? salesName(lead.assigned_to) : 'Unassigned (pool)'}</div></div>
              <div><span className="text-[#667085]">Accepted At</span><div className="font-semibold text-[#172033]">{lead.accepted_at ? new Date(lead.accepted_at).toLocaleString() : '—'}</div></div>
            </div>

            <div className="flex items-center gap-2">
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="form-input text-sm flex-1">
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
              <button onClick={applyStatus} disabled={busy || status === lead.status} className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#004898] text-white hover:bg-[#00346E] disabled:opacity-50 whitespace-nowrap">
                Update Status
              </button>
            </div>

            <form onSubmit={submitFollowUp} className="flex items-center gap-2">
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a follow-up note…" className="form-input text-sm flex-1" />
              <button type="submit" disabled={busy || !note.trim()} className="px-4 py-2 text-sm font-semibold rounded-lg border border-[#E4E7EC] bg-white text-[#344054] hover:bg-[#F8FAFC] disabled:opacity-50 whitespace-nowrap">
                Add
              </button>
            </form>

            <div>
              <h4 className="text-xs font-bold text-[#667085] uppercase tracking-wider mb-2">History</h4>
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {history.map((h) => (
                  <div key={h.id} className="text-xs border-l-2 border-[#E4E7EC] pl-3 py-1">
                    <div className="font-semibold text-[#172033]">
                      {h.event_type.replace(/_/g, ' ')}
                      {h.actor_name ? <span className="text-[#667085] font-normal"> — {h.actor_name}</span> : null}
                    </div>
                    {h.details?.reason && <div className="text-[#667085]">Reason: {h.details.reason}</div>}
                    {h.details?.note && <div className="text-[#667085]">{h.details.note}</div>}
                    {h.details?.from && h.details?.to && <div className="text-[#667085]">{h.details.from} → {h.details.to}</div>}
                    <div className="text-[#98A2B3]">{new Date(h.created_at).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Upload -> Validate -> Preview -> Confirm -> Transactional Import (§8).
const ImportModal = ({ onClose, onImported, showToast }) => {
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

      const parsedRows = [];
      for (let r = 2; r <= sheet.rowCount; r += 1) {
        const row = sheet.getRow(r);
        if (row.values.length <= 1) continue; // blank row
        parsedRows.push({
          company: companyCol ? String(row.getCell(companyCol).value ?? '').trim() : '',
          phone: phoneCol ? String(row.getCell(phoneCol).value ?? '').trim() : '',
          person_to_contact: contactCol ? String(row.getCell(contactCol).value ?? '').trim() : '',
          email: emailCol ? String(row.getCell(emailCol).value ?? '').trim() : '',
          value_estimate: valueCol ? row.getCell(valueCol).value ?? '' : ''
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
      const outcome = await confirmImport(rows);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] rounded-xl bg-white shadow-xl border border-[#E4E7EC] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-[#E4E7EC] shrink-0">
          <h3 className="text-lg font-bold text-[#172033]">Import Leads from Excel</h3>
          <button onClick={onClose} className="text-[#667085] hover:text-[#172033]"><X className="w-5 h-5" /></button>
        </div>

        {step === 'upload' && (
          <div className="p-8 text-center space-y-4">
            <FileSpreadsheet className="w-12 h-12 text-[#B3D1F2] mx-auto" />
            <p className="text-sm text-[#667085]">
              Upload an .xlsx file with columns <strong>Company</strong> and <strong>Phone</strong> (required), plus optional
              Person to Contact, Email, and Value Estimate.
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
          </div>
        )}

        {step === 'preview' && preview && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="p-5 flex gap-4 text-sm border-b border-[#E4E7EC] shrink-0">
              <span className="text-[#027A48] font-semibold flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> {preview.valid.length} ready to import</span>
              <span className="text-[#B42318] font-semibold flex items-center gap-1"><XCircle className="w-4 h-4" /> {preview.failed.length} failed</span>
              <span className="text-[#B54708] font-semibold flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> {preview.duplicates.length} duplicate</span>
            </div>
            <div className="overflow-y-auto flex-1 p-5">
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
                          <span className="text-[#B54708]">Duplicate ({r.duplicateOf})</span>
                        ) : (
                          <span className="text-[#027A48]">Ready</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(preview.failed.length > 0 || preview.duplicates.length > 0) && (
                <p className="text-xs text-[#667085] mt-3">
                  Failed and duplicate rows will be skipped — only the {preview.valid.length} ready row(s) will be imported.
                  Fix and re-upload the rest separately.
                </p>
              )}
            </div>
            <div className="p-5 border-t border-[#E4E7EC] flex justify-end gap-2 shrink-0">
              <button onClick={() => setStep('upload')} className="px-4 py-2 text-sm font-semibold rounded-lg border border-[#E4E7EC] bg-white text-[#344054] hover:bg-[#F8FAFC]">Back</button>
              <button
                onClick={doConfirm}
                disabled={busy || !preview.valid.length}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#004898] text-white hover:bg-[#00346E] disabled:opacity-50"
              >
                {busy ? 'Importing…' : `Confirm Import (${preview.valid.length})`}
              </button>
            </div>
          </div>
        )}

        {step === 'done' && result && (
          <div className="p-8 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 text-[#12B76A] mx-auto" />
            <p className="text-sm font-semibold text-[#172033]">{result.imported} lead(s) imported successfully.</p>
            {(result.failed.length > 0 || result.duplicates.length > 0) && (
              <p className="text-xs text-[#667085]">{result.failed.length} failed, {result.duplicates.length} skipped as duplicates — not imported.</p>
            )}
            <button onClick={onClose} className="px-5 py-2.5 rounded-lg bg-[#004898] text-white text-sm font-semibold hover:bg-[#00346E]">Done</button>
          </div>
        )}
      </div>
    </div>
  );
};

export const AdminLeadsTab = () => {
  const { showToast } = useApp();
  const [leads, setLeads] = useState([]);
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [formModal, setFormModal] = useState(null); // { lead? } or null
  const [assignModal, setAssignModal] = useState(null); // lead or null
  const [detailId, setDetailId] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);

  const load = useCallback(async () => {
    try {
      const [leadsData, rosterData] = await Promise.all([
        fetchLeads(statusFilter ? { status: statusFilter } : {}),
        fetchSalesInApi()
      ]);
      setLeads(Array.isArray(leadsData) ? leadsData : []);
      setRoster(Array.isArray(rosterData) ? rosterData : []);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, showToast]);

  useEffect(() => { load(); }, [load]);

  // Realtime (Phase 7): refresh on any lead event, with a 20s poll as the
  // API-refresh fallback the plan requires in case the stream drops.
  useEffect(() => {
    const source = subscribeToLeadEvents(() => load());
    const poll = setInterval(load, 20000);
    return () => { source?.close(); clearInterval(poll); };
  }, [load]);

  const salesName = (id) => roster.find((s) => s.id === id)?.full_name || '—';

  const filtered = leads.filter((l) =>
    (l.company || '').toLowerCase().includes(search.toLowerCase()) ||
    (l.phone || '').includes(search)
  );

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      const result = await deleteLead(pendingDelete.id);
      showToast(result.message || 'Lead removed', 'success');
      setPendingDelete(null);
      load();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  if (loading) return <TableSkeleton rows={4} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setFormModal({})} className="btn btn-primary text-xs font-bold">
            <Plus className="w-4 h-4" /> Add Lead
          </button>
          <button onClick={() => setImportOpen(true)} className="px-3 py-2 text-xs font-bold rounded-lg border border-[#E4E7EC] bg-white text-[#344054] hover:bg-[#F8FAFC] inline-flex items-center gap-1.5">
            <Upload className="w-3.5 h-3.5" /> Import Excel
          </button>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-[#98A2B3] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search company or phone…" style={{ paddingLeft: '36px' }} className="form-input text-xs" />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="text-xs font-semibold text-[#172033] border border-[#E4E7EC] rounded-lg px-3 py-2 bg-white outline-none focus:border-[#004898]">
            <option value="">All Statuses</option>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </div>
      </div>

      <div className="card overflow-hidden border border-[#E4E7EC] shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse bg-white">
            <thead className="bg-[#F8FAFC] text-[#667085] uppercase font-bold text-[10px] tracking-wider border-b border-[#E4E7EC]">
              <tr>
                <th className="px-6 py-4">Company</th>
                <th className="px-6 py-4">Phone</th>
                <th className="px-6 py-4">Value</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Assigned To</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F2F4F7]">
              {filtered.length === 0 ? (
                <tr><td colSpan="6" className="p-8 text-center text-[#667085]">No leads match the selected filters.</td></tr>
              ) : filtered.map((l) => (
                <tr key={l.id} className="hover:bg-[#F8FAFC] transition-all">
                  <td className="px-6 py-4 align-middle">
                    <button onClick={() => setDetailId(l.id)} className="font-extrabold text-[13px] text-[#004898] hover:underline text-left">{l.company}</button>
                    {l.person_to_contact && <div className="text-[11px] text-[#667085]">{l.person_to_contact}</div>}
                  </td>
                  <td className="px-6 py-4 align-middle text-[#475467] font-medium">{l.phone}</td>
                  <td className="px-6 py-4 align-middle text-[#475467] font-medium">{money(l.value_estimate)}</td>
                  <td className="px-6 py-4 align-middle">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${STATUS_COLOR[l.status]}`}>{STATUS_LABEL[l.status]}</span>
                  </td>
                  <td className="px-6 py-4 align-middle text-[#475467] font-medium">{l.assigned_to ? salesName(l.assigned_to) : <span className="text-[#98A2B3] italic">Unassigned</span>}</td>
                  <td className="px-6 py-4 align-middle">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => setDetailId(l.id)} title="History & Status" className="p-1.5 rounded-lg bg-white hover:bg-[#F8FAFC] text-[#172033] border border-[#E4E7EC]"><HistoryIcon className="w-4 h-4" /></button>
                      <button onClick={() => setAssignModal(l)} title="Assign" className="p-1.5 rounded-lg bg-white hover:bg-[#F8FAFC] text-[#172033] border border-[#E4E7EC]"><UserPlus className="w-4 h-4" /></button>
                      <button onClick={() => setFormModal({ lead: l })} title="Edit" className="p-1.5 rounded-lg bg-white hover:bg-[#F8FAFC] text-[#172033] border border-[#E4E7EC]"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => setPendingDelete(l)} title="Delete" className="p-1.5 rounded-lg bg-white hover:bg-[#FEF3F2] text-[#D92D20] border border-[#E4E7EC] hover:border-[#FDA29B]"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {formModal && (
        <LeadFormModal lead={formModal.lead} onClose={() => setFormModal(null)} onSaved={() => { setFormModal(null); load(); }} showToast={showToast} />
      )}
      {assignModal && (
        <AssignModal lead={assignModal} roster={roster.filter((s) => s.is_active)} onClose={() => setAssignModal(null)} onSaved={() => { setAssignModal(null); load(); }} showToast={showToast} />
      )}
      {detailId && (
        <DetailModal leadId={detailId} roster={roster} onClose={() => setDetailId(null)} onChanged={load} showToast={showToast} />
      )}
      {importOpen && (
        <ImportModal onClose={() => setImportOpen(false)} onImported={load} showToast={showToast} />
      )}
      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl border border-[#E4E7EC]">
            <div className="flex items-start gap-3 p-5">
              <div className="shrink-0 w-10 h-10 rounded-full bg-[#FEF3F2] flex items-center justify-center"><AlertTriangle className="w-5 h-5 text-[#D92D20]" /></div>
              <div>
                <h3 className="text-lg font-bold text-[#172033]">Delete Lead</h3>
                <p className="mt-1 text-sm text-[#667085]">
                  Delete <span className="font-semibold text-[#172033]">{pendingDelete.company}</span>? Leads with no activity are removed permanently;
                  leads with history (assignment, status changes, etc.) are archived instead, to preserve the record.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-[#E4E7EC] bg-[#F9FAFB] rounded-b-xl">
              <button onClick={() => setPendingDelete(null)} className="px-4 py-2 text-sm font-semibold rounded-lg border border-[#E4E7EC] bg-white text-[#344054] hover:bg-[#F8FAFC]">Cancel</button>
              <button onClick={confirmDelete} className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#D92D20] text-white hover:bg-[#B42318]">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
