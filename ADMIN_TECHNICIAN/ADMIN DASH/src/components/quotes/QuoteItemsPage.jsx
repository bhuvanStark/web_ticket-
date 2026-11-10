// Quotation Items — the catalog Quote Managers price from. Categories are
// baskets on the left; items (with cost/OSP price) on the right. Built for
// large catalogs: server-side search + pagination, bulk delete, Excel
// import/export.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Search, Pencil, Trash2, Upload, Download, FileSpreadsheet, FolderPlus, Folder, FolderOpen,
  X, Check, Package, ChevronLeft, ChevronRight, AlertTriangle, CheckCircle2, Loader2
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  fetchQuoteCategories, createQuoteCategory, renameQuoteCategory, deleteQuoteCategory,
  fetchQuoteItems, createQuoteItem, updateQuoteItem, deleteQuoteItems, importQuoteItems
} from '../../services/quoteApiService';
import { parseItemsWorkbook, validateItemRow, downloadItemsTemplate, exportItemsWorkbook } from '../../utils/quoteItemsExcel';
import { formatINR } from './quoteShared';

const PAGE_SIZE = 50;

function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

const Modal = ({ title, icon: Icon, onClose, children, wide, busy }) => (
  <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
    <div className={`bg-white w-full ${wide ? 'max-w-4xl' : 'max-w-lg'} rounded-2xl shadow-2xl border border-[#E4E7EC] overflow-hidden flex flex-col max-h-[90vh]`}>
      <div className="p-5 border-b border-[#E4E7EC] bg-[#F8FAFC] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#004898] text-white flex items-center justify-center"><Icon className="w-5 h-5" /></div>
          <h3 className="font-extrabold text-lg text-[#172033]">{title}</h3>
        </div>
        <button onClick={onClose} disabled={busy} className="p-1 text-[#667085] hover:text-[#172033] rounded-lg hover:bg-white disabled:opacity-50"><X className="w-5 h-5" /></button>
      </div>
      {children}
    </div>
  </div>
);

