// Admin → Reports: technician performance for a chosen period, from real
// ticket and project-activity data (GET /api/admin/tech-reports/*). Self-
// contained — own fetch, own state; reads nothing from AppContext except
// showToast, so no other page is affected. The numbers and their rules
// (what counts as done, owned vs assisted credit, India days) are defined
// once on the backend in techReportService.js.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Download, ChevronDown, FileText, FileSpreadsheet, FileJson, CheckCircle2, Clock, Star, Inbox,
  FolderKanban, CalendarCheck, ArrowUpDown, ArrowDown, ArrowUp, RefreshCw, ChevronRight
} from 'lucide-react';
import { TableSkeleton } from '../common/SkeletonLoader';
import { fetchTechReportOverview } from '../../services/techReportApiService';
import { exportTechReport } from '../../utils/techReportExport';
import { WorkTrendChart } from './WorkTrendChart';
import { TechReportDetailPanel } from './TechReportDetailPanel';
import { PERIODS, resolvePeriod, fmtRange, fmtHours, fmtRating, fmtPct, totalDone, indiaToday } from './techReportFormat';

// Sortable leaderboard columns. `get` returns the sort value (null sorts last).
const COLUMNS = [
  { id: 'name', label: 'Technician', get: (r) => r.name.toLowerCase(), align: 'left' },
  { id: 'done', label: 'Work done', get: totalDone, hint: 'Tickets (owned + assisted) + project activities completed' },
  { id: 'tickets', label: 'Tickets', get: (r) => r.tickets.owned + r.tickets.assisted },
  { id: 'open', label: 'Open now', get: (r) => r.tickets.openNow },
  { id: 'resolution', label: 'Avg resolution', get: (r) => r.tickets.avgResolutionHours, lowIsGood: true },
  { id: 'rating', label: 'Rating', get: (r) => r.tickets.avgRating },
  { id: 'projects', label: 'Project work', get: (r) => r.projects.completed },
  { id: 'ontime', label: 'On time', get: (r) => r.projects.onTimeRate }
];

const sortRows = (rows, { id, dir }) => {
  const col = COLUMNS.find((c) => c.id === id) || COLUMNS[1];
  return [...rows].sort((a, b) => {
    const va = col.get(a);
    const vb = col.get(b);
    if (va == null && vb == null) return a.name.localeCompare(b.name);
    if (va == null) return 1;
    if (vb == null) return -1;
    if (va === vb) return a.name.localeCompare(b.name);
    return (va < vb ? -1 : 1) * (dir === 'asc' ? 1 : -1);
  });
};

