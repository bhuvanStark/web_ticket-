// Quotation builder — one version of a quote: solutions (free-text name)
// holding catalog items and service lines, plus an optional Pre-Installation
// & PPM block. Price = OSP ÷ SM rounded up (quoteEngine.js); SM is set for
// the whole quote and can be overridden per line, as can the unit price.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Save, Plus, Trash2, Copy, ChevronUp, ChevronDown, Search, Package, Wrench, Layers,
  FileDown, FileSpreadsheet, GitBranch, CheckCircle2, XCircle, Send, RotateCcw, Lock, Eye, EyeOff, Loader2,
  ClipboardList, AlertTriangle, Undo2, MoreHorizontal, Check
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  fetchQuote, fetchQuoteVersion, saveQuoteVersion, createQuoteVersion, setQuoteStatus, fetchQuoteItems, fetchQuoteCategories, deleteQuote
} from '../../services/quoteApiService';
import { computeVersion, hasOverride, round2, ROUNDING_STEPS } from './quoteEngine';
import { formatINR, formatNum, formatDate, QUOTE_STATUS, smToMarginPct, marginTone, todayKey } from './quoteShared';
import { exportQuotePdf, exportQuoteXlsx } from '../../utils/quoteExport';

let keySeq = 0;
const newKey = () => `k${++keySeq}`;
const round4 = (v) => Math.round((v + Number.EPSILON) * 10000) / 10000;
// SM accepted by the backend (stored at 4 decimals, must stay above 0).
const validSm = (v) => v != null && v >= 0.01 && v <= 2;

// Unsaved edits of a builder that unmounted without saving (e.g. the user
// clicked another sidebar page), keyed by version id. Restored on reopen
// as long as nobody saved that version in the meantime.
const unsavedDrafts = new Map();

const toDoc = (version, quote) => ({
  project_ref: quote.project_ref || '',
  quote_date: String(version.quote_date).slice(0, 10),
  sm: Number(version.sm),
  rounding_step: Number(version.rounding_step),
  notes: version.notes || '',
  sections: version.sections.map((s) => ({
    key: newKey(), kind: s.kind, name: s.name || '',
    lines: s.lines.map((l) => ({ ...l, key: newKey() }))
  }))
});

const LINE_FIELDS = ['line_type', 'item_id', 'category_name', 'series', 'model_name', 'description', 'hsn_code',
  'uom', 'qty', 'osp_unit', 'sm_override', 'price_override', 'gst_rate'];

const toPayload = (doc) => ({
  project_ref: doc.project_ref,
  quote_date: doc.quote_date,
  sm: doc.sm,
  rounding_step: doc.rounding_step,
  notes: doc.notes,
  sections: doc.sections.map((s) => ({
    kind: s.kind,
    name: s.name,
    lines: s.lines.map((line) => Object.fromEntries(LINE_FIELDS.map((f) => [f, line[f] ?? null])))
  }))
});

const blankService = () => ({ key: newKey(), line_type: 'service', description: '', qty: 1, osp_unit: 0, gst_rate: 18, uom: 'Nos', sm_override: null, price_override: null });

const LOST_REASONS = ['Competitor price', 'Budget cancelled', 'Timeline mismatch', 'Scope changed', 'No response'];

// Number input: Indian-grouped when idle, raw while editing, and keeps what
// is typed until blur (so "0." isn't eaten). `grouped` off for SM / GST %.
const NumCell = ({ value, onChange, placeholder, disabled, className = '', grouped = true }) => {
  const [draft, setDraft] = useState(null);
  const idle = value == null ? '' : grouped ? formatNum(value) : String(value);
  return (
    <input
      // No type attribute on purpose: index.css pads every input[type="text"]
      // inside a .relative ancestor by 40px (search-icon fix), hiding digits.
      inputMode="decimal" size={1} disabled={disabled} placeholder={placeholder}
      value={draft ?? idle}
      onChange={(e) => {
        const raw = e.target.value.replace(/[,\s₹]/g, '');
        setDraft(e.target.value);
        if (raw === '') onChange(null);
        else if (/^\d*\.?\d*$/.test(raw) && Number.isFinite(Number(raw))) onChange(Number(raw));
      }}
      onBlur={() => setDraft(null)}
      onFocus={(e) => { setDraft(value == null ? '' : String(value)); const el = e.target; requestAnimationFrame(() => el.select()); }}
      className={`w-full ${grouped ? 'min-w-[96px]' : 'min-w-[56px]'} bg-transparent px-2 py-1.5 rounded-md text-right tabular-nums outline-none border border-transparent hover:border-[#E4E7EC] focus:border-[#004898] focus:bg-white disabled:hover:border-transparent disabled:text-[#344054] placeholder:text-[#98A2B3] ${className}`}
    />
  );
};

