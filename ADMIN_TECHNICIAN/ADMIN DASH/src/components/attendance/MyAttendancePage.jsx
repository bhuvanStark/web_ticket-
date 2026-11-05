// Technician/Sales/Back-Office Nav Parity fix — personal "My Attendance"
// page (plan item 2). Shared by all three employee roles unchanged: the
// self-service history endpoint derives identity from the JWT server-side,
// so this component never receives or sends any employee id/type — it can
// only ever show the signed-in employee's own records. No admin filters,
// exports, mark-absent, or employee lists — read-only, single fetch.
//
// Reuses attendanceApiService.fetchMyAttendanceHistoryInApi (new thin
// wrapper around a new self-service route that itself reuses
// attendanceService.getHistoryForEmployee unchanged) — no new attendance
// business logic anywhere in this feature.
//
// Also the employee's own leave: Apply Leave (full or half day, with a
// reason, today up to 90 days ahead) and cancelling upcoming leave. Sundays
// and the holidays an admin configured for their branch show as H.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, X, Clock3, CalendarMinus } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { LeaveDialog } from './LeaveDialog';
import {
  fetchMyAttendanceHistoryInApi,
  fetchMyHolidaysInApi,
  applyMyLeaveInApi,
  cancelMyLeaveInApi
} from '../../services/attendanceApiService';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const pad2 = (n) => String(n).padStart(2, '0');
const dateKeyOf = (year, month0, day) => `${year}-${pad2(month0 + 1)}-${pad2(day)}`;
const todayDateKey = () => {
  const d = new Date();
  return dateKeyOf(d.getFullYear(), d.getMonth(), d.getDate());
};

