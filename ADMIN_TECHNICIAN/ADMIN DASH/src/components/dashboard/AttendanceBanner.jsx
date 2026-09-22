// Attendance Category (V1), generalized by Sales & Back-Office Roles V1 —
// the employee's Check In / Check Out banner, shared by Technician's "My
// Dashboard", and Sales/Back-Office's own single-page dashboards (see
// SalesDashboard.jsx / BackOfficeDashboard.jsx). Additive, fully self-
// contained: reads only myAttendanceToday/checkIn/checkOut/baseRole from
// context (never `tickets` or `myProjectActivities`), so a failure anywhere
// in Attendance can never affect the ticket/project sections that sit below
// it on TechDashboard.
//
// While an admin is impersonating a technician's view (baseRole 'admin',
// role 'tech'), this renders a read-only attendance history instead of live
// controls — the plan is explicit that Admin must never be able to create a
// check-in, so there are no Check In/Check Out buttons in that branch at
// all, and the history is fetched through the admin-scoped endpoint (an
// impersonating admin never holds a technician-role JWT). Sales/Back-Office
// are never impersonated at all (no "switch into their view" feature
// exists), so for them baseRole always equals role and this branch never
// applies.
import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { LogIn, LogOut, MapPin, Clock, ShieldAlert, History } from 'lucide-react';
import { fetchAttendanceHistoryInApi } from '../../services/attendanceApiService';

const LOCATION_LABELS = {
  gps_captured: 'Location captured',
  permission_denied: 'Location permission denied',
  device_unsupported: 'Location unsupported on this device',
  unavailable_error: 'Location unavailable'
};

const fmtTime = (d) => (d ? new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—');
// attendance_date is a plain 'YYYY-MM-DD' string (see formatDateOnly on the
// backend). `new Date('YYYY-MM-DD')` parses that as UTC midnight, and
// toLocaleDateString renders it in the browser's local timezone — for any
// timezone behind UTC that shows the previous day. Parsing the components
// straight into the local-time constructor instead means construction and
// rendering use the same (local) timezone, so it always shows the date it
// was given, regardless of the viewer's timezone.
const fmtDate = (d) => {
  if (!d) return '—';
  const [year, month, day] = d.split('-').map(Number);
  if (!year || !month || !day) return '—';
  return new Date(year, month - 1, day).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};
const fmtDuration = (minutes) => {
  if (minutes == null) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

// Requests GPS only once, right here, only after the Check In click — never
// on page load, never repeated, never in the background.
function captureLocation() {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve({ status: 'device_unsupported' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        status: 'gps_captured',
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy
      }),
      (error) => resolve({
        status: error?.code === error?.PERMISSION_DENIED ? 'permission_denied' : 'unavailable_error'
      }),
      { timeout: 10000, maximumAge: 0 }
    );
  });
}