// ---- Item picker ----
const ItemPicker = ({ sectionName, onAdd, onClose }) => {
  const [categories, setCategories] = useState([]);
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState({ rows: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [added, setAdded] = useState({});
  const inputRef = useRef(null);

  useEffect(() => { fetchQuoteCategories().then(setCategories).catch(() => {}); inputRef.current?.focus(); }, []);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    const t = setTimeout(() => {
      fetchQuoteItems({ search, category_id: category, limit: 40 })
        .then((data) => { if (alive) { setResults(data); setCursor(0); } })
        .catch(() => {})
        .finally(() => { if (alive) setLoading(false); });
    }, 200);
    return () => { alive = false; clearTimeout(t); };
  }, [search, category]);

  const add = (item) => {
    onAdd(item);
    setAdded((a) => ({ ...a, [item.id]: (a[item.id] || 0) + 1 }));
  };

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, results.rows.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    if (e.key === 'Enter' && results.rows[cursor]) { e.preventDefault(); add(results.rows[cursor]); }
    if (e.key === 'Escape') onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-start justify-center p-4 pt-[8vh]" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-[#E4E7EC] overflow-hidden flex flex-col max-h-[80vh]">
        <div className="p-4 border-b border-[#E4E7EC] space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#667085]">Add items to</p>
              <p className="font-extrabold text-[#172033]">{sectionName || 'Untitled solution'}</p>
            </div>
            <button onClick={onClose} className="btn btn-primary text-xs !py-2"><Check className="w-4 h-4" />Done</button>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#98A2B3] absolute left-3 top-1/2 -translate-y-1/2" />
              <input ref={inputRef} value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={onKey}
                placeholder="Search model, series, HSN…  (↑↓ to move, Enter to add)"
                className="w-full pl-9 pr-3 py-2.5 text-sm border border-[#E4E7EC] rounded-xl outline-none focus:border-[#004898] focus:ring-2 focus:ring-[#004898]/10" />
            </div>
            <select value={category} onChange={(e) => setCategory(e.target.value)}
              className="text-xs font-semibold border border-[#E4E7EC] rounded-xl px-3 outline-none focus:border-[#004898] max-w-[40%]">
              <option value="">All categories</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.item_count})</option>)}
            </select>
          </div>
        </div>
        <div className="overflow-y-auto flex-1">
          {results.rows.length === 0 && !loading ? (
            <div className="py-14 text-center text-sm text-[#667085]">
              <Package className="w-9 h-9 text-[#D0D5DD] mx-auto mb-2" />
              {search || category ? 'No items match.' : 'The catalog is empty — add items on the Items page.'}
            </div>
          ) : results.rows.map((item, i) => (
            <button key={item.id} onMouseEnter={() => setCursor(i)} onClick={() => add(item)}
              className={`w-full text-left px-4 py-3 flex items-center gap-4 border-b border-[#F2F4F7] transition-colors ${i === cursor ? 'bg-[#F5F9FE]' : 'bg-white'}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-[13px] text-[#172033] truncate">{item.model_name}</span>
                  {item.series && <span className="text-[11px] text-[#667085] truncate">{item.series}</span>}
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-[11px] text-[#98A2B3]">
                  <span className="font-semibold text-[#475467] bg-[#F2F4F7] px-1.5 rounded">{item.category_name}</span>
                  {item.hsn_code && <span className="font-mono">HSN {item.hsn_code}</span>}
                  {item.remark && <span className="truncate">{item.remark}</span>}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-bold text-[13px] text-[#172033] tabular-nums">{formatINR(item.price)}</div>
                <div className="text-[10px] text-[#98A2B3]">OSP · GST {item.gst_rate}%</div>
              </div>
              <span className={`shrink-0 w-16 text-center text-[11px] font-bold rounded-lg py-1 ${added[item.id] ? 'bg-[#ECFDF3] text-[#027A48]' : 'bg-[#EFF5FC] text-[#004898]'}`}>
                {added[item.id] ? `Added ×${added[item.id]}` : 'Add'}
              </span>
            </button>
          ))}
          {results.total > results.rows.length && (
            <p className="text-center text-[11px] text-[#98A2B3] py-3">Showing {results.rows.length} of {results.total} — refine your search</p>
          )}
        </div>
      </div>
    </div>
  );
};

// ---- Status dialog (Won / Lost) ----
const StatusDialog = ({ kind, onClose, onConfirm }) => {
  const [po, setPo] = useState('');
  const [poDate, setPoDate] = useState(todayKey);
  const [reason, setReason] = useState('');
  const [other, setOther] = useState('');
  const [busy, setBusy] = useState(false);
  const won = kind === 'won';
  const valid = won ? po.trim() && poDate : (reason === 'Other' ? other.trim() : reason);

  const submit = async (e) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    try {
      await onConfirm(won ? { status: 'won', po_number: po.trim(), po_date: poDate } : { status: 'lost', lost_reason: reason === 'Other' ? other.trim() : reason });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <form onSubmit={submit} className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-[#E4E7EC] overflow-hidden">
        <div className={`p-5 flex items-center gap-3 ${won ? 'bg-[#ECFDF3]' : 'bg-[#FEF3F2]'}`}>
          {won ? <CheckCircle2 className="w-7 h-7 text-[#12B76A]" /> : <XCircle className="w-7 h-7 text-[#F04438]" />}
          <div>
            <h3 className="font-extrabold text-lg text-[#172033]">{won ? 'Mark as Won' : 'Mark as Lost'}</h3>
            <p className="text-xs text-[#475467]">{won ? 'Record the customer purchase order.' : 'Why did we lose this deal?'}</p>
          </div>
        </div>
        <div className="p-5 space-y-4">
          {won ? (
            <>
              <div>
                <label className="form-label">PO Number *</label>
                <input autoFocus value={po} onChange={(e) => setPo(e.target.value)} placeholder="e.g. 4500012345" className="form-input" />
              </div>
              <div>
                <label className="form-label">PO Date *</label>
                <input type="date" value={poDate} onChange={(e) => setPoDate(e.target.value)} className="form-input" />
              </div>
            </>
          ) : (
            <div className="space-y-2">
              {[...LOST_REASONS, 'Other'].map((r) => (
                <label key={r} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer text-sm font-semibold ${reason === r ? 'border-[#F04438] bg-[#FEF3F2] text-[#B42318]' : 'border-[#E4E7EC] text-[#344054] hover:bg-[#F8FAFC]'}`}>
                  <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} className="accent-[#F04438]" />{r}
                </label>
              ))}
              {reason === 'Other' && <input autoFocus value={other} onChange={(e) => setOther(e.target.value)} placeholder="Describe the reason" className="form-input" />}
            </div>
          )}
        </div>
        <div className="px-5 pb-5 flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={busy} className="btn btn-secondary">Cancel</button>
          <button type="submit" disabled={!valid || busy} className={`btn text-white disabled:opacity-60 ${won ? 'bg-[#12B76A] hover:bg-[#039855]' : 'bg-[#F04438] hover:bg-[#D92D20]'}`}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : won ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {won ? 'Mark Won' : 'Mark Lost'}
          </button>
        </div>
      </form>
    </div>
  );
};

