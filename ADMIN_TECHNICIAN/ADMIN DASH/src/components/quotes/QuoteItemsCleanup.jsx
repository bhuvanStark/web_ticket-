// Items > Clean-up. Items added before brands existed were filed under a
// "category" that was mostly a brand name; migration 053 turned those into
// brands and left every item without a category or model no. Items with no
// HSN/SAC are listed here too. This screen sorts them: set brand / category /
// model no / HSN per row or in bulk, merge
// misspelt brands, and turn a "brand" that is really a product type into a
// category. Nothing here deletes an item.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Search, X, Check, CheckCircle2, AlertTriangle, Loader2, Pencil, Trash2, GitMerge, FolderInput, Plus,
  ChevronLeft, ChevronRight, WandSparkles, RefreshCw, ListChecks, Tag, Building2, Hash, Layers
} from 'lucide-react';
import {
  fetchQuoteItems, bulkSetQuoteItems, setQuoteItemModelNos, setQuoteItemHsnCodes, createQuoteGroup, renameQuoteGroup, deleteQuoteGroup,
  mergeQuoteGroup, convertQuoteGroupToCategory, createQuoteCategory, linkQuoteGroupCategory, unlinkQuoteGroupCategory
} from '../../services/quoteApiService';
import { Modal, NewNameField, CategoryOptions, similarNames, suggestFromMake } from './catalogShared';

const PAGE_SIZE = 50;
const NONE = 'none';

const FILTERS = [
  { id: 'any', label: 'To fix' },
  { id: 'category', label: 'No category' },
  { id: 'model_no', label: 'No model no' },
  { id: 'hsn', label: 'No HSN/SAC' },
  { id: 'group', label: 'No brand' },
  { id: 'done', label: 'Done' },
  { id: '', label: 'All' }
];

const RULES = [
  ['Brand', 'is the make: LG, Samsung, Kramer. One name per brand.'],
  ['Category', 'is the product type: Display, Speaker. Shared by all brands, so filtering by Display shows every brand\'s displays.'],
  ['Model No', 'is the maker\'s part number. Brand + Model No identifies an item; two items of one brand can\'t share a model no.'],
  ['HSN / SAC', 'is required: HSN for products, SAC for services. Tally and the DC print it for every item.'],
  ['Description', 'is free text and can be edited any time.']
];

const missing = (item) => ({ group: !item.group_id, category: !item.category_id, model_no: !item.model_no, hsn: !item.hsn_code });
const isDone = (item) => Boolean(item.group_id && item.category_id && item.model_no && item.hsn_code);

function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

// ---- dialogs ----