// ---- Add / edit item ----
const ItemFormModal = ({ item, categories, defaultCategoryId, onClose, onSaved, onCategoryCreated, showToast }) => {
  const isEdit = Boolean(item?.id);
  const blank = { category_id: defaultCategoryId || '', series: '', model_name: '', hsn_code: '', price: '', gst_rate: '18', remark: '' };
  const [form, setForm] = useState(() => (isEdit ? {
    category_id: item.category_id, series: item.series || '', model_name: item.model_name, hsn_code: item.hsn_code || '',
    price: String(item.price), gst_rate: String(item.gst_rate), remark: item.remark || ''
  } : blank));
  const [newCategory, setNewCategory] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const modelRef = useRef(null);
  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setError(''); };

  const addCategory = async () => {
    const name = (newCategory || '').trim();
    if (!name) return;
    try {
      const created = await createQuoteCategory(name);
      onCategoryCreated(created);
      setForm((f) => ({ ...f, category_id: created.id }));
      setNewCategory(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const save = async (andNew) => {
    if (!form.category_id) return setError('Choose a category first');
    if (!form.model_name.trim()) return setError('Model name is required');
    if (form.price === '' || !(Number(form.price) >= 0)) return setError('Enter a valid price');
    setBusy(true);
    try {
      const payload = { ...form, price: Number(form.price), gst_rate: form.gst_rate === '' ? 18 : Number(form.gst_rate) };
      if (isEdit) await updateQuoteItem(item.id, payload);
      else await createQuoteItem(payload);
      showToast(isEdit ? 'Item updated' : `${form.model_name.trim()} added`, 'success');
      onSaved();
      if (andNew) {
        setForm({ ...blank, category_id: form.category_id, series: form.series, gst_rate: form.gst_rate });
        modelRef.current?.focus();
      } else {
        onClose();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const input = 'w-full px-3 py-2 border border-[#E4E7EC] rounded-lg text-sm text-[#172033] outline-none focus:border-[#004898] focus:ring-2 focus:ring-[#004898]/10';
  return (
    <Modal title={isEdit ? 'Edit Item' : 'Add Item'} icon={Package} onClose={onClose} busy={busy}>
      <form onSubmit={(e) => { e.preventDefault(); save(false); }} className="p-6 space-y-4 overflow-y-auto">
        <div>
          <label className="form-label">Category *</label>
          {newCategory === null ? (
            <div className="flex gap-2">
              <select value={form.category_id} onChange={set('category_id')} autoFocus={!form.category_id} className={`${input} font-semibold`}>
                <option value="">Select a category…</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button type="button" onClick={() => setNewCategory('')} className="btn btn-secondary !px-3 shrink-0" title="New category"><FolderPlus className="w-4 h-4" /></button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input autoFocus value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="New category name"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } if (e.key === 'Escape') setNewCategory(null); }} className={input} />
              <button type="button" onClick={addCategory} className="btn btn-primary !px-3 shrink-0"><Check className="w-4 h-4" /></button>
              <button type="button" onClick={() => setNewCategory(null)} className="btn btn-secondary !px-3 shrink-0"><X className="w-4 h-4" /></button>
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="form-label">Model Name *</label>
            <input ref={modelRef} value={form.model_name} onChange={set('model_name')} placeholder="e.g. 55UL5Q" className={`${input} font-bold`} autoFocus={Boolean(form.category_id) && !isEdit} />
          </div>
          <div>
            <label className="form-label">Series</label>
            <input value={form.series} onChange={set('series')} placeholder="e.g. UL Series" className={input} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="form-label">HSN Code</label>
            <input value={form.hsn_code} onChange={set('hsn_code')} placeholder="85287219" className={`${input} font-mono`} />
          </div>
          <div>
            <label className="form-label">Price (OSP) *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#98A2B3]">₹</span>
              <input type="number" min="0" step="0.01" value={form.price} onChange={set('price')} placeholder="0" className={`${input} pl-7 text-right tabular-nums font-semibold`} />
            </div>
          </div>
          <div>
            <label className="form-label">GST %</label>
            <input type="number" min="0" max="100" step="0.01" value={form.gst_rate} onChange={set('gst_rate')} className={`${input} text-right tabular-nums`} />
          </div>
        </div>
        <div>
          <label className="form-label">Remark</label>
          <textarea value={form.remark} onChange={set('remark')} rows={2} placeholder="Specs, warranty, notes…" className={`${input} resize-none`} />
        </div>
        {error && <p className="text-xs font-semibold text-[#DC2626] flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" />{error}</p>}
        <div className="pt-3 border-t border-[#E4E7EC] flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} disabled={busy} className="btn btn-secondary">Cancel</button>
          {!isEdit && <button type="button" onClick={() => save(true)} disabled={busy} className="btn btn-secondary">Save &amp; add another</button>}
          <button type="submit" disabled={busy} className="btn btn-primary disabled:opacity-70">
            <CheckCircle2 className="w-4 h-4" /><span>{busy ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Item'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};

// ---- Excel import ----
const ImportModal = ({ categories, onClose, onDone, showToast }) => {
  const [step, setStep] = useState('upload');
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [serverErrors, setServerErrors] = useState([]);
  const fileRef = useRef(null);

  const checked = useMemo(() => rows.map((row) => ({ ...row, problems: validateItemRow(row) })), [rows]);
  const bad = checked.filter((r) => r.problems.length);
  const known = useMemo(() => new Set(categories.map((c) => c.name.trim().toLowerCase())), [categories]);
  const newCats = [...new Set(checked.map((r) => String(r.category || '').trim()).filter((c) => c && !known.has(c.toLowerCase())))];

  const handleFile = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      setRows(await parseItemsWorkbook(file));
      setServerErrors([]);
      setStep('preview');
    } catch (err) {
      showToast(err.message || 'Could not read this file', 'error');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const confirm = async () => {
    setBusy(true);
    try {
      const outcome = await importQuoteItems(rows);
      setResult(outcome);
      setStep('done');
      onDone();
    } catch (err) {
      setServerErrors(err.details || []);
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Import Items from Excel" icon={FileSpreadsheet} onClose={onClose} wide busy={busy}>
      <div className="p-6 overflow-y-auto space-y-4">
        {step === 'upload' && (
          <>
            <label
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0]); }}
              className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-[#B3D1F2] bg-[#F5F9FE] rounded-2xl py-12 cursor-pointer hover:bg-[#EFF5FC] transition-colors"
            >
              {busy ? <Loader2 className="w-10 h-10 text-[#004898] animate-spin" /> : <Upload className="w-10 h-10 text-[#004898]" />}
              <div className="text-center">
                <p className="font-bold text-[#172033]">Drop your .xlsx here or click to browse</p>
                <p className="text-xs text-[#667085] mt-1">Columns: Category, Series, Model Name, HSN Code, Price, GST %, Remark</p>
              </div>
              <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
            </label>
            <div className="rounded-xl bg-[#F8FAFC] border border-[#E4E7EC] p-4 text-xs text-[#475467] space-y-1.5">
              <p className="font-bold text-[#172033]">How the import works</p>
              <p>• A category that doesn't exist yet is created automatically.</p>
              <p>• A Model Name already in the catalog gets its details and price <b>updated</b>; new ones are added.</p>
              <p>• GST % defaults to 18 when left blank. Price is the cost (OSP).</p>
              <p>• Nothing is saved until you confirm the preview — and if any row is invalid, nothing is saved at all.</p>
            </div>
            <button onClick={downloadItemsTemplate} className="btn btn-secondary text-xs"><Download className="w-4 h-4" />Download template</button>
          </>
        )}

        {step === 'preview' && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                ['Rows', checked.length, 'text-[#172033]'],
                ['Valid', checked.length - bad.length, 'text-[#027A48]'],
                ['With errors', bad.length, bad.length ? 'text-[#B42318]' : 'text-[#98A2B3]'],
                ['New categories', newCats.length, 'text-[#004898]']
              ].map(([label, value, tone]) => (
                <div key={label} className="rounded-xl border border-[#E4E7EC] p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#667085]">{label}</p>
                  <p className={`text-2xl font-extrabold tabular-nums ${tone}`}>{value}</p>
                </div>
              ))}
            </div>
            {newCats.length > 0 && (
              <p className="text-xs text-[#475467]"><span className="font-bold">Will create:</span> {newCats.join(', ')}</p>
            )}
            {serverErrors.length > 0 && (
              <div className="rounded-xl border border-[#FECDCA] bg-[#FEF3F2] p-3 text-xs text-[#B42318] max-h-32 overflow-y-auto">
                {serverErrors.map((e) => <p key={e.row}>Row {e.row}: {e.error}</p>)}
              </div>
            )}
            <div className="border border-[#E4E7EC] rounded-xl overflow-hidden">
              <div className="max-h-80 overflow-auto">
                <table className="w-full text-xs">
                  <thead className="bg-[#F8FAFC] text-[#667085] uppercase text-[10px] font-bold tracking-wider sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left">Row</th><th className="px-3 py-2 text-left">Category</th><th className="px-3 py-2 text-left">Model</th>
                      <th className="px-3 py-2 text-left">Series</th><th className="px-3 py-2 text-left">HSN</th><th className="px-3 py-2 text-right">Price</th>
                      <th className="px-3 py-2 text-right">GST %</th><th className="px-3 py-2 text-left">Check</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F2F4F7]">
                    {[...bad, ...checked.filter((r) => !r.problems.length)].slice(0, 300).map((r) => (
                      <tr key={r.row} className={r.problems.length ? 'bg-[#FEF3F2]' : ''}>
                        <td className="px-3 py-1.5 text-[#98A2B3] tabular-nums">{r.row}</td>
                        <td className="px-3 py-1.5">{String(r.category || '')}</td>
                        <td className="px-3 py-1.5 font-bold text-[#172033]">{String(r.model_name || '')}</td>
                        <td className="px-3 py-1.5">{String(r.series || '')}</td>
                        <td className="px-3 py-1.5 font-mono">{String(r.hsn_code || '')}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{String(r.price ?? '')}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{r.gst_rate === '' || r.gst_rate == null ? '18' : String(r.gst_rate)}</td>
                        <td className="px-3 py-1.5">
                          {r.problems.length
                            ? <span className="text-[#B42318] font-semibold">{r.problems.join(', ')}</span>
                            : <span className="text-[#027A48] font-semibold inline-flex items-center gap-1"><Check className="w-3 h-3" />OK</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {checked.length > 300 && <p className="text-[11px] text-[#667085] px-3 py-2 border-t border-[#F2F4F7]">Showing 300 of {checked.length} rows (errors first).</p>}
            </div>
            <div className="flex items-center justify-between gap-3 pt-2">
              <button onClick={() => setStep('upload')} disabled={busy} className="btn btn-secondary">Choose another file</button>
              <button onClick={confirm} disabled={busy || bad.length > 0} className="btn btn-primary disabled:opacity-60">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {bad.length ? `Fix ${bad.length} row(s) to import` : `Import ${checked.length} item(s)`}
              </button>
            </div>
          </>
        )}

        {step === 'done' && result && (
          <div className="text-center py-8 space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-[#ECFDF3] flex items-center justify-center"><CheckCircle2 className="w-9 h-9 text-[#12B76A]" /></div>
            <div>
              <p className="text-lg font-extrabold text-[#172033]">Import complete</p>
              <p className="text-sm text-[#667085] mt-1">
                {result.created} added · {result.updated} updated · {result.categoriesCreated} new categor{result.categoriesCreated === 1 ? 'y' : 'ies'}
              </p>
            </div>
            <button onClick={onClose} className="btn btn-primary">Done</button>
          </div>
        )}
      </div>
    </Modal>
  );
};

// ---- Page ----
export const QuoteItemsPage = ({ readOnly }) => {
  const { showToast } = useApp();
  const [categories, setCategories] = useState([]);
  const [catSearch, setCatSearch] = useState('');
  const [activeCat, setActiveCat] = useState('');
  const [newCat, setNewCat] = useState(null);
  const [renaming, setRenaming] = useState(null);
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search);
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ rows: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(() => new Set());
  const [modal, setModal] = useState(null);
  const [exporting, setExporting] = useState(false);

  const loadCategories = useCallback(async () => {
    try { setCategories(await fetchQuoteCategories()); } catch (err) { showToast(err.message, 'error'); }
  }, [showToast]);

  // Only the latest request may update the table (fast typing/paging can
  // otherwise let an older, slower response overwrite a newer one).
  const requestSeq = useRef(0);
  const loadItems = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    try {
      const result = await fetchQuoteItems({ search: debounced, category_id: activeCat, page, limit: PAGE_SIZE });
      if (seq === requestSeq.current) setData(result);
    } catch (err) {
      if (seq === requestSeq.current) showToast(err.message, 'error');
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [debounced, activeCat, page, showToast]);

  useEffect(() => { loadCategories(); }, [loadCategories]);
  useEffect(() => { loadItems(); }, [loadItems]);
  useEffect(() => { setPage(1); setSelected(new Set()); }, [debounced, activeCat]);

  const refreshAll = () => { loadCategories(); loadItems(); };
  const totalItems = categories.reduce((n, c) => n + c.item_count, 0);
  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const visibleCats = categories.filter((c) => c.name.toLowerCase().includes(catSearch.trim().toLowerCase()));
  const activeCatName = categories.find((c) => c.id === activeCat)?.name;

  const addCategory = async () => {
    const name = (newCat || '').trim();
    if (!name) { setNewCat(null); return; }
    try {
      const created = await createQuoteCategory(name);
      setNewCat(null);
      await loadCategories();
      setActiveCat(created.id);
      showToast(`Category "${created.name}" created`, 'success');
    } catch (err) { showToast(err.message, 'error'); }
  };

  const saveRename = async () => {
    const name = (renaming?.name || '').trim();
    if (!name) { setRenaming(null); return; }
    try {
      await renameQuoteCategory(renaming.id, name);
      setRenaming(null);
      refreshAll();
    } catch (err) { showToast(err.message, 'error'); }
  };

  const removeCategory = async (cat) => {
    if (!window.confirm(`Delete the category "${cat.name}"?`)) return;
    try {
      await deleteQuoteCategory(cat.id);
      if (activeCat === cat.id) setActiveCat('');
      loadCategories();
      showToast('Category deleted', 'success');
    } catch (err) { showToast(err.message, 'error'); }
  };

  const removeItems = async (ids) => {
    if (!window.confirm(`Delete ${ids.length} item(s)? Saved quotations keep their copy of these items.`)) return;
    try {
      const { deleted } = await deleteQuoteItems(ids);
      setSelected(new Set());
      refreshAll();
      showToast(`${deleted} item(s) deleted`, 'success');
    } catch (err) { showToast(err.message, 'error'); }
  };

  const exportAll = async () => {
    setExporting(true);
    try {
      const all = [];
      for (let p = 1; ; p += 1) {
        const chunk = await fetchQuoteItems({ search: debounced, category_id: activeCat, page: p, limit: 200 });
        all.push(...chunk.rows);
        if (all.length >= chunk.total || chunk.rows.length === 0) break;
      }
      await exportItemsWorkbook(all);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setExporting(false);
    }
  };

  const allOnPage = data.rows.length > 0 && data.rows.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected((s) => {
    const next = new Set(s);
    if (allOnPage) data.rows.forEach((r) => next.delete(r.id)); else data.rows.forEach((r) => next.add(r.id));
    return next;
  });
  const toggle = (id) => setSelected((s) => { const next = new Set(s); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-[#172033] tracking-tight">Items Catalog</h2>
          <p className="text-xs md:text-sm text-[#667085] mt-0.5">
            {totalItems.toLocaleString('en-IN')} items in {categories.length} categories · prices are cost (OSP)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={exportAll} disabled={exporting || !data.total} className="btn btn-secondary text-xs disabled:opacity-60">
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}Export
          </button>
          {!readOnly && (
            <>
              <button onClick={() => setModal({ type: 'import' })} className="btn btn-secondary text-xs"><Upload className="w-4 h-4" />Import Excel</button>
              <button onClick={() => setModal({ type: 'item' })} className="btn btn-primary text-xs shadow-sm"><Plus className="w-4 h-4" />Add Item</button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5 items-start">
        {/* Categories */}
        <aside className="card bg-white border border-[#E4E7EC] shadow-xs overflow-hidden lg:sticky lg:top-0">
          <div className="p-3 border-b border-[#F2F4F7] flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-[#98A2B3] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input value={catSearch} onChange={(e) => setCatSearch(e.target.value)} placeholder="Find category"
                className="w-full pl-8 pr-2 py-1.5 text-xs border border-[#E4E7EC] rounded-lg outline-none focus:border-[#004898]" />
            </div>
            {!readOnly && (
              <button onClick={() => setNewCat('')} title="New category" className="p-1.5 rounded-lg border border-[#E4E7EC] text-[#004898] hover:bg-[#EFF5FC]"><FolderPlus className="w-4 h-4" /></button>
            )}
          </div>
          <nav className="p-2 max-h-[calc(100vh-280px)] overflow-y-auto space-y-0.5">
            {newCat !== null && (
              <div className="flex items-center gap-1 px-1 py-1">
                <input autoFocus value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Category name"
                  onKeyDown={(e) => { if (e.key === 'Enter') addCategory(); if (e.key === 'Escape') setNewCat(null); }}
                  className="flex-1 min-w-0 px-2 py-1.5 text-xs border border-[#004898] rounded-lg outline-none" />
                <button onClick={addCategory} className="p-1.5 text-[#027A48] hover:bg-[#ECFDF3] rounded-lg"><Check className="w-4 h-4" /></button>
                <button onClick={() => setNewCat(null)} className="p-1.5 text-[#667085] hover:bg-[#F2F4F7] rounded-lg"><X className="w-4 h-4" /></button>
              </div>
            )}
            <button onClick={() => setActiveCat('')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${!activeCat ? 'bg-[#EFF5FC] text-[#004898]' : 'text-[#475467] hover:bg-[#F8FAFC]'}`}>
              <span className="flex items-center gap-2"><Package className="w-4 h-4" />All items</span>
              <span className="tabular-nums">{totalItems}</span>
            </button>
            {visibleCats.map((c) => {
              const active = activeCat === c.id;
              if (renaming?.id === c.id) {
                return (
                  <div key={c.id} className="flex items-center gap-1 px-1 py-1">
                    <input autoFocus value={renaming.name} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })}
                      onKeyDown={(e) => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setRenaming(null); }}
                      className="flex-1 min-w-0 px-2 py-1.5 text-xs border border-[#004898] rounded-lg outline-none" />
                    <button onClick={saveRename} className="p-1.5 text-[#027A48] hover:bg-[#ECFDF3] rounded-lg"><Check className="w-4 h-4" /></button>
                    <button onClick={() => setRenaming(null)} className="p-1.5 text-[#667085] hover:bg-[#F2F4F7] rounded-lg"><X className="w-4 h-4" /></button>
                  </div>
                );
              }
              return (
                <div key={c.id} className={`group flex items-center rounded-lg transition-colors ${active ? 'bg-[#EFF5FC]' : 'hover:bg-[#F8FAFC]'}`}>
                  <button onClick={() => setActiveCat(c.id)} className={`flex-1 min-w-0 flex items-center gap-2 px-3 py-2 text-xs font-semibold text-left ${active ? 'text-[#004898]' : 'text-[#475467]'}`}>
                    {active ? <FolderOpen className="w-4 h-4 shrink-0" /> : <Folder className="w-4 h-4 shrink-0 text-[#98A2B3]" />}
                    <span className="truncate">{c.name}</span>
                  </button>
                  <span className={`text-[11px] tabular-nums pr-2 ${readOnly ? '' : 'group-hover:hidden'} ${active ? 'text-[#004898] font-bold' : 'text-[#98A2B3]'}`}>{c.item_count}</span>
                  {!readOnly && (
                    <span className="hidden group-hover:flex items-center pr-1">
                      <button onClick={() => setRenaming({ id: c.id, name: c.name })} title="Rename" className="p-1 text-[#667085] hover:text-[#004898]"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => removeCategory(c)} title="Delete" className="p-1 text-[#667085] hover:text-[#D92D20]"><Trash2 className="w-3.5 h-3.5" /></button>
                    </span>
                  )}
                </div>
              );
            })}
            {categories.length === 0 && newCat === null && (
              <div className="text-center py-8 px-4">
                <Folder className="w-8 h-8 text-[#D0D5DD] mx-auto" />
                <p className="text-xs text-[#667085] mt-2">No categories yet.{!readOnly && ' Create one, or import an Excel sheet.'}</p>
              </div>
            )}
          </nav>
        </aside>

        {/* Items */}
        <section className="card bg-white border border-[#E4E7EC] shadow-xs overflow-hidden min-w-0">
          <div className="p-4 border-b border-[#F2F4F7] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <h3 className="font-extrabold text-[#172033] truncate">{activeCatName || 'All items'}</h3>
              <span className="text-[11px] font-bold text-[#004898] bg-[#EFF5FC] px-2 py-0.5 rounded-full tabular-nums">{data.total}</span>
              {activeCat && !readOnly && (
                <button onClick={() => setModal({ type: 'item' })} className="text-[11px] font-bold text-[#004898] hover:underline flex items-center gap-1 ml-1"><Plus className="w-3 h-3" />Add here</button>
              )}
            </div>
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-[#98A2B3] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search model, series, HSN, remark…"
                className="w-full pl-9 pr-8 py-2 text-xs border border-[#E4E7EC] rounded-lg outline-none focus:border-[#004898]" />
              {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[#98A2B3] hover:text-[#172033]"><X className="w-3.5 h-3.5" /></button>}
            </div>
          </div>

          {selected.size > 0 && !readOnly && (
            <div className="px-4 py-2 bg-[#EFF5FC] border-b border-[#B3D1F2] flex items-center justify-between text-xs">
              <span className="font-bold text-[#004898]">{selected.size} selected</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setSelected(new Set())} className="font-semibold text-[#475467] hover:text-[#172033] px-2 py-1">Clear</button>
                <button onClick={() => removeItems([...selected])} className="font-bold text-white bg-[#D92D20] hover:bg-[#B42318] rounded-lg px-3 py-1.5 flex items-center gap-1.5"><Trash2 className="w-3.5 h-3.5" />Delete selected</button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-[#F8FAFC] text-[#667085] uppercase font-bold text-[10px] tracking-wider border-b border-[#E4E7EC]">
                <tr>
                  {!readOnly && <th className="pl-4 py-3 w-8"><input type="checkbox" checked={allOnPage} onChange={toggleAll} className="accent-[#004898]" /></th>}
                  <th className="px-4 py-3">Model / Series</th>
                  {!activeCat && <th className="px-4 py-3">Category</th>}
                  <th className="px-4 py-3">HSN</th>
                  <th className="px-4 py-3 text-right">Price (OSP)</th>
                  <th className="px-4 py-3 text-right">GST</th>
                  <th className="px-4 py-3">Remark</th>
                  {!readOnly && <th className="px-4 py-3 text-right w-20" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F2F4F7]">
                {loading && data.rows.length === 0 ? (
                  [...Array(6)].map((_, i) => (
                    <tr key={i}><td colSpan={8} className="px-4 py-3"><div className="h-4 bg-[#F2F4F7] rounded animate-pulse" /></td></tr>
                  ))
                ) : data.rows.length === 0 ? (
                  <tr><td colSpan={8} className="py-16 text-center">
                    <Package className="w-10 h-10 text-[#D0D5DD] mx-auto" />
                    <p className="text-sm font-bold text-[#172033] mt-3">{search ? 'No items match your search' : 'No items here yet'}</p>
                    {!readOnly && !search && (
                      <div className="flex justify-center gap-2 mt-4">
                        <button onClick={() => setModal({ type: 'item' })} className="btn btn-primary text-xs"><Plus className="w-4 h-4" />Add Item</button>
                        <button onClick={() => setModal({ type: 'import' })} className="btn btn-secondary text-xs"><Upload className="w-4 h-4" />Import Excel</button>
                      </div>
                    )}
                  </td></tr>
                ) : data.rows.map((item) => (
                  <tr key={item.id} className={`group hover:bg-[#F8FAFC] transition-colors ${selected.has(item.id) ? 'bg-[#F5F9FE]' : ''} ${loading ? 'opacity-60' : ''}`}>
                    {!readOnly && <td className="pl-4 py-3"><input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} className="accent-[#004898]" /></td>}
                    <td className="px-4 py-3">
                      <div className="font-extrabold text-[13px] text-[#172033]">{item.model_name}</div>
                      {item.series && <div className="text-[11px] text-[#667085]">{item.series}</div>}
                    </td>
                    {!activeCat && (
                      <td className="px-4 py-3">
                        <button onClick={() => setActiveCat(item.category_id)} className="text-[11px] font-semibold text-[#475467] bg-[#F2F4F7] hover:bg-[#EFF5FC] hover:text-[#004898] px-2 py-0.5 rounded-md">{item.category_name}</button>
                      </td>
                    )}
                    <td className="px-4 py-3 font-mono text-[#475467]">{item.hsn_code || '—'}</td>
                    <td className="px-4 py-3 text-right font-bold text-[#172033] tabular-nums">{formatINR(item.price, { decimals: true })}</td>
                    <td className="px-4 py-3 text-right text-[#475467] tabular-nums">{item.gst_rate}%</td>
                    <td className="px-4 py-3 text-[#667085] max-w-xs truncate" title={item.remark || ''}>{item.remark || '—'}</td>
                    {!readOnly && (
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setModal({ type: 'item', item })} title="Edit" className="p-1.5 rounded-lg text-[#475467] hover:bg-white hover:text-[#004898] border border-transparent hover:border-[#E4E7EC]"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => removeItems([item.id])} title="Delete" className="p-1.5 rounded-lg text-[#475467] hover:bg-white hover:text-[#D92D20] border border-transparent hover:border-[#E4E7EC]"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.total > PAGE_SIZE && (
            <div className="px-4 py-3 border-t border-[#F2F4F7] flex items-center justify-between text-xs text-[#667085]">
              <span className="tabular-nums">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data.total)} of {data.total}</span>
              <div className="flex items-center gap-1">
                <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="p-1.5 rounded-lg border border-[#E4E7EC] disabled:opacity-40 hover:bg-[#F8FAFC]"><ChevronLeft className="w-4 h-4" /></button>
                <span className="px-2 font-semibold text-[#172033] tabular-nums">{page} / {pages}</span>
                <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="p-1.5 rounded-lg border border-[#E4E7EC] disabled:opacity-40 hover:bg-[#F8FAFC]"><ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
          )}
        </section>
      </div>

      {modal?.type === 'item' && (
        <ItemFormModal
          item={modal.item}
          categories={categories}
          defaultCategoryId={activeCat}
          onClose={() => setModal(null)}
          onSaved={refreshAll}
          onCategoryCreated={() => loadCategories()}
          showToast={showToast}
        />
      )}
      {modal?.type === 'import' && (
        <ImportModal categories={categories} onClose={() => setModal(null)} onDone={refreshAll} showToast={showToast} />
      )}
    </div>
  );
};
