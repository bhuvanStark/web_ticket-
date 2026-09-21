// Attendance Category (V1) — the Admin Attendance page. Attendance-only:
// never reads `tickets`, `myProjectActivities`, or any other domain state
// from AppContext — only `showToast` (same pattern every other page uses)
// and `pollTick`, a counter AppContext bumps once per tick of its existing
// 3s poll interval. Reading that counter lets this page refresh on the same
// cadence as tickets/projects without starting a second interval of its
// own; the actual list/filter state and fetch logic stay entirely local. A
// failure here can never affect anything else in the app, and nothing else
// can affect this page either.
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Search, Download, ChevronDown, FileText, FileSpreadsheet, FileJson,
  Calendar as CalendarIcon, Eye, MapPin, CheckCircle2, XCircle, Clock3, UserX
} from 'lucide-react';
import { TableSkeleton } from '../common/SkeletonLoader';
import { AttendanceDetailsModal } from './AttendanceDetailsModal';
import { exportAttendance } from '../../utils/attendanceExport';
import {
  fetchAdminAttendanceInApi,
  markAbsentInApi,
  markAllAbsentInApi,
  adminCheckOutInApi,
  bulkCheckOutInApi
} from '../../services/attendanceApiService';

const LOCATION_LABELS = {
  gps_captured: 'Location captured',
  permission_denied: 'Permission Denied',
  device_unsupported: 'Device Unsupported',
  unavailable_error: 'Unavailable/Error',
  no_location: 'No location'
};

const STATUS_BADGES = {
  checked_in: { label: 'Not Yet Checked Out', className: 'bg-[#FEF0C7] text-[#B54708]' },
  checked_out: { label: 'Present', className: 'bg-[#ECFDF3] text-[#027A48]' },
  absent: { label: 'Absent', className: 'bg-[#FEF3F2] text-[#D92D20]' },
  unmarked: { label: 'No Check-In', className: 'bg-[#F8FAFC] text-[#667085]' }
};

