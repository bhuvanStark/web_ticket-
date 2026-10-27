import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { fetchRemovalPreviewInApi, removeStaffInApi, deleteStaffInApi } from '../../services/staffRemovalApiService';

// Remove / Delete confirmation for a Technician, Sales or Back-Office
// employee (backend services/staffRemovalService.js). Remove is the normal
// action: they are logged out and can never sign in again, their attendance
// is deleted, open work is handed over and finished work is kept. Delete
// (the record itself) is offered only when they have no work history.
//
// role: 'technician' | 'sales' | 'back_office'
// onDone(action) runs after a successful Remove ('removed') or Delete ('deleted').
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function consequences(role, p) {
  const lines = ['Logged out now and can’t log in again'];
  lines.push(p.attendanceRecords
    ? `${plural(p.attendanceRecords, 'attendance record')} deleted`
    : 'No attendance records to delete');
  if (role === 'technician') {
    if (p.openTickets) lines.push(`${plural(p.openTickets, 'open ticket')} go back to Unassigned`);
    if (p.completedTickets) lines.push(`${plural(p.completedTickets, 'completed ticket')} and their reports are kept`);
  } else if (role === 'sales') {
    if (p.closedLeads) lines.push(`${plural(p.closedLeads, 'Won / Lost / Dead lead')} archived, still credited to them`);
    if (p.openLeads) lines.push(`${plural(p.openLeads, 'open lead')} go back to the pool for reassignment`);
    if (p.dailyReports) lines.push(`${plural(p.dailyReports, 'daily report')} kept`);
  }
  return lines;
}

const btnBase = 'px-4 py-2 text-sm font-semibold rounded-lg transition-all cursor-pointer disabled:opacity-60';

export const RemoveStaffDialog = ({ role, employee, onClose, onDone, showToast }) => {
  const [preview, setPreview] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [busy, setBusy] = useState(null); // 'remove' | 'delete'
  const name = employee?.full_name || employee?.name || 'this employee';

  useEffect(() => {
    let cancelled = false;
    fetchRemovalPreviewInApi(role, employee.id)
      .then((data) => { if (!cancelled) setPreview(data); })
      .catch((err) => { if (!cancelled) setLoadError(err.message || 'Could not load details'); });
    return () => { cancelled = true; };
  }, [role, employee.id]);

  const run = async (action) => {
    if (busy) return;
    setBusy(action);
    try {
      if (action === 'remove') await removeStaffInApi(role, employee.id);
      else await deleteStaffInApi(role, employee.id);
      showToast?.(action === 'remove' ? `${name} removed.` : `${name} deleted.`, 'success');
      onDone?.(action === 'remove' ? 'removed' : 'deleted');
    } catch (err) {
      showToast?.(err.message || 'Something went wrong', 'error');
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl border border-[#E4E7EC]">
        <div className="flex items-start gap-3 p-5">
          <div className="shrink-0 w-10 h-10 rounded-full bg-[#FEF3F2] flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-[#D92D20]" />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-[#172033]">Remove {name}?</h3>
            {loadError ? (
              <p className="mt-1 text-sm text-[#D92D20]">{loadError}</p>
            ) : !preview ? (
              <p className="mt-1 text-sm text-[#667085]">Checking their tickets, leads and attendance…</p>
            ) : (
              <>
                <ul className="mt-2 space-y-1 text-sm text-[#475467] list-disc pl-4">
                  {consequences(role, preview).map((line) => <li key={line}>{line}</li>)}
                </ul>
                <p className="mt-2 text-xs text-[#667085]">
                  {preview.canDelete
                    ? 'They have no work history, so you can also delete the record completely.'
                    : 'Their work stays in the system under their name. This cannot be undone.'}
                </p>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 px-5 py-4 border-t border-[#E4E7EC] bg-[#F9FAFB] rounded-b-xl">
          <button
            onClick={onClose}
            disabled={!!busy}
            className={`${btnBase} border border-[#E4E7EC] bg-white text-[#344054] hover:bg-[#F8FAFC]`}
          >
            Cancel
          </button>
          {preview?.canDelete && (
            <button
              onClick={() => run('delete')}
              disabled={!!busy}
              className={`${btnBase} border border-[#FDA29B] bg-white text-[#D92D20] hover:bg-[#FEF3F2]`}
            >
              {busy === 'delete' ? 'Deleting…' : 'Delete permanently'}
            </button>
          )}
          <button
            onClick={() => run('remove')}
            disabled={!preview || !!busy}
            className={`${btnBase} bg-[#D92D20] text-white hover:bg-[#B42318]`}
          >
            {busy === 'remove' ? 'Removing…' : 'Remove'}
          </button>
        </div>
      </div>
    </div>
  );
};
