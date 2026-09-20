import React, { useState, useEffect } from 'react';
import { Download, ChevronDown, FileText, FileSpreadsheet, FileJson, Calendar as CalendarIcon } from 'lucide-react';
import { StatusBadge } from '../common/Badge';
import { fetchProjectActivities } from '../../services/projectApiService';
import { exportProjectActivityHistory } from '../../utils/projectActivityExport';

const localDateKey = (d) => {
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

// Rendered inside ProjectDetailsModal. Shows completed daily activities
// (Completed + Cancelled, per spec §10) with a date-range filter and an
// export that respects it — "Who worked on this project, and on which days?"
export const ProjectActivityHistoryView = ({ projectId }) => {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [isExportOpen, setIsExportOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(false);
      try {
        const data = await fetchProjectActivities(projectId, 'history');
        if (!cancelled) setActivities(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  const filtered = activities.filter((a) => {
    const key = localDateKey(a.scheduled_date);
    if (dateFrom && key < dateFrom) return false;
    if (dateTo && key > dateTo) return false;
    return true;
  });

  if (loading) {
    return <div className="p-6 text-center text-xs text-[#667085]">Loading activity history…</div>;
  }
  if (error) {
    return <div className="p-6 text-center text-xs text-[#B42318]">Could not load activity history.</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="relative">
            <CalendarIcon className="w-3.5 h-3.5 text-[#98A2B3] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="pl-7 pr-2 py-1.5 border border-[#E4E7EC] rounded-lg text-[11px] font-semibold text-[#172033] outline-none focus:border-[#004898]"
            />
          </div>
          <span className="text-[11px] text-[#98A2B3]">to</span>
          <div className="relative">
            <CalendarIcon className="w-3.5 h-3.5 text-[#98A2B3] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="pl-7 pr-2 py-1.5 border border-[#E4E7EC] rounded-lg text-[11px] font-semibold text-[#172033] outline-none focus:border-[#004898]"
            />
          </div>
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="text-[11px] font-bold text-[#004898] hover:underline">
              Clear
            </button>
          )}
        </div>

        <div className="relative">
          <button
            onClick={() => setIsExportOpen((v) => !v)}
            className="h-8 px-3 bg-white border border-[#E4E7EC] hover:border-[#B3D1F2] hover:bg-[#F8FAFC] text-[#004898] rounded-lg flex items-center gap-1.5 transition-all font-bold text-[11px] cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          {isExportOpen && (
            <div className="absolute right-0 mt-1 w-44 bg-white rounded-xl shadow-xl border border-[#E4E7EC] overflow-hidden z-20 py-1">
              {[
                ['pdf', 'PDF', FileText, '#E3342F'],
                ['excel', 'Excel', FileSpreadsheet, '#107C41'],
                ['csv', 'CSV', FileJson, '#475467'],
                ['doc', 'DOC', FileText, '#2B579A']
              ].map(([fmt, label, Icon, color]) => (
                <button
                  key={fmt}
                  onClick={() => { exportProjectActivityHistory(filtered, fmt); setIsExportOpen(false); }}
                  className="w-full px-3 py-2 text-left text-xs font-semibold text-[#172033] hover:bg-[#F8FAFC] flex items-center gap-2"
                >
                  <Icon className="w-4 h-4" style={{ color }} />
                  Export as {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="border border-[#E4E7EC] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left" style={{ tableLayout: 'fixed' }}>
            <thead>
              <tr className="bg-[#F8FAFC] border-b border-[#E4E7EC]">
                <th className="py-2 px-3 text-[10px] font-bold uppercase tracking-wider text-[#667085] w-[22%]">Technician</th>
                <th className="py-2 px-3 text-[10px] font-bold uppercase tracking-wider text-[#667085] w-[14%]">Date</th>
                <th className="py-2 px-3 text-[10px] font-bold uppercase tracking-wider text-[#667085] w-[12%]">Scheduled</th>
                <th className="py-2 px-3 text-[10px] font-bold uppercase tracking-wider text-[#667085] w-[16%]">Completed</th>
                <th className="py-2 px-3 text-[10px] font-bold uppercase tracking-wider text-[#667085] w-[12%]">Status</th>
                <th className="py-2 px-3 text-[10px] font-bold uppercase tracking-wider text-[#667085]">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F2F4F7]">
              {filtered.length === 0 ? (
                <tr><td colSpan="6" className="py-8 text-center text-xs text-[#667085]">No activity history in this range.</td></tr>
              ) : (
                filtered.map((a) => (
                  <tr key={a.id}>
                    <td className="py-2 px-3 text-xs font-bold text-[#172033]" style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{a.technician?.full_name || '—'}</td>
                    <td className="py-2 px-3 text-xs text-[#475467]">{a.scheduled_date ? new Date(a.scheduled_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                    <td className="py-2 px-3 text-xs text-[#475467]">{a.scheduled_time || '—'}</td>
                    <td className="py-2 px-3 text-xs text-[#475467]">{a.completed_at ? new Date(a.completed_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                    <td className="py-2 px-3"><StatusBadge status={a.status} /></td>
                    <td className="py-2 px-3 text-xs text-[#667085]" style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{a.completion_notes || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