const KpiTile = ({ icon: Icon, label, value, sub, tone }) => (
  <div className="bg-white rounded-2xl border border-[#E4E7EC] shadow-xs p-4">
    <div className="flex items-center gap-2 text-[#667085]">
      <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${tone}`}><Icon className="w-4 h-4" /></span>
      <span className="text-[10px] font-bold uppercase tracking-wider leading-tight">{label}</span>
    </div>
    <div className="text-2xl md:text-[28px] font-extrabold text-[#172033] tracking-tight mt-2 tabular-nums leading-none">{value}</div>
    <div className="text-[11px] text-[#667085] mt-1.5 truncate">{sub}</div>
  </div>
);

const Bar = ({ value, max, color }) => (
  <div className="h-1.5 w-full rounded-full bg-[#F2F4F7] overflow-hidden" aria-hidden="true">
    <div className="h-full rounded-full" style={{ width: `${max ? Math.max(value ? 4 : 0, (value / max) * 100) : 0}%`, background: color }} />
  </div>
);

export const ReportsPage = () => {
  const { showToast } = useApp();
  const [period, setPeriod] = useState('month');
  const [custom, setCustom] = useState(() => ({ from: `${indiaToday().slice(0, 8)}01`, to: indiaToday() }));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sort, setSort] = useState({ id: 'done', dir: 'desc' });
  const [hideIdle, setHideIdle] = useState(false);
  const [selected, setSelected] = useState(null);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const exportRef = useRef(null);
  const requestSeq = useRef(0);

  const range = useMemo(() => resolvePeriod(period, custom), [period, custom]);
  const customInvalid = period === 'custom' && range.from > range.to;

  const load = useCallback(async () => {
    if (customInvalid) return;
    const seq = ++requestSeq.current;
    setLoading(true);
    try {
      const result = await fetchTechReportOverview(range);
      if (seq !== requestSeq.current) return;
      setData(result);
      setError(null);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setError(err.message || 'Could not load the report');
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [range, customInvalid]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onDown = (e) => { if (exportRef.current && !exportRef.current.contains(e.target)) setIsExportOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const rows = useMemo(() => {
    const all = data?.technicians || [];
    return sortRows(hideIdle ? all.filter((r) => totalDone(r) || r.tickets.openNow || r.projects.scheduled) : all, sort);
  }, [data, sort, hideIdle]);

  const maxDone = Math.max(0, ...rows.map(totalDone));
  const k = data?.kpis;
  const closeDetail = useCallback(() => setSelected(null), []);

  const toggleSort = (id) => setSort((s) => (s.id === id
    ? { id, dir: s.dir === 'desc' ? 'asc' : 'desc' }
    : { id, dir: id === 'name' || COLUMNS.find((c) => c.id === id)?.lowIsGood ? 'asc' : 'desc' }));

  const handleExport = (format) => {
    setIsExportOpen(false);
    if (!data) return;
    exportTechReport({ rows, kpis: data.kpis, range: data.range, rangeLabel: fmtRange(data.range) }, format);
    showToast?.(`Exporting technician report to ${format.toUpperCase()}…`, 'info');
  };

  const SortIcon = ({ id }) => (sort.id !== id ? <ArrowUpDown className="w-3 h-3 opacity-40" />
    : sort.dir === 'desc' ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />);

  return (
    <div className="space-y-5 md:space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-extrabold text-[#172033] tracking-tight">Technician Performance</h2>
          <p className="text-xs md:text-sm text-[#667085] mt-1">
            Tickets and project work completed by each technician · <span className="font-semibold text-[#344054]">{fmtRange(range)}</span>
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="grid grid-cols-5 sm:inline-flex bg-white border border-[#E4E7EC] rounded-lg p-1">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={`px-2 sm:px-3 py-1.5 text-[11px] sm:text-xs font-bold rounded-md whitespace-nowrap transition-colors ${period === p.id ? 'bg-[#004898] text-white' : 'text-[#667085] hover:text-[#172033]'}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} disabled={loading} title="Refresh" aria-label="Refresh" className="p-2 rounded-lg border border-[#E4E7EC] bg-white text-[#475467] hover:bg-[#F8FAFC] disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${loading && data ? 'animate-spin' : ''}`} />
            </button>
            <div className="relative flex-1 sm:flex-none" ref={exportRef}>
              <button
                onClick={() => setIsExportOpen((o) => !o)}
                disabled={!data}
                className="w-full justify-center px-4 py-2 rounded-lg bg-[#004898] text-white text-xs font-bold inline-flex items-center gap-2 hover:bg-[#00346E] disabled:opacity-50"
              >
                <Download className="w-4 h-4" /> Export <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {isExportOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-[#E4E7EC] overflow-hidden z-20 py-1">
                  {[
                    { format: 'pdf', label: 'Export as PDF', Icon: FileText, color: '#E3342F' },
                    { format: 'excel', label: 'Export as Excel', Icon: FileSpreadsheet, color: '#107C41' },
                    { format: 'csv', label: 'Export as CSV', Icon: FileJson, color: '#475467' }
                  ].map(({ format, label, Icon, color }) => (
                    <button key={format} onClick={() => handleExport(format)} className="w-full px-4 py-2.5 text-left text-sm font-semibold text-[#172033] hover:bg-[#F8FAFC] flex items-center gap-3">
                      <Icon className="w-4 h-4" style={{ color }} /> {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {period === 'custom' && (
        <div className="flex flex-wrap items-center gap-2 bg-white border border-[#E4E7EC] rounded-xl p-3">
          <span className="text-xs font-bold uppercase tracking-wider text-[#667085]">Range</span>
          <input type="date" value={custom.from} max={custom.to} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))} className="px-3 py-2 border border-[#E4E7EC] rounded-lg text-xs font-semibold text-[#172033]" />
          <span className="text-xs text-[#98A2B3]">to</span>
          <input type="date" value={custom.to} min={custom.from} max={indiaToday()} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))} className="px-3 py-2 border border-[#E4E7EC] rounded-lg text-xs font-semibold text-[#172033]" />
          {customInvalid && <span className="text-xs font-semibold text-[#B42318]">Start date must be on or before the end date.</span>}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-[#FECDCA] bg-[#FEF3F2] px-4 py-3 text-sm text-[#B42318] flex items-center justify-between gap-3">
          <span>{error}</span>
          <button onClick={load} className="text-xs font-bold underline">Try again</button>
        </div>
      )}

      {!data && loading ? <TableSkeleton rows={5} /> : data && (
        <div className={`space-y-5 md:space-y-6 transition-opacity ${loading ? 'opacity-60' : ''}`}>
          {/* KPI row — the selected period, company-wide (each ticket once). */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <KpiTile icon={CheckCircle2} tone="bg-[#ECFDF3] text-[#027A48]" label="Tickets completed" value={k.ticketsCompleted} sub="completed, resolved or closed" />
            <KpiTile icon={Clock} tone="bg-[#EFF5FC] text-[#004898]" label="Avg resolution" value={fmtHours(k.avgResolutionHours)} sub="created → completed" />
            <KpiTile icon={Star} tone="bg-[#FFFAEB] text-[#B54708]" label="Avg rating" value={k.avgRating == null ? '—' : `${fmtRating(k.avgRating)} / 5`} sub={k.ratingCount ? `from ${k.ratingCount} rating${k.ratingCount === 1 ? '' : 's'}` : 'no ratings in this period'} />
            <KpiTile icon={Inbox} tone="bg-[#EFF8FF] text-[#175CD3]" label="Open tickets now" value={k.openNow} sub={k.unassignedNow ? `${k.unassignedNow} unassigned` : 'all assigned'} />
            <KpiTile icon={FolderKanban} tone="bg-[#FEF6EE] text-[#C4320A]" label="Project work done" value={k.activitiesCompleted} sub={k.activitiesOverdueNow ? `${k.activitiesOverdueNow} overdue now` : 'nothing overdue'} />
            <KpiTile icon={CalendarCheck} tone="bg-[#F4F3FF] text-[#5925DC]" label="Project on time" value={fmtPct(k.activitiesOnTimeRate)} sub="done on or before the scheduled day" />
          </div>

          {/* Trend */}
          <div className="bg-white rounded-2xl border border-[#E4E7EC] shadow-xs p-4 md:p-5">
            <h3 className="text-sm font-extrabold text-[#172033] mb-3">Completed work</h3>
            <WorkTrendChart trend={data.trend} />
          </div>

          {/* Leaderboard */}
          <div className="bg-white rounded-2xl border border-[#E4E7EC] shadow-xs overflow-hidden">
            <div className="px-4 md:px-5 py-4 border-b border-[#E4E7EC] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-extrabold text-[#172033]">Technicians</h3>
                <p className="text-[11px] text-[#667085] mt-0.5">Click a technician to see their tickets and project work. Assisted = added to someone else’s ticket.</p>
              </div>
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#475467] cursor-pointer shrink-0">
                <input type="checkbox" checked={hideIdle} onChange={(e) => setHideIdle(e.target.checked)} className="w-4 h-4 accent-[#004898]" />
                Hide technicians with no work
              </label>
            </div>

            {rows.length === 0 ? (
              <p className="p-8 text-center text-sm text-[#667085]">No technicians to show.</p>
            ) : (
              <>
                {/* Phones: cards */}
                <div className="md:hidden divide-y divide-[#F2F4F7]">
                  <div className="px-4 py-2 flex items-center gap-2 text-[11px] text-[#667085]">
                    Sort by
                    <select value={sort.id} onChange={(e) => toggleSort(e.target.value)} className="text-xs font-semibold text-[#172033] border border-[#E4E7EC] rounded-lg px-2 py-1 bg-white">
                      {COLUMNS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                  </div>
                  {rows.map((r) => (
                    <button key={r.technicianId} onClick={() => setSelected(r)} className="w-full text-left px-4 py-3.5 active:bg-[#F8FAFC]">
                      <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="font-extrabold text-sm text-[#172033] truncate">{r.name}{!r.isActive && <span className="ml-1 text-[11px] font-semibold text-[#B42318]">inactive</span>}</div>
                          <div className="text-[11px] text-[#667085] truncate">{r.location || 'No branch'}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-xl font-extrabold text-[#172033] tabular-nums leading-none">{totalDone(r)}</div>
                          <div className="text-[10px] font-semibold text-[#667085] uppercase">done</div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-[#98A2B3] shrink-0" />
                      </div>
                      <div className="mt-2 grid grid-cols-4 gap-2 text-center">
                        {[
                          ['Tickets', r.tickets.owned + r.tickets.assisted],
                          ['Open', r.tickets.openNow],
                          ['Avg res.', fmtHours(r.tickets.avgResolutionHours)],
                          ['Project', `${r.projects.completed}/${r.projects.scheduled}`]
                        ].map(([label, v]) => (
                          <div key={label} className="rounded-lg bg-[#F8FAFC] py-1.5">
                            <div className="text-xs font-bold text-[#172033] tabular-nums">{v}</div>
                            <div className="text-[10px] text-[#667085]">{label}</div>
                          </div>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>

                {/* Desktop: sortable table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead className="bg-[#F8FAFC] text-[#667085] uppercase font-bold text-[10px] tracking-wider border-b border-[#E4E7EC]">
                      <tr>
                        {COLUMNS.map((c) => (
                          <th key={c.id} className={`px-4 py-3 ${c.align === 'left' ? 'text-left' : 'text-right'} ${c.id === 'done' ? 'w-[180px]' : ''}`} title={c.hint}>
                            <button onClick={() => toggleSort(c.id)} className={`inline-flex items-center gap-1 uppercase hover:text-[#172033] ${sort.id === c.id ? 'text-[#004898]' : ''}`}>
                              {c.label} <SortIcon id={c.id} />
                            </button>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F2F4F7]">
                      {rows.map((r) => (
                        <tr key={r.technicianId} onClick={() => setSelected(r)} className="hover:bg-[#F8FAFC] cursor-pointer transition-colors">
                          <td className="px-4 py-3">
                            <div className="font-extrabold text-[13px] text-[#004898]">{r.name}{!r.isActive && <span className="ml-1.5 text-[10px] font-semibold text-[#B42318]">inactive</span>}</div>
                            <div className="text-[11px] text-[#667085]">{r.location || '—'}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Bar value={totalDone(r)} max={maxDone} color="#004898" />
                              <span className="font-extrabold text-sm text-[#172033] tabular-nums w-8 text-right">{totalDone(r)}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            <div className="font-bold text-[#172033]">{r.tickets.owned + r.tickets.assisted}</div>
                            <div className="text-[10px] text-[#667085]">
                              {r.tickets.owned} owned{r.tickets.assisted ? ` · ${r.tickets.assisted} assisted` : ''}{r.tickets.remote ? ` · ${r.tickets.remote} remote` : ''}
                              {r.tickets.reassigned ? ` · ${r.tickets.reassigned} reassigned` : ''}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums font-semibold text-[#475467]">{r.tickets.openNow}</td>
                          <td className="px-4 py-3 text-right tabular-nums font-semibold text-[#475467]">{fmtHours(r.tickets.avgResolutionHours)}</td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {r.tickets.avgRating == null ? <span className="text-[#98A2B3]">—</span> : (
                              <span className="inline-flex items-center gap-1 font-bold text-[#172033]">
                                <Star className="w-3.5 h-3.5 fill-[#F79009] text-[#F79009]" /> {fmtRating(r.tickets.avgRating)}
                                <span className="text-[10px] font-medium text-[#667085]">({r.tickets.ratingCount})</span>
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            <div className="font-bold text-[#172033]">{r.projects.completed}<span className="text-[#98A2B3] font-medium"> / {r.projects.scheduled}</span></div>
                            {r.projects.overdueNow > 0 && <div className="text-[10px] font-semibold text-[#B42318]">{r.projects.overdueNow} overdue</div>}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums font-semibold text-[#475467]">{fmtPct(r.projects.onTimeRate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {selected && data && <TechReportDetailPanel row={selected} range={data.range} onClose={closeDetail} />}
    </div>
  );
};