// Reached only via the "admin impersonating a technician" branch below —
// Sales/Back-Office are never impersonated — so `employeeType` is always
// 'technician' here; a literal, not a prop, since there's only ever the one
// caller.
const ReadOnlyHistoryCard = ({ technicianId }) => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchAttendanceHistoryInApi('technician', technicianId);
        if (!cancelled) setHistory(Array.isArray(data) ? data.slice(0, 5) : []);
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [technicianId]);

  return (
    <div className="bg-white rounded-2xl p-5 border border-[#E4E7EC] shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <History className="w-4 h-4 text-[#004898]" />
        <h3 className="text-sm font-extrabold text-[#172033]">Attendance (read-only while viewing as technician)</h3>
      </div>
      {loading ? (
        <p className="text-xs text-[#667085]">Loading…</p>
      ) : failed ? (
        <p className="text-xs text-[#667085]">Attendance history is unavailable right now.</p>
      ) : history.length === 0 ? (
        <p className="text-xs text-[#667085]">No attendance records yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {history.map((r) => (
            <div key={r.id} className="flex items-center justify-between text-xs border-b border-[#F2F4F7] pb-2 last:border-0 last:pb-0">
              <span className="font-bold text-[#172033]">{fmtDate(r.attendance_date)}</span>
              <span className="text-[#667085]">{fmtTime(r.check_in_time)} – {fmtTime(r.check_out_time)}</span>
              <span className="text-[#667085]">{fmtDuration(r.duration_minutes)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const EMPLOYEE_ROLES = ['tech', 'sales', 'back_office'];

export const AttendanceBanner = () => {
  const { baseRole, role, currentUser, myAttendanceToday, checkIn, checkOut } = useApp();
  const [isWorking, setIsWorking] = useState(false);

  if (!EMPLOYEE_ROLES.includes(role)) return null;

  // Admin "switch into technician view" — read-only, no controls at all.
  // Sales/Back-Office have no such impersonation feature, so for them
  // baseRole always equals role and this branch never applies.
  if (role === 'tech' && baseRole !== 'tech') {
    return currentUser?.id ? <ReadOnlyHistoryCard technicianId={currentUser.id} /> : null;
  }

  const handleCheckIn = async () => {
    setIsWorking(true);
    try {
      const location = await captureLocation();
      await checkIn(location);
    } finally {
      setIsWorking(false);
    }
  };

  const handleCheckOut = async () => {
    setIsWorking(true);
    try {
      await checkOut();
    } finally {
      setIsWorking(false);
    }
  };

  const status = myAttendanceToday?.status;

  return (
    <div className="bg-white rounded-2xl p-5 border border-[#E4E7EC] shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className={`p-2.5 rounded-xl ${status === 'checked_in' ? 'bg-[#F0FDF4] text-[#12B76A]' : 'bg-[#EFF5FC] text-[#004898]'}`}>
          <Clock className="w-5 h-5" />
        </div>
        <div>
          {status === 'absent' ? (
            <>
              <p className="text-sm font-extrabold text-[#172033] flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-[#B54708]" /> Marked absent for today
              </p>
              <p className="text-xs text-[#667085] mt-0.5">An admin has recorded you as absent for today.</p>
            </>
          ) : status === 'checked_in' ? (
            <>
              <p className="text-sm font-extrabold text-[#172033]">In at {fmtTime(myAttendanceToday.check_in_time)}</p>
              <p className="text-xs text-[#667085] mt-0.5 flex items-center gap-1">
                <MapPin className="w-3 h-3" /> {LOCATION_LABELS[myAttendanceToday.location_status] || 'Location unavailable'}
              </p>
            </>
          ) : status === 'checked_out' ? (
            <>
              <p className="text-sm font-extrabold text-[#172033]">
                Checked out at {fmtTime(myAttendanceToday.check_out_time)}
              </p>
              <p className="text-xs text-[#667085] mt-0.5">
                In at {fmtTime(myAttendanceToday.check_in_time)} &middot; {fmtDuration(myAttendanceToday.duration_minutes)} today
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-extrabold text-[#172033]">You haven't checked in today</p>
              <p className="text-xs text-[#667085] mt-0.5">Tap Check In to start your attendance for today.</p>
            </>
          )}
        </div>
      </div>

      {status === 'checked_in' ? (
        <button
          onClick={handleCheckOut}
          disabled={isWorking}
          className="bg-[#D92D20] hover:bg-[#B42318] text-white rounded-xl px-5 py-2.5 text-xs font-extrabold flex items-center gap-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer shrink-0"
        >
          <LogOut className="w-4 h-4" /> {isWorking ? 'Checking out…' : 'Check Out'}
        </button>
      ) : !status ? (
        <button
          onClick={handleCheckIn}
          disabled={isWorking}
          className="bg-[#004898] hover:bg-[#00346E] text-white rounded-xl px-5 py-2.5 text-xs font-extrabold flex items-center gap-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer shrink-0"
        >
          <LogIn className="w-4 h-4" /> {isWorking ? 'Checking in…' : 'Check In'}
        </button>
      ) : null}
    </div>
  );
};
