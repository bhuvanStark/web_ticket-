// One voucher (Sales Order / Proforma / DC / Invoice) prepared from a won
// quotation. Lines come pre-filled from the won version; the maker ticks
// lines, sets qty (partial deliveries), the Tally names and the billing
// details, then downloads the XML for Tally → Import → Transactions.
import React, { useMemo, useState } from 'react';
import {
  ArrowLeft, Save, Download, Loader2, AlertTriangle, CheckCircle2, Undo2, Trash2, Wand2, Lock, Info
} from 'lucide-react';
import { StateSelect } from '../common/StateSelect';
import {
  createVoucher, updateVoucher, deleteVoucher, downloadVoucherXml, setVoucherImported
} from '../../services/tallyApiService';
import { formatINR, formatNum, formatDate, formatDateTime, todayKey } from '../quotes/quoteShared';
import {
  VOUCHER_KINDS, VOUCHER_STATUS, computeVoucher, voucherProblems, defaultVoucherType, stateFromGstin, saveXmlFile
} from './tallyShared';

const HEADER_FIELDS = ['voucher_type', 'voucher_date', 'po_number', 'po_date', 'party_ledger', 'bill_name', 'bill_address',
  'bill_gstin', 'bill_state', 'ship_name', 'ship_address', 'ship_gstin', 'ship_state', 'place_of_supply', 'narration'];
const round2 = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
const suggestion = (row) => (row.brand && row.model_no ? `${row.brand} ${row.model_no}` : '');

// Header for a new voucher: the quote's last voucher, else what was
// remembered for this customer, else the quote itself.
function newHeader(kind, data) {
  const { quote, vouchers, party } = data;
  const last = vouchers[0];
  const from = last || party || {};
  const header = {
    voucher_type: '',
    voucher_date: todayKey(),
    po_number: last?.po_number ?? quote.po_number ?? '',
    po_date: last?.po_date ?? quote.po_date ?? '',
    party_ledger: from.party_ledger || '',
    bill_name: from.bill_name || quote.customer || '',
    bill_address: from.bill_address || '',
    bill_gstin: from.bill_gstin || '',
    bill_state: from.bill_state || '',
    ship_name: last?.ship_name || '',
    ship_address: last?.ship_address || (last ? '' : quote.site_location || ''),
    ship_gstin: last?.ship_gstin || '',
    ship_state: last?.ship_state || '',
    place_of_supply: last?.place_of_supply || '',
    narration: [quote.project_ref && `Ref ${quote.project_ref}`, `${quote.customer} – ${quote.project}`].filter(Boolean).join(' · ')
  };
  header.place_of_supply ||= header.ship_state || header.bill_state;
  return header;
}

// Rows: every won-version line (ticked or not), plus any line already on
// this voucher whose quote line no longer exists (quote reopened/edited).
function buildRows(kind, data, existing) {
  const k = VOUCHER_KINDS[kind];
  const own = new Map((existing?.lines || []).filter((l) => l.source_line_id).map((l) => [l.source_line_id, l]));
  const usedElsewhere = (lineId) => data.used
    .filter((u) => u.source_line_id === lineId && u.kind === kind && u.voucher_id !== existing?.voucher.id)
    .reduce((n, u) => n + u.qty, 0);
  const rows = data.lines.map((line) => {
    const used = usedElsewhere(line.id);
    const mine = own.get(line.id);
    const allowed = line.line_type !== 'service' || k.services;
    const remaining = Math.max(0, round2(line.qty - used));
    return {
      key: line.id,
      source_line_id: line.id,
      item_id: line.item_id,
      line_type: line.line_type,
      description: line.description,
      detail: line.detail,
      section_name: line.section_name,
      hsn_code: line.hsn_code,
      brand: line.brand,
      model_no: line.model_no,
      quote_qty: line.qty,
      used,
      allowed,
      selected: existing ? Boolean(mine) : allowed && remaining > 0,
      qty: mine ? mine.qty : remaining || line.qty,
      rate: mine ? mine.rate : line.rate,
      gst_rate: mine ? mine.gst_rate : line.gst_rate,
      stock_item_name: mine?.stock_item_name || line.stock_item_name || '',
      unit_name: mine?.unit_name || line.unit_name || line.uom || 'Nos'
    };
  });
  const known = new Set(data.lines.map((l) => l.id));
  for (const line of existing?.lines || []) {
    if (line.source_line_id && known.has(line.source_line_id)) continue;
    rows.push({
      key: line.id, source_line_id: line.source_line_id, item_id: line.item_id, line_type: line.line_type,
      description: line.description, hsn_code: line.hsn_code, quote_qty: null, used: 0, orphan: true,
      allowed: line.line_type !== 'service' || k.services, selected: true, qty: line.qty, rate: line.rate,
      gst_rate: line.gst_rate, stock_item_name: line.stock_item_name || '', unit_name: line.unit_name || 'Nos'
    });
  }
  return rows;
}

