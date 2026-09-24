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
import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, X, Clock3 } from 'lucide-react';
import { fetchMyAttendanceHistoryInApi } from '../../services/attendanceApiService';

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

export const MyAttendancePage = () => {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  // Month currently shown, anchored to the 1st so year/month arithmetic
  // below never has to worry about a day that doesn't exist in the target
  // month (e.g. navigating from the 31st into a 30-day month).
  const [monthCursor, setMonthCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setFailed(false);
      try {
        const data = await fetchMyAttendanceHistoryInApi();
        if (!cancelled) setRecords(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

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

  const goPrevMonth = () => setMonthCursor(new Date(year, month0 - 1, 1));
  const goNextMonth = () => { if (!isCurrentMonth) setMonthCursor(new Date(year, month0 + 1, 1)); };

  const numDays = new Date(year, month0 + 1, 0).getDate();
  // Monday-first grid, matching the Monday-start week convention the Admin
  // Attendance page already uses (AttendanceDetailsModal.jsx's startOfWeek).
  const firstWeekday = new Date(year, month0, 1).getDay(); // 0=Sun..6=Sat
  const leadingBlanks = (firstWeekday + 6) % 7;

  const dayStatus = (day) => {
    const key = dateKeyOf(year, month0, day);
    if (key > todayKey) return 'future';
    const rec = recordsByDate.get(key);
    if (!rec) return 'unmarked';
    if (rec.status === 'absent') return 'absent';
    if (isPresentStatus(rec.status)) return 'present';
    return 'unmarked';
  };

  const { presentCount, absentCount, monthRecords } = useMemo(() => {
    let present = 0;
    let absent = 0;
    const list = [];
    for (let day = 1; day <= numDays; day++) {
      const key = dateKeyOf(year, month0, day);
      const rec = recordsByDate.get(key);
      if (!rec) continue;
      list.push(rec);
      if (rec.status === 'absent') absent++;
      else if (isPresentStatus(rec.status)) present++;
    }
    list.sort((a, b) => (a.attendance_date < b.attendance_date ? 1 : -1));
    return { presentCount: present, absentCount: absent, monthRecords: list };
  }, [recordsByDate, year, month0, numDays]);

  const cells = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push(null);
  for (let day = 1; day <= numDays; day++) cells.push(day);

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-extrabold text-[#172033] tracking-tight">My Attendance</h2>
        <p className="text-xs md:text-sm text-[#667085] mt-0.5">Your own check-in / check-out history, month by month.</p>
      </div>

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
        <div className="flex items-center gap-4 px-5 py-3 border-b border-[#F2F4F7] bg-[#FAFCFF]">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#027A48]">
            <span>🟢</span> {presentCount} Present
          </div>
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#D92D20]">
            <span>🔴</span> {absentCount} Absent
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
                  const isToday = dateKeyOf(year, month0, day) === todayKey;
                  return (
                    <div
                      key={day}
                      className={`aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5 text-xs font-semibold ${
                        status === 'present' ? 'bg-[#ECFDF3] text-[#027A48]' :
                        status === 'absent' ? 'bg-[#FEF3F2] text-[#D92D20]' :
                        'text-[#98A2B3]'
                      } ${isToday ? 'ring-1 ring-[#004898]' : ''}`}
                    >
                      <span>{day}</span>
                      {status === 'present' && <span className="text-[9px] leading-none">🟢</span>}
                      {status === 'absent' && <span className="text-[9px] leading-none">🔴</span>}
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
                <p className="text-xs text-[#667085] mt-0.5">{presentCount} Present &middot; {absentCount} Absent</p>
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
                        {r.status !== 'absent' && (
                          <div className="text-[11px] text-[#667085] mt-0.5">
                            {fmtTime(r.check_in_time)} – {fmtTime(r.check_out_time)}
                          </div>
                        )}
                      </div>
                      <span className={`text-[11px] font-bold px-2 py-1 rounded-full ${
                        r.status === 'absent' ? 'bg-[#FEF3F2] text-[#D92D20]' : 'bg-[#ECFDF3] text-[#027A48]'
                      }`}>
                        {r.status === 'absent' ? 'Absent' : 'Present'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
