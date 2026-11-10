// Sales Funnel — starred leads with their costing (Value = the lead's Value
// Estimate; Backup, Order Closed and a short Remark are entered here). One
// panel serves Admin (Sales → Funnel tab: every salesperson, filterable by
// salesperson and branch), a salesperson (My Leads → Funnel: their own
// leads only — the server scopes it) and Super Admin "View as" (read-only,
// one salesperson). Filters combine and also drive the Excel export.
// Also exports the star toggle and the Product field used on the lead lists
// and forms.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Star, Download, Pencil, X, Filter, Package, IndianRupee, Archive, CheckCircle2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { fetchFunnel, setFunnelStar, updateFunnel, subscribeToLeadEvents } from '../../services/leadsApiService';
import { useFunnelOptions } from './useFunnelOptions';
import { fetchSalesInApi } from '../../services/salesApiService';
import { exportFunnelXlsx } from '../../utils/funnelExport';
import { LeadStatCard } from './LeadStatCards';
import { SearchField, ListPanel } from './LeadFilterBar';
import { LeadPagination } from './LeadPagination';
import { SalesModal, ModalHeader, ModalBody, ModalFooter, btnPrimary, btnSecondary } from './SalesModal';
import { STATUS_LABEL, STATUS_COLOR, money, pageCount } from './leadPipeline';
import { formatInr } from './leadFormat';

const FUNNEL_PAGE_SIZE = 24;

// Free-text Product with suggestions from products already in use.
export const ProductField = ({ value, onChange, products = [], disabled = false }) => (
  <div>
    <label className="block text-xs font-bold text-[#344054] mb-1">Product</label>
    <input value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} list="lead-product-options" maxLength={254}
      placeholder="e.g. AV, VC, EPABX" className="form-input text-sm disabled:bg-[#F8FAFC]" />
    <datalist id="lead-product-options">
      {products.map((p) => <option key={p} value={p} />)}
    </datalist>
  </div>
);