// Same local-timezone-safe parsing AttendanceBanner.jsx already uses for
// 'YYYY-MM-DD' attendance_date strings.
const fmtDate = (dateKey) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};
const fmtTime = (d) => (d ? new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—');

const isPresentStatus = (status) => status === 'checked_in' || status === 'checked_out';
// Present for the day, including an admin "Marked present" day (no times).
const isPresentDay = (status) => isPresentStatus(status) || status === 'admin_present';
const isLeaveStatus = (status) => status === 'leave' || status === 'half_day_leave';
const isHalfDay = (r) => r.status === 'half_day_leave' || (r.half_day === true && isPresentStatus(r.status));
const isSundayKey = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0;
};
const addDaysKey = (key, days) => {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dateKeyOf(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
};
const MAX_LEAVE_DAYS_AHEAD = 90;

const STATUS_PILL = {
  absent: ['Absent', 'bg-[#FEF3F2] text-[#D92D20]'],
  emergency_holiday: ['Emergency Holiday', 'bg-[#EFF8FF] text-[#175CD3]'],
  leave: ['Leave', 'bg-[#F4F3FF] text-[#6941C6]'],
  half_day_leave: ['Half-Day Leave', 'bg-[#F4F3FF] text-[#6941C6]'],
  admin_present: ['Present · Marked by admin', 'bg-[#ECFDF3] text-[#027A48]']
};
const statusPill = (r) => {
  if (isHalfDay(r) && isPresentStatus(r.status)) return ['Present · Half-Day Leave', 'bg-[#F4F3FF] text-[#6941C6]'];
  return STATUS_PILL[r.status] || ['Present', 'bg-[#ECFDF3] text-[#027A48]'];
};

export const MyAttendancePage = () => {
  const { role, baseRole, showToast, refreshMyAttendanceToday } = useApp();
  // An admin viewing a technician's dashboard holds an admin token, which the
  // self-service endpoints refuse — no leave actions in that mode.
  const isSelf = role === baseRole;
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [holidayByDate, setHolidayByDate] = useState(() => new Map());
  const [isLeaveOpen, setIsLeaveOpen] = useState(false);
  const [cancellingDate, setCancellingDate] = useState(null);

  // Month currently shown, anchored to the 1st so year/month arithmetic
  // below never has to worry about a day that doesn't exist in the target
  // month (e.g. navigating from the 31st into a 30-day month).
  const [monthCursor, setMonthCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  // `quiet` refreshes after a leave change without blanking the calendar.
  const loadHistory = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    setFailed(false);
    try {
      const data = await fetchMyAttendanceHistoryInApi();
      setRecords(Array.isArray(data) ? data : []);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const recordsByDate = useMemo(() => {
    const map = new Map();
    for (const r of records) {
      if (r?.attendance_date) map.set(r.attendance_date, r);
    }
    return map;
  }, [records]);

  const year = monthCursor.getFullYear();
  const month0 = monthCursor.getMonth();
  const monthLabel = `${MONTH_NAMES[month0]} ${year}`;
  const todayKey = todayDateKey();

  const now = new Date();
  const isCurrentMonth = year === now.getFullYear() && month0 === now.getMonth();

  // Configured holidays for the month on screen (Sundays are computed).
  useEffect(() => {
    if (!isSelf) return undefined;
    let cancelled = false;
    const last = new Date(year, month0 + 1, 0).getDate();
    (async () => {
      try {
        const data = await fetchMyHolidaysInApi({ from: dateKeyOf(year, month0, 1), to: dateKeyOf(year, month0, last) });
        if (!cancelled) setHolidayByDate(new Map((data || []).map((h) => [h.date, h.name])));
      } catch {
        if (!cancelled) setHolidayByDate(new Map());
      }
    })();
    return () => { cancelled = true; };
  }, [year, month0, isSelf]);

  const holidayName = (key) => holidayByDate.get(key) || (isSundayKey(key) ? 'Sunday' : null);

  const upcomingLeave = useMemo(() => records
    .filter((r) => r.attendance_date >= todayKey && (isLeaveStatus(r.status) || r.half_day === true))
    .sort((a, b) => (a.attendance_date < b.attendance_date ? -1 : 1)), [records, todayKey]);

  const applyLeave = async ({ date, halfDay, reason }) => {
    await applyMyLeaveInApi({ date, halfDay, reason });
    setIsLeaveOpen(false);
    showToast?.(halfDay ? 'Half-day leave applied.' : 'Leave applied.', 'success');
    loadHistory({ quiet: true });
    if (date === todayKey) refreshMyAttendanceToday?.();
  };

  const cancelLeave = async (date) => {
    if (!window.confirm(`Cancel your leave on ${fmtDate(date)}?`)) return;
    setCancellingDate(date);
    try {
      await cancelMyLeaveInApi(date);
      showToast?.('Leave cancelled.', 'success');
      await loadHistory({ quiet: true });
      if (date === todayKey) refreshMyAttendanceToday?.();
    } catch (err) {
      showToast?.(err?.message || 'Could not cancel leave.', 'error');
    } finally {
      setCancellingDate(null);
    }
  };

  const goPrevMonth = () => setMonthCursor(new Date(year, month0 - 1, 1));
  const goNextMonth = () => { if (!isCurrentMonth) setMonthCursor(new Date(year, month0 + 1, 1)); };

  const numDays = new Date(year, month0 + 1, 0).getDate();
  // Monday-first grid, matching the Monday-start week convention the Admin
  // Attendance page already uses (AttendanceDetailsModal.jsx's startOfWeek).
  const firstWeekday = new Date(year, month0, 1).getDay(); // 0=Sun..6=Sat
  const leadingBlanks = (firstWeekday + 6) % 7;

  // A record always wins; with none, a Sunday/holiday is H (past or
  // future), any other future day is blank.
  const dayStatus = (day) => {
    const key = dateKeyOf(year, month0, day);
    const rec = recordsByDate.get(key);
    if (rec) {
      if (rec.status === 'absent') return 'absent';
      if (rec.status === 'emergency_holiday') return 'emergency';
      if (rec.status === 'leave') return 'leave';
      if (isHalfDay(rec)) return 'halfday';
      if (isPresentDay(rec.status)) return 'present';
    }
    if (holidayName(key)) return 'holiday';
    return key > todayKey ? 'future' : 'unmarked';
  };

  const { presentCount, absentCount, holidayCount, leaveCount, offDayCount, monthRecords } = useMemo(() => {
    let present = 0;
    let absent = 0;
    let holiday = 0;
    let leave = 0;
    let offDays = 0;
    const list = [];
    for (let day = 1; day <= numDays; day++) {
      const key = dateKeyOf(year, month0, day);
      const rec = recordsByDate.get(key);
      if (!rec) {
        if (holidayByDate.get(key) || isSundayKey(key)) offDays++;
        continue;
      }
      list.push(rec);
      if (rec.status === 'absent') absent++;
      else if (rec.status === 'emergency_holiday') holiday++;
      else if (rec.status === 'leave') leave += 1;
      else if (isHalfDay(rec)) leave += 0.5;
      if (isPresentDay(rec.status)) present++;
    }
    list.sort((a, b) => (a.attendance_date < b.attendance_date ? 1 : -1));
    return { presentCount: present, absentCount: absent, holidayCount: holiday, leaveCount: leave, offDayCount: offDays, monthRecords: list };
  }, [recordsByDate, holidayByDate, year, month0, numDays]);

  const cells = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push(null);
  for (let day = 1; day <= numDays; day++) cells.push(day);

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold text-[#172033] tracking-tight">My Attendance</h2>
          <p className="text-xs md:text-sm text-[#667085] mt-0.5">Your own check-in / check-out history, month by month.</p>
        </div>
        {isSelf && (
          <button
            onClick={() => setIsLeaveOpen(true)}
            className="self-start sm:self-auto bg-[#6941C6] hover:bg-[#53389E] text-white rounded-xl px-4 py-2.5 text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer shrink-0"
          >
            <CalendarMinus className="w-4 h-4" /> Apply Leave
          </button>
        )}
      </div>

      {upcomingLeave.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#E4E7EC] shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-[#F2F4F7]">
            <h3 className="text-sm font-extrabold text-[#172033]">Upcoming Leave</h3>
          </div>
          <div className="divide-y divide-[#F2F4F7]">
            {upcomingLeave.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <div className="text-xs font-bold text-[#172033]">
                    {fmtDate(r.attendance_date)} &middot; {isHalfDay(r) ? 'Half-Day Leave' : 'Full Day'}
                  </div>
                  {r.leave_reason && <div className="text-[11px] text-[#667085] mt-0.5 break-words">{r.leave_reason}</div>}
                </div>
                {isSelf && (
                  <button
                    onClick={() => cancelLeave(r.attendance_date)}
                    disabled={cancellingDate === r.attendance_date}
                    className="text-xs font-bold text-[#6941C6] hover:underline shrink-0 disabled:opacity-50 cursor-pointer"
                  >
                    {cancellingDate === r.attendance_date ? 'Cancelling…' : 'Cancel'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-[#E4E7EC] shadow-sm overflow-hidden">
        {/* Month selector */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#F2F4F7]">
          <button
            onClick={goPrevMonth}
            aria-label="Previous month"
            className="p-2 rounded-lg text-[#667085] hover:text-[#004898] hover:bg-[#F6F8FB] transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <button
            onClick={() => setIsDetailsOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-[#F6F8FB] transition-colors cursor-pointer"
            title="View daily details"
          >
            <Clock3 className="w-4 h-4 text-[#004898]" />
            <span className="text-sm font-extrabold text-[#172033]">{monthLabel}</span>
          </button>

          <button
            onClick={goNextMonth}
            disabled={isCurrentMonth}
            aria-label="Next month"
            className="p-2 rounded-lg text-[#667085] hover:text-[#004898] hover:bg-[#F6F8FB] transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Present/Absent counts */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 border-b border-[#F2F4F7] bg-[#FAFCFF]">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#027A48]">
            <span>🟢</span> {presentCount} Present
          </div>
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#D92D20]">
            <span>🔴</span> {absentCount} Absent
          </div>
          {holidayCount > 0 && (
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#175CD3]">
              <span>🔵</span> {holidayCount} Emergency Holiday
            </div>
          )}
          {leaveCount > 0 && (
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#6941C6]">
              <span className="px-1 rounded bg-[#F4F3FF]">L</span> {leaveCount} Leave
            </div>
          )}
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#475467]">
            <span className="px-1 rounded bg-[#F2F4F7]">H</span> {offDayCount} Holiday
          </div>
        </div>

        {/* Calendar grid */}
        <div className="p-5">
          {loading ? (
            <p className="text-xs text-[#667085] text-center py-6">Loading attendance…</p>
          ) : failed ? (
            <p className="text-xs text-[#667085] text-center py-6">Attendance history is unavailable right now.</p>
          ) : (
            <>
              <div className="grid grid-cols-7 gap-1 mb-1">
                {WEEKDAY_LABELS.map((w) => (
                  <div key={w} className="text-center text-[10px] font-bold text-[#98A2B3] uppercase tracking-wide py-1">
                    {w}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {cells.map((day, idx) => {
                  if (day === null) return <div key={`blank-${idx}`} />;
                  const status = dayStatus(day);
                  const key = dateKeyOf(year, month0, day);
                  const isToday = key === todayKey;
                  return (
                    <div
                      key={day}
                      title={status === 'holiday' ? holidayName(key) : undefined}
                      className={`aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5 text-xs font-semibold ${
                        status === 'present' ? 'bg-[#ECFDF3] text-[#027A48]' :
                        status === 'absent' ? 'bg-[#FEF3F2] text-[#D92D20]' :
                        status === 'emergency' ? 'bg-[#EFF8FF] text-[#175CD3]' :
                        status === 'leave' || status === 'halfday' ? 'bg-[#F4F3FF] text-[#6941C6]' :
                        status === 'holiday' ? 'bg-[#F2F4F7] text-[#475467]' :
                        'text-[#98A2B3]'
                      } ${isToday ? 'ring-1 ring-[#004898]' : ''}`}
                    >
                      <span>{day}</span>
                      {status === 'present' && <span className="text-[9px] leading-none">🟢</span>}
                      {status === 'absent' && <span className="text-[9px] leading-none">🔴</span>}
                      {status === 'emergency' && <span className="text-[9px] leading-none">🔵</span>}
                      {status === 'leave' && <span className="text-[9px] font-black leading-none">L</span>}
                      {status === 'halfday' && <span className="text-[9px] font-black leading-none">½L</span>}
                      {status === 'holiday' && <span className="text-[9px] font-black leading-none">H</span>}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Daily details modal/sheet */}
      {isDetailsOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
          <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl border border-[#E4E7EC] max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#E4E7EC] shrink-0">
              <div>
                <h3 className="text-base font-extrabold text-[#172033]">{monthLabel}</h3>
                <p className="text-xs text-[#667085] mt-0.5">{presentCount} Present &middot; {absentCount} Absent{leaveCount > 0 && <> &middot; {leaveCount} Leave</>}{holidayCount > 0 && <> &middot; {holidayCount} Emergency Holiday</>}</p>
              </div>
              <button
                onClick={() => setIsDetailsOpen(false)}
                className="p-1.5 rounded-lg hover:bg-[#F8FAFC] text-[#667085] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1">
              {monthRecords.length === 0 ? (
                <p className="text-xs text-[#667085] text-center py-8">No attendance records for this month.</p>
              ) : (
                <div className="divide-y divide-[#F2F4F7]">
                  {monthRecords.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <div>
                        <div className="text-xs font-bold text-[#172033]">{fmtDate(r.attendance_date)}</div>
                        {isPresentStatus(r.status) && (
                          <div className="text-[11px] text-[#667085] mt-0.5">
                            {fmtTime(r.check_in_time)} – {fmtTime(r.check_out_time)}
                          </div>
                        )}
                        {r.leave_reason && <div className="text-[11px] text-[#667085] mt-0.5 break-words">Reason: {r.leave_reason}</div>}
                      </div>
                      <span className={`text-[11px] font-bold px-2 py-1 rounded-full shrink-0 ${statusPill(r)[1]}`}>
                        {statusPill(r)[0]}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {isLeaveOpen && (
        <LeaveDialog
          showDate
          defaultDate={todayKey}
          minDate={todayKey}
          maxDate={addDaysKey(todayKey, MAX_LEAVE_DAYS_AHEAD)}
          subtitle="Applied straight away. Sundays and holidays need no leave."
          onClose={() => setIsLeaveOpen(false)}
          onSubmit={applyLeave}
        />
      )}
    </div>
  );
};