const fmtTime = (d) => (d ? new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—');
const fmtDuration = (minutes) => {
  if (minutes == null) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

export const AttendancePage = () => {
  const { showToast, pollTick } = useApp();

  // null until the first fetch resolves and hands back the server's own
  // India-day default — see fetchData below. Only ever overwritten by an
  // explicit admin choice after that.
  const [date, setDate] = useState(null);
  // `search` is the input's live value (updates every keystroke, so typing
  // feels responsive); `debouncedSearch` is what's actually sent to the
  // server, 300ms after the admin stops typing — see the effect below.
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [cardFilter, setCardFilter] = useState(null); // 'present' | 'not_yet_checked_out' | 'absent' | null
  const [counts, setCounts] = useState({ present: 0, absent: 0, not_yet_checked_out: 0 });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [detailsRow, setDetailsRow] = useState(null);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [pendingBulk, setPendingBulk] = useState(null); // 'check-out-all' | 'mark-all-absent'
  const [isBulkWorking, setIsBulkWorking] = useState(false);
  const dropdownRef = useRef(null);
  // Bumped on every fetchData call; a response is only applied if it's
  // still the most recent request by the time it resolves. Guards against
  // an older, slower response (e.g. from a search term the admin already
  // changed) landing after a newer one and overwriting it with stale data.
  const requestIdRef = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchData = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setLoadFailed(false);
    try {
      const data = await fetchAdminAttendanceInApi({ date: date || undefined, card: cardFilter || undefined, search: debouncedSearch });
      if (requestId !== requestIdRef.current) return; // a newer request has since started; ignore this stale response
      setCounts(data.counts || { present: 0, absent: 0, not_yet_checked_out: 0 });
      setRows(data.rows || []);
      // First load only: pin the date input to the server's own India-day
      // default so it can never silently drift under the admin mid-session.
      if (!date && data.date) setDate(data.date);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      console.warn('Attendance fetch failed:', err);
      setLoadFailed(true);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [date, cardFilter, debouncedSearch]);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, cardFilter, debouncedSearch, pollTick]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) setIsExportOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleCard = (card) => setCardFilter((prev) => (prev === card ? null : card));

  const handleCheckOut = async (recordId) => {
    try {
      await adminCheckOutInApi(recordId);
      showToast?.('Checked out.', 'success');
      setDetailsRow(null);
      fetchData();
    } catch (err) {
      showToast?.(err.message || 'Check-out failed', 'error');
    }
  };

  const handleMarkAbsent = async (technicianId) => {
    try {
      await markAbsentInApi(technicianId, date);
      showToast?.('Marked absent.', 'success');
      setDetailsRow(null);
      fetchData();
    } catch (err) {
      showToast?.(err.message || 'Mark absent failed', 'error');
    }
  };

  const runBulkAction = async () => {
    if (!pendingBulk || isBulkWorking) return;
    setIsBulkWorking(true);
    try {
      if (pendingBulk === 'check-out-all') {
        const result = await bulkCheckOutInApi(date);
        showToast?.(`Checked out ${result.succeeded}/${result.total} open session(s).`, result.succeeded === result.total ? 'success' : 'info');
      } else {
        const result = await markAllAbsentInApi(date);
        showToast?.(`Marked ${result.markedCount} technician(s) absent.`, 'success');
      }
      fetchData();
    } catch (err) {
      showToast?.(err.message || 'Bulk action failed', 'error');
    } finally {
      setIsBulkWorking(false);
      setPendingBulk(null);
    }
  };

  if (loading && rows.length === 0) return <TableSkeleton rows={5} />;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-2xl font-black text-[#172033] tracking-tight">Attendance</h2>
          <p className="text-sm text-[#667085] mt-1 max-w-xl leading-relaxed">
            Technician check-in / check-out records — separate from Service Tickets and Projects.
          </p>
        </div>

        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsExportOpen(!isExportOpen)}
            className="h-11 px-6 bg-white border border-[#E4E7EC] hover:border-[#B3D1F2] hover:bg-[#F8FAFC] text-[#004898] rounded-full flex items-center gap-2 transition-all font-bold text-sm shadow-sm cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Export</span>
            <ChevronDown className="w-4 h-4 text-[#172033] ml-1" />
          </button>

          {isExportOpen && (
            <div className="absolute right-0 mt-2 w-52 bg-white rounded-2xl shadow-xl border border-[#E4E7EC] overflow-hidden z-20 animate-in fade-in slide-in-from-top-2 duration-200 py-2">
              {[
                { format: 'pdf', label: 'Export as PDF', Icon: FileText, color: '#E3342F' },
                { format: 'excel', label: 'Export as Excel', Icon: FileSpreadsheet, color: '#107C41' },
                { format: 'csv', label: 'Export as CSV', Icon: FileJson, color: '#475467' },
                { format: 'doc', label: 'Export as DOC', Icon: FileText, color: '#2B579A' }
              ].map(({ format, label, Icon, color }) => (
                <button
                  key={format}
                  onClick={() => {
                    exportAttendance(rows, date, format);
                    showToast?.(`Exporting ${rows.length} record${rows.length === 1 ? '' : 's'} to ${format.toUpperCase()}...`, 'info');
                    setIsExportOpen(false);
                  }}
                  className="w-full px-5 py-3 text-left text-sm font-semibold text-[#172033] hover:bg-[#F8FAFC] flex items-center gap-3 transition-colors"
                >
                  <Icon className="w-5 h-5" style={{ color }} />
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {loadFailed && (
        <div className="bg-[#FEF3F2] border border-[#FDA29B] text-[#B42318] text-xs font-bold rounded-xl px-4 py-3">
          Couldn't load attendance right now. Try changing the date or refreshing.
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <button
          onClick={() => toggleCard('present')}
          className={`text-left bg-white rounded-2xl p-6 border shadow-sm relative overflow-hidden group transition-colors cursor-pointer ${cardFilter === 'present' ? 'border-[#12B76A] ring-2 ring-[#ABE5C6]' : 'border-[#E4E7EC] hover:border-[#ABE5C6]'}`}
        >
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <CheckCircle2 className="w-16 h-16 text-[#12B76A]" />
          </div>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 rounded-xl bg-[#F0FDF4] text-[#12B76A]"><CheckCircle2 className="w-5 h-5" /></div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#667085]">Total Present</span>
          </div>
          <div className="text-4xl font-black text-[#172033] mb-1">{counts.present}</div>
          <p className="text-xs font-medium text-[#667085]">Checked in and checked out</p>
        </button>

        <button
          onClick={() => toggleCard('not_yet_checked_out')}
          className={`text-left bg-white rounded-2xl p-6 border shadow-sm relative overflow-hidden group transition-colors cursor-pointer ${cardFilter === 'not_yet_checked_out' ? 'border-[#B54708] ring-2 ring-[#FEF0C7]' : 'border-[#E4E7EC] hover:border-[#FEF0C7]'}`}
        >
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Clock3 className="w-16 h-16 text-[#B54708]" />
          </div>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 rounded-xl bg-[#FEF0C7] text-[#B54708]"><Clock3 className="w-5 h-5" /></div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#667085]">Not Yet Checked Out</span>
          </div>
          <div className="text-4xl font-black text-[#172033] mb-1">{counts.not_yet_checked_out}</div>
          <p className="text-xs font-medium text-[#667085]">Checked in, open session</p>
        </button>

        <button
          onClick={() => toggleCard('absent')}
          className={`text-left bg-white rounded-2xl p-6 border shadow-sm relative overflow-hidden group transition-colors cursor-pointer ${cardFilter === 'absent' ? 'border-[#D92D20] ring-2 ring-[#FDA29B]' : 'border-[#E4E7EC] hover:border-[#FDA29B]'}`}
        >
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <XCircle className="w-16 h-16 text-[#D92D20]" />
          </div>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 rounded-xl bg-[#FEF3F2] text-[#D92D20]"><XCircle className="w-5 h-5" /></div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#667085]">Total Absent</span>
          </div>
          <div className="text-4xl font-black text-[#172033] mb-1">{counts.absent}</div>
          <p className="text-xs font-medium text-[#667085]">Admin-confirmed absences</p>
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white p-3 rounded-2xl border border-[#E4E7EC] shadow-sm flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="flex-1 relative">
          <Search className="w-5 h-5 text-[#98A2B3] absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search technician name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-11 pr-4 py-2 bg-transparent text-sm font-semibold focus:outline-none placeholder:font-medium placeholder:text-[#98A2B3]"
          />
        </div>

        <div className="relative shrink-0">
          <CalendarIcon className="w-4 h-4 text-[#98A2B3] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="date"
            value={date || ''}
            onChange={(e) => setDate(e.target.value)}
            className="pl-9 pr-3 py-2 border border-[#E4E7EC] rounded-lg text-xs font-semibold text-[#172033] outline-none focus:border-[#004898]"
          />
        </div>

        {(cardFilter || search) && (
          <button
            onClick={() => { setCardFilter(null); setSearch(''); }}
            className="text-xs font-bold text-[#D92D20] hover:underline shrink-0"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Bulk actions — only ever surfaced for the filter they apply to. */}
      {cardFilter === 'not_yet_checked_out' && rows.length > 0 && (
        <div className="flex justify-end">
          <button
            onClick={() => setPendingBulk('check-out-all')}
            className="btn btn-secondary text-xs font-bold"
          >
            Check Out All ({rows.length})
          </button>
        </div>
      )}
      {cardFilter === 'absent' && rows.some((r) => r.bucket === 'unmarked') && (
        <div className="flex justify-end">
          <button
            onClick={() => setPendingBulk('mark-all-absent')}
            className="btn btn-secondary text-xs font-bold"
          >
            Mark All Absent ({rows.filter((r) => r.bucket === 'unmarked').length})
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-[#E4E7EC] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-[#F8FAFC] border-b border-[#E4E7EC]">
                <th className="py-4 px-6 text-[10px] font-bold uppercase tracking-wider text-[#667085]">Technician</th>
                <th className="py-4 px-6 text-[10px] font-bold uppercase tracking-wider text-[#667085] w-28">Date</th>
                <th className="py-4 px-6 text-[10px] font-bold uppercase tracking-wider text-[#667085] w-28">Check-In</th>
                <th className="py-4 px-6 text-[10px] font-bold uppercase tracking-wider text-[#667085] w-28">Check-Out</th>
                <th className="py-4 px-6 text-[10px] font-bold uppercase tracking-wider text-[#667085] w-24">Duration</th>
                <th className="py-4 px-6 text-[10px] font-bold uppercase tracking-wider text-[#667085]">Location</th>
                <th className="py-4 px-6 text-[10px] font-bold uppercase tracking-wider text-[#667085] w-40">Status</th>
                <th className="py-4 px-6 text-[10px] font-bold uppercase tracking-wider text-[#667085] text-right w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E7EC]">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan="8" className="py-12 text-center text-[#667085] text-sm">
                    No technicians match the selected filters.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const badge = STATUS_BADGES[r.bucket] || STATUS_BADGES.unmarked;
                  return (
                    <tr key={r.technician.id} className="hover:bg-[#F8FAFC] transition-colors">
                      <td className="py-4 px-6">
                        <h4 className="text-sm font-extrabold text-[#172033]">{r.technician.full_name}</h4>
                        <p className="text-xs text-[#667085]">{r.technician.email}</p>
                      </td>
                      {/* Every row is for this same selected day, so `date`
                          covers a record-less ('unmarked') technician, who
                          has no attendance_date of their own to read. */}
                      <td className="py-4 px-6 text-sm text-[#172033] font-medium">{r.record?.attendance_date || date || '—'}</td>
                      <td className="py-4 px-6 text-sm text-[#172033] font-medium">{fmtTime(r.record?.check_in_time)}</td>
                      <td className="py-4 px-6 text-sm text-[#172033] font-medium">{fmtTime(r.record?.check_out_time)}</td>
                      <td className="py-4 px-6 text-sm text-[#172033] font-medium">{fmtDuration(r.record?.duration_minutes)}</td>
                      <td className="py-4 px-6">
                        {r.record?.location_status === 'gps_captured' ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-[#172033] flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5 text-[#98A2B3]" /> Location captured
                            </span>
                            <a
                              href={`https://www.google.com/maps?q=${r.record.location_lat},${r.record.location_lng}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] font-bold text-[#004898] hover:underline"
                            >
                              View on Map
                            </a>
                          </div>
                        ) : (
                          <span className="text-xs font-semibold text-[#667085]">
                            {LOCATION_LABELS[r.record?.location_status] || 'No location'}
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-6">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold ${badge.className}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <button
                          onClick={() => setDetailsRow(r)}
                          className="w-8 h-8 rounded-full flex items-center justify-center text-[#98A2B3] hover:bg-[#004898] hover:text-white transition-all cursor-pointer inline-flex"
                          title="Attendance details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {detailsRow && (
        <AttendanceDetailsModal
          row={detailsRow}
          date={date}
          onClose={() => setDetailsRow(null)}
          onCheckOut={handleCheckOut}
          onMarkAbsent={handleMarkAbsent}
        />
      )}

      {pendingBulk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl border border-[#E4E7EC]">
            <div className="flex items-start gap-3 p-5">
              <div className="shrink-0 w-10 h-10 rounded-full bg-[#FEF3F2] flex items-center justify-center">
                <UserX className="w-5 h-5 text-[#D92D20]" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#172033]">
                  {pendingBulk === 'check-out-all' ? 'Check out all open sessions?' : 'Mark all unmarked technicians absent?'}
                </h3>
                <p className="mt-1 text-sm text-[#667085]">
                  {pendingBulk === 'check-out-all'
                    ? 'This checks out every currently open attendance session for this day. This cannot be undone.'
                    : 'This marks every technician with no attendance record for this day as absent. Technicians who already checked in are never affected.'}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-[#E4E7EC] bg-[#F9FAFB] rounded-b-xl">
              <button
                onClick={() => setPendingBulk(null)}
                disabled={isBulkWorking}
                className="px-4 py-2 text-sm font-semibold rounded-lg border border-[#E4E7EC] bg-white text-[#344054] hover:bg-[#F8FAFC] transition-all cursor-pointer disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={runBulkAction}
                disabled={isBulkWorking}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#D92D20] text-white hover:bg-[#B42318] transition-all cursor-pointer disabled:opacity-60"
              >
                {isBulkWorking ? 'Working…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
