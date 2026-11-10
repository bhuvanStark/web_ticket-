// Quotations — every quote with its latest version, filterable by status.
// Opening one shows the builder in place.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, FileText, Plus, ChevronRight, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { fetchQuotes } from '../../services/quoteApiService';
import { QuoteBuilder } from './QuoteBuilder';
import { formatINR, formatDate, QUOTE_STATUS, marginTone } from './quoteShared';

const TABS = [['', 'All'], ['draft', 'Draft'], ['sent', 'Under Process'], ['won', 'Won'], ['lost', 'Lost']];

export const QuotationsPage = ({ readOnly, openQuoteId, initialSearch = '', onNewQuote }) => {
  const { showToast } = useApp();
  const [openId, setOpenId] = useState(openQuoteId || null);
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(initialSearch);
  const [status, setStatus] = useState('');

  useEffect(() => { if (openQuoteId) setOpenId(openQuoteId); }, [openQuoteId]);
  useEffect(() => { setSearch(initialSearch); }, [initialSearch]);

  const load = useCallback(async () => {
    try { setQuotes(await fetchQuotes()); } catch (err) { showToast(err.message, 'error'); } finally { setLoading(false); }
  }, [showToast]);
  useEffect(() => { if (!openId) load(); }, [openId, load]);

  const term = search.trim().toLowerCase();
  const matching = useMemo(() => quotes.filter((q) =>
    !term || [q.customer, q.project, q.project_ref, q.site_location].some((v) => (v || '').toLowerCase().includes(term))
  ), [quotes, term]);
  const shown = matching.filter((q) => !status || q.status === status);
  const sumBy = (s) => matching.filter((q) => !s || q.status === s).reduce((n, q) => n + q.grand_total, 0);
  const countBy = (s) => matching.filter((q) => !s || q.status === s).length;

  if (openId) {
    return <QuoteBuilder quoteId={openId} readOnly={readOnly} onBack={() => setOpenId(null)} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-[#172033] tracking-tight">Quotations</h2>
          <p className="text-xs md:text-sm text-[#667085] mt-0.5">Proposals with versions, pricing and deal outcome.</p>
        </div>
        {!readOnly && (
          <button onClick={onNewQuote} className="btn btn-primary shadow-sm text-xs font-bold"><Plus className="w-4 h-4" />New Quotation</button>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[['draft'], ['sent'], ['won'], ['lost']].map(([s]) => (
          <button key={s} onClick={() => setStatus(status === s ? '' : s)}
            className={`card text-left bg-white border shadow-xs p-4 transition-all ${status === s ? 'border-[#004898] ring-2 ring-[#004898]/10' : 'border-[#E4E7EC] hover:border-[#B3D1F2]'}`}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#667085] inline-flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${QUOTE_STATUS[s].dot}`} />{QUOTE_STATUS[s].label}
              </span>
              <span className="text-xs font-bold text-[#475467] tabular-nums">{countBy(s)}</span>
            </div>
            <p className="text-lg font-extrabold text-[#172033] tabular-nums mt-1 truncate">{formatINR(sumBy(s))}</p>
          </button>
        ))}
      </div>

      <div className="card bg-white border border-[#E4E7EC] shadow-xs overflow-hidden">
        <div className="p-4 border-b border-[#F2F4F7] flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-1 bg-[#F2F4F7] rounded-xl p-1 overflow-x-auto">
            {TABS.map(([value, label]) => (
              <button key={value} onClick={() => setStatus(value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${status === value ? 'bg-white text-[#004898] shadow-xs' : 'text-[#667085] hover:text-[#172033]'}`}>
                {label} <span className="tabular-nums opacity-70">{countBy(value)}</span>
              </button>
            ))}
          </div>
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-[#98A2B3] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customer, project or ref…"
              className="w-full pl-9 pr-8 py-2 text-xs border border-[#E4E7EC] rounded-lg outline-none focus:border-[#004898]" />
            {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[#98A2B3] hover:text-[#172033]"><X className="w-3.5 h-3.5" /></button>}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-[#F8FAFC] text-[#667085] uppercase font-bold text-[10px] tracking-wider border-b border-[#E4E7EC]">
              <tr>
                <th className="px-5 py-3">Customer / Project</th>
                <th className="px-5 py-3">Project Ref</th>
                <th className="px-5 py-3">Version</th>
                <th className="px-5 py-3 text-right">Grand Total</th>
                <th className="px-5 py-3 text-right">Margin</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Updated</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F2F4F7]">
              {loading ? (
                [...Array(5)].map((_, i) => <tr key={i}><td colSpan={8} className="px-5 py-4"><div className="h-4 bg-[#F2F4F7] rounded animate-pulse" /></td></tr>)
              ) : shown.length === 0 ? (
                <tr><td colSpan={8} className="py-16 text-center">
                  <FileText className="w-10 h-10 text-[#D0D5DD] mx-auto" />
                  <p className="text-sm font-bold text-[#172033] mt-3">{quotes.length ? 'No quotations match' : 'No quotations yet'}</p>
                  {!quotes.length && !readOnly && <p className="text-xs text-[#667085] mt-1">Start from a lead on the Quote Leads page.</p>}
                </td></tr>
              ) : shown.map((q) => {
                const price = q.supply_price + q.services_price;
                const marginPct = price > 0 ? Math.round(((price - q.supply_osp - q.services_osp) / price) * 10000) / 100 : 0;
                const st = QUOTE_STATUS[q.status];
                return (
                  <tr key={q.id} onClick={() => setOpenId(q.id)} className="group cursor-pointer hover:bg-[#F8FAFC] transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="font-extrabold text-[13px] text-[#172033]">{q.customer}</div>
                      <div className="text-[11px] text-[#667085] truncate max-w-xs">{q.project || q.site_location || '—'}</div>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-[11px] text-[#475467]">{q.project_ref || <span className="text-[#98A2B3] font-sans">Not set</span>}</td>
                    <td className="px-5 py-3.5"><span className="font-bold text-[#004898] bg-[#EFF5FC] px-2 py-0.5 rounded-md">V{q.version_no}.0</span></td>
                    <td className="px-5 py-3.5 text-right font-extrabold text-[13px] text-[#172033] tabular-nums">{formatINR(q.grand_total)}</td>
                    <td className={`px-5 py-3.5 text-right font-bold tabular-nums ${marginTone(marginPct)}`}>{price > 0 ? `${marginPct}%` : '—'}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border ${st.cls}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />{st.label}
                      </span>
                      {q.status === 'won' && q.po_number && <div className="text-[10px] text-[#027A48] mt-1">PO {q.po_number}</div>}
                    </td>
                    <td className="px-5 py-3.5 text-[#667085]">
                      {formatDate(q.version_updated_at)}
                      {q.created_by_name && <div className="text-[10px] text-[#98A2B3]">{q.created_by_name}</div>}
                    </td>
                    <td className="pr-4"><ChevronRight className="w-4 h-4 text-[#D0D5DD] group-hover:text-[#004898]" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
