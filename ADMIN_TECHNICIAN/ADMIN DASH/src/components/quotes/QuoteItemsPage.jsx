// Quotation Items — the catalog Quote Managers price from. Brands (groups)
// on the left, each with its categories; categories are shared, so the
// category filter shows matching items from every brand. An item is
// identified by brand + model no (rules in catalogShared.jsx). Items from
// before brands existed show in red until sorted on the Clean-up screen.
// Built for large catalogs: server-side search + pagination, bulk delete,
// Excel import/export.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Search, Pencil, Trash2, Upload, Download, FileSpreadsheet, Building2, FolderOpen, Folder,
  X, Check, Package, ChevronLeft, ChevronRight, AlertTriangle, CheckCircle2, Loader2, ListChecks, WandSparkles
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  fetchQuoteGroups, fetchQuoteCategories, fetchQuoteCatalogSummary, createQuoteGroup, renameQuoteGroup, deleteQuoteGroup,
  createQuoteCategory, fetchQuoteItems, createQuoteItem, updateQuoteItem, deleteQuoteItems, importQuoteItems
} from '../../services/quoteApiService';
import { parseItemsWorkbook, validateItemRow, downloadItemsTemplate, exportItemsWorkbook } from '../../utils/quoteItemsExcel';
import { formatINR } from './quoteShared';
import { Modal, NewNameField, CategoryOptions, suggestFromMake } from './catalogShared';
import { QuoteItemsCleanup } from './QuoteItemsCleanup';

const PAGE_SIZE = 50;

function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