// Star toggle: in the Funnel when filled. Admin can star any live lead; a
// salesperson only their own (the server re-checks).
export const FunnelStar = ({ lead, onChanged, showToast, disabled = false, className = '' }) => {
  const [busy, setBusy] = useState(false);
  const starred = !!lead.funnel_starred_at;
  const toggle = async (e) => {
    e.stopPropagation();
    setBusy(true);
    try {
      await setFunnelStar(lead.id, !starred);
      showToast(starred ? 'Removed from the Funnel' : 'Added to the Funnel', 'success');
      onChanged?.();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy || disabled}
      aria-pressed={starred}
      title={starred ? 'In the Funnel — click to remove' : 'Add to the Funnel'}
      aria-label={starred ? `Remove ${lead.company} from the Funnel` : `Add ${lead.company} to the Funnel`}
      className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${starred ? 'text-[#F79009] hover:bg-[#FFFAEB]' : 'text-[#98A2B3] hover:text-[#F79009] hover:bg-[#F8FAFC]'} ${className}`}
    >
      <Star className="w-4 h-4" fill={starred ? 'currentColor' : 'none'} />
    </button>
  );
};

// Edit a funnel card's costing + product.
const FunnelEditModal = ({ lead, products, onClose, onSaved, showToast }) => {
  const [product, setProduct] = useState(lead.product || '');
  const [backup, setBackup] = useState(lead.funnel_backup_value ?? '');
  const [orderClosed, setOrderClosed] = useState(lead.funnel_order_closed_value ?? '');
  const [remark, setRemark] = useState(lead.funnel_remark || '');
  const [saving, setSaving] = useState(false);
  const num = (v) => (v === '' || v == null ? null : Number(v));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateFunnel(lead.id, { product: product || null, backup_value: num(backup), order_closed_value: num(orderClosed), remark: remark || null });
      showToast('Funnel details saved', 'success');
      onSaved();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const label = 'block text-xs font-bold text-[#344054] mb-1';
  return (
    <SalesModal onClose={onClose} onSubmit={submit}>
      <ModalHeader title="Funnel Details" subtitle={lead.company} onClose={onClose} />
      <ModalBody className="space-y-3">
        <ProductField value={product} onChange={setProduct} products={products} />
        <div>
          <span className={label}>Value</span>
          <div className="text-sm font-semibold text-[#172033]">{money(lead.value_estimate)}</div>
          <p className="text-[11px] text-[#667085]">The lead’s Value Estimate — change it from the lead itself.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={label}>Backup (₹)</label>
            <input type="number" inputMode="decimal" min="0" step="any" value={backup} onChange={(e) => setBackup(e.target.value)} className="form-input text-sm" />
          </div>
          <div>
            <label className={label}>Order Closed (₹)</label>
            <input type="number" inputMode="decimal" min="0" step="any" value={orderClosed} onChange={(e) => setOrderClosed(e.target.value)} className="form-input text-sm" />
          </div>
        </div>
        <div>
          <label className={label}>Remark</label>
          <input value={remark} onChange={(e) => setRemark(e.target.value)} maxLength={500} placeholder="e.g. Under process / This month will close" className="form-input text-sm" />
        </div>
      </ModalBody>
      <ModalFooter>
        <button type="button" onClick={onClose} className={btnSecondary}>Cancel</button>
        <button type="submit" disabled={saving} className={btnPrimary}>{saving ? 'Saving…' : 'Save'}</button>
      </ModalFooter>
    </SalesModal>
  );
};

const Amount = ({ label, value, tone }) => (
  <div className="min-w-0">
    <div className="text-[10px] font-bold uppercase tracking-wider text-[#98A2B3]">{label}</div>
    <div className={`text-[13px] font-extrabold truncate ${value == null ? 'text-[#D0D5DD]' : tone}`}>{money(value)}</div>
  </div>
);

const FunnelCard = ({ lead, showOwner, readOnly, onEdit, onChanged, onOpen, showToast }) => (
  <div className="rounded-xl border border-[#E4E7EC] bg-white shadow-xs p-3.5 flex flex-col gap-3">
    <div className="flex items-start gap-2">
      <button type="button" onClick={onOpen ? () => onOpen(lead) : undefined} disabled={!onOpen} className="min-w-0 flex-1 text-left disabled:cursor-default">
        <div className="font-extrabold text-[14px] text-[#172033] truncate">{lead.company}</div>
        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_COLOR[lead.status]}`}>{STATUS_LABEL[lead.status]}</span>
          {lead.product && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#F2F4F7] text-[#344054]">{lead.product}</span>}
        </div>
      </button>
      {!readOnly && <FunnelStar lead={lead} onChanged={onChanged} showToast={showToast} />}
    </div>
    <div className="grid grid-cols-3 gap-2 rounded-lg bg-[#F8FAFC] border border-[#F2F4F7] px-2.5 py-2">
      <Amount label="Value" value={lead.value_estimate} tone="text-[#004898]" />
      <Amount label="Backup" value={lead.funnel_backup_value} tone="text-[#B54708]" />
      <Amount label="Order Closed" value={lead.funnel_order_closed_value} tone="text-[#027A48]" />
    </div>
    <p className={`text-[12px] min-h-[1.25rem] ${lead.funnel_remark ? 'text-[#344054]' : 'text-[#98A2B3] italic'}`}>{lead.funnel_remark || 'No remark'}</p>
    <div className="mt-auto flex items-center justify-between gap-2 text-[11px] text-[#667085]">
      <span className="truncate">
        {showOwner && <>{lead.sales_name || 'Unassigned'}{lead.sales_location ? ` · ${lead.sales_location}` : ''} · </>}
        Since {new Date(lead.funnel_starred_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
      </span>
      {!readOnly && (
        <button type="button" onClick={() => onEdit(lead)} className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-[#E4E7EC] px-2 py-1 font-bold text-[#004898] hover:bg-[#F8FAFC]">
          <Pencil className="w-3 h-3" /> Edit
        </button>
      )}
    </div>
  </div>
);

const EMPTY_FILTERS = { from: '', to: '', salesId: '', location: '', product: '' };

// mode: 'admin' (all salespeople; `roster` for the salesperson filter),
// 'sales' (own leads). `viewAsSalesId`: Super Admin "View as" — Admin
// endpoint fixed to that salesperson, read-only. `onOpenLead` opens a
// lead's details when its name is clicked.
export const FunnelPanel = ({ mode, roster = [], viewAsSalesId, readOnly = false, onOpenLead, showToast }) => {
  const isAdminView = mode === 'admin' && !viewAsSalesId;
  const { products, locations } = useFunnelOptions();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null); // { rows, total, totals }
  const [editLead, setEditLead] = useState(null);
  const [exporting, setExporting] = useState(false);
  const requestSeq = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => { setPage(1); }, [filters, query]);

  const options = useCallback(() => ({
    ...filters,
    salesId: viewAsSalesId || filters.salesId || undefined,
    location: isAdminView ? filters.location || undefined : undefined,
    q: query || undefined
  }), [filters, query, viewAsSalesId, isAdminView]);
  const mine = mode === 'sales' && !viewAsSalesId;

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    try {
      const result = await fetchFunnel({ ...options(), limit: FUNNEL_PAGE_SIZE, offset: (page - 1) * FUNNEL_PAGE_SIZE }, { mine });
      if (seq !== requestSeq.current) return;
      if (!result.rows.length && page > 1) { setPage(pageCount(result.total, FUNNEL_PAGE_SIZE)); return; }
      setData(result);
    } catch (err) {
      if (seq === requestSeq.current) {
        showToast(err.message, 'error');
        setData((prev) => prev || { rows: [], total: 0, totals: { value: 0, backup: 0, orderClosed: 0 } });
      }
    }
  }, [options, page, mine, showToast]);

  useEffect(() => { load(); }, [load]);
  // Refresh on lead events only — no polling.
  useEffect(() => {
    const source = subscribeToLeadEvents(() => load());
    return () => source?.close();
  }, [load]);

  const exportAll = async () => {
    setExporting(true);
    try {
      const result = await fetchFunnel({ ...options(), exportAll: true }, { mine });
      if (!result.rows.length) { showToast('Nothing to export for these filters.', 'info'); return; }
      await exportFunnelXlsx(result.rows, result.totals, `sales-funnel-${new Date().toISOString().slice(0, 10)}`);
      if (result.rows.length < result.total) showToast(`Exported the first ${result.rows.length} of ${result.total} rows.`, 'info');
    } catch (err) {
      showToast(err.message || 'Export failed', 'error');
    } finally {
      setExporting(false);
    }
  };

  const set = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));
  const filtered = Object.values(filters).some(Boolean) || !!search;
  const totals = data?.totals;
  // Funnel cards show the ₹ total only — the lead count is the same on all three.
  const amountCard = (value, tone) => (data
    ? <span className={`text-xl font-extrabold leading-none ${tone}`}>{formatInr(value)}</span>
    : <span className="block h-6 w-24 rounded-md bg-[#F2F4F7] animate-pulse" />);
  const select = 'form-input text-xs !py-2 w-full';
  const salespeople = roster.filter((s) => s.is_active || s.id === filters.salesId);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <LeadStatCard label="Value" icon={IndianRupee} tone="blue" hint={data ? `${data.total} lead${data.total === 1 ? '' : 's'} in the Funnel` : undefined}>
          {amountCard(totals?.value, 'text-[#004898]')}
        </LeadStatCard>
        <LeadStatCard label="Backup" icon={Archive} tone="amber">{amountCard(totals?.backup, 'text-[#B54708]')}</LeadStatCard>
        <LeadStatCard label="Order Closed" icon={CheckCircle2} tone="green">{amountCard(totals?.orderClosed, 'text-[#027A48]')}</LeadStatCard>
      </div>

      <ListPanel>
        <div className="p-3 sm:p-4 space-y-3 bg-[#FCFCFD] border-b border-[#E4E7EC] rounded-t-xl">
          <div className="flex flex-col md:flex-row md:items-center gap-2.5">
            <SearchField value={search} onChange={setSearch} className="w-full md:w-80" />
            <div className="md:ml-auto flex items-center gap-2">
              {filtered && (
                <button type="button" onClick={() => { setFilters(EMPTY_FILTERS); setSearch(''); }} className="inline-flex items-center gap-1 text-xs font-bold text-[#004898] hover:underline">
                  <X className="w-3.5 h-3.5" /> Reset filters
                </button>
              )}
              <button type="button" onClick={exportAll} disabled={exporting || !data?.total} className="btn btn-secondary text-xs font-bold disabled:opacity-50">
                <Download className="w-4 h-4" /> {exporting ? 'Exporting…' : 'Export Excel'}
              </button>
            </div>
          </div>
          <div className={`grid grid-cols-2 gap-2 ${isAdminView ? 'lg:grid-cols-5' : 'lg:grid-cols-3'}`}>
            <label className="text-[11px] font-bold text-[#667085]">From
              <input type="date" value={filters.from} max={filters.to || undefined} onChange={set('from')} className={select} />
            </label>
            <label className="text-[11px] font-bold text-[#667085]">To
              <input type="date" value={filters.to} min={filters.from || undefined} onChange={set('to')} className={select} />
            </label>
            {isAdminView && (
              <label className="text-[11px] font-bold text-[#667085]">Salesperson
                <select value={filters.salesId} onChange={set('salesId')} className={select}>
                  <option value="">All salespeople</option>
                  {salespeople.map((s) => <option key={s.id} value={s.id}>{s.full_name}{s.is_active ? '' : ' (inactive)'}</option>)}
                </select>
              </label>
            )}
            {isAdminView && (
              <label className="text-[11px] font-bold text-[#667085]">Location
                <select value={filters.location} onChange={set('location')} className={select}>
                  <option value="">All locations</option>
                  {locations.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </label>
            )}
            <label className="text-[11px] font-bold text-[#667085]">Product
              <select value={filters.product} onChange={set('product')} className={select}>
                <option value="">All products</option>
                {products.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
          </div>
          <p className="text-[11px] text-[#98A2B3] flex items-center gap-1">
            <Filter className="w-3 h-3" /> Dates are when a lead was added to the Funnel. The export uses these filters.
          </p>
        </div>

        <div className="p-3 sm:p-4">
          {!data ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {[0, 1, 2].map((i) => <div key={i} className="h-44 rounded-xl bg-[#F2F4F7] animate-pulse" />)}
            </div>
          ) : data.rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-[#667085]">
              <Package className="w-8 h-8 mx-auto mb-2 text-[#D0D5DD]" />
              {filtered ? 'No funnel leads match these filters.' : 'The Funnel is empty — star a lead (☆) in the lead list to add it here.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {data.rows.map((l) => (
                <FunnelCard key={l.id} lead={l} showOwner={isAdminView} readOnly={readOnly} onEdit={setEditLead} onChanged={load} onOpen={onOpenLead} showToast={showToast} />
              ))}
            </div>
          )}
        </div>
      </ListPanel>

      {data && <LeadPagination page={page} totalPages={pageCount(data.total, FUNNEL_PAGE_SIZE)} count={data.total} pageSize={FUNNEL_PAGE_SIZE} onChange={setPage} />}
      {data?.total > 0 && (
        <p className="text-[11px] text-[#667085] px-1">
          {data.total} lead{data.total === 1 ? '' : 's'} · Value {formatInr(totals.value)} · Backup {formatInr(totals.backup)} · Order Closed {formatInr(totals.orderClosed)}
        </p>
      )}

      {editLead && (
        <FunnelEditModal lead={editLead} products={products} onClose={() => setEditLead(null)} onSaved={() => { setEditLead(null); load(); }} showToast={showToast} />
      )}
    </div>
  );
};

// Admin Sales → Funnel tab: every salesperson's funnel, with the roster
// (incl. deactivated people, so their old leads stay filterable).
export const AdminFunnelTab = () => {
  const { showToast } = useApp();
  const [roster, setRoster] = useState([]);
  useEffect(() => {
    fetchSalesInApi({ includeInactive: true })
      .then((data) => setRoster(Array.isArray(data) ? data : []))
      .catch((err) => console.warn('Sales roster unavailable:', err));
  }, []);
  return <FunnelPanel mode="admin" roster={roster} showToast={showToast} />;
};