const NewNameDialog = ({ kind, existing, title, onPick, onCreate, onClose }) => (
  <Modal title={title} icon={kind === 'brand' ? Building2 : Tag} onClose={onClose}>
    <div className="p-5 space-y-3 overflow-y-auto">
      <NewNameField kind={kind} existing={existing} onCreate={onCreate} onPick={onPick} onCancel={onClose} />
      {existing.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#667085] mb-1.5">All {kind === 'brand' ? 'brands' : 'categories'} ({existing.length})</p>
          <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
            {existing.map((x) => (
              <button key={x.id} type="button" onClick={() => onPick(x)}
                className="text-xs font-semibold text-[#475467] bg-[#F2F4F7] hover:bg-[#EFF5FC] hover:text-[#004898] rounded-lg px-2 py-1">{x.name}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  </Modal>
);

const RenameDialog = ({ group, groups, onDone, onClose }) => {
  const [name, setName] = useState(group.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const others = groups.filter((g) => g.id !== group.id);
  const lookalikes = similarNames(name, others);
  const save = async () => {
    setBusy(true);
    try { await renameQuoteGroup(group.id, name.trim()); onDone(`Renamed to “${name.trim()}”`); } catch (err) { setError(err.message); setBusy(false); }
  };
  return (
    <Modal title={`Rename “${group.name}”`} icon={Pencil} onClose={onClose} busy={busy}>
      <div className="p-5 space-y-3">
        <input autoFocus value={name} onChange={(e) => { setName(e.target.value); setError(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && name.trim() && name.trim() !== group.name && !busy) save(); }}
          className="w-full px-3 py-2 text-sm border border-[#E4E7EC] rounded-lg outline-none focus:border-[#004898]" />
        {lookalikes.length > 0 && (
          <p className="text-[11px] text-[#93370D] bg-[#FFFCF5] border border-[#FEC84B] rounded-lg p-2.5 flex gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px text-[#DC6803]" />
            <span>{lookalikes.map((g) => `“${g.name}”`).join(', ')} already exists. If it's the same brand, use <b>Merge</b> instead of renaming.</span>
          </p>
        )}
        {error && <p className="text-xs font-semibold text-[#B42318]">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} disabled={busy} className="btn btn-secondary">Cancel</button>
          <button onClick={save} disabled={busy || !name.trim() || name.trim() === group.name} className="btn btn-primary disabled:opacity-60">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}Rename
          </button>
        </div>
      </div>
    </Modal>
  );
};

const MergeDialog = ({ group, groups, onDone, onClose }) => {
  const others = groups.filter((g) => g.id !== group.id);
  const lookalikes = similarNames(group.name, others);
  const [into, setInto] = useState(lookalikes[0]?.id || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const target = others.find((g) => g.id === into);
  const merge = async () => {
    setBusy(true);
    try {
      const { moved } = await mergeQuoteGroup(group.id, into);
      onDone(`${moved} item(s) moved to “${target.name}”`, into);
    } catch (err) { setError(err.message); setBusy(false); }
  };
  return (
    <Modal title={`Merge “${group.name}”`} icon={GitMerge} onClose={onClose} busy={busy}>
      <div className="p-5 space-y-4">
        <p className="text-sm text-[#475467]">Use this when two brands are really one, e.g. a misspelling. Every item moves across with its category and model no.</p>
        {lookalikes.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <span className="text-[11px] font-semibold text-[#667085] self-center">Looks like:</span>
            {lookalikes.map((g) => (
              <button key={g.id} onClick={() => setInto(g.id)}
                className={`text-xs font-semibold rounded-lg px-2 py-1 border ${into === g.id ? 'border-[#004898] bg-[#EFF5FC] text-[#004898]' : 'border-[#E4E7EC] text-[#475467]'}`}>{g.name}</button>
            ))}
          </div>
        )}
        <div>
          <label className="form-label">Merge into</label>
          <select value={into} onChange={(e) => setInto(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E4E7EC] rounded-lg outline-none focus:border-[#004898] font-semibold">
            <option value="">Choose a brand…</option>
            {others.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.item_count})</option>)}
          </select>
        </div>
        {target && (
          <div className="rounded-xl bg-[#F8FAFC] border border-[#E4E7EC] p-3 text-xs text-[#475467] flex items-center gap-2">
            <span className="font-bold text-[#172033]">{group.name}</span><span className="tabular-nums">({group.item_count})</span>
            <ArrowLeft className="w-3.5 h-3.5 rotate-180 text-[#98A2B3]" />
            <span className="font-bold text-[#004898]">{target.name}</span>
            <span className="ml-auto">“{group.name}” is then removed</span>
          </div>
        )}
        {error && <p className="text-xs font-semibold text-[#B42318]">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="btn btn-secondary">Cancel</button>
          <button onClick={merge} disabled={busy || !into} className="btn btn-primary disabled:opacity-60">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitMerge className="w-4 h-4" />}Merge
          </button>
        </div>
      </div>
    </Modal>
  );
};

const ConvertDialog = ({ group, groups, onDone, onClose }) => {
  const others = groups.filter((g) => g.id !== group.id);
  const [into, setInto] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const convert = async () => {
    setBusy(true);
    try {
      const { moved, category } = await convertQuoteGroupToCategory(group.id, into || null);
      onDone(`“${category.name}” is now a category · ${moved} item(s) ${into ? `moved to ${others.find((g) => g.id === into)?.name}` : 'need a brand'}`, into || NONE);
    } catch (err) { setError(err.message); setBusy(false); }
  };
  return (
    <Modal title={`Turn “${group.name}” into a category`} icon={FolderInput} onClose={onClose} busy={busy}>
      <div className="p-5 space-y-4">
        <p className="text-sm text-[#475467]">
          Use this when <b>“{group.name}”</b> is a product type, not a make. Its {group.item_count} item(s) get the category
          <b> “{group.name}”</b> (unless they already have one) and “{group.name}” stops being a brand.
        </p>
        <div>
          <label className="form-label">Which brand are these items?</label>
          <select value={into} onChange={(e) => setInto(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E4E7EC] rounded-lg outline-none focus:border-[#004898] font-semibold">
            <option value="">Mixed brands, I'll set each one</option>
            {others.map((g) => <option key={g.id} value={g.id}>All of them are {g.name}</option>)}
          </select>
          {!into && (
            <p className="text-[11px] text-[#667085] mt-1.5">
              They'll show under <b>No brand</b>. The clean-up suggests a brand from each item's old “Model Name / Make” text. Model nos already typed are kept.
            </p>
          )}
        </div>
        {error && <p className="text-xs font-semibold text-[#B42318]">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="btn btn-secondary">Cancel</button>
          <button onClick={convert} disabled={busy} className="btn btn-primary disabled:opacity-60">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderInput className="w-4 h-4" />}Turn into category
          </button>
        </div>
      </div>
    </Modal>
  );
};

// ---- one row ----

const cellSelect = (bad) =>
  `w-full min-w-[112px] text-xs font-semibold rounded-lg px-2 py-1.5 outline-none border focus:border-[#004898] ${bad ? 'border-[#FDA29B] bg-[#FEF3F2] text-[#B42318]' : 'border-[#E4E7EC] bg-white text-[#172033]'}`;

const CleanupRow = ({ item, groups, groupsById, categories, selected, onToggle, onSetGroup, onSetCategory, onSaveModelNo, onSaveHsn, state }) => {
  const miss = missing(item);
  const group = groupsById.get(item.group_id);
  const suggestion = useMemo(() => suggestFromMake(item.remark, groups, item.group_name), [item.remark, item.group_name, groups]);
  const [draft, setDraft] = useState(item.model_no || '');
  useEffect(() => { setDraft(item.model_no || ''); }, [item.model_no]);
  // Emptying a box never saves a blank: it puts the saved value back.
  const commit = () => {
    if (!draft.trim()) setDraft(item.model_no || '');
    else if (draft.trim() !== (item.model_no || '')) onSaveModelNo(item, draft.trim());
  };
  const [hsn, setHsn] = useState(item.hsn_code || '');
  useEffect(() => { setHsn(item.hsn_code || ''); }, [item.hsn_code]);
  const commitHsn = () => {
    if (!hsn.trim()) setHsn(item.hsn_code || '');
    else if (hsn.trim() !== (item.hsn_code || '')) onSaveHsn(item, hsn.trim());
  };
  const brandHint = miss.group && suggestion.groupId;
  const modelHint = !item.model_no && suggestion.modelNo && !draft.trim();

  return (
    <tr className={`align-top transition-colors ${selected ? 'bg-[#F5F9FE]' : isDone(item) ? 'bg-[#F6FEF9]' : 'bg-white'}`}>
      <td className="pl-4 py-3"><input type="checkbox" checked={selected} onChange={onToggle} className="accent-[#004898] mt-1" /></td>
      <td className="px-3 py-3 min-w-[190px] max-w-[320px]">
        <div className="font-bold text-[13px] text-[#172033] leading-snug">{item.model_name}</div>
        {item.series && <div className="text-[11px] text-[#667085]">{item.series}</div>}
        {item.remark && (
          <div className="mt-1 text-[11px] text-[#667085]">
            <span className="text-[#98A2B3]">Old make text: </span><span className="font-mono text-[#475467]">{item.remark}</span>
          </div>
        )}
      </td>
      <td className="px-3 py-3">
        <select value={item.group_id || ''} disabled={state?.saving} onChange={(e) => onSetGroup(item, e.target.value)} className={cellSelect(miss.group)}>
          {!item.group_id && <option value="">Choose brand…</option>}
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          <option value="__new">+ New brand…</option>
        </select>
        {brandHint && (
          <button onClick={() => onSetGroup(item, suggestion.groupId)} className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-[#6941C6] hover:underline">
            <WandSparkles className="w-3 h-3" />Use {suggestion.groupName}
          </button>
        )}
      </td>
      <td className="px-3 py-3">
        <select value={item.category_id || ''} disabled={state?.saving} onChange={(e) => onSetCategory(item, e.target.value)} className={cellSelect(miss.category)}>
          {!item.category_id && <option value="">Choose category…</option>}
          <CategoryOptions group={group} categories={categories} />
        </select>
      </td>
      <td className="px-3 py-3">
        <input value={draft} disabled={state?.saving || miss.group} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setDraft(item.model_no || ''); }}
          placeholder={miss.group ? 'Brand first' : 'Model no'}
          className={`w-full min-w-[100px] text-xs font-mono font-semibold rounded-lg px-2 py-1.5 outline-none border focus:border-[#004898] disabled:opacity-60 ${miss.model_no && !draft.trim() ? 'border-[#FDA29B] bg-[#FEF3F2] placeholder:text-[#F97066]' : 'border-[#E4E7EC] bg-white text-[#172033]'}`} />
        {modelHint && !miss.group && (
          <button onClick={() => onSaveModelNo(item, suggestion.modelNo)} className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-[#6941C6] hover:underline">
            <WandSparkles className="w-3 h-3" />Use {suggestion.modelNo}
          </button>
        )}
      </td>
      <td className="px-3 py-3">
        <input value={hsn} disabled={state?.saving} onChange={(e) => setHsn(e.target.value)} onBlur={commitHsn}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setHsn(item.hsn_code || ''); }}
          placeholder="HSN / SAC" title="HSN for products, SAC for services"
          className={`w-full min-w-[84px] text-xs font-mono font-semibold rounded-lg px-2 py-1.5 outline-none border focus:border-[#004898] disabled:opacity-60 ${miss.hsn && !hsn.trim() ? 'border-[#FDA29B] bg-[#FEF3F2] placeholder:text-[#F97066]' : 'border-[#E4E7EC] bg-white text-[#172033]'}`} />
      </td>
      <td className="pr-4 py-3 text-right w-20 whitespace-nowrap">
        {state?.saving ? <Loader2 className="w-4 h-4 animate-spin text-[#004898] ml-auto mt-1" />
          : state?.error ? <span className="text-[11px] font-semibold text-[#B42318]" title={state.error}>{state.error}</span>
            : isDone(item) ? <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#027A48] mt-1"><CheckCircle2 className="w-3.5 h-3.5" />Done</span>
              : <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#B42318] mt-1"><AlertTriangle className="w-3.5 h-3.5" />{Object.values(miss).filter(Boolean).length} to fix</span>}
      </td>
    </tr>
  );
};

// ---- screen ----

export const QuoteItemsCleanup = ({ groups, categories, summary, reloadMeta, onExit, showToast }) => {
  const [activeGroup, setActiveGroup] = useState('');
  const [groupSearch, setGroupSearch] = useState('');
  const [filter, setFilter] = useState('any');
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search);
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ rows: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [rowState, setRowState] = useState({});
  const [dialog, setDialog] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [showRules, setShowRules] = useState(true);

  const groupsById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const categoriesById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const activeGroupRow = groupsById.get(activeGroup);

  const requestSeq = useRef(0);
  const loadItems = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    try {
      const result = await fetchQuoteItems({ search: debounced, group_id: activeGroup, needs_fix: filter, page, limit: PAGE_SIZE });
      if (seq !== requestSeq.current) return;
      // Fixing items shrinks a "to fix" list, so a later page can come back empty.
      if (!result.rows.length && page > 1) { setPage(1); return; }
      setData(result);
      setStale(false);
      setRowState({});
      setSelected(new Set());
    } catch (err) {
      if (seq === requestSeq.current) showToast(err.message, 'error');
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [debounced, activeGroup, filter, page, showToast]);

  useEffect(() => { loadItems(); }, [loadItems]);
  useEffect(() => { setPage(1); setSelected(new Set()); }, [debounced, activeGroup, filter]);
  // A merged/converted brand disappears; fall back to all.
  useEffect(() => { if (activeGroup && activeGroup !== NONE && !groupsById.has(activeGroup)) setActiveGroup(''); }, [activeGroup, groupsById]);

  // Row edits refresh the counts once things settle, not after every keystroke-save.
  const metaTimer = useRef(null);
  const refreshMeta = useCallback(() => {
    clearTimeout(metaTimer.current);
    metaTimer.current = setTimeout(() => reloadMeta(), 500);
  }, [reloadMeta]);
  useEffect(() => () => clearTimeout(metaTimer.current), []);

  const patchRows = (ids, patch) => {
    const set = new Set(ids);
    setData((d) => ({ ...d, rows: d.rows.map((r) => (set.has(r.id) ? { ...r, ...(typeof patch === 'function' ? patch(r) : patch) } : r)) }));
    setStale(true);
  };
  const setSaving = (ids, value) => setRowState((s) => {
    const next = { ...s };
    ids.forEach((id) => { next[id] = value; });
    return next;
  });

  // `name` is passed when the brand/category was just created (not in props yet).
  const applyGroup = async (ids, groupId, name) => {
    setSaving(ids, { saving: true });
    try {
      await bulkSetQuoteItems(ids, { groupId });
      patchRows(ids, { group_id: groupId, group_name: name || groupsById.get(groupId)?.name || '' });
      setSaving(ids, null);
      refreshMeta();
      return true;
    } catch (err) {
      setSaving(ids, { error: err.message });
      showToast(err.message, 'error');
      return false;
    }
  };

  const applyCategory = async (ids, categoryId, name) => {
    setSaving(ids, { saving: true });
    try {
      await bulkSetQuoteItems(ids, { categoryId });
      patchRows(ids, { category_id: categoryId, category_name: name || categoriesById.get(categoryId)?.name || '' });
      setSaving(ids, null);
      refreshMeta();
      return true;
    } catch (err) {
      setSaving(ids, { error: err.message });
      showToast(err.message, 'error');
      return false;
    }
  };

  const applyModelNos = async (list) => {
    const ids = list.map((x) => x.id);
    setSaving(ids, { saving: true });
    try {
      const { skipped } = await setQuoteItemModelNos(list.map(({ id, model_no }) => ({ id, model_no: model_no || null })));
      const skippedIds = new Set(skipped.map((s) => s.id));
      const byId = new Map(list.map((x) => [x.id, x.model_no || null]));
      patchRows(ids.filter((id) => !skippedIds.has(id)), (r) => ({ model_no: byId.get(r.id) }));
      setRowState((s) => {
        const next = { ...s };
        ids.forEach((id) => { next[id] = skippedIds.has(id) ? { error: 'Brand already has this model no' } : null; });
        return next;
      });
      refreshMeta();
      return { saved: ids.length - skippedIds.size, skipped: skippedIds.size };
    } catch (err) {
      setSaving(ids, { error: err.message });
      showToast(err.message, 'error');
      return { saved: 0, skipped: ids.length };
    }
  };

  const onSetGroup = (item, value) => {
    if (value === '__new') return setDialog({ type: 'newBrand', ids: [item.id] });
    if (value && value !== item.group_id) applyGroup([item.id], value);
  };
  const onSetCategory = (item, value) => {
    if (value === '__new') return setDialog({ type: 'newCategory', ids: [item.id], groupId: item.group_id });
    if (value && value !== item.category_id) applyCategory([item.id], value);
  };
  const onSaveModelNo = (item, value) => applyModelNos([{ id: item.id, model_no: value }]);
  const onSaveHsn = async (item, value) => {
    setSaving([item.id], { saving: true });
    try {
      await setQuoteItemHsnCodes([{ id: item.id, hsn_code: value || null }]);
      patchRows([item.id], { hsn_code: value || null });
      setSaving([item.id], null);
      refreshMeta();
    } catch (err) {
      setSaving([item.id], { error: err.message });
      showToast(err.message, 'error');
    }
  };

  // Suggestions on this page: brand first (model no depends on it), then model
  // no. Only confident ones are bulk-applied; the rest stay as per-row hints.
  const suggestions = useMemo(() => data.rows.map((item) => {
    const s = suggestFromMake(item.remark, groups, item.group_name);
    return {
      item,
      groupId: !item.group_id && s.groupId ? s.groupId : null,
      modelNo: !item.model_no && s.modelNo && s.confident && (item.group_id || s.groupId) ? s.modelNo : null
    };
  }).filter((s) => s.groupId || s.modelNo), [data.rows, groups]);

  const applySuggestions = async () => {
    setBulkBusy(true);
    const byGroup = new Map();
    for (const s of suggestions) if (s.groupId) byGroup.set(s.groupId, [...(byGroup.get(s.groupId) || []), s.item.id]);
    let brands = 0;
    const brandFailed = new Set();
    for (const [groupId, ids] of byGroup) {
      if (await applyGroup(ids, groupId)) brands += ids.length;
      else ids.forEach((id) => brandFailed.add(id));
    }
    // A model no needs its brand; skip rows whose brand didn't save.
    const models = suggestions.filter((s) => s.modelNo && !brandFailed.has(s.item.id)).map((s) => ({ id: s.item.id, model_no: s.modelNo }));
    const result = models.length ? await applyModelNos(models) : { saved: 0, skipped: 0 };
    setBulkBusy(false);
    const problems = brandFailed.size + result.skipped;
    showToast(`Applied ${brands} brand(s) and ${result.saved} model no(s)${problems ? ` · ${problems} need a look (marked on the row)` : ''}`, problems ? 'warning' : 'success');
  };

  const bulk = async (kind, value) => {
    const ids = [...selected];
    if (!ids.length || !value) return;
    if (value === '__new') return setDialog({ type: kind === 'group' ? 'newBrand' : 'newCategory', ids, groupId: activeGroupRow?.id });
    setBulkBusy(true);
    const ok = kind === 'group' ? await applyGroup(ids, value) : await applyCategory(ids, value);
    setBulkBusy(false);
    if (ok) { showToast(`${ids.length} item(s) updated`, 'success'); setSelected(new Set()); }
  };

  // dialog results
  const pickBrandFor = async (ids, group) => { setDialog(null); if (ids?.length) await applyGroup(ids, group.id, group.name); };
  const pickCategoryFor = async (ids, category, groupId) => {
    setDialog(null);
    if (groupId) await linkQuoteGroupCategory(groupId, category.id).catch((err) => showToast(err.message, 'error'));
    if (ids?.length) await applyCategory(ids, category.id, category.name);
    else reloadMeta();
  };
  const afterGroupAction = async (message, focus) => {
    setDialog(null);
    showToast(message, 'success');
    await reloadMeta();
    if (focus) setActiveGroup(focus);
    loadItems();
  };

  const removeGroup = async (group) => {
    if (!window.confirm(`Remove the empty brand “${group.name}”?`)) return;
    try { await deleteQuoteGroup(group.id); showToast('Brand removed', 'success'); reloadMeta(); } catch (err) { showToast(err.message, 'error'); }
  };
  const unlink = async (group, category) => {
    try { await unlinkQuoteGroupCategory(group.id, category.id); reloadMeta(); } catch (err) { showToast(err.message, 'error'); }
  };

  const allOnPage = data.rows.length > 0 && data.rows.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected((s) => {
    const next = new Set(s);
    if (allOnPage) data.rows.forEach((r) => next.delete(r.id)); else data.rows.forEach((r) => next.add(r.id));
    return next;
  });
  const toggle = (id) => setSelected((s) => { const next = new Set(s); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  const total = summary?.total || 0;
  const toFix = summary?.to_fix || 0;
  const pct = total ? Math.round(((total - toFix) / total) * 100) : 100;
  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const visibleGroups = groups.filter((g) => g.name.toLowerCase().includes(groupSearch.trim().toLowerCase()));
  // On these filters a sorted item leaves the list, so paging forward after
  // edits would skip items; reloading the same page brings the next ones up.
  const shrinking = filter !== '' && filter !== 'done';
  const headerTitle = activeGroup === NONE ? 'No brand' : activeGroupRow?.name || 'All brands';

  return (
    <div className="space-y-5">
      {/* Header + progress */}
      <div className="card bg-white border border-[#E4E7EC] shadow-xs p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <button onClick={onExit} className="p-2 rounded-xl border border-[#E4E7EC] text-[#475467] hover:bg-[#F8FAFC]" title="Back to catalog"><ArrowLeft className="w-4 h-4" /></button>
            <div>
              <h2 className="text-2xl font-extrabold text-[#172033] tracking-tight flex items-center gap-2"><ListChecks className="w-6 h-6 text-[#004898]" />Catalog clean-up</h2>
              <p className="text-xs md:text-sm text-[#667085] mt-0.5 max-w-2xl">
                Give every item a <b>Brand</b>, a <b>Category</b>, a <b>Model No</b> and an <b>HSN / SAC</b> code. Changes save as you go, and nothing is deleted.
              </p>
            </div>
          </div>
          <div className="lg:text-right shrink-0">
            <p className="text-3xl font-extrabold tabular-nums text-[#172033]">{pct}%</p>
            <p className="text-xs text-[#667085] tabular-nums">{(total - toFix).toLocaleString('en-IN')} of {total.toLocaleString('en-IN')} sorted</p>
          </div>
        </div>
        <div className="h-2 rounded-full bg-[#F2F4F7] overflow-hidden">
          <div className={`h-full rounded-full transition-all ${toFix ? 'bg-[#004898]' : 'bg-[#12B76A]'}`} style={{ width: `${pct}%` }} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {[
            ['any', 'Still to fix', toFix, ListChecks],
            ['category', 'No category', summary?.no_category || 0, Layers],
            ['model_no', 'No model no', summary?.no_model_no || 0, Hash],
            ['hsn', 'No HSN/SAC', summary?.no_hsn || 0, Tag],
            ['group', 'No brand', summary?.no_group || 0, Building2]
          ].map(([id, label, value, Icon]) => (
            <button key={id} onClick={() => setFilter(id)}
              className={`text-left rounded-xl border p-3 transition-colors ${filter === id ? 'border-[#004898] bg-[#F5F9FE]' : 'border-[#E4E7EC] hover:bg-[#F8FAFC]'}`}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#667085] flex items-center gap-1.5"><Icon className="w-3.5 h-3.5" />{label}</p>
              <p className={`text-2xl font-extrabold tabular-nums ${value ? 'text-[#B42318]' : 'text-[#027A48]'}`}>{value}</p>
            </button>
          ))}
        </div>
        {toFix === 0 && total > 0 && (
          <p className="text-sm font-semibold text-[#027A48] flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />Every item has a brand, a category, a model no and an HSN/SAC. The catalog is clean.</p>
        )}
      </div>

      {/* Rules */}
      <div className="rounded-2xl border border-[#B3D1F2] bg-[#F5F9FE] px-4 py-3">
        <button onClick={() => setShowRules((v) => !v)} className="w-full flex items-center justify-between text-xs font-bold text-[#004898]">
          <span>The rules for every item</span><span>{showRules ? 'Hide' : 'Show'}</span>
        </button>
        {showRules && (
          <ul className="mt-2 grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-[#344054]">
            {RULES.map(([term, text]) => <li key={term}><b className="text-[#172033]">{term}</b> {text}</li>)}
            <li className="sm:col-span-2 text-[#475467]">
              A “brand” that is really a product type (e.g. <i>AV Switching</i>, <i>Display Mount</i>)? Use <b>Turn into category</b>. Two spellings of one brand (e.g. <i>Krammer</i> / <i>Kramer</i>)? Use <b>Merge</b>.
            </li>
          </ul>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-5 items-start">
        {/* Brands */}
        <aside className="card bg-white border border-[#E4E7EC] shadow-xs overflow-hidden lg:sticky lg:top-0">
          <div className="p-3 border-b border-[#F2F4F7] flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-[#98A2B3] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input value={groupSearch} onChange={(e) => setGroupSearch(e.target.value)} placeholder="Find brand"
                className="w-full pl-8 pr-2 py-1.5 text-xs border border-[#E4E7EC] rounded-lg outline-none focus:border-[#004898]" />
            </div>
            <button onClick={() => setDialog({ type: 'newBrand' })} title="New brand" className="p-1.5 rounded-lg border border-[#E4E7EC] text-[#004898] hover:bg-[#EFF5FC]"><Plus className="w-4 h-4" /></button>
          </div>
          <nav className="p-2 max-h-[calc(100vh-260px)] overflow-y-auto space-y-0.5">
            {[['', 'All brands', summary?.to_fix || 0], ...(summary?.no_group ? [[NONE, 'No brand', summary.no_group]] : [])].map(([id, label, n]) => (
              <button key={id || 'all'} onClick={() => setActiveGroup(id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold ${activeGroup === id ? 'bg-[#EFF5FC] text-[#004898]' : 'text-[#475467] hover:bg-[#F8FAFC]'}`}>
                <span className={id === NONE ? 'italic' : ''}>{label}</span>
                {n > 0 && <span className="text-[10px] font-bold tabular-nums text-[#B42318] bg-[#FEF3F2] rounded-full px-1.5">{n}</span>}
              </button>
            ))}
            <div className="h-px bg-[#F2F4F7] my-1.5" />
            {visibleGroups.map((g) => {
              const active = activeGroup === g.id;
              const lookalike = similarNames(g.name, groups.filter((o) => o.id !== g.id)).length > 0;
              return (
                <div key={g.id} className={`group rounded-lg ${active ? 'bg-[#EFF5FC]' : 'hover:bg-[#F8FAFC]'}`}>
                  <div className="flex items-center">
                    <button onClick={() => setActiveGroup(g.id)} className={`flex-1 min-w-0 flex items-center gap-2 px-3 py-2 text-xs font-semibold text-left ${active ? 'text-[#004898]' : 'text-[#344054]'}`}>
                      <span className="truncate">{g.name}</span>
                      {lookalike && <span title="Another brand has a similar name — merge?" className="text-[9px] font-bold uppercase text-[#B54708] bg-[#FFFAEB] border border-[#FEC84B] rounded px-1">Similar</span>}
                    </button>
                    <span className="pr-2 group-hover:hidden">
                      {g.to_fix_count > 0
                        ? <span className="text-[10px] font-bold tabular-nums text-[#B42318] bg-[#FEF3F2] rounded-full px-1.5">{g.to_fix_count}/{g.item_count}</span>
                        : <CheckCircle2 className="w-3.5 h-3.5 text-[#12B76A]" />}
                    </span>
                    <span className="hidden group-hover:flex items-center pr-1">
                      <button onClick={() => setDialog({ type: 'rename', group: g })} title="Rename" className="p-1 text-[#667085] hover:text-[#004898]"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setDialog({ type: 'merge', group: g })} title="Merge into another brand" className="p-1 text-[#667085] hover:text-[#004898]"><GitMerge className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setDialog({ type: 'convert', group: g })} title="Turn into category" className="p-1 text-[#667085] hover:text-[#004898]"><FolderInput className="w-3.5 h-3.5" /></button>
                      {g.item_count === 0 && <button onClick={() => removeGroup(g)} title="Remove empty brand" className="p-1 text-[#667085] hover:text-[#D92D20]"><Trash2 className="w-3.5 h-3.5" /></button>}
                    </span>
                  </div>
                </div>
              );
            })}
          </nav>
          <div className="px-3 py-2.5 border-t border-[#F2F4F7] text-[10px] text-[#98A2B3] flex flex-wrap gap-x-3 gap-y-1">
            <span className="flex items-center gap-1"><Pencil className="w-3 h-3" />Rename</span>
            <span className="flex items-center gap-1"><GitMerge className="w-3 h-3" />Merge</span>
            <span className="flex items-center gap-1"><FolderInput className="w-3 h-3" />Turn into category</span>
          </div>
        </aside>

        {/* Items */}
        <section className="card bg-white border border-[#E4E7EC] shadow-xs overflow-hidden min-w-0">
          <div className="p-4 border-b border-[#F2F4F7] space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <h3 className={`font-extrabold text-[#172033] truncate ${activeGroup === NONE ? 'italic' : ''}`}>{headerTitle}</h3>
                <span className="text-[11px] font-bold text-[#004898] bg-[#EFF5FC] px-2 py-0.5 rounded-full tabular-nums">{data.total}</span>
                {activeGroupRow && (
                  <span className="hidden md:flex items-center gap-1 ml-1">
                    <button onClick={() => setDialog({ type: 'merge', group: activeGroupRow })} className="text-[11px] font-bold text-[#475467] hover:text-[#004898] flex items-center gap-1 px-1.5"><GitMerge className="w-3 h-3" />Merge</button>
                    <button onClick={() => setDialog({ type: 'convert', group: activeGroupRow })} className="text-[11px] font-bold text-[#475467] hover:text-[#004898] flex items-center gap-1 px-1.5"><FolderInput className="w-3 h-3" />Turn into category</button>
                  </span>
                )}
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-[#98A2B3] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search description, make text…"
                  className="w-full pl-9 pr-8 py-2 text-xs border border-[#E4E7EC] rounded-lg outline-none focus:border-[#004898]" />
                {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[#98A2B3] hover:text-[#172033]"><X className="w-3.5 h-3.5" /></button>}
              </div>
            </div>

            {activeGroupRow && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#667085] mr-1">Categories in {activeGroupRow.name}</span>
                {activeGroupRow.categories.map((c) => (
                  <span key={c.id} className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#344054] bg-[#F2F4F7] rounded-md pl-2 pr-1 py-0.5">
                    {c.name}<span className="text-[#98A2B3] tabular-nums">{c.item_count}</span>
                    {Number(c.item_count) === 0 && <button onClick={() => unlink(activeGroupRow, c)} title="Remove from this brand" className="p-0.5 text-[#98A2B3] hover:text-[#D92D20]"><X className="w-3 h-3" /></button>}
                  </span>
                ))}
                <button onClick={() => setDialog({ type: 'newCategory', ids: [], groupId: activeGroupRow.id })}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-[#004898] hover:bg-[#EFF5FC] rounded-md px-2 py-0.5"><Plus className="w-3 h-3" />Add category</button>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1 bg-[#F2F4F7] rounded-xl p-1">
                {FILTERS.map((f) => (
                  <button key={f.id || 'all'} onClick={() => setFilter(f.id)}
                    className={`text-[11px] font-bold rounded-lg px-2.5 py-1 ${filter === f.id ? 'bg-white text-[#004898] shadow-xs' : 'text-[#475467] hover:text-[#172033]'}`}>{f.label}</button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                {stale && (
                  <button onClick={loadItems} className="text-[11px] font-bold text-[#475467] hover:text-[#004898] flex items-center gap-1"><RefreshCw className="w-3 h-3" />Refresh list</button>
                )}
                {suggestions.length > 0 && (
                  <button onClick={applySuggestions} disabled={bulkBusy}
                    className="text-[11px] font-bold text-white bg-[#6941C6] hover:bg-[#53389E] rounded-lg px-2.5 py-1.5 flex items-center gap-1.5 disabled:opacity-60"
                    title="Fill brand and model no from each item's old Model Name / Make text, where it can be read">
                    {bulkBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <WandSparkles className="w-3.5 h-3.5" />}Apply {suggestions.length} suggestion{suggestions.length === 1 ? '' : 's'} on this page
                  </button>
                )}
              </div>
            </div>
          </div>

          {selected.size > 0 && (
            <div className="px-4 py-2 bg-[#EFF5FC] border-b border-[#B3D1F2] flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold text-[#004898] mr-1">{selected.size} selected</span>
              <select value="" disabled={bulkBusy} onChange={(e) => bulk('group', e.target.value)} className="text-xs font-semibold border border-[#B3D1F2] bg-white rounded-lg px-2 py-1.5 outline-none">
                <option value="">Set brand…</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                <option value="__new">+ New brand…</option>
              </select>
              <select value="" disabled={bulkBusy} onChange={(e) => bulk('category', e.target.value)} className="text-xs font-semibold border border-[#B3D1F2] bg-white rounded-lg px-2 py-1.5 outline-none">
                <option value="">Set category…</option>
                <CategoryOptions group={activeGroupRow} categories={categories} />
              </select>
              {bulkBusy && <Loader2 className="w-4 h-4 animate-spin text-[#004898]" />}
              <button onClick={() => setSelected(new Set())} className="ml-auto font-semibold text-[#475467] hover:text-[#172033] px-2 py-1">Clear</button>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-[#F8FAFC] text-[#667085] uppercase font-bold text-[10px] tracking-wider border-b border-[#E4E7EC]">
                <tr>
                  <th className="pl-4 py-3 w-8"><input type="checkbox" checked={allOnPage} onChange={toggleAll} className="accent-[#004898]" /></th>
                  <th className="px-3 py-3">Item</th>
                  <th className="px-3 py-3">Brand</th>
                  <th className="px-3 py-3">Category</th>
                  <th className="px-3 py-3">Model No</th>
                  <th className="px-3 py-3">HSN / SAC</th>
                  <th className="pr-4 py-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F2F4F7]">
                {loading && data.rows.length === 0 ? (
                  [...Array(6)].map((_, i) => <tr key={i}><td colSpan={7} className="px-4 py-4"><div className="h-4 bg-[#F2F4F7] rounded animate-pulse" /></td></tr>)
                ) : data.rows.length === 0 ? (
                  <tr><td colSpan={7} className="py-16 text-center">
                    <CheckCircle2 className="w-10 h-10 text-[#12B76A] mx-auto" />
                    <p className="text-sm font-bold text-[#172033] mt-3">{filter === 'done' || filter === '' ? 'No items here' : 'Nothing left to fix here'}</p>
                    {filter !== '' && <button onClick={() => setFilter('')} className="mt-2 text-xs font-bold text-[#004898] hover:underline">Show all items</button>}
                  </td></tr>
                ) : data.rows.map((item) => (
                  <CleanupRow key={item.id} item={item} groups={groups} groupsById={groupsById} categories={categories}
                    selected={selected.has(item.id)} onToggle={() => toggle(item.id)} state={rowState[item.id]}
                    onSetGroup={onSetGroup} onSetCategory={onSetCategory} onSaveModelNo={onSaveModelNo} onSaveHsn={onSaveHsn} />
                ))}
              </tbody>
            </table>
          </div>

          {stale && shrinking && data.rows.length > 0 && (
            <div className="px-4 py-3 border-t border-[#B3D1F2] bg-[#F5F9FE] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <span className="text-[#475467]">Sorted items drop off this list when it refreshes.</span>
              <button onClick={loadItems} className="btn btn-primary text-xs"><RefreshCw className="w-3.5 h-3.5" />Next items to fix</button>
            </div>
          )}
          {data.total > PAGE_SIZE && (
            <div className="px-4 py-3 border-t border-[#F2F4F7] flex items-center justify-between text-xs text-[#667085]">
              <span className="tabular-nums">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data.total)} of {data.total}</span>
              <div className="flex items-center gap-1">
                <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="p-1.5 rounded-lg border border-[#E4E7EC] disabled:opacity-40 hover:bg-[#F8FAFC]"><ChevronLeft className="w-4 h-4" /></button>
                <span className="px-2 font-semibold text-[#172033] tabular-nums">{page} / {pages}</span>
                <button disabled={page >= pages} onClick={() => (stale && shrinking ? loadItems() : setPage((p) => p + 1))} className="p-1.5 rounded-lg border border-[#E4E7EC] disabled:opacity-40 hover:bg-[#F8FAFC]"><ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
          )}
        </section>
      </div>

      {dialog?.type === 'newBrand' && (
        <NewNameDialog kind="brand" title="New brand" existing={groups} onClose={() => setDialog(null)}
          onPick={(g) => pickBrandFor(dialog.ids, g)}
          onCreate={async (name) => {
            const created = await createQuoteGroup(name);
            await reloadMeta();
            showToast(`Brand “${created.name}” created`, 'success');
            if (dialog.ids?.length) await pickBrandFor(dialog.ids, created); else setDialog(null);
          }} />
      )}
      {dialog?.type === 'newCategory' && (
        <NewNameDialog kind="category" existing={categories} onClose={() => setDialog(null)}
          title={dialog.groupId && groupsById.get(dialog.groupId) ? `New category in ${groupsById.get(dialog.groupId).name}` : 'New category'}
          onPick={(c) => pickCategoryFor(dialog.ids, c, dialog.groupId)}
          onCreate={async (name) => {
            const created = await createQuoteCategory(name, dialog.groupId);
            await reloadMeta();
            showToast(`Category “${created.name}” created`, 'success');
            if (dialog.ids?.length) { setDialog(null); await applyCategory(dialog.ids, created.id, created.name); } else setDialog(null);
          }} />
      )}
      {dialog?.type === 'rename' && <RenameDialog group={dialog.group} groups={groups} onClose={() => setDialog(null)} onDone={(m) => afterGroupAction(m)} />}
      {dialog?.type === 'merge' && <MergeDialog group={dialog.group} groups={groups} onClose={() => setDialog(null)} onDone={afterGroupAction} />}
      {dialog?.type === 'convert' && <ConvertDialog group={dialog.group} groups={groups} onClose={() => setDialog(null)} onDone={afterGroupAction} />}
    </div>
  );
};
