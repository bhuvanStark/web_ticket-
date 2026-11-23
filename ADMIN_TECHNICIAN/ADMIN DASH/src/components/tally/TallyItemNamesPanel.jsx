// Item names — each catalog item's Tally stock item name and unit. Filled
// here or on a voucher (a voucher remembers what was typed). The catalog item
// itself is never changed from Tally Desk.
import React, { useCallback, useEffect, useState } from 'react';
import { Search, X, Loader2, Save, Wand2 } from 'lucide-react';
import { fetchTallyItems, setTallyItemName } from '../../services/tallyApiService';

const FILTERS = [['', 'All'], ['no', 'Not linked'], ['yes', 'Linked']];
const suggestion = (row) => (row.brand && row.model_no ? `${row.brand} ${row.model_no}` : '');

const Row = ({ row, onSaved, showToast }) => {
  const [stock, setStock] = useState(row.stock_item_name || '');
  const [unit, setUnit] = useState(row.unit_name || 'Nos');
  const [saving, setSaving] = useState(false);
  const dirty = stock.trim() !== (row.stock_item_name || '') || (stock.trim() && unit.trim() !== (row.unit_name || ''));

  const save = async () => {
    setSaving(true);
    try {
      onSaved(row.id, await setTallyItemName(row.id, stock, unit));
      showToast(stock.trim() ? 'Tally name saved' : 'Tally name removed', 'success');
    } catch (err) { showToast(err.message, 'error'); } finally { setSaving(false); }
  };

  return (
    <tr className="align-top">
      <td className="px-4 py-3">
        <div className="font-bold text-[12px] text-[#172033]">{row.brand || <span className="text-[#98A2B3]">No brand</span>}{row.model_no && <span className="font-mono text-[#475467]"> · {row.model_no}</span>}</div>
        <div className="text-[11px] text-[#667085] max-w-sm truncate" title={row.model_name}>{row.model_name}</div>
      </td>
      <td className="px-4 py-3 font-mono text-[11px] text-[#475467]">{row.hsn_code || '—'}</td>
      <td className="px-4 py-3 min-w-[240px]">
        <div className="flex gap-1">
          <input value={stock} onChange={(e) => setStock(e.target.value)} placeholder={suggestion(row) || 'Tally stock item name'}
            className="flex-1 min-w-0 px-2 py-1.5 border border-[#E4E7EC] rounded-md text-[11px] font-mono outline-none focus:border-[#004898]" />
          {!stock && suggestion(row) && (
            <button onClick={() => setStock(suggestion(row))} title="Use Brand + Model No" className="p-1.5 text-[#004898] hover:bg-[#EFF5FC] rounded-md"><Wand2 className="w-3.5 h-3.5" /></button>
          )}
        </div>
      </td>
      <td className="px-4 py-3 w-24">
        <input value={unit} onChange={(e) => setUnit(e.target.value)}
          className="w-full px-2 py-1.5 border border-[#E4E7EC] rounded-md text-[11px] font-mono outline-none focus:border-[#004898]" />
      </td>
      <td className="px-4 py-3 w-20 text-right">
        <button onClick={save} disabled={!dirty || saving} className="inline-flex items-center gap-1 text-[11px] font-bold text-white bg-[#004898] hover:bg-[#003a7a] px-2.5 py-1.5 rounded-lg disabled:opacity-40">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}Save
        </button>
      </td>
    </tr>
  );
};

export const TallyItemNamesPanel = ({ showToast }) => {
  const [search, setSearch] = useState('');
  const [linked, setLinked] = useState('no');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ rows: [], total: 0, limit: 50 });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await fetchTallyItems({ search, linked, page })); } catch (err) { showToast(err.message, 'error'); } finally { setLoading(false); }
  }, [search, linked, page, showToast]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const onSaved = (id, saved) => setData((d) => ({ ...d, rows: d.rows.map((r) => (r.id === id ? { ...r, ...saved } : r)) }));
  const pages = Math.max(1, Math.ceil(data.total / data.limit));

  return (
    <div className="card bg-white border border-[#E4E7EC] shadow-xs overflow-hidden">
      <div className="p-4 border-b border-[#F2F4F7] flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-1 bg-[#F2F4F7] rounded-xl p-1">
          {FILTERS.map(([value, label]) => (
            <button key={value} onClick={() => { setLinked(value); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap ${linked === value ? 'bg-white text-[#004898] shadow-xs' : 'text-[#667085] hover:text-[#172033]'}`}>{label}</button>
          ))}
        </div>
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-[#98A2B3] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search brand, model no, description, Tally name…"
            className="w-full pl-9 pr-8 py-2 text-xs border border-[#E4E7EC] rounded-lg outline-none focus:border-[#004898]" />
          {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[#98A2B3] hover:text-[#172033]"><X className="w-3.5 h-3.5" /></button>}
        </div>
      </div>
      <p className="px-4 pt-3 text-[11px] text-[#667085]">
        The Tally stock item name must match Tally exactly. The wand fills in Brand + Model No — use it only if that is how the item is named in Tally.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead className="bg-[#F8FAFC] text-[#667085] uppercase font-bold text-[10px] tracking-wider border-b border-[#E4E7EC]">
            <tr><th className="px-4 py-3">Catalog item</th><th className="px-4 py-3">HSN</th><th className="px-4 py-3">Tally stock item</th><th className="px-4 py-3">Unit</th><th /></tr>
          </thead>
          <tbody className="divide-y divide-[#F2F4F7]">
            {loading && !data.rows.length ? (
              [...Array(5)].map((_, i) => <tr key={i}><td colSpan={5} className="px-4 py-4"><div className="h-4 bg-[#F2F4F7] rounded animate-pulse" /></td></tr>)
            ) : data.rows.length === 0 ? (
              <tr><td colSpan={5} className="py-12 text-center text-[#667085]">{linked === 'no' && !search ? 'Every catalog item has a Tally name.' : 'No items match.'}</td></tr>
            ) : data.rows.map((row) => <Row key={`${row.id}-${row.stock_item_name}-${row.unit_name}`} row={row} onSaved={onSaved} showToast={showToast} />)}
          </tbody>
        </table>
      </div>
      <div className="p-3 border-t border-[#F2F4F7] flex items-center justify-between text-[11px] text-[#667085]">
        <span className="tabular-nums">{data.total} item{data.total === 1 ? '' : 's'}</span>
        <span className="flex items-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-2 py-1 border border-[#E4E7EC] rounded-md disabled:opacity-40">Prev</button>
          <span className="tabular-nums">{page} / {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="px-2 py-1 border border-[#E4E7EC] rounded-md disabled:opacity-40">Next</button>
        </span>
      </div>
    </div>
  );
};