const Missing = ({ children = 'Missing' }) => (
  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[#B42318] bg-[#FEF3F2] border border-[#FECDCA] rounded-md px-1.5 py-0.5">
    <AlertTriangle className="w-3 h-3" />{children}
  </span>
);

// ---- Add / edit item ----
// Brand → Category (that brand's own first, or reuse a shared one) → Model No.
// "+ New" for brand or category opens the check-first field.
const ItemFormModal = ({ item, groups: initialGroups, categories: initialCategories, defaultGroupId, defaultCategoryId, onClose, onSaved, onMetaChanged, showToast }) => {
  const isEdit = Boolean(item?.id);
  const [groups, setGroups] = useState(initialGroups);
  const [categories, setCategories] = useState(initialCategories);
  const blank = {
    group_id: defaultGroupId || '', category_id: defaultCategoryId || '', model_no: '', model_name: '', series: '',
    hsn_code: '', price: '', gst_rate: '18', remark: '', product_link: ''
  };
  const [form, setForm] = useState(() => (isEdit ? {
    group_id: item.group_id || '', category_id: item.category_id || '', model_no: item.model_no || '', model_name: item.model_name,
    series: item.series || '', hsn_code: item.hsn_code || '', price: String(item.price), gst_rate: String(item.gst_rate),
    remark: item.remark || '', product_link: item.product_link || ''
  } : blank));
  const [creating, setCreating] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const modelRef = useRef(null);
  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setError(''); };

  const group = groups.find((g) => g.id === form.group_id);
  const category = categories.find((c) => c.id === form.category_id);
  const newToBrand = group && category && !group.categories.some((c) => c.id === category.id);
  const suggestion = useMemo(() => suggestFromMake(form.remark, groups, group?.name), [form.remark, groups, group]);
  const wasUnsorted = isEdit && item.needs_fix;

  const pickGroup = (g) => { setForm((f) => ({ ...f, group_id: g.id })); setCreating(null); setError(''); };
  const pickCategory = (c) => { setForm((f) => ({ ...f, category_id: c.id })); setCreating(null); setError(''); };
  const createGroup = async (name) => {
    const created = await createQuoteGroup(name);
    setGroups((list) => [...list, created].sort((a, b) => a.name.localeCompare(b.name)));
    pickGroup(created);
    onMetaChanged();
    showToast(`Brand “${created.name}” created`, 'success');
  };
  const createCategory = async (name) => {
    const created = await createQuoteCategory(name, form.group_id || undefined);
    setCategories((list) => [...list, created].sort((a, b) => a.name.localeCompare(b.name)));
    if (form.group_id) {
      setGroups((list) => list.map((g) => (g.id === form.group_id ? { ...g, categories: [...g.categories, { id: created.id, name: created.name, item_count: 0 }] } : g)));
    }
    pickCategory(created);
    onMetaChanged();
    showToast(`Category “${created.name}” created`, 'success');
  };

  const save = async (andNew) => {
    if (!form.group_id) return setError('Choose a brand');
    if (!form.category_id) return setError('Choose a category');
    if (!form.model_no.trim()) return setError('Model No is required');
    if (!form.model_name.trim()) return setError('Description is required');
    if (!form.hsn_code.trim()) return setError('HSN/SAC code is required (HSN for products, SAC for services)');
    if (form.price === '' || !(Number(form.price) >= 0)) return setError('Enter a valid price');
    setBusy(true);
    try {
      const payload = { ...form, price: Number(form.price), gst_rate: form.gst_rate === '' ? 18 : Number(form.gst_rate) };
      if (isEdit) await updateQuoteItem(item.id, payload);
      else await createQuoteItem(payload);
      showToast(isEdit ? 'Item updated' : `${group?.name || ''} ${form.model_no.trim()} added`, 'success');
      onSaved();
      if (andNew) {
        setForm({ ...blank, group_id: form.group_id, category_id: form.category_id, series: form.series, gst_rate: form.gst_rate });
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
  const bad = (empty) => (wasUnsorted && empty ? '!border-[#FDA29B] !bg-[#FEF3F2]' : '');
  const pickerSelect = (value, onChange, children, placeholder, empty, autoFocus) => (
    <select value={value} onChange={onChange} autoFocus={autoFocus} className={`${input} font-semibold ${bad(empty)}`}>
      <option value="">{placeholder}</option>
      {children}
    </select>
  );

  return (
    <Modal title={isEdit ? 'Edit Item' : 'Add Item'} icon={Package} onClose={onClose} busy={busy}>
      <form onSubmit={(e) => { e.preventDefault(); save(false); }} className="p-6 space-y-4 overflow-y-auto">
        {wasUnsorted && (
          <p className="rounded-xl border border-[#FECDCA] bg-[#FEF3F2] p-3 text-xs text-[#B42318] flex gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>This item is missing details the catalog now requires. Fill in the boxes marked red: <b>Brand</b>, <b>Category</b>, <b>Model No</b> and <b>HSN / SAC</b>.</span>
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="form-label">Brand *</label>
            {creating === 'brand' ? (
              <NewNameField kind="brand" existing={groups} onCreate={createGroup} onPick={pickGroup} onCancel={() => setCreating(null)} />
            ) : pickerSelect(form.group_id, (e) => (e.target.value === '__new' ? setCreating('brand') : set('group_id')(e)), (
              <>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                <option value="__new">+ New brand…</option>
              </>
            ), 'Choose a brand…', !form.group_id, !form.group_id && !isEdit)}
          </div>
          <div>
            <label className="form-label">Category *</label>
            {creating === 'category' ? (
              <NewNameField kind="category" existing={categories} onCreate={createCategory} onPick={pickCategory} onCancel={() => setCreating(null)} />
            ) : (
              <>
                {pickerSelect(form.category_id, (e) => (e.target.value === '__new' ? setCreating('category') : set('category_id')(e)),
                  <CategoryOptions group={group} categories={categories} />, group ? 'Choose a category…' : 'Choose a brand first, or any category…', !form.category_id)}
                {newToBrand && <p className="text-[11px] text-[#667085] mt-1">“{category.name}” will be added to {group.name}'s categories.</p>}
              </>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr] gap-4">
          <div>
            <label className="form-label">Model No *</label>
            <input ref={modelRef} value={form.model_no} onChange={set('model_no')} placeholder="e.g. 55UL5Q"
              className={`${input} font-mono font-bold ${bad(!form.model_no.trim())}`} autoFocus={Boolean(form.group_id) && !isEdit} />
            {!form.model_no.trim() && suggestion.modelNo && (
              <button type="button" onClick={() => setForm((f) => ({ ...f, model_no: suggestion.modelNo }))}
                className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-[#6941C6] hover:underline">
                <WandSparkles className="w-3 h-3" />Use {suggestion.modelNo}
              </button>
            )}
          </div>
          <div>
            <label className="form-label">Description *</label>
            <input value={form.model_name} onChange={set('model_name')} placeholder="e.g. 55-inch 4K UHD Commercial Display" className={`${input} font-semibold`} />
          </div>
        </div>
        <p className="text-[11px] text-[#667085] -mt-2">Brand + Model No identifies the item. The description can be changed any time.</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="col-span-2 sm:col-span-1">
            <label className="form-label">Series</label>
            <input value={form.series} onChange={set('series')} placeholder="UL Series" className={input} />
          </div>
          <div>
            <label className="form-label">HSN / SAC *</label>
            <input value={form.hsn_code} onChange={set('hsn_code')} placeholder="85287219" title="HSN for products, SAC for services"
              className={`${input} font-mono ${bad(!form.hsn_code.trim())}`} />
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
          <label className="form-label">Model Name / Make <span className="font-normal text-[#98A2B3]">(prints on the quotation as today)</span></label>
          <textarea value={form.remark} onChange={set('remark')} rows={2} placeholder="e.g. LG 55UL5Q" className={`${input} resize-none`} />
        </div>
        <div>
          <label className="form-label">Product Link</label>
          <input inputMode="url" value={form.product_link} onChange={set('product_link')} placeholder="https://… (optional — clickable in the quotation)" className={input} />
        </div>
        {error && <p className="text-xs font-semibold text-[#DC2626] flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" />{error}</p>}
        <div className="pt-3 border-t border-[#E4E7EC] flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} disabled={busy} className="btn btn-secondary">Cancel</button>
          {!isEdit && <button type="button" onClick={() => save(true)} disabled={busy || Boolean(creating)} className="btn btn-secondary">Save &amp; add another</button>}
          <button type="submit" disabled={busy || Boolean(creating)} className="btn btn-primary disabled:opacity-70">
            <CheckCircle2 className="w-4 h-4" /><span>{busy ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Item'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};

// ---- Excel import ----
const ImportModal = ({ groups, categories, onClose, onDone, showToast }) => {
  const [step, setStep] = useState('upload');
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [serverErrors, setServerErrors] = useState([]);
  const fileRef = useRef(null);

  const checked = useMemo(() => rows.map((row) => ({ ...row, problems: validateItemRow(row) })), [rows]);
  const bad = checked.filter((r) => r.problems.length);
  const fresh = (key, list) => {
    const known = new Set(list.map((x) => x.name.trim().toLowerCase()));
    return [...new Set(checked.map((r) => String(r[key] || '').trim()).filter((n) => n && !known.has(n.toLowerCase())))];
  };
  const newGroups = fresh('group', groups);
  const newCats = fresh('category', categories);

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
                <p className="text-xs text-[#667085] mt-1">Columns: Brand, Category, Model No, Description, Series, HSN/SAC, Price, GST %, Model Name / Make</p>
              </div>
              <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
            </label>
            <div className="rounded-xl bg-[#F8FAFC] border border-[#E4E7EC] p-4 text-xs text-[#475467] space-y-1.5">
              <p className="font-bold text-[#172033]">How the import works</p>
              <p>• Brand, Category, Model No, Description, HSN/SAC and Price are required on every row (HSN for products, SAC for services).</p>
              <p>• A brand or category that doesn't exist yet is created. <b>Check the spelling</b> against the preview's “Will create” list first.</p>
              <p>• A row updates the item with the same <b>Brand + Model No</b>; failing that, the item with the same Description. Anything else is added as new.
                So you can <b>Export</b>, fill in Brand / Category / Model No in Excel, and import the sheet back.</p>
              <p>• GST % defaults to 18 when left blank. Price is the cost (OSP).</p>
              <p>• Nothing is saved until you confirm the preview — and if any row is invalid, nothing is saved at all.</p>
            </div>
            <button onClick={downloadItemsTemplate} className="btn btn-secondary text-xs"><Download className="w-4 h-4" />Download template</button>
          </>
        )}

        {step === 'preview' && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                ['Rows', checked.length, 'text-[#172033]'],
                ['Valid', checked.length - bad.length, 'text-[#027A48]'],
                ['With errors', bad.length, bad.length ? 'text-[#B42318]' : 'text-[#98A2B3]'],
                ['New brands', newGroups.length, newGroups.length ? 'text-[#B54708]' : 'text-[#98A2B3]'],
                ['New categories', newCats.length, newCats.length ? 'text-[#B54708]' : 'text-[#98A2B3]']
              ].map(([label, value, tone]) => (
                <div key={label} className="rounded-xl border border-[#E4E7EC] p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#667085]">{label}</p>
                  <p className={`text-2xl font-extrabold tabular-nums ${tone}`}>{value}</p>
                </div>
              ))}
            </div>
            {(newGroups.length > 0 || newCats.length > 0) && (
              <div className="rounded-xl border border-[#FEC84B] bg-[#FFFCF5] p-3 text-xs text-[#93370D] space-y-1">
                <p className="font-bold flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" />Will create — check these aren't misspellings of existing ones</p>
                {newGroups.length > 0 && <p><b>Brands:</b> {newGroups.join(', ')}</p>}
                {newCats.length > 0 && <p><b>Categories:</b> {newCats.join(', ')}</p>}
              </div>
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
                      <th className="px-3 py-2 text-left">Row</th><th className="px-3 py-2 text-left">Brand</th><th className="px-3 py-2 text-left">Category</th>
                      <th className="px-3 py-2 text-left">Model No</th><th className="px-3 py-2 text-left">Description</th>
                      <th className="px-3 py-2 text-left">HSN/SAC</th><th className="px-3 py-2 text-right">Price</th><th className="px-3 py-2 text-right">GST %</th><th className="px-3 py-2 text-left">Check</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F2F4F7]">
                    {[...bad, ...checked.filter((r) => !r.problems.length)].slice(0, 300).map((r) => (
                      <tr key={r.row} className={r.problems.length ? 'bg-[#FEF3F2]' : ''}>
                        <td className="px-3 py-1.5 text-[#98A2B3] tabular-nums">{r.row}</td>
                        <td className="px-3 py-1.5 font-semibold">{String(r.group || '')}</td>
                        <td className="px-3 py-1.5">{String(r.category || '')}</td>
                        <td className="px-3 py-1.5 font-mono font-bold text-[#172033]">{String(r.model_no || '')}</td>
                        <td className="px-3 py-1.5 max-w-[240px] truncate">{String(r.model_name || '')}</td>
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
                {result.created} added · {result.updated} updated · {result.groupsCreated} new brand(s) · {result.categoriesCreated} new categor{result.categoriesCreated === 1 ? 'y' : 'ies'}
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
  const [view, setView] = useState('catalog');
  const [groups, setGroups] = useState([]);
  const [categories, setCategories] = useState([]);
  const [summary, setSummary] = useState(null);
  const [groupSearch, setGroupSearch] = useState('');
  const [activeGroup, setActiveGroup] = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  const [newGroup, setNewGroup] = useState(false);
  const [renaming, setRenaming] = useState(null);
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search);
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ rows: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(() => new Set());
  const [modal, setModal] = useState(null);
  const [exporting, setExporting] = useState(false);

  const reloadMeta = useCallback(async () => {
    try {
      const [g, c, s] = await Promise.all([fetchQuoteGroups(), fetchQuoteCategories(), fetchQuoteCatalogSummary()]);
      setGroups(g);
      setCategories(c);
      setSummary(s);
    } catch (err) { showToast(err.message, 'error'); }
  }, [showToast]);

  // Only the latest request may update the table (fast typing/paging can
  // otherwise let an older, slower response overwrite a newer one).
  const requestSeq = useRef(0);
  const loadItems = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    try {
      const result = await fetchQuoteItems({ search: debounced, group_id: activeGroup, category_id: activeCategory, page, limit: PAGE_SIZE });
      if (seq === requestSeq.current) setData(result);
    } catch (err) {
      if (seq === requestSeq.current) showToast(err.message, 'error');
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [debounced, activeGroup, activeCategory, page, showToast]);

  useEffect(() => { reloadMeta(); }, [reloadMeta]);
  useEffect(() => { if (view === 'catalog') loadItems(); }, [loadItems, view]);
  useEffect(() => { setPage(1); setSelected(new Set()); }, [debounced, activeGroup, activeCategory]);
  // A brand merged or turned into a category on the Clean-up screen disappears.
  useEffect(() => {
    if (activeGroup && activeGroup !== 'none' && groups.length && !groups.some((g) => g.id === activeGroup)) setActiveGroup('');
  }, [activeGroup, groups]);

  const refreshAll = () => { reloadMeta(); loadItems(); };
  const toFix = summary?.to_fix || 0;
  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const visibleGroups = groups.filter((g) => g.name.toLowerCase().includes(groupSearch.trim().toLowerCase()));
  const activeGroupRow = groups.find((g) => g.id === activeGroup);
  const activeCategoryName = categories.find((c) => c.id === activeCategory)?.name;
  const title = activeGroup === 'none' ? 'No brand' : [activeGroupRow?.name, activeCategoryName].filter(Boolean).join(' · ') || 'All items';

  const selectGroup = (id) => { setActiveGroup(id); setActiveCategory(''); };

  const saveRename = async () => {
    const name = (renaming?.name || '').trim();
    if (!name) { setRenaming(null); return; }
    try {
      await renameQuoteGroup(renaming.id, name);
      setRenaming(null);
      refreshAll();
    } catch (err) { showToast(err.message, 'error'); }
  };

  const removeGroup = async (g) => {
    if (!window.confirm(`Delete the empty brand "${g.name}"?`)) return;
    try {
      await deleteQuoteGroup(g.id);
      if (activeGroup === g.id) selectGroup('');
      reloadMeta();
      showToast('Brand deleted', 'success');
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
        const chunk = await fetchQuoteItems({ search: debounced, group_id: activeGroup, category_id: activeCategory, page: p, limit: 200 });
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

  if (view === 'cleanup' && !readOnly) {
    return (
      <QuoteItemsCleanup groups={groups} categories={categories} summary={summary} reloadMeta={reloadMeta}
        onExit={() => { setView('catalog'); reloadMeta(); }} showToast={showToast} />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-[#172033] tracking-tight">Items Catalog</h2>
          <p className="text-xs md:text-sm text-[#667085] mt-0.5">
            {(summary?.total || 0).toLocaleString('en-IN')} items · {groups.length} brands · {categories.length} categories · prices are cost (OSP)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!readOnly && (
            <button onClick={() => setView('cleanup')} className="btn btn-secondary text-xs">
              <ListChecks className="w-4 h-4" />Clean-up
              {toFix > 0 && <span className="text-[10px] font-bold tabular-nums text-white bg-[#D92D20] rounded-full px-1.5">{toFix}</span>}
            </button>
          )}
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

      {toFix > 0 && (
        <div className="rounded-2xl border border-[#FECDCA] bg-[#FEF3F2] px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-[#D92D20] shrink-0" />
          <div className="flex-1 text-xs text-[#7A271A]">
            <p className="font-bold text-sm text-[#B42318]">{toFix.toLocaleString('en-IN')} item{toFix === 1 ? '' : 's'} need sorting</p>
            <p>
              {[
                summary.no_category && `${summary.no_category} without a category`,
                summary.no_model_no && `${summary.no_model_no} without a model no`,
                summary.no_group && `${summary.no_group} without a brand`,
                summary.no_hsn && `${summary.no_hsn} without an HSN/SAC`
              ].filter(Boolean).join(' · ')}. They're marked red below.
            </p>
          </div>
          {!readOnly && (
            <button onClick={() => setView('cleanup')} className="btn btn-primary text-xs shrink-0 !bg-[#D92D20] hover:!bg-[#B42318] !border-[#D92D20]"><ListChecks className="w-4 h-4" />Open clean-up</button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5 items-start">
        {/* Brands */}
        <aside className="card bg-white border border-[#E4E7EC] shadow-xs overflow-hidden lg:sticky lg:top-0">
          <div className="p-3 border-b border-[#F2F4F7] flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-[#98A2B3] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input value={groupSearch} onChange={(e) => setGroupSearch(e.target.value)} placeholder="Find brand"
                className="w-full pl-8 pr-2 py-1.5 text-xs border border-[#E4E7EC] rounded-lg outline-none focus:border-[#004898]" />
            </div>
            {!readOnly && (
              <button onClick={() => setNewGroup(true)} title="New brand" className="p-1.5 rounded-lg border border-[#E4E7EC] text-[#004898] hover:bg-[#EFF5FC]"><Plus className="w-4 h-4" /></button>
            )}
          </div>
          <nav className="p-2 max-h-[calc(100vh-280px)] overflow-y-auto space-y-0.5">
            {newGroup && (
              <div className="pb-2">
                <NewNameField kind="brand" existing={groups} onCancel={() => setNewGroup(false)}
                  onPick={(g) => { setNewGroup(false); selectGroup(g.id); }}
                  onCreate={async (name) => {
                    const created = await createQuoteGroup(name);
                    setNewGroup(false);
                    await reloadMeta();
                    selectGroup(created.id);
                    showToast(`Brand “${created.name}” created`, 'success');
                  }} />
              </div>
            )}
            <button onClick={() => selectGroup('')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${!activeGroup ? 'bg-[#EFF5FC] text-[#004898]' : 'text-[#475467] hover:bg-[#F8FAFC]'}`}>
              <span className="flex items-center gap-2"><Package className="w-4 h-4" />All brands</span>
              <span className="tabular-nums">{summary?.total || 0}</span>
            </button>
            {summary?.no_group > 0 && (
              <button onClick={() => selectGroup('none')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold italic text-[#B42318] ${activeGroup === 'none' ? 'bg-[#FEF3F2]' : 'hover:bg-[#FEF3F2]'}`}>
                <span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4" />No brand</span>
                <span className="tabular-nums not-italic">{summary.no_group}</span>
              </button>
            )}
            {visibleGroups.map((g) => {
              const active = activeGroup === g.id;
              if (renaming?.id === g.id) {
                return (
                  <div key={g.id} className="flex items-center gap-1 px-1 py-1">
                    <input autoFocus value={renaming.name} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })}
                      onKeyDown={(e) => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setRenaming(null); }}
                      className="flex-1 min-w-0 px-2 py-1.5 text-xs border border-[#004898] rounded-lg outline-none" />
                    <button onClick={saveRename} className="p-1.5 text-[#027A48] hover:bg-[#ECFDF3] rounded-lg"><Check className="w-4 h-4" /></button>
                    <button onClick={() => setRenaming(null)} className="p-1.5 text-[#667085] hover:bg-[#F2F4F7] rounded-lg"><X className="w-4 h-4" /></button>
                  </div>
                );
              }
              return (
                <div key={g.id}>
                  <div className={`group flex items-center rounded-lg transition-colors ${active ? 'bg-[#EFF5FC]' : 'hover:bg-[#F8FAFC]'}`}>
                    <button onClick={() => selectGroup(g.id)} className={`flex-1 min-w-0 flex items-center gap-2 px-3 py-2 text-xs font-semibold text-left ${active ? 'text-[#004898]' : 'text-[#475467]'}`}>
                      <Building2 className={`w-4 h-4 shrink-0 ${active ? '' : 'text-[#98A2B3]'}`} />
                      <span className="truncate">{g.name}</span>
                      {g.to_fix_count > 0 && <span title={`${g.to_fix_count} item(s) to sort`} className="w-1.5 h-1.5 rounded-full bg-[#F04438] shrink-0" />}
                    </button>
                    <span className={`text-[11px] tabular-nums pr-2 ${readOnly ? '' : 'group-hover:hidden'} ${active ? 'text-[#004898] font-bold' : 'text-[#98A2B3]'}`}>{g.item_count}</span>
                    {!readOnly && (
                      <span className="hidden group-hover:flex items-center pr-1">
                        <button onClick={() => setRenaming({ id: g.id, name: g.name })} title="Rename" className="p-1 text-[#667085] hover:text-[#004898]"><Pencil className="w-3.5 h-3.5" /></button>
                        {g.item_count === 0 && <button onClick={() => removeGroup(g)} title="Delete empty brand" className="p-1 text-[#667085] hover:text-[#D92D20]"><Trash2 className="w-3.5 h-3.5" /></button>}
                      </span>
                    )}
                  </div>
                  {active && g.categories.length > 0 && (
                    <div className="ml-5 pl-2 border-l border-[#E4E7EC] my-0.5 space-y-0.5">
                      {g.categories.map((c) => {
                        const on = activeCategory === c.id;
                        return (
                          <button key={c.id} onClick={() => setActiveCategory(on ? '' : c.id)}
                            className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-[11px] font-semibold ${on ? 'bg-[#EFF5FC] text-[#004898]' : 'text-[#475467] hover:bg-[#F8FAFC]'}`}>
                            <span className="flex items-center gap-1.5 truncate">{on ? <FolderOpen className="w-3.5 h-3.5" /> : <Folder className="w-3.5 h-3.5 text-[#98A2B3]" />}{c.name}</span>
                            <span className="tabular-nums text-[#98A2B3]">{c.item_count}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            {groups.length === 0 && !newGroup && (
              <div className="text-center py-8 px-4">
                <Building2 className="w-8 h-8 text-[#D0D5DD] mx-auto" />
                <p className="text-xs text-[#667085] mt-2">No brands yet.{!readOnly && ' Create one, or import an Excel sheet.'}</p>
              </div>
            )}
          </nav>
        </aside>

        {/* Items */}
        <section className="card bg-white border border-[#E4E7EC] shadow-xs overflow-hidden min-w-0">
          <div className="p-4 border-b border-[#F2F4F7] flex flex-col xl:flex-row xl:items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <h3 className={`font-extrabold truncate ${activeGroup === 'none' ? 'italic text-[#B42318]' : 'text-[#172033]'}`}>{title}</h3>
              <span className="text-[11px] font-bold text-[#004898] bg-[#EFF5FC] px-2 py-0.5 rounded-full tabular-nums">{data.total}</span>
              {activeGroupRow && !readOnly && (
                <button onClick={() => setModal({ type: 'item' })} className="text-[11px] font-bold text-[#004898] hover:underline flex items-center gap-1 ml-1"><Plus className="w-3 h-3" />Add here</button>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full xl:w-auto">
              <select value={activeCategory} onChange={(e) => setActiveCategory(e.target.value)} title="Category, across every brand"
                className={`text-xs font-semibold border rounded-lg px-3 py-2 outline-none focus:border-[#004898] ${activeCategory ? 'border-[#004898] text-[#004898] bg-[#F5F9FE]' : 'border-[#E4E7EC] text-[#475467]'}`}>
                <option value="">All categories</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.item_count})</option>)}
              </select>
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-[#98A2B3] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search brand, model no, description, HSN…"
                  className="w-full pl-9 pr-8 py-2 text-xs border border-[#E4E7EC] rounded-lg outline-none focus:border-[#004898]" />
                {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[#98A2B3] hover:text-[#172033]"><X className="w-3.5 h-3.5" /></button>}
              </div>
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
                  <th className="px-4 py-3">Description / Series</th>
                  {!activeGroupRow && <th className="px-4 py-3">Brand</th>}
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Model No</th>
                  <th className="px-4 py-3">HSN/SAC</th>
                  <th className="px-4 py-3 text-right">Price (OSP)</th>
                  <th className="px-4 py-3 text-right">GST</th>
                  {!readOnly && <th className="px-4 py-3 text-right w-20" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F2F4F7]">
                {loading && data.rows.length === 0 ? (
                  [...Array(6)].map((_, i) => (
                    <tr key={i}><td colSpan={9} className="px-4 py-3"><div className="h-4 bg-[#F2F4F7] rounded animate-pulse" /></td></tr>
                  ))
                ) : data.rows.length === 0 ? (
                  <tr><td colSpan={9} className="py-16 text-center">
                    <Package className="w-10 h-10 text-[#D0D5DD] mx-auto" />
                    <p className="text-sm font-bold text-[#172033] mt-3">{search || activeCategory ? 'No items match' : 'No items here yet'}</p>
                    {!readOnly && !search && !activeCategory && (
                      <div className="flex justify-center gap-2 mt-4">
                        <button onClick={() => setModal({ type: 'item' })} className="btn btn-primary text-xs"><Plus className="w-4 h-4" />Add Item</button>
                        <button onClick={() => setModal({ type: 'import' })} className="btn btn-secondary text-xs"><Upload className="w-4 h-4" />Import Excel</button>
                      </div>
                    )}
                  </td></tr>
                ) : data.rows.map((item) => (
                  <tr key={item.id} className={`group hover:bg-[#F8FAFC] transition-colors ${selected.has(item.id) ? 'bg-[#F5F9FE]' : ''} ${loading ? 'opacity-60' : ''} ${item.needs_fix ? 'shadow-[inset_3px_0_0_#F04438]' : ''}`}>
                    {!readOnly && <td className="pl-4 py-3"><input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} className="accent-[#004898]" /></td>}
                    <td className="px-4 py-3 max-w-sm">
                      <div className="font-extrabold text-[13px] text-[#172033]">{item.model_name}</div>
                      {item.series && <div className="text-[11px] text-[#667085]">{item.series}</div>}
                      {item.remark && <div className="text-[11px] text-[#98A2B3] truncate" title={item.remark}>Make: {item.remark}</div>}
                    </td>
                    {!activeGroupRow && (
                      <td className="px-4 py-3">
                        {item.group_id
                          ? <button onClick={() => selectGroup(item.group_id)} className="text-[11px] font-bold text-[#344054] hover:text-[#004898]">{item.group_name}</button>
                          : <Missing />}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      {item.category_id
                        ? <button onClick={() => setActiveCategory(item.category_id)} className="text-[11px] font-semibold text-[#475467] bg-[#F2F4F7] hover:bg-[#EFF5FC] hover:text-[#004898] px-2 py-0.5 rounded-md">{item.category_name}</button>
                        : <Missing />}
                    </td>
                    <td className="px-4 py-3 font-mono font-semibold text-[#172033]">{item.model_no || <Missing />}</td>
                    <td className="px-4 py-3 font-mono text-[#475467]">{item.hsn_code || <Missing />}</td>
                    <td className="px-4 py-3 text-right font-bold text-[#172033] tabular-nums">{formatINR(item.price, { decimals: true })}</td>
                    <td className="px-4 py-3 text-right text-[#475467] tabular-nums">{item.gst_rate}%</td>
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
          groups={groups}
          categories={categories}
          defaultGroupId={activeGroupRow?.id}
          defaultCategoryId={activeCategory}
          onClose={() => setModal(null)}
          onSaved={refreshAll}
          onMetaChanged={reloadMeta}
          showToast={showToast}
        />
      )}
      {modal?.type === 'import' && (
        <ImportModal groups={groups} categories={categories} onClose={() => setModal(null)} onDone={refreshAll} showToast={showToast} />
      )}
    </div>
  );
};
