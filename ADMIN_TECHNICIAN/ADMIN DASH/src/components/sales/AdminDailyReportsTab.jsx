// Admin → Sales → Daily Reports. Read-only list of every salesperson's daily
// reports, filterable by salesperson and date range, each with its entries
// and Download PDF. Self-contained like the other Sales tabs.
import React, { useCallback, useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { fetchSalesInApi } from '../../services/salesApiService';
import { fetchAllReports, fetchReportSubmissionStatus } from '../../services/salesDailyReportApiService';
import { todayKey } from './leadPipeline';
import { formatReportDate } from '../../utils/salesDailyReportPdf';
import { CheckCircle2, XCircle } from 'lucide-react';
import { ReportRow } from './SalesDailyReportPage';
import { TableSkeleton } from '../common/SkeletonLoader';

export const AdminDailyReportsTab = () => {
  const { showToast } = useApp();
  const [roster, setRoster] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [salesId, setSalesId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [statusDate, setStatusDate] = useState(todayKey());
  const [status, setStatus] = useState(null);

  const load = useCallback(async () => {
    try {
      setReports(await fetchAllReports({ salesId, from, to }) || []);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [salesId, from, to, showToast]);

  useEffect(() => { load(); }, [load]);

  // Who has / hasn't submitted for the chosen day. Independent of the list
  // below: a failure here never blocks it.
  useEffect(() => {
    let cancelled = false;
    fetchReportSubmissionStatus(statusDate)
      .then((data) => { if (!cancelled) setStatus(data); })
      .catch((err) => { if (!cancelled) { setStatus(null); console.warn('Report status unavailable:', err); } });
    return () => { cancelled = true; };
  }, [statusDate, reports]);

  // Roster only feeds the filter (incl. deactivated people, whose past
  // reports are still here); a failure just leaves it empty.
  useEffect(() => {
    fetchSalesInApi({ includeInactive: true }).then((data) => setRoster(Array.isArray(data) ? data : [])).catch(() => {});
  }, []);

  return (
    <div className="sales-module space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-end gap-3">
        <div className="flex-1">
          <h2 className="text-xl font-extrabold text-[#172033] tracking-tight">Daily Reports</h2>
          <p className="text-xs text-[#667085] mt-0.5">What each salesperson worked on, day by day. Status and timers are as submitted.</p>
        </div>
        <div className="grid grid-cols-2 sm:flex sm:items-end gap-2 sm:gap-3">
          <select value={salesId} onChange={(e) => setSalesId(e.target.value)} className="col-span-2 sm:col-span-1 text-xs font-semibold text-[#172033] border border-[#E4E7EC] rounded-lg px-3 py-2 bg-white outline-none focus:border-[#004898]">
            <option value="">All salespeople</option>
            {roster.map((s) => <option key={s.id} value={s.id}>{s.full_name}{s.is_active ? '' : ' (inactive)'}</option>)}
          </select>
          <label className="text-[11px] font-bold text-[#667085] flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-1.5 min-w-0">
            From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full sm:w-auto min-w-0 text-xs border border-[#E4E7EC] rounded-lg px-2 py-1.5 bg-white" />
          </label>
          <label className="text-[11px] font-bold text-[#667085] flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-1.5 min-w-0">
            To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full sm:w-auto min-w-0 text-xs border border-[#E4E7EC] rounded-lg px-2 py-1.5 bg-white" />
          </label>
        </div>
      </div>

      {status && (
        <div className="card p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-sm font-extrabold text-[#172033] w-full sm:w-auto sm:mr-auto">
              Submissions · {statusDate === todayKey() ? 'Today' : formatReportDate(statusDate)}
            </h3>
            <span className="inline-flex items-center gap-1 rounded-full bg-[#ECFDF3] border border-[#ABEFC6] px-2.5 py-1 text-[11px] font-bold text-[#027A48]"><CheckCircle2 className="w-3.5 h-3.5" /> {status.submitted.length} submitted</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-[#FEF3F2] border border-[#FECDCA] px-2.5 py-1 text-[11px] font-bold text-[#B42318]"><XCircle className="w-3.5 h-3.5" /> {status.missing.length} missing</span>
            <input type="date" value={statusDate} max={todayKey()} onChange={(e) => e.target.value && setStatusDate(e.target.value)} className="text-xs border border-[#E4E7EC] rounded-lg px-2 py-1.5 bg-white" aria-label="Submission date" />
          </div>
          {status.submitted.length + status.missing.length === 0 ? (
            <p className="text-xs text-[#667085]">No active salespeople.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {status.missing.map((p) => (
                <span key={p.salesId} className="rounded-full bg-[#FEF3F2] px-2.5 py-1 text-[11px] font-semibold text-[#B42318]">{p.name}</span>
              ))}
              {status.submitted.map((p) => (
                <button key={p.salesId} onClick={() => { setSalesId(p.salesId); setFrom(statusDate); setTo(statusDate); }} title="Show this report below"
                  className="rounded-full bg-[#ECFDF3] px-2.5 py-1 text-[11px] font-semibold text-[#027A48] hover:underline">{p.name}</button>
              ))}
            </div>
          )}
        </div>
      )}

      {loading ? <TableSkeleton rows={4} /> : (
        <div className="card overflow-hidden border border-[#E4E7EC] shadow-xs">
          {reports.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#667085]">No daily reports match these filters.</div>
          ) : reports.map((r) => <ReportRow key={r.id} report={r} showSalesName />)}
        </div>
      )}
    </div>
  );
};