// ---- Dropdown menu ----
const Menu = ({ trigger, children, align = 'right' }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      {trigger(() => setOpen((o) => !o), open)}
      {open && (
        <div onClick={() => setOpen(false)} className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} top-full mt-1.5 z-40 min-w-[230px] bg-white border border-[#E4E7EC] rounded-xl shadow-xl py-1.5`}>
          {children}
        </div>
      )}
    </div>
  );
};
const MenuItem = ({ icon: Icon, children, onClick, tone = 'text-[#344054]', hint }) => (
  <button onClick={onClick} className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-[13px] font-semibold hover:bg-[#F8FAFC] ${tone}`}>
    <Icon className="w-4 h-4 shrink-0" /><span className="flex-1">{children}</span>{hint && <span className="text-[10px] text-[#98A2B3] font-medium">{hint}</span>}
  </button>
);

// ---- Line row ----
const LineRow = ({ line, calc, index, globalSm, showCosting, readOnly, onChange, onRemove, onMove, isFirst, isLast }) => {
  const set = (patch) => onChange({ ...line, ...patch });
  const indiv = hasOverride(line);
  const service = line.line_type === 'service';
  return (
    <tr className="group align-top hover:bg-[#FAFCFF]">
      <td className="pl-4 pr-1 py-2 text-[11px] text-[#98A2B3] tabular-nums pt-3.5">{index}</td>
      <td className="px-2 py-2 min-w-[260px]">
        {service ? (
          <textarea
            value={line.description || ''} disabled={readOnly} rows={1} placeholder="Service description (e.g. Installation, cabling & commissioning)"
            onChange={(e) => set({ description: e.target.value })}
            style={{ fieldSizing: 'content' }}
            className="w-full resize-none min-h-[34px] bg-transparent px-2 py-1.5 rounded-md text-[13px] font-semibold text-[#172033] outline-none border border-transparent hover:border-[#E4E7EC] focus:border-[#004898] focus:bg-white disabled:hover:border-transparent"
          />
        ) : (
          <div className="px-2 py-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-extrabold text-[13px] text-[#172033]">{line.model_name || '—'}</span>
              {line.series && <span className="text-[11px] text-[#667085]">{line.series}</span>}
              {line.category_name && <span className="text-[10px] font-semibold text-[#475467] bg-[#F2F4F7] px-1.5 rounded">{line.category_name}</span>}
            </div>
            <input
              value={line.description || ''} disabled={readOnly} placeholder={readOnly ? '' : 'Add description (optional)'}
              onChange={(e) => set({ description: e.target.value })}
              className="w-full mt-0.5 bg-transparent text-[11px] text-[#667085] outline-none border-b border-transparent hover:border-[#E4E7EC] focus:border-[#004898] placeholder:text-[#C0C6D0]"
            />
          </div>
        )}
      </td>
      <td className="px-1 py-2 w-24">
        <input value={line.hsn_code || ''} disabled={readOnly} onChange={(e) => set({ hsn_code: e.target.value })} placeholder="HSN"
          className="w-full bg-transparent px-2 py-1.5 rounded-md text-[11px] font-mono text-[#475467] outline-none border border-transparent hover:border-[#E4E7EC] focus:border-[#004898] focus:bg-white disabled:hover:border-transparent" />
      </td>
      <td className="px-1 py-2 w-20 min-w-[64px]"><NumCell value={line.qty} grouped={false} disabled={readOnly} onChange={(v) => set({ qty: round2(v ?? 0) })} className="font-bold text-[13px]" /></td>
      {showCosting && (
        <>
          <td className="px-1 py-2 w-28 min-w-[112px] bg-[#FBFDF7]"><NumCell value={line.osp_unit} disabled={readOnly} onChange={(v) => set({ osp_unit: round2(v ?? 0) })} className="text-[12px] text-[#475467]" /></td>
          <td className="px-1 py-2 w-20 min-w-[72px] bg-[#FBFDF7]">
            <NumCell value={line.sm_override} placeholder={String(globalSm)} grouped={false} disabled={readOnly || line.price_override != null}
              onChange={(v) => { if (!v) set({ sm_override: null }); else if (validSm(v)) set({ sm_override: round4(v) }); }}
              className={`text-[12px] ${line.sm_override != null ? 'font-bold text-[#4F46E5]' : ''}`} />
          </td>
        </>
      )}
      <td className="px-1 py-2 w-32 min-w-[120px]">
        <NumCell value={line.price_override ?? calc.unit_price} disabled={readOnly}
          onChange={(v) => set({ price_override: v == null ? null : round2(v) })}
          className={`text-[13px] font-semibold ${line.price_override != null ? 'text-[#4F46E5]' : 'text-[#172033]'}`} />
      </td>
      <td className="px-3 py-2 w-32 text-right tabular-nums text-[13px] font-bold text-[#172033] pt-3.5">{formatNum(calc.amount)}</td>
      <td className="px-1 py-2 w-16 min-w-[60px]"><NumCell value={line.gst_rate} grouped={false} disabled={readOnly} onChange={(v) => { if (v == null || v <= 100) set({ gst_rate: round2(v ?? 0) }); }} className="text-[12px] text-[#475467]" /></td>
      <td className="px-3 py-2 w-32 text-right tabular-nums text-[12px] text-[#475467] pt-3.5">{formatNum(calc.total)}</td>
      {showCosting && (
        <td className="px-3 py-2 w-24 text-right pt-3">
          <div className={`text-[12px] font-bold tabular-nums ${marginTone(calc.margin_pct)}`}>{calc.margin_pct}%</div>
          {indiv ? (
            <button disabled={readOnly} onClick={() => set({ sm_override: null, price_override: null })} title="Back to the quote's SM"
              className="mt-0.5 inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide text-[#4F46E5] bg-[#EEF2FF] px-1.5 py-0.5 rounded hover:bg-[#E0E7FF] disabled:cursor-default">
              Indiv{!readOnly && <Undo2 className="w-2.5 h-2.5" />}
            </button>
          ) : <span className="mt-0.5 inline-block text-[9px] font-bold uppercase tracking-wide text-[#98A2B3] bg-[#F2F4F7] px-1.5 py-0.5 rounded">Univ</span>}
        </td>
      )}
      <td className="pr-3 py-2 w-16 pt-3">
        {!readOnly && (
          <div className="flex items-center justify-end opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="flex flex-col">
              <button disabled={isFirst} onClick={() => onMove(-1)} className="text-[#98A2B3] hover:text-[#004898] disabled:opacity-30"><ChevronUp className="w-3.5 h-3.5" /></button>
              <button disabled={isLast} onClick={() => onMove(1)} className="text-[#98A2B3] hover:text-[#004898] disabled:opacity-30"><ChevronDown className="w-3.5 h-3.5" /></button>
            </div>
            <button onClick={onRemove} title="Remove line" className="p-1 text-[#98A2B3] hover:text-[#D92D20]"><Trash2 className="w-4 h-4" /></button>
          </div>
        )}
      </td>
    </tr>
  );
};

// ---- Section card ----
const SectionCard = ({ section, computed, number, globalSm, showCosting, readOnly, onChange, onRemove, onMove, onDuplicate, onPickItems, isFirst, isLast }) => {
  const ppm = section.kind === 'ppm';
  const setLines = (lines) => onChange({ ...section, lines });
  const updateLine = (key, next) => setLines(section.lines.map((l) => (l.key === key ? next : l)));
  const moveLine = (key, dir) => {
    const lines = [...section.lines];
    const i = lines.findIndex((l) => l.key === key);
    const j = i + dir;
    if (j < 0 || j >= lines.length) return;
    [lines[i], lines[j]] = [lines[j], lines[i]];
    setLines(lines);
  };
  const calcFor = new Map(computed.lines.map((l) => [l.key, l.calc]));
  const supply = section.lines.filter((l) => l.line_type !== 'service');
  const services = section.lines.filter((l) => l.line_type === 'service');
  const cols = 9 + (showCosting ? 3 : 0);
  const t = computed.totals;

  const renderRows = (lines, offset) => lines.map((line, i) => (
    <LineRow
      key={line.key} line={line} calc={calcFor.get(line.key)} index={offset + i + 1} globalSm={globalSm}
      showCosting={showCosting} readOnly={readOnly}
      onChange={(next) => updateLine(line.key, next)}
      onRemove={() => setLines(section.lines.filter((l) => l.key !== line.key))}
      onMove={(dir) => moveLine(line.key, dir)}
      isFirst={i === 0} isLast={i === lines.length - 1}
    />
  ));

  const groupHeader = (Icon, label, count) => (
    <tr className="bg-[#F8FAFC]">
      <td colSpan={cols} className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#667085]">
        <span className="inline-flex items-center gap-1.5"><Icon className="w-3.5 h-3.5" />{label} · {count}</span>
      </td>
    </tr>
  );

  return (
    <div className={`card bg-white border shadow-xs overflow-hidden ${ppm ? 'border-[#C7D7FE]' : 'border-[#E4E7EC]'}`}>
      <div className={`px-4 py-3 flex items-center gap-3 border-b ${ppm ? 'bg-[#F5F8FF] border-[#E0EAFF]' : 'bg-white border-[#F2F4F7]'}`}>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-extrabold shrink-0 ${ppm ? 'bg-[#4F46E5] text-white' : 'bg-[#004898] text-white'}`}>
          {ppm ? <ClipboardList className="w-4 h-4" /> : number}
        </div>
        <input
          value={section.name} disabled={readOnly}
          onChange={(e) => onChange({ ...section, name: e.target.value })}
          placeholder={ppm ? 'Pre-Installation Planning & Migration Services' : 'Solution / room name — e.g. 48 Seater Boardroom'}
          className="flex-1 min-w-0 text-[15px] font-extrabold text-[#172033] bg-transparent outline-none px-2 py-1 rounded-md border border-transparent hover:border-[#E4E7EC] focus:border-[#004898] focus:bg-white disabled:hover:border-transparent placeholder:font-semibold placeholder:text-[#98A2B3]"
        />
        <div className="hidden md:flex items-center gap-4 text-right shrink-0">
          {!ppm && <div><p className="text-[9px] font-bold uppercase tracking-wider text-[#98A2B3]">Supply</p><p className="text-[13px] font-bold tabular-nums text-[#172033]">{formatINR(t.supply_price)}</p></div>}
          <div><p className="text-[9px] font-bold uppercase tracking-wider text-[#98A2B3]">Services</p><p className="text-[13px] font-bold tabular-nums text-[#172033]">{formatINR(t.services_price)}</p></div>
          <div><p className="text-[9px] font-bold uppercase tracking-wider text-[#98A2B3]">Incl. GST</p><p className="text-[13px] font-extrabold tabular-nums text-[#004898]">{formatINR(t.grand_total)}</p></div>
        </div>
        {!readOnly && (
          <Menu trigger={(toggle) => (
            <button onClick={toggle} className="p-1.5 rounded-lg text-[#667085] hover:bg-[#F2F4F7]"><MoreHorizontal className="w-5 h-5" /></button>
          )}>
            {!isFirst && <MenuItem icon={ChevronUp} onClick={() => onMove(-1)}>Move up</MenuItem>}
            {!isLast && <MenuItem icon={ChevronDown} onClick={() => onMove(1)}>Move down</MenuItem>}
            {!ppm && <MenuItem icon={Copy} onClick={onDuplicate}>Duplicate solution</MenuItem>}
            <MenuItem icon={Trash2} tone="text-[#D92D20]" onClick={onRemove}>Delete {ppm ? 'block' : 'solution'}</MenuItem>
          </Menu>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-[#667085] uppercase font-bold text-[9.5px] tracking-wider border-b border-[#E4E7EC]">
            <tr>
              <th className="pl-4 pr-1 py-2 text-left w-6">#</th>
              <th className="px-2 py-2 text-left">{ppm ? 'Service activity' : 'Item / Description'}</th>
              <th className="px-2 py-2 text-left">HSN/SAC</th>
              <th className="px-3 py-2 text-right">Qty</th>
              {showCosting && <th className="px-3 py-2 text-right bg-[#FBFDF7] text-[#4D7C0F]">OSP Unit</th>}
              {showCosting && <th className="px-3 py-2 text-right bg-[#FBFDF7] text-[#4D7C0F]">SM</th>}
              <th className="px-3 py-2 text-right">Unit Price</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2 text-right">GST %</th>
              <th className="px-3 py-2 text-right">Total</th>
              {showCosting && <th className="px-3 py-2 text-right">Margin</th>}
              <th className="pr-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F2F4F7]">
            {section.lines.length === 0 && (
              <tr><td colSpan={cols} className="px-4 py-8 text-center text-[#98A2B3] text-xs">
                {readOnly ? 'No lines.' : ppm ? 'Add the pre-installation service activities below.' : 'Add items from the catalog, then installation / cabling services.'}
              </td></tr>
            )}
            {!ppm && supply.length > 0 && services.length > 0 && groupHeader(Package, 'Supply', supply.length)}
            {!ppm && renderRows(supply, 0)}
            {!ppm && services.length > 0 && supply.length > 0 && groupHeader(Wrench, 'Installation & Services', services.length)}
            {renderRows(services, ppm ? 0 : supply.length)}
          </tbody>
        </table>
      </div>

      {!readOnly && (
        <div className="px-4 py-2.5 border-t border-[#F2F4F7] flex flex-wrap items-center gap-2 bg-[#FCFCFD]">
          {!ppm && (
            <button onClick={onPickItems} className="inline-flex items-center gap-1.5 text-xs font-bold text-[#004898] bg-[#EFF5FC] hover:bg-[#E0ECF9] px-3 py-1.5 rounded-lg">
              <Plus className="w-3.5 h-3.5" />Add item
            </button>
          )}
          <button onClick={() => setLines([...section.lines, blankService()])} className="inline-flex items-center gap-1.5 text-xs font-bold text-[#475467] bg-white border border-[#E4E7EC] hover:border-[#004898] hover:text-[#004898] px-3 py-1.5 rounded-lg">
            <Wrench className="w-3.5 h-3.5" />{ppm ? 'Add service activity' : 'Add installation / service'}
          </button>
        </div>
      )}
    </div>
  );
};

// ---- Builder ----
export const QuoteBuilder = ({ quoteId, readOnly: viewerOnly, onBack }) => {
  const { showToast } = useApp();
  const [quote, setQuote] = useState(null);
  const [versionMeta, setVersionMeta] = useState(null);
  const [doc, setDoc] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [picker, setPicker] = useState(null);
  const [statusDialog, setStatusDialog] = useState(null);
  const [showCosting, setShowCosting] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (versionId) => {
    setLoading(true);
    try {
      const q = await fetchQuote(quoteId);
      const target = versionId || q.versions[0]?.id;
      const { version } = await fetchQuoteVersion(quoteId, target);
      const draft = unsavedDrafts.get(version.id);
      unsavedDrafts.delete(version.id);
      const restore = draft && draft.base === version.updated_at && version.is_latest && !['won', 'lost'].includes(q.status);
      setQuote(q);
      setVersionMeta(version);
      setDoc(restore ? draft.doc : toDoc(version, q));
      setDirty(Boolean(restore));
      if (restore) showToast('Your unsaved changes were restored. Save to keep them.', 'info');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [quoteId, showToast]);

  useEffect(() => { load(); }, [load]);

  const latest = useRef({});
  latest.current = { doc, dirty, versionMeta };
  useEffect(() => () => {
    const { doc: d, dirty: isDirty, versionMeta: meta } = latest.current;
    if (isDirty && d && meta) unsavedDrafts.set(meta.id, { doc: d, base: meta.updated_at });
  }, []);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const locked = quote && (quote.status === 'won' || quote.status === 'lost');
  const isLatest = versionMeta?.is_latest;
  const readOnly = viewerOnly || !isLatest || locked;

  const update = (patch) => { setDoc((d) => ({ ...d, ...patch })); setDirty(true); };
  const updateSection = (key, next) => update({ sections: doc.sections.map((s) => (s.key === key ? next : s)) });

  const computed = useMemo(() => {
    if (!doc) return null;
    const result = computeVersion(doc);
    return { ...result, sections: result.sections.map((s, i) => ({ ...s, key: doc.sections[i].key })) };
  }, [doc]);

  const save = useCallback(async () => {
    if (!doc || readOnly || saving) return;
    const sent = doc;
    setSaving(true);
    try {
      const { version } = await saveQuoteVersion(quoteId, versionMeta.id, { ...toPayload(sent), base_updated_at: versionMeta.updated_at });
      setVersionMeta((m) => ({ ...m, ...version, sections: undefined }));
      // Edits typed while the request was in flight stay unsaved.
      setDirty(latest.current.doc !== sent);
      showToast('Quotation saved', 'success');
      setQuote(await fetchQuote(quoteId));
    } catch (err) {
      if (err.status === 409 && /Someone else saved/.test(err.message)) {
        if (window.confirm(`${err.message}\n\nReload now? Your unsaved edits here will be lost.`)) load(versionMeta.id);
      } else {
        showToast(err.message, 'error');
      }
    } finally {
      setSaving(false);
    }
  }, [doc, readOnly, saving, quoteId, versionMeta, showToast, load]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);

  const confirmDiscard = () => {
    if (dirty && !window.confirm('You have unsaved changes. Discard them?')) return false;
    // Confirmed: don't let the unmount cleanup park these edits as a draft.
    latest.current.dirty = false;
    setDirty(false);
    return true;
  };

  const switchVersion = (id) => { if (id !== versionMeta.id && confirmDiscard()) load(id); };

  const newVersion = async () => {
    if (dirty) {
      showToast('Save your changes first — the new version is copied from the saved one.', 'error');
      return;
    }
    if (!window.confirm(`Create V${quote.versions[0].version_no + 1}.0? V${quote.versions[0].version_no}.0 will be frozen (view-only) and editing continues in the new version.`)) return;
    setBusy(true);
    try {
      const { version_id } = await createQuoteVersion(quoteId);
      showToast(`V${(quote.versions[0]?.version_no || 0) + 1}.0 created — the previous version is now read-only`, 'success');
      await load(version_id);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (body) => {
    if (dirty && (body.status === 'won' || body.status === 'lost')) {
      showToast('Save your changes first.', 'error');
      return;
    }
    try {
      const q = await setQuoteStatus(quoteId, body);
      setQuote(q);
      setStatusDialog(null);
      showToast(`Marked ${QUOTE_STATUS[body.status].label}`, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const removeQuote = async () => {
    if (!window.confirm('Delete this quotation and all its versions? This cannot be undone.')) return;
    try {
      await deleteQuote(quoteId);
      showToast('Quotation deleted', 'success');
      onBack();
    } catch (err) { showToast(err.message, 'error'); }
  };

  const doExport = async (format, internal) => {
    if (dirty && !window.confirm('This version has unsaved changes. Export what is on screen anyway?')) return;
    const data = { quote, version: { ...versionMeta, ...doc }, computed };
    try {
      if (format === 'pdf') exportQuotePdf(data, { internal });
      else await exportQuoteXlsx(data, { internal });
    } catch (err) {
      showToast(err.message || 'Export failed', 'error');
    }
  };

  const addItemLine = (sectionKey, item) => {
    setDoc((d) => ({
      ...d,
      sections: d.sections.map((s) => (s.key !== sectionKey ? s : {
        ...s,
        lines: (() => {
          const line = {
            key: newKey(), line_type: 'supply', item_id: item.id, category_name: item.category_name, series: item.series,
            model_name: item.model_name, description: item.remark || '', hsn_code: item.hsn_code, uom: 'Nos', qty: 1,
            osp_unit: Number(item.price), gst_rate: Number(item.gst_rate), sm_override: null, price_override: null
          };
          const firstService = s.lines.findIndex((l) => l.line_type === 'service');
          if (firstService === -1) return [...s.lines, line];
          return [...s.lines.slice(0, firstService), line, ...s.lines.slice(firstService)];
        })()
      }))
    }));
    setDirty(true);
  };

  const moveSection = (key, dir) => {
    const sections = [...doc.sections];
    const i = sections.findIndex((s) => s.key === key);
    const j = i + dir;
    if (j < 0 || j >= sections.length) return;
    [sections[i], sections[j]] = [sections[j], sections[i]];
    update({ sections });
  };

  if (loading || !doc) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3">
        <Loader2 className="w-8 h-8 text-[#004898] animate-spin" />
        <p className="text-xs font-semibold text-[#667085]">Loading quotation…</p>
      </div>
    );
  }

  const totals = computed.totals;
  const status = QUOTE_STATUS[quote.status];
  const hasPpm = doc.sections.some((s) => s.kind === 'ppm');
  let solutionNo = 0;

  return (
    <div className="space-y-5 pb-16">
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <button onClick={() => { if (confirmDiscard()) onBack(); }} className="mt-1 p-2 rounded-xl border border-[#E4E7EC] bg-white text-[#475467] hover:text-[#004898] hover:border-[#004898]" title="Back to quotations">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-2xl font-extrabold text-[#172033] tracking-tight truncate">{quote.customer}</h2>
              <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border ${status.cls}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />{status.label}
              </span>
              {dirty && <span className="text-[11px] font-bold text-[#B54708] bg-[#FFFAEB] border border-[#FEDF89] px-2 py-0.5 rounded-full">Unsaved changes</span>}
            </div>
            <p className="text-xs text-[#667085] mt-1 truncate">
              {[quote.project, quote.site_location].filter(Boolean).join(' · ') || 'No project details'}
              {quote.created_by_name && <> · created by {quote.created_by_name}</>}
            </p>
            {quote.status === 'won' && <p className="text-xs font-semibold text-[#027A48] mt-1">PO {quote.po_number} · {formatDate(quote.po_date)}</p>}
            {quote.status === 'lost' && <p className="text-xs font-semibold text-[#B42318] mt-1">Lost: {quote.lost_reason}</p>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Versions: one fixed-width picker however many revisions exist.
              Only the latest is editable (the backend refuses saves to older
              ones); older versions open read-only for viewing/exporting. */}
          <div className="flex items-center bg-white border border-[#E4E7EC] rounded-xl shadow-xs">
            <Menu trigger={(toggle, open) => (
              <button onClick={toggle} title="Version history"
                className={`h-[34px] pl-3 pr-2 ${!viewerOnly && !locked && isLatest ? 'rounded-l-xl' : 'rounded-xl'} text-xs font-bold inline-flex items-center gap-1.5 ${isLatest ? 'text-[#004898]' : 'text-[#B54708] bg-[#FFFAEB]'}`}>
                {isLatest ? <GitBranch className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                V{versionMeta.version_no}.0
                <span className="font-semibold text-[#98A2B3]">/ {quote.versions.length}</span>
                <ChevronDown className={`w-3.5 h-3.5 text-[#98A2B3] transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>
            )}>
              <p className="px-3.5 pt-1 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-[#98A2B3]">Version history</p>
              <div className="max-h-72 overflow-y-auto w-72">
                {quote.versions.map((v, i) => {
                  const current = v.id === versionMeta.id;
                  return (
                    <button key={v.id} onClick={() => switchVersion(v.id)}
                      className={`w-full flex items-start gap-3 px-3.5 py-2.5 text-left hover:bg-[#F8FAFC] ${current ? 'bg-[#F5F9FE]' : ''}`}>
                      <span className={`mt-0.5 shrink-0 text-[11px] font-extrabold px-1.5 py-0.5 rounded-md ${i === 0 ? 'bg-[#004898] text-white' : 'bg-[#F2F4F7] text-[#475467]'}`}>V{v.version_no}.0</span>
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-1.5 text-[12px] font-bold text-[#172033]">
                          {formatINR(v.grand_total)}
                          {i === 0
                            ? <span className="text-[9px] font-bold uppercase tracking-wide text-[#027A48] bg-[#ECFDF3] px-1.5 rounded">Latest · editable</span>
                            : <span className="text-[9px] font-bold uppercase tracking-wide text-[#667085] bg-[#F2F4F7] px-1.5 rounded inline-flex items-center gap-0.5"><Lock className="w-2.5 h-2.5" />Read-only</span>}
                        </span>
                        <span className="block text-[11px] text-[#98A2B3] truncate">
                          {formatDate(v.updated_at)}{v.updated_by_name ? ` · ${v.updated_by_name}` : ''}
                        </span>
                      </span>
                      {current && <Check className="w-4 h-4 text-[#004898] shrink-0 mt-0.5" />}
                    </button>
                  );
                })}
              </div>
            </Menu>
            {!viewerOnly && !locked && isLatest && (
              <button onClick={newVersion} disabled={busy} title="Freeze this version and continue in a new copy"
                className="h-[34px] px-3 border-l border-[#E4E7EC] rounded-r-xl text-xs font-bold text-[#004898] hover:bg-[#EFF5FC] inline-flex items-center gap-1 disabled:opacity-60">
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}New version
              </button>
            )}
          </div>

          <Menu trigger={(toggle) => (
            <button onClick={toggle} className="btn btn-secondary text-xs !py-2"><FileDown className="w-4 h-4" />Export</button>
          )}>
            <p className="px-3.5 pt-1 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-[#98A2B3]">Client copy · no cost/margin</p>
            <MenuItem icon={FileDown} onClick={() => doExport('pdf', false)}>Client PDF</MenuItem>
            <MenuItem icon={FileSpreadsheet} onClick={() => doExport('xlsx', false)}>Client Excel</MenuItem>
            <div className="my-1.5 border-t border-[#F2F4F7]" />
            <p className="px-3.5 pt-1 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-[#98A2B3]">Internal · with OSP & SM</p>
            <MenuItem icon={FileDown} onClick={() => doExport('pdf', true)}>Internal PDF</MenuItem>
            <MenuItem icon={FileSpreadsheet} onClick={() => doExport('xlsx', true)}>Internal Excel</MenuItem>
          </Menu>

          {!viewerOnly && (
            <Menu trigger={(toggle) => (
              <button onClick={toggle} className="btn btn-secondary text-xs !py-2">Status<ChevronDown className="w-3.5 h-3.5" /></button>
            )}>
              {quote.status !== 'sent' && !locked && <MenuItem icon={Send} onClick={() => changeStatus({ status: 'sent' })}>Mark Under Process</MenuItem>}
              {quote.status !== 'draft' && !locked && <MenuItem icon={RotateCcw} onClick={() => changeStatus({ status: 'draft' })}>Back to Draft</MenuItem>}
              {!locked && <MenuItem icon={CheckCircle2} tone="text-[#027A48]" onClick={() => setStatusDialog('won')}>Mark Won…</MenuItem>}
              {!locked && <MenuItem icon={XCircle} tone="text-[#D92D20]" onClick={() => setStatusDialog('lost')}>Mark Lost…</MenuItem>}
              {locked && <MenuItem icon={RotateCcw} onClick={() => changeStatus({ status: 'sent' })}>Reopen (Under Process)</MenuItem>}
              <div className="my-1.5 border-t border-[#F2F4F7]" />
              <MenuItem icon={Trash2} tone="text-[#D92D20]" onClick={removeQuote}>Delete quotation</MenuItem>
            </Menu>
          )}

          {!readOnly && (
            <button onClick={save} disabled={saving || !dirty} className="btn btn-primary text-xs !py-2 shadow-sm disabled:opacity-60" title="Save (Ctrl/⌘ + S)">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}{saving ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>
      </div>

      {readOnly && (
        <div className="flex items-center gap-2 text-xs font-semibold text-[#475467] bg-[#F8FAFC] border border-[#E4E7EC] rounded-xl px-4 py-2.5">
          <Lock className="w-4 h-4 text-[#667085]" />
          <span className="flex-1">
            {viewerOnly ? 'Read-only view. Only Quote Managers can edit quotations.'
              : locked ? `This quotation is ${status.label}. Reopen it from Status to make changes.`
              : `You are viewing V${versionMeta.version_no}.0 — an older, frozen version kept for reference. It can be viewed and exported but not edited.`}
          </span>
          {!isLatest && (
            <button onClick={() => switchVersion(quote.versions[0].id)}
              className="shrink-0 text-[11px] font-bold text-white bg-[#004898] hover:bg-[#003774] px-3 py-1.5 rounded-lg">
              Go to latest V{quote.versions[0].version_no}.0
            </button>
          )}
        </div>
      )}

      {/* Settings + KPIs */}
      <div className="card bg-white border border-[#E4E7EC] shadow-xs p-4 sticky top-0 z-20">
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-[1.6fr_1fr_0.8fr_0.9fr_auto] gap-3 items-end">
          <div className="col-span-2 md:col-span-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#667085]">Project Ref</label>
            <input value={doc.project_ref} disabled={readOnly} onChange={(e) => update({ project_ref: e.target.value })}
              placeholder="TTPL/BLR/INS/AV/26-27/NRS/041026-a"
              className="mt-1 w-full px-3 py-2 text-xs font-mono font-semibold border border-[#E4E7EC] rounded-lg outline-none focus:border-[#004898] disabled:bg-[#F8FAFC]" />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#667085]">Date</label>
            <input type="date" value={doc.quote_date} disabled={readOnly} onChange={(e) => e.target.value && update({ quote_date: e.target.value })}
              className="mt-1 w-full px-3 py-2 text-xs font-semibold border border-[#E4E7EC] rounded-lg outline-none focus:border-[#004898] disabled:bg-[#F8FAFC]" />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#667085]">Universal SM</label>
            <div className="mt-1 flex items-center border border-[#E4E7EC] rounded-lg focus-within:border-[#004898] bg-white">
              <NumCell value={doc.sm} grouped={false} disabled={readOnly} onChange={(v) => validSm(v) && update({ sm: round4(v) })} className="!text-left font-extrabold text-[13px] text-[#004898] !border-0" />
              <span className="pr-3 text-[11px] font-bold text-[#667085] whitespace-nowrap">{smToMarginPct(doc.sm)}% margin</span>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#667085]">Round up to</label>
            <select value={doc.rounding_step} disabled={readOnly} onChange={(e) => update({ rounding_step: Number(e.target.value) })}
              className="mt-1 w-full px-3 py-2 text-xs font-semibold border border-[#E4E7EC] rounded-lg outline-none focus:border-[#004898] bg-white disabled:bg-[#F8FAFC]">
              {ROUNDING_STEPS.map((s) => <option key={s} value={s}>₹{s.toLocaleString('en-IN')}</option>)}
            </select>
          </div>
          <button onClick={() => setShowCosting((v) => !v)}
            className={`h-[38px] px-3 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 border ${showCosting ? 'bg-[#F7FEE7] border-[#BEF264] text-[#4D7C0F]' : 'bg-white border-[#E4E7EC] text-[#475467]'}`}>
            {showCosting ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}Costing
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
          {[
            ['OSP Cost', formatINR(totals.supply_osp + totals.services_osp), 'text-[#475467]', showCosting],
            ['Supply Price', formatINR(totals.supply_price), 'text-[#172033]', true],
            ['Services Price', formatINR(totals.services_price), 'text-[#172033]', true],
            ['GST', formatINR(totals.gst_total), 'text-[#475467]', true],
            ['Margin', `${formatINR(totals.margin)} · ${totals.margin_pct}%`, marginTone(totals.margin_pct), showCosting],
            ['Grand Total', formatINR(totals.grand_total), 'text-[#004898]', true]
          ].filter((k) => k[3]).map(([label, value, tone]) => (
            <div key={label} className={`rounded-xl px-3 py-2 ${label === 'Grand Total' ? 'bg-[#EFF5FC] border border-[#B3D1F2]' : 'bg-[#F8FAFC]'}`}>
              <p className="text-[9.5px] font-bold uppercase tracking-wider text-[#667085]">{label}</p>
              <p className={`text-[15px] font-extrabold tabular-nums truncate ${tone}`}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-4">
        {doc.sections.map((section, i) => {
          if (section.kind !== 'ppm') solutionNo += 1;
          return (
            <SectionCard
              key={section.key}
              section={section}
              computed={computed.sections[i]}
              number={solutionNo}
              globalSm={doc.sm}
              showCosting={showCosting}
              readOnly={readOnly}
              isFirst={i === 0}
              isLast={i === doc.sections.length - 1}
              onChange={(next) => updateSection(section.key, next)}
              onMove={(dir) => moveSection(section.key, dir)}
              onRemove={() => {
                if (section.lines.length && !window.confirm(`Delete "${section.name || 'this solution'}" and its ${section.lines.length} line(s)?`)) return;
                update({ sections: doc.sections.filter((s) => s.key !== section.key) });
              }}
              onDuplicate={() => {
                const copy = { ...section, key: newKey(), name: section.name ? `${section.name} (copy)` : '', lines: section.lines.map((l) => ({ ...l, key: newKey() })) };
                const idx = doc.sections.findIndex((s) => s.key === section.key);
                update({ sections: [...doc.sections.slice(0, idx + 1), copy, ...doc.sections.slice(idx + 1)] });
              }}
              onPickItems={() => setPicker(section.key)}
            />
          );
        })}

        {doc.sections.length === 0 && (
          <div className="card bg-white border border-dashed border-[#D0D5DD] p-10 text-center">
            <Layers className="w-10 h-10 text-[#D0D5DD] mx-auto" />
            <p className="text-sm font-bold text-[#172033] mt-3">No solutions yet</p>
          </div>
        )}

        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => {
              const section = { key: newKey(), kind: 'solution', name: '', lines: [] };
              const ppmAt = doc.sections.findIndex((s) => s.kind === 'ppm');
              update({ sections: ppmAt === -1 ? [...doc.sections, section] : [...doc.sections.slice(0, ppmAt), section, ...doc.sections.slice(ppmAt)] });
            }} className="flex-1 min-w-[200px] border-2 border-dashed border-[#B3D1F2] hover:border-[#004898] hover:bg-[#F5F9FE] text-[#004898] rounded-xl py-3.5 text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors">
              <Plus className="w-4 h-4" />Add solution
            </button>
            {!hasPpm && (
              <button onClick={() => update({ sections: [...doc.sections, { key: newKey(), kind: 'ppm', name: 'Pre-Installation Planning & Migration Services', lines: [] }] })}
                className="flex-1 min-w-[200px] border-2 border-dashed border-[#C7D7FE] hover:border-[#4F46E5] hover:bg-[#F5F8FF] text-[#4F46E5] rounded-xl py-3.5 text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors">
                <ClipboardList className="w-4 h-4" />Add Pre-Installation &amp; PPM
              </button>
            )}
          </div>
        )}
      </div>

      {/* Investment summary + notes */}
      <div className="space-y-5">
        <div className="card bg-white border border-[#E4E7EC] shadow-xs overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#F2F4F7]">
            <h3 className="font-extrabold text-[#172033]">Investment Summary</h3>
            <p className="text-[11px] text-[#667085]">As it appears on the summary sheet</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#F8FAFC] text-[#667085] uppercase font-bold text-[9.5px] tracking-wider">
                <tr>
                  <th className="px-4 py-2 text-left">#</th>
                  <th className="px-4 py-2 text-left">Description</th>
                  {showCosting && <th className="px-4 py-2 text-right text-[#4D7C0F]">OSP Supply</th>}
                  <th className="px-4 py-2 text-right">Supply Price</th>
                  {showCosting && <th className="px-4 py-2 text-right text-[#4D7C0F]">OSP Services</th>}
                  <th className="px-4 py-2 text-right">Services Price</th>
                  <th className="px-4 py-2 text-right">GST</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F2F4F7]">
                {computed.sections.map((s, i) => (
                  <tr key={s.key}>
                    <td className="px-4 py-2.5 text-[#98A2B3] tabular-nums">{i + 1}</td>
                    <td className="px-4 py-2.5 font-semibold text-[#172033]">{doc.sections[i].name || (s.kind === 'ppm' ? 'Pre-Installation & PPM' : 'Untitled solution')}</td>
                    {showCosting && <td className="px-4 py-2.5 text-right tabular-nums text-[#475467]">{formatNum(s.totals.supply_osp)}</td>}
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatNum(s.totals.supply_price)}</td>
                    {showCosting && <td className="px-4 py-2.5 text-right tabular-nums text-[#475467]">{formatNum(s.totals.services_osp)}</td>}
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatNum(s.totals.services_price)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[#475467]">{formatNum(s.totals.gst_total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-[#E4E7EC] font-extrabold text-[#172033]">
                <tr>
                  <td className="px-4 py-2.5" colSpan={2}>Grand Total (Supply + Installation + PPM)</td>
                  {showCosting && <td className="px-4 py-2.5 text-right tabular-nums">{formatNum(totals.supply_osp)}</td>}
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatNum(totals.supply_price)}</td>
                  {showCosting && <td className="px-4 py-2.5 text-right tabular-nums">{formatNum(totals.services_osp)}</td>}
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatNum(totals.services_price)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatNum(totals.gst_total)}</td>
                </tr>
                <tr className="bg-[#004898] text-white">
                  <td className="px-4 py-3" colSpan={showCosting ? 6 : 4}>Grand Total (All Inclusive)</td>
                  <td className="px-4 py-3 text-right tabular-nums text-[15px]">{formatINR(totals.grand_total)}</td>
                </tr>
                {showCosting && (
                  <tr className="bg-[#F7FEE7] text-[#3F6212]">
                    <td className="px-4 py-2.5" colSpan={6}>SM — margin over OSP</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatINR(totals.margin)} <span className="text-[11px]">({totals.margin_pct}%)</span></td>
                  </tr>
                )}
              </tfoot>
            </table>
          </div>
        </div>

        <div className="card bg-white border border-[#E4E7EC] shadow-xs overflow-hidden flex flex-col">
          <div className="px-5 py-3.5 border-b border-[#F2F4F7] flex items-center justify-between">
            <div>
              <h3 className="font-extrabold text-[#172033]">Notes &amp; Terms</h3>
              <p className="text-[11px] text-[#667085]">Printed under the summary. Saved with this version.</p>
            </div>
            {!readOnly && doc.notes.trim() === '' && <AlertTriangle className="w-4 h-4 text-[#F79009]" title="No notes" />}
          </div>
          <textarea value={doc.notes} disabled={readOnly} onChange={(e) => update({ notes: e.target.value })} rows={7}
            className="flex-1 w-full p-5 text-[13px] leading-relaxed text-[#344054] outline-none resize-y disabled:bg-white" />
        </div>
      </div>

      {picker && (
        <ItemPicker
          sectionName={doc.sections.find((s) => s.key === picker)?.name}
          onAdd={(item) => addItemLine(picker, item)}
          onClose={() => setPicker(null)}
        />
      )}
      {statusDialog && <StatusDialog kind={statusDialog} onClose={() => setStatusDialog(null)} onConfirm={changeStatus} />}
    </div>
  );
};
