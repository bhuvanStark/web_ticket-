// Attendance Category (V1) — the Eye action's "Attendance Action / Details"
// modal. Local to AttendancePage (not rendered globally from App.jsx, same
// as TechniciansPage's ShareTechLinkModal) — it only ever needs to exist
// while that page is open. Attendance-only fields; no tickets, no projects.
import React, { useState } from 'react';
import { X, LogOut, ShieldAlert, MapPin, Clock } from 'lucide-react';

const LOCATION_LABELS = {
  gps_captured: 'Location captured',
  permission_denied: 'Permission Denied',
  device_unsupported: 'Device Unsupported',
  unavailable_error: 'Unavailable/Error',
  no_location: 'No location'
};

const EMPLOYEE_TYPE_LABELS = { technician: 'Technician', sales: 'Sales', back_office: 'Back-Office' };

const fmtTime = (d) => (d ? new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—');
const fmtDuration = (minutes) => {
  if (minutes == null) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

// Sales & Back-Office Roles V1 — `row.employee` (was `row.technician`
// before Attendance was unified across all three roles); `onMarkAbsent` now
// takes (employeeType, employeeId) since an id alone is ambiguous once
// there are three identity tables — see attendanceApiService.markAbsentInApi.
export const AttendanceDetailsModal = ({ row, date, onClose, onCheckOut, onMarkAbsent }) => {
  const [isWorking, setIsWorking] = useState(false);
  if (!row) return null;

  const { employee, record, bucket } = row;
  const hasCoords = record?.location_lat != null && record?.location_lng != null;

  const run = async (action) => {
    setIsWorking(true);
    try {
      await action();
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-[#E4E7EC]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E4E7EC]">
          <div>
            <h3 className="text-base font-extrabold text-[#172033]">Attendance Details</h3>
            <p className="text-xs text-[#667085]">
              {employee.full_name} &middot; {EMPLOYEE_TYPE_LABELS[employee.employee_type] || employee.employee_type} &middot; {date}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#F8FAFC] text-[#667085] cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-3 text-sm">
          {bucket === 'absent' ? (
            <div className="flex items-center gap-2 text-[#B54708] bg-[#FEF0C7] rounded-lg px-3 py-2 text-xs font-bold">
              <ShieldAlert className="w-4 h-4" /> Confirmed absent for this day
            </div>
          ) : bucket === 'unmarked' ? (
            <div className="text-xs font-bold text-[#667085] bg-[#F8FAFC] border border-[#E4E7EC] rounded-lg px-3 py-2">
              No check-in recorded for this day.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#667085] uppercase tracking-wide">Check-In</span>
                <span className="font-semibold text-[#172033] flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {fmtTime(record.check_in_time)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#667085] uppercase tracking-wide">Check-Out</span>
                <span className="font-semibold text-[#172033]">{record.check_out_time ? fmtTime(record.check_out_time) : 'Not yet checked out'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#667085] uppercase tracking-wide">Duration</span>
                <span className="font-semibold text-[#172033]">{fmtDuration(record.duration_minutes)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#667085] uppercase tracking-wide">Location</span>
                <span className="font-semibold text-[#172033] flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" /> {LOCATION_LABELS[record.location_status] || 'No location'}
                </span>
              </div>
              {hasCoords && (
                <a
                  href={`https://www.google.com/maps?q=${record.location_lat},${record.location_lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-bold text-[#004898] hover:underline self-end"
                >
                  View on Map
                </a>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-[#E4E7EC] bg-[#F9FAFB] rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold rounded-lg border border-[#E4E7EC] bg-white text-[#344054] hover:bg-[#F8FAFC] transition-all cursor-pointer"
          >
            Close
          </button>
          {/* Checked in, no checkout yet: only Check Out is offered — never
              Mark Absent (they've already checked in) and never Check In. */}
          {bucket === 'checked_in' && (
            <button
              onClick={() => run(() => onCheckOut(record.id))}
              disabled={isWorking}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#D92D20] text-white hover:bg-[#B42318] transition-all cursor-pointer disabled:opacity-60 flex items-center gap-1.5"
            >
              <LogOut className="w-4 h-4" /> {isWorking ? 'Checking out…' : 'Check Out'}
            </button>
          )}
          {/* No attendance at all: only Mark Absent is offered — never Check In. */}
          {bucket === 'unmarked' && (
            <button
              onClick={() => run(() => onMarkAbsent(employee.employee_type, employee.id))}
              disabled={isWorking}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#B54708] text-white hover:bg-[#93370D] transition-all cursor-pointer disabled:opacity-60 flex items-center gap-1.5"
            >
              <ShieldAlert className="w-4 h-4" /> {isWorking ? 'Marking…' : 'Mark Absent'}
            </button>
          )}
          {/* checked_out and absent: view-only, no actions. */}
        </div>
      </div>
    </div>
  );
};
