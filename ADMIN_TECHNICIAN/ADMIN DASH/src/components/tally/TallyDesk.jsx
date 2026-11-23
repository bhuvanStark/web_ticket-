// Tally Desk (Phase 1, tallyPlan.md) — Back-Office Tally Makers turn won
// quotations into Tally vouchers and download the XML that Accounts imports
// in Tally (Import → Transactions). It only reads quotations, never edits them.
import React, { useCallback, useEffect, useState } from 'react';
import {
  Loader2, Search, X, ChevronRight, ArrowLeft, FileText, Landmark, Package, Settings2, ListChecks, Plus, AlertTriangle
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { EmptyState } from '../common/EmptyState';
import { fetchTallySettings, fetchWonQuotes, fetchWonQuote, fetchVouchers, fetchVoucher } from '../../services/tallyApiService';
import { formatINR, formatDate } from '../quotes/quoteShared';
import { useTallyAccess, VOUCHER_KINDS, VOUCHER_STATUS } from './tallyShared';
import { TallyVoucherEditor } from './TallyVoucherEditor';
import { TallySettingsPanel } from './TallySettingsPanel';
import { TallyItemNamesPanel } from './TallyItemNamesPanel';

const TABS = [
  { id: 'quotes', label: 'Won quotations', icon: FileText },
  { id: 'vouchers', label: 'Vouchers', icon: ListChecks },
  { id: 'items', label: 'Item names', icon: Package },
  { id: 'settings', label: 'Tally settings', icon: Settings2 }
];
const REQUIRED_SETTINGS = ['ledger_sales_goods', 'ledger_cgst', 'ledger_sgst', 'ledger_igst', 'vch_sales_order', 'vch_delivery_note', 'vch_invoice_goods'];

const StatusPill = ({ status }) => {
  const st = VOUCHER_STATUS[status] || VOUCHER_STATUS.draft;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border whitespace-nowrap ${st.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />{st.label}
    </span>
  );
};

const VoucherTable = ({ vouchers, onOpen, showQuote }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-xs text-left">
      <thead className="bg-[#F8FAFC] text-[#667085] uppercase font-bold text-[10px] tracking-wider border-b border-[#E4E7EC]">
        <tr>
          <th className="px-5 py-3">Voucher</th>
          {showQuote && <th className="px-5 py-3">Customer / Project</th>}
          <th className="px-5 py-3">Date</th>
          <th className="px-5 py-3">PO</th>
          <th className="px-5 py-3 text-right">Total</th>
          <th className="px-5 py-3">Status</th>
          <th className="w-8" />
        </tr>
      </thead>
      <tbody className="divide-y divide-[#F2F4F7]">
        {vouchers.map((v) => (
          <tr key={v.id} onClick={() => onOpen(v)} className="group cursor-pointer hover:bg-[#F8FAFC]">
            <td className="px-5 py-3">
              <div className="font-extrabold text-[13px] text-[#172033]">TD-{v.ref_no} · {VOUCHER_KINDS[v.kind]?.label}</div>
              <div className="text-[11px] text-[#667085]">{v.voucher_type || 'Type not set'} · {v.line_count} line{v.line_count === 1 ? '' : 's'}</div>
            </td>
            {showQuote && (
              <td className="px-5 py-3">
                <div className="font-bold text-[12px] text-[#172033]">{v.customer}</div>
                <div className="text-[11px] text-[#667085]">{v.project}</div>
              </td>
            )}
            <td className="px-5 py-3 text-[#475467] whitespace-nowrap">{formatDate(v.voucher_date)}</td>
            <td className="px-5 py-3 text-[#475467]">{v.po_number || '—'}</td>
            <td className="px-5 py-3 text-right font-extrabold text-[#172033] tabular-nums">{formatINR(v.total)}</td>
            <td className="px-5 py-3">
              <StatusPill status={v.status} />
              {v.tally_voucher_no && <div className="text-[10px] text-[#027A48] mt-1">{v.tally_voucher_no}</div>}
            </td>
            <td className="pr-4"><ChevronRight className="w-4 h-4 text-[#D0D5DD] group-hover:text-[#004898]" /></td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// One won quotation: its vouchers and the buttons to start a new one.
const QuotePanel = ({ data, onBack, onNew, onOpen }) => {
  const { quote, vouchers, lines } = data;
  const won = quote.status === 'won' && quote.won_version_id;
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <button onClick={onBack} className="mt-1 p-2 rounded-xl border border-[#E4E7EC] bg-white text-[#475467] hover:text-[#004898] hover:border-[#004898]"><ArrowLeft className="w-4 h-4" /></button>
        <div className="min-w-0">
          <h2 className="text-xl font-extrabold text-[#172033] tracking-tight">{quote.customer}</h2>
          <p className="text-xs text-[#667085] mt-0.5">
            {quote.project}{quote.project_ref ? ` · Ref ${quote.project_ref}` : ''}
            {won ? ` · Won V${quote.version_no}.0 · ${formatINR(quote.grand_total)}` : ''}
            {quote.po_number ? ` · PO ${quote.po_number}${quote.po_date ? ` (${formatDate(quote.po_date)})` : ''}` : ''}
          </p>
        </div>
      </div>

      {won ? (
        <div className="card bg-white border border-[#E4E7EC] shadow-xs p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#667085] mb-3">Make a Tally voucher · {lines.length} line{lines.length === 1 ? '' : 's'} on the won quote</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {Object.entries(VOUCHER_KINDS).map(([kind, k]) => (
              <button key={kind} onClick={() => onNew(kind)}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-[#E4E7EC] bg-white hover:border-[#004898] hover:bg-[#EFF5FC] text-left">
                <Plus className="w-4 h-4 text-[#004898] shrink-0" />
                <span className="text-xs font-bold text-[#172033]">{k.label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-[#FEDF89] bg-[#FFFAEB] px-4 py-3 flex items-start gap-3 text-xs text-[#7A2E0E]">
          <AlertTriangle className="w-4 h-4 text-[#DC6803] shrink-0 mt-0.5" />
          <p>This quotation is no longer marked Won, so no new vouchers can be made from it. Its existing vouchers are below.</p>
        </div>
      )}

      <div className="card bg-white border border-[#E4E7EC] shadow-xs overflow-hidden">
        <div className="px-5 py-3 border-b border-[#F2F4F7]"><h3 className="font-extrabold text-sm text-[#172033]">Vouchers</h3></div>
        {vouchers.length ? <VoucherTable vouchers={vouchers} onOpen={onOpen} /> : (
          <p className="py-10 text-center text-xs text-[#667085]">No vouchers yet. Start with the Sales Order once the customer's PO is in.</p>
        )}
      </div>
    </div>
  );
};

export const TallyDesk = () => {
  const { showToast } = useApp();
  const access = useTallyAccess(true, { recheck: true });
  const [tab, setTab] = useState('quotes');
  const [settings, setSettings] = useState(null);
  const [quotes, setQuotes] = useState([]);
  const [allVouchers, setAllVouchers] = useState([]);
  const [voucherStatus, setVoucherStatus] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  // view: null (lists) | { quoteId } | { quoteId, kind, voucherId? }
  const [view, setView] = useState(null);
  const [quoteData, setQuoteData] = useState(null);
  const [voucherDetail, setVoucherDetail] = useState(null);

  useEffect(() => {
    if (!access.canAccess) return;
    fetchTallySettings().then(setSettings).catch((err) => showToast(err.message, 'error'));
  }, [access.canAccess, showToast]);

  const loadLists = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'quotes') setQuotes(await fetchWonQuotes({ search }));
      if (tab === 'vouchers') setAllVouchers(await fetchVouchers({ status: voucherStatus }));
    } catch (err) { showToast(err.message, 'error'); } finally { setLoading(false); }
  }, [tab, search, voucherStatus, showToast]);
  useEffect(() => {
    if (!access.canAccess || view) return undefined;
    const t = setTimeout(loadLists, 250);
    return () => clearTimeout(t);
  }, [access.canAccess, view, loadLists]);

  const loadQuote = useCallback(async (quoteId) => {
    try { setQuoteData(await fetchWonQuote(quoteId)); } catch (err) { showToast(err.message, 'error'); setView(null); }
  }, [showToast]);
  const loadVoucher = useCallback(async (voucherId) => {
    try { setVoucherDetail(await fetchVoucher(voucherId)); } catch (err) { showToast(err.message, 'error'); }
  }, [showToast]);

  const openQuote = (quoteId) => { setQuoteData(null); setVoucherDetail(null); setView({ quoteId }); loadQuote(quoteId); };
  const openVoucher = (v) => {
    setQuoteData(null); setVoucherDetail(null);
    setView({ quoteId: v.quote_id, kind: v.kind, voucherId: v.id, fromList: !view });
    loadQuote(v.quote_id); loadVoucher(v.id);
  };

  // Editor callbacks: a save returns the voucher; a delete closes it.
  const onVoucherSaved = (saved, { keepOpen, reload } = {}) => {
    loadQuote(view.quoteId);
    if (saved) { setVoucherDetail(saved); setView((v) => ({ ...v, voucherId: saved.voucher.id })); return; }
    if (reload) { loadVoucher(reload); return; }
    if (!keepOpen) { setVoucherDetail(null); setView((v) => (v.fromList ? null : { quoteId: v.quoteId })); }
  };

  if (access.loading) return <div className="flex justify-center py-32"><Loader2 className="w-8 h-8 text-[#004898] animate-spin" /></div>;
  if (!access.canAccess) return <EmptyState title="No Access" subtitle="Tally Desk is available to Tally Makers only." icon="inbox" />;
  if (!settings) return <div className="flex justify-center py-32"><Loader2 className="w-8 h-8 text-[#004898] animate-spin" /></div>;

  if (view?.kind) {
    const ready = quoteData && (!view.voucherId || voucherDetail?.voucher.id === view.voucherId);
    if (!ready) return <div className="flex justify-center py-32"><Loader2 className="w-8 h-8 text-[#004898] animate-spin" /></div>;
    const existing = view.voucherId ? voucherDetail : null;
    return (
      <TallyVoucherEditor
        key={existing ? `${existing.voucher.id}-${existing.voucher.updated_at}` : `new-${view.kind}`}
        kind={view.kind}
        data={quoteData}
        existing={existing}
        settings={settings}
        showToast={showToast}
        onSaved={onVoucherSaved}
        onBack={() => { setVoucherDetail(null); setView(view.fromList ? null : { quoteId: view.quoteId }); }}
      />
    );
  }
  if (view?.quoteId) {
    if (!quoteData) return <div className="flex justify-center py-32"><Loader2 className="w-8 h-8 text-[#004898] animate-spin" /></div>;
    return (
      <QuotePanel
        data={quoteData}
        onBack={() => setView(null)}
        onNew={(kind) => { setVoucherDetail(null); setView({ quoteId: view.quoteId, kind }); }}
        onOpen={(v) => { setVoucherDetail(null); setView({ quoteId: v.quote_id, kind: v.kind, voucherId: v.id }); loadVoucher(v.id); }}
      />
    );
  }

  const missingSettings = REQUIRED_SETTINGS.filter((k) => !settings[k]).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-[#172033] tracking-tight flex items-center gap-2"><Landmark className="w-6 h-6 text-[#004898]" />Tally Desk</h2>
          <p className="text-xs md:text-sm text-[#667085] mt-0.5">Turn won quotations into Tally vouchers. Download the file and import it in Tally: Import → Transactions.</p>
        </div>
      </div>

      {missingSettings > 0 && tab !== 'settings' && (
        <button onClick={() => setTab('settings')} className="w-full text-left rounded-2xl border border-[#FEDF89] bg-[#FFFAEB] px-4 py-3 flex items-start gap-3 text-xs text-[#7A2E0E]">
          <AlertTriangle className="w-4 h-4 text-[#DC6803] shrink-0 mt-0.5" />
          <span><b>Tally settings are not complete.</b> {missingSettings} ledger / voucher type name{missingSettings === 1 ? ' is' : 's are'} missing — vouchers can't be downloaded until they are filled in. Open Tally settings →</span>
        </button>
      )}

      <div className="flex items-center gap-1 bg-[#F2F4F7] rounded-xl p-1 overflow-x-auto w-full md:w-fit">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap inline-flex items-center gap-1.5 ${tab === id ? 'bg-white text-[#004898] shadow-xs' : 'text-[#667085] hover:text-[#172033]'}`}>
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {tab === 'settings' && <TallySettingsPanel settings={settings} onSaved={setSettings} showToast={showToast} />}
      {tab === 'items' && <TallyItemNamesPanel showToast={showToast} />}

      {tab === 'quotes' && (
        <div className="card bg-white border border-[#E4E7EC] shadow-xs overflow-hidden">
          <div className="p-4 border-b border-[#F2F4F7] flex justify-end">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-[#98A2B3] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customer, project, ref or PO…"
                className="w-full pl-9 pr-8 py-2 text-xs border border-[#E4E7EC] rounded-lg outline-none focus:border-[#004898]" />
              {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[#98A2B3] hover:text-[#172033]"><X className="w-3.5 h-3.5" /></button>}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-[#F8FAFC] text-[#667085] uppercase font-bold text-[10px] tracking-wider border-b border-[#E4E7EC]">
                <tr>
                  <th className="px-5 py-3">Customer / Project</th>
                  <th className="px-5 py-3">PO</th>
                  <th className="px-5 py-3">Won version</th>
                  <th className="px-5 py-3 text-right">Grand Total</th>
                  <th className="px-5 py-3">Vouchers</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F2F4F7]">
                {loading && !quotes.length ? (
                  [...Array(4)].map((_, i) => <tr key={i}><td colSpan={6} className="px-5 py-4"><div className="h-4 bg-[#F2F4F7] rounded animate-pulse" /></td></tr>)
                ) : quotes.length === 0 ? (
                  <tr><td colSpan={6} className="py-16 text-center">
                    <FileText className="w-10 h-10 text-[#D0D5DD] mx-auto" />
                    <p className="text-sm font-bold text-[#172033] mt-3">{search ? 'No won quotations match' : 'No won quotations yet'}</p>
                    <p className="text-xs text-[#667085] mt-1">A quotation shows up here once a Quote Manager marks it Won.</p>
                  </td></tr>
                ) : quotes.map((q) => (
                  <tr key={q.id} onClick={() => openQuote(q.id)} className="group cursor-pointer hover:bg-[#F8FAFC]">
                    <td className="px-5 py-3.5">
                      <div className="font-extrabold text-[13px] text-[#172033]">{q.customer}</div>
                      <div className="text-[11px] text-[#667085] truncate max-w-xs">{q.project}{q.project_ref ? ` · ${q.project_ref}` : ''}</div>
                    </td>
                    <td className="px-5 py-3.5 text-[#475467]">{q.po_number || '—'}<div className="text-[10px] text-[#98A2B3]">{q.po_date ? formatDate(q.po_date) : ''}</div></td>
                    <td className="px-5 py-3.5"><span className="font-bold text-[#004898] bg-[#EFF5FC] px-2 py-0.5 rounded-md">V{q.version_no}.0</span></td>
                    <td className="px-5 py-3.5 text-right font-extrabold text-[13px] text-[#172033] tabular-nums">{formatINR(q.grand_total)}</td>
                    <td className="px-5 py-3.5 text-[#475467]">
                      {q.voucher_count ? `${q.voucher_count} (${q.imported_count} in Tally)` : <span className="text-[#98A2B3]">None yet</span>}
                    </td>
                    <td className="pr-4"><ChevronRight className="w-4 h-4 text-[#D0D5DD] group-hover:text-[#004898]" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'vouchers' && (
        <div className="card bg-white border border-[#E4E7EC] shadow-xs overflow-hidden">
          <div className="p-4 border-b border-[#F2F4F7]">
            <div className="flex items-center gap-1 bg-[#F2F4F7] rounded-xl p-1 overflow-x-auto w-fit">
              {[['', 'All'], ...Object.entries(VOUCHER_STATUS).map(([k, s]) => [k, s.label])].map(([value, label]) => (
                <button key={value} onClick={() => setVoucherStatus(value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap ${voucherStatus === value ? 'bg-white text-[#004898] shadow-xs' : 'text-[#667085] hover:text-[#172033]'}`}>{label}</button>
              ))}
            </div>
          </div>
          {loading && !allVouchers.length ? (
            <div className="p-5 space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-4 bg-[#F2F4F7] rounded animate-pulse" />)}</div>
          ) : allVouchers.length ? <VoucherTable vouchers={allVouchers} onOpen={openVoucher} showQuote /> : (
            <p className="py-16 text-center text-xs text-[#667085]">No vouchers{voucherStatus ? ' with this status' : ' yet'}.</p>
          )}
        </div>
      )}
    </div>
  );
};