const Field = ({ label, children, hint, wide }) => (
  <label className={`block ${wide ? 'md:col-span-2' : ''}`}>
    <span className="text-[11px] font-bold text-[#344054]">{label}</span>
    <div className="mt-1">{children}</div>
    {hint && <span className="block text-[10px] text-[#667085] mt-1">{hint}</span>}
  </label>
);
const inputCls = 'w-full px-3 py-2 border border-[#E4E7EC] rounded-lg text-xs outline-none focus:border-[#004898] disabled:bg-[#F8FAFC]';

export const TallyVoucherEditor = ({ kind, data, existing, settings, onBack, onSaved, showToast }) => {
  const [header, setHeader] = useState(() => (existing
    ? Object.fromEntries(HEADER_FIELDS.map((f) => [f, existing.voucher[f] ?? '']))
    : newHeader(kind, data)));
  const [rows, setRows] = useState(() => buildRows(kind, data, existing));
  const [dirty, setDirty] = useState(!existing);
  const [busy, setBusy] = useState('');
  const k = VOUCHER_KINDS[kind];
  const voucher = existing?.voucher;
  const locked = voucher?.status === 'imported';

  const set = (patch) => { setHeader((h) => ({ ...h, ...patch })); setDirty(true); };
  const setRow = (key, patch) => { setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r))); setDirty(true); };

  const selected = rows.filter((r) => r.selected);
  const typeOptions = useMemo(() => {
    const names = kind === 'invoice' ? [settings.vch_invoice_goods, settings.vch_invoice_services]
      : [defaultVoucherType(kind, settings)];
    return [...new Set([...names, header.voucher_type].filter(Boolean))];
  }, [kind, settings, header.voucher_type]);
  const voucherType = header.voucher_type || defaultVoucherType(kind, settings, selected) || '';
  const current = { ...header, kind, voucher_type: voucherType };
  const lines = selected.map((r) => ({ ...r, qty: Number(r.qty), rate: Number(r.rate), gst_rate: Number(r.gst_rate) }));
  const calc = computeVoucher(current, lines, settings);
  const problems = [
    ...voucherProblems(current, lines, settings),
    ...lines.filter((l) => !(l.qty > 0)).map((l) => `Line "${l.description}": qty must be more than 0`)
  ];

  const body = () => ({
    kind,
    quote_id: data.quote.id,
    ...current,
    lines: selected.map((r) => ({
      source_line_id: r.source_line_id, item_id: r.item_id, line_type: r.line_type, description: r.description,
      hsn_code: r.hsn_code, stock_item_name: r.stock_item_name, unit_name: r.unit_name, qty: r.qty, rate: r.rate, gst_rate: r.gst_rate
    }))
  });

  const save = async ({ quiet = false } = {}) => {
    setBusy('save');
    try {
      const saved = existing ? await updateVoucher(voucher.id, body()) : await createVoucher(body());
      setDirty(false);
      onSaved(saved, { keepOpen: true });
      if (!quiet) showToast('Voucher saved', 'success');
      return saved;
    } catch (err) {
      showToast(err.message, 'error');
      return null;
    } finally { setBusy(''); }
  };

  const download = async () => {
    if (problems.length) { showToast('Fix the items listed in red first', 'error'); return; }
    if (voucher?.download_count > 0 && !window.confirm(
      `This file was already downloaded ${voucher.download_count} time(s).\n\nImport it again only if Tally rejected the earlier import — importing the same voucher twice creates a duplicate in Tally.\n\nDownload again?`
    )) return;
    const saved = dirty || !existing ? await save({ quiet: true }) : existing;
    if (!saved) return;
    setBusy('download');
    try {
      saveXmlFile(await downloadVoucherXml(saved.voucher.id));
      showToast('File downloaded. Import it in Tally: Import → Transactions', 'success');
      onSaved(null, { keepOpen: true, reload: saved.voucher.id });
    } catch (err) {
      showToast(err.details?.length ? `${err.message}: ${err.details[0]}` : err.message, 'error');
    } finally { setBusy(''); }
  };

  const markImported = async (imported) => {
    let no = null;
    if (imported) {
      no = window.prompt('Imported into Tally successfully?\n\nOptional: the voucher number Tally gave it (e.g. SO/123).', '');
      if (no === null) return;
    } else if (!window.confirm('Undo "In Tally"? The voucher becomes editable again.')) return;
    setBusy('import');
    try {
      onSaved(await setVoucherImported(voucher.id, imported, no), { keepOpen: true });
      showToast(imported ? 'Marked as imported into Tally' : 'Voucher unlocked', 'success');
    } catch (err) { showToast(err.message, 'error'); } finally { setBusy(''); }
  };

  const remove = async () => {
    if (!window.confirm('Delete this voucher? This does not touch Tally.')) return;
    try { await deleteVoucher(voucher.id); showToast('Voucher deleted', 'success'); onSaved(null, { keepOpen: false }); } catch (err) { showToast(err.message, 'error'); }
  };

  const fillSuggestions = () => {
    const fillable = (r) => r.line_type !== 'service' && !r.stock_item_name && suggestion(r);
    const n = rows.filter(fillable).length;
    if (!n) { showToast('Nothing to fill: no empty Tally name has a Brand + Model No', 'info'); return; }
    setRows((rs) => rs.map((r) => (fillable(r) ? { ...r, stock_item_name: suggestion(r) } : r)));
    setDirty(true);
    showToast(`Filled ${n} line(s) with Brand + Model No — check they match Tally`, 'success');
  };

  const onGstin = (prefix, value) => {
    const patch = { [`${prefix}_gstin`]: value.toUpperCase() };
    const state = stateFromGstin(value);
    if (state && !header[`${prefix}_state`]) patch[`${prefix}_state`] = state;
    set(patch);
  };

  const status = VOUCHER_STATUS[voucher?.status || 'draft'];

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <button onClick={() => { if (!dirty || window.confirm('Discard unsaved changes?')) onBack(); }}
            className="mt-1 p-2 rounded-xl border border-[#E4E7EC] bg-white text-[#475467] hover:text-[#004898] hover:border-[#004898]"><ArrowLeft className="w-4 h-4" /></button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-extrabold text-[#172033] tracking-tight">{voucher ? `TD-${voucher.ref_no}` : 'New'} · {k.label}</h2>
              <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border ${status.cls}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />{status.label}{voucher?.tally_voucher_no ? ` · ${voucher.tally_voucher_no}` : ''}
              </span>
            </div>
            <p className="text-xs text-[#667085] mt-0.5 truncate">
              {data.quote.customer} – {data.quote.project}
              {data.quote.version_no ? ` · Won V${data.quote.version_no}.0` : ''}
              {voucher?.last_downloaded_at ? ` · Downloaded ${voucher.download_count}× (last ${formatDateTime(voucher.last_downloaded_at)}${voucher.last_downloaded_by_name ? ` by ${voucher.last_downloaded_by_name}` : ''})` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {voucher && !locked && (
            <button onClick={remove} className="p-2 rounded-lg border border-[#E4E7EC] bg-white text-[#98A2B3] hover:text-[#D92D20]" title="Delete voucher"><Trash2 className="w-4 h-4" /></button>
          )}
          {voucher && voucher.status !== 'draft' && (
            <button onClick={() => markImported(!locked)} disabled={Boolean(busy)}
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg border border-[#D0D5DD] bg-white text-[#344054] hover:bg-[#F8FAFC]">
              {locked ? <><Undo2 className="w-4 h-4" />Undo “In Tally”</> : <><CheckCircle2 className="w-4 h-4 text-[#12B76A]" />Mark imported</>}
            </button>
          )}
          {!locked && (
            <>
              <button onClick={() => save()} disabled={Boolean(busy) || (!dirty && Boolean(existing))}
                className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg border border-[#D0D5DD] bg-white text-[#344054] hover:bg-[#F8FAFC] disabled:opacity-50">
                {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Save
              </button>
              <button onClick={download} disabled={Boolean(busy)} className="btn btn-primary text-xs font-bold shadow-sm disabled:opacity-50">
                {busy === 'download' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}Download for Tally
              </button>
            </>
          )}
        </div>
      </div>

      {locked && (
        <div className="rounded-2xl border border-[#A6F4C5] bg-[#ECFDF3] px-4 py-3 flex items-start gap-3 text-xs text-[#05603A]">
          <Lock className="w-4 h-4 shrink-0 mt-0.5" />
          <p>This voucher is in Tally, so it is locked here. Change it in Tally. Use “Undo” only if it was marked by mistake.</p>
        </div>
      )}

      {!locked && problems.length > 0 && (
        <div className="rounded-2xl border border-[#FECDCA] bg-[#FEF3F2] px-4 py-3 text-xs text-[#7A271A]">
          <div className="flex items-center gap-2 font-bold text-[#B42318]"><AlertTriangle className="w-4 h-4" />Before Tally accepts this voucher:</div>
          <ul className="list-disc ml-9 mt-1 space-y-0.5">{problems.slice(0, 12).map((p) => <li key={p}>{p}</li>)}</ul>
          {problems.length > 12 && <p className="ml-9 mt-1">…and {problems.length - 12} more</p>}
        </div>
      )}

      <div className="card bg-white border border-[#E4E7EC] shadow-xs p-5">
        <h3 className="font-extrabold text-sm text-[#172033] mb-4">Voucher</h3>
        <fieldset disabled={locked} className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Field label="Tally voucher type">
            {typeOptions.length ? (
              <select value={voucherType} onChange={(e) => set({ voucher_type: e.target.value })} className={inputCls}>
                {typeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            ) : <p className="text-[11px] text-[#B42318] py-2">Not set — add it in Tally Settings.</p>}
          </Field>
          <Field label="Voucher date"><input type="date" value={header.voucher_date || ''} onChange={(e) => set({ voucher_date: e.target.value })} className={inputCls} /></Field>
          <Field label="Customer PO no"><input value={header.po_number || ''} onChange={(e) => set({ po_number: e.target.value })} className={inputCls} /></Field>
          <Field label="PO date"><input type="date" value={header.po_date || ''} onChange={(e) => set({ po_date: e.target.value })} className={inputCls} /></Field>
        </fieldset>
        <p className="text-[10px] text-[#667085] mt-2">Tally gives the voucher its number when it is imported.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card bg-white border border-[#E4E7EC] shadow-xs p-5">
          <h3 className="font-extrabold text-sm text-[#172033] mb-4">Bill to (party)</h3>
          <fieldset disabled={locked} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Party ledger in Tally *" wide hint="Exactly as the customer's ledger is named in Tally. Remembered for this customer.">
              <input value={header.party_ledger || ''} onChange={(e) => set({ party_ledger: e.target.value })} className={`${inputCls} font-mono`} />
            </Field>
            <Field label="Billing name" wide><input value={header.bill_name || ''} onChange={(e) => set({ bill_name: e.target.value })} className={inputCls} /></Field>
            <Field label="Billing address" wide>
              <textarea rows={3} value={header.bill_address || ''} onChange={(e) => set({ bill_address: e.target.value })} className={inputCls} />
            </Field>
            <Field label="GSTIN"><input value={header.bill_gstin || ''} onChange={(e) => onGstin('bill', e.target.value)} maxLength={15} className={`${inputCls} font-mono`} placeholder="Unregistered: leave empty" /></Field>
            <Field label="State"><StateSelect value={header.bill_state || ''} onChange={(v) => set({ bill_state: v })} /></Field>
          </fieldset>
        </div>
        <div className="card bg-white border border-[#E4E7EC] shadow-xs p-5">
          <h3 className="font-extrabold text-sm text-[#172033] mb-4">Ship to (site)</h3>
          <fieldset disabled={locked} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Consignee name" wide hint="Leave empty when it is the same as Bill to."><input value={header.ship_name || ''} onChange={(e) => set({ ship_name: e.target.value })} className={inputCls} /></Field>
            <Field label="Site address" wide>
              <textarea rows={3} value={header.ship_address || ''} onChange={(e) => set({ ship_address: e.target.value })} className={inputCls} />
            </Field>
            <Field label="GSTIN"><input value={header.ship_gstin || ''} onChange={(e) => onGstin('ship', e.target.value)} maxLength={15} className={`${inputCls} font-mono`} /></Field>
            <Field label="State"><StateSelect value={header.ship_state || ''} onChange={(v) => set({ ship_state: v, ...(header.place_of_supply ? {} : { place_of_supply: v }) })} /></Field>
            {k.taxed && (
              <Field label="Place of supply *" wide
                hint={header.place_of_supply ? (calc.intra ? `Same state as ours (${settings.home_state}) → CGST + SGST` : `Other state → IGST`) : 'Usually the state the goods are delivered to.'}>
                <StateSelect value={header.place_of_supply || ''} onChange={(v) => set({ place_of_supply: v })} />
              </Field>
            )}
          </fieldset>
        </div>
      </div>

      <div className="card bg-white border border-[#E4E7EC] shadow-xs overflow-hidden">
        <div className="p-4 border-b border-[#F2F4F7] flex flex-col md:flex-row md:items-center justify-between gap-2">
          <div>
            <h3 className="font-extrabold text-sm text-[#172033]">Lines <span className="text-[#667085] font-bold">{selected.length} of {rows.length} ticked</span></h3>
            <p className="text-[11px] text-[#667085] mt-0.5">
              {k.services ? 'Goods need their Tally stock item name; service lines post to the services ledger.' : 'Goods only. Untick lines or lower the qty for a partial delivery.'}
            </p>
          </div>
          {!locked && (
            <button onClick={fillSuggestions} className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#004898] bg-[#EFF5FC] hover:bg-[#E0EDFB] px-3 py-1.5 rounded-lg">
              <Wand2 className="w-3.5 h-3.5" />Fill empty Tally names with Brand + Model No
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left min-w-[980px]">
            <thead className="bg-[#F8FAFC] text-[#667085] uppercase font-bold text-[10px] tracking-wider border-b border-[#E4E7EC]">
              <tr>
                <th className="pl-4 py-2 w-8" />
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2">Tally stock item / unit</th>
                <th className="px-3 py-2 text-right">Quote qty</th>
                <th className="px-3 py-2 text-right w-24">Qty</th>
                <th className="px-3 py-2 text-right w-28">Rate</th>
                <th className="px-3 py-2 text-right">GST %</th>
                <th className="px-3 py-2 text-right pr-4">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F2F4F7]">
              {rows.length === 0 && <tr><td colSpan={8} className="py-10 text-center text-[#667085]">The won version has no lines.</td></tr>}
              {rows.map((r) => {
                const off = !r.selected;
                const amount = round2(Number(r.qty) * Number(r.rate));
                const missingName = r.selected && r.line_type !== 'service' && !r.stock_item_name;
                return (
                  <tr key={r.key} className={`align-top ${off ? 'opacity-50' : ''}`}>
                    <td className="pl-4 py-2.5">
                      <input type="checkbox" checked={r.selected} disabled={locked || !r.allowed}
                        title={r.allowed ? '' : `A ${k.label} carries goods only`}
                        onChange={(e) => setRow(r.key, { selected: e.target.checked })} className="w-4 h-4 accent-[#004898]" />
                    </td>
                    <td className="px-3 py-2.5 max-w-xs">
                      <div className="font-bold text-[12px] text-[#172033]">
                        {r.description}
                        {r.line_type === 'service' && <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wide text-[#6941C6] bg-[#F4F3FF] px-1.5 py-0.5 rounded">Service</span>}
                      </div>
                      <div className="text-[10px] text-[#667085]">
                        {[r.section_name, r.hsn_code && `HSN ${r.hsn_code}`, r.brand && r.model_no && `${r.brand} · ${r.model_no}`].filter(Boolean).join(' · ')}
                      </div>
                      {r.orphan && <div className="text-[10px] text-[#B54708] mt-0.5 flex items-center gap-1"><Info className="w-3 h-3" />No longer on the won quote</div>}
                    </td>
                    <td className="px-3 py-2.5 min-w-[260px]">
                      {r.line_type === 'service' ? (
                        <span className="text-[11px] text-[#667085]">→ {settings.ledger_sales_services || <span className="text-[#B42318]">services ledger not set</span>}</span>
                      ) : (
                        <div className="flex gap-1">
                          <input value={r.stock_item_name} disabled={locked || off} onChange={(e) => setRow(r.key, { stock_item_name: e.target.value })}
                            placeholder={suggestion(r) || 'Tally stock item name'}
                            className={`flex-1 min-w-0 px-2 py-1.5 border rounded-md text-[11px] font-mono outline-none focus:border-[#004898] disabled:bg-transparent ${missingName ? 'border-[#FDA29B] bg-[#FEF3F2]' : 'border-[#E4E7EC]'}`} />
                          <input value={r.unit_name} disabled={locked || off} onChange={(e) => setRow(r.key, { unit_name: e.target.value })}
                            className="w-16 px-2 py-1.5 border border-[#E4E7EC] rounded-md text-[11px] font-mono outline-none focus:border-[#004898] disabled:bg-transparent" />
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[#475467]">
                      {r.quote_qty == null ? '—' : formatNum(r.quote_qty)}
                      {r.used > 0 && <div className="text-[10px] text-[#B54708]">{formatNum(r.used)} on other {k.short}s</div>}
                    </td>
                    <td className="px-3 py-2.5">
                      <input type="number" min="0" step="any" value={r.qty} disabled={locked || off} onChange={(e) => setRow(r.key, { qty: e.target.value })}
                        className="w-full px-2 py-1.5 border border-[#E4E7EC] rounded-md text-[12px] text-right tabular-nums outline-none focus:border-[#004898] disabled:bg-transparent" />
                    </td>
                    <td className="px-3 py-2.5">
                      <input type="number" min="0" step="any" value={r.rate} disabled={locked || off} onChange={(e) => setRow(r.key, { rate: e.target.value })}
                        className="w-full px-2 py-1.5 border border-[#E4E7EC] rounded-md text-[12px] text-right tabular-nums outline-none focus:border-[#004898] disabled:bg-transparent" />
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[#475467]">{formatNum(r.gst_rate)}%</td>
                    <td className="px-3 py-2.5 pr-4 text-right tabular-nums font-bold text-[#172033]">{formatNum(amount)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-[#E4E7EC] p-4 flex flex-col md:flex-row justify-between gap-4">
          <fieldset disabled={locked} className="flex-1 max-w-xl">
            <Field label="Narration"><textarea rows={2} value={header.narration || ''} onChange={(e) => set({ narration: e.target.value })} className={inputCls} /></Field>
          </fieldset>
          <dl className="text-xs w-full md:w-72 space-y-1 tabular-nums">
            {[
              ['Goods', calc.goods],
              k.services && ['Services', calc.services],
              k.taxed && calc.intra && ['CGST', calc.cgst],
              k.taxed && calc.intra && ['SGST', calc.sgst],
              k.taxed && !calc.intra && ['IGST', calc.igst],
              calc.round_off !== 0 && ['Round off', calc.round_off]
            ].filter(Boolean).map(([label, value]) => (
              <div key={label} className="flex justify-between text-[#475467]"><dt>{label}</dt><dd>{formatNum(value)}</dd></div>
            ))}
            <div className="flex justify-between border-t border-[#E4E7EC] pt-1.5 mt-1.5 font-extrabold text-sm text-[#172033]"><dt>Total</dt><dd>{formatINR(calc.total, { decimals: true })}</dd></div>
            {!k.taxed && <p className="text-[10px] text-[#667085]">A delivery note carries no GST.</p>}
          </dl>
        </div>
      </div>

      {voucher && (
        <p className="text-[11px] text-[#98A2B3]">
          Created {formatDate(voucher.created_at)}{voucher.created_by_name ? ` by ${voucher.created_by_name}` : ''}
          {voucher.updated_by_name ? ` · last changed by ${voucher.updated_by_name}` : ''}
        </p>
      )}
    </div>
  );
};
