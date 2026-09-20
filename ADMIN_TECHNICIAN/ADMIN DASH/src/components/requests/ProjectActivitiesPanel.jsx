import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Building2, MapPin, Calendar, Clock, UserCheck, FileCheck, CheckCircle } from 'lucide-react';
import { StatusBadge } from '../common/Badge';

// Technician's own Daily Project Activities — a self-contained master-detail
// panel, separate from the ticket stepper in TechJobsPage.jsx. Only
// Assigned/Accepted activities are shown here; Completed/Cancelled ones move
// to Service History (per spec §5's "Activity leaves active technician view").
export const ProjectActivitiesPanel = () => {
  const { myProjectActivities, updateActivityStatus, completeActivity } = useApp();
  const [selectedId, setSelectedId] = useState(null);
  const [notes, setNotes] = useState('');
  const [showCompleteForm, setShowCompleteForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const activeActivities = (myProjectActivities || []).filter(a => a.status === 'Assigned' || a.status === 'Accepted');
  const activeActivity = activeActivities.find(a => a.id === selectedId) || activeActivities[0];

  const handleAccept = async () => {
    if (!activeActivity) return;
    await updateActivityStatus(activeActivity.id, 'Accepted');
  };

  const handleComplete = async () => {
    if (!activeActivity || submitting) return;
    setSubmitting(true);
    const ok = await completeActivity(activeActivity.id, notes);
    setSubmitting(false);
    if (ok) {
      setNotes('');
      setShowCompleteForm(false);
    }
  };

  if (activeActivities.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-[#E4E7EC] p-10 text-center">
        <p className="text-sm font-bold text-[#172033]">No active project activities</p>
        <p className="text-xs text-[#667085] mt-1">Activities assigned to you will appear here.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="space-y-3">
        <h3 className="font-extrabold text-sm text-[#172033] uppercase tracking-wider">
          Activities ({activeActivities.length})
        </h3>
        {activeActivities.map((a) => {
          const isSelected = activeActivity?.id === a.id;
          return (
            <div
              key={a.id}
              onClick={() => { setSelectedId(a.id); setShowCompleteForm(false); }}
              className={`p-4 rounded-xl border cursor-pointer transition-all space-y-2 ${
                isSelected ? 'border-[#004898] bg-[#EFF5FC] ring-2 ring-[#004898]/20 shadow-xs' : 'border-[#E4E7EC] bg-white hover:border-[#B3D1F2]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-xs font-mono text-[#004898]">{a.project?.id}</span>
                <StatusBadge status={a.status} />
              </div>
              <h4 className="font-extrabold text-xs text-[#172033]">{a.project?.name}</h4>
              <div className="text-[11px] text-[#667085]">
                {new Date(a.scheduled_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} · {a.scheduled_time}
              </div>
            </div>
          );
        })}
      </div>

      {activeActivity && (
        <div className="lg:col-span-2 space-y-6">
          <div className="p-5 bg-white border border-[#E4E7EC] rounded-2xl shadow-sm">
            <div className="text-[11px] font-bold uppercase tracking-widest text-[#667085] mb-4">
              Current Status: <strong className="text-[#004898] ml-1">{activeActivity.status}</strong>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {activeActivity.status === 'Assigned' && (
                <button
                  onClick={handleAccept}
                  className="px-5 py-2.5 bg-[#004898] text-white font-extrabold text-sm hover:bg-[#003673] rounded-xl shadow-sm flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>Accept Activity</span>
                </button>
              )}

              {activeActivity.status === 'Accepted' && !showCompleteForm && (
                <button
                  onClick={() => setShowCompleteForm(true)}
                  className="px-5 py-2.5 bg-[#12B76A] text-white font-extrabold text-sm hover:bg-[#0E9384] rounded-xl shadow-sm flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <FileCheck className="w-4 h-4" />
                  <span>Complete Activity</span>
                </button>
              )}
            </div>

            {/* Light completion: just notes + timestamp — no service-report
                shape. Scheduled time and actual completion time are kept
                separate per spec §5. */}
            {activeActivity.status === 'Accepted' && showCompleteForm && (
              <div className="mt-4 p-4 rounded-xl border border-[#E4E7EC] bg-[#F8FAFC] space-y-3">
                <label className="block text-xs font-bold text-[#172033]">Completion Notes <span className="font-normal text-[#98A2B3]">(optional)</span></label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="What was done for this activity?"
                  className="w-full px-3 py-2 border border-[#E4E7EC] rounded-lg text-xs outline-none focus:border-[#004898] resize-none bg-white"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleComplete}
                    disabled={submitting}
                    className="px-4 py-2 bg-[#12B76A] text-white font-extrabold text-xs hover:bg-[#0E9384] rounded-lg shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-60"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    {submitting ? 'Submitting…' : 'Confirm Completion'}
                  </button>
                  <button onClick={() => setShowCompleteForm(false)} className="text-xs font-bold text-[#667085] hover:text-[#172033] cursor-pointer">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white p-6 rounded-2xl border border-[#E4E7EC] shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b border-[#F2F4F7] pb-4">
              <div>
                <span className="font-extrabold text-sm text-[#004898] font-mono px-2 py-0.5 bg-[#EFF5FC] rounded border border-[#B3D1F2]">{activeActivity.project?.id}</span>
                <h3 className="font-extrabold text-xl text-[#172033] mt-1.5">{activeActivity.project?.name}</h3>
              </div>
              <StatusBadge status={activeActivity.status} />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="bg-[#F8FAFC] rounded-lg p-3 border border-[#F2F4F7]">
                <div className="flex items-center gap-1.5 text-[#667085] mb-1"><Building2 className="w-3.5 h-3.5" /><span className="text-[10px] font-bold uppercase tracking-widest">Customer</span></div>
                <div className="font-bold text-[#172033]">{activeActivity.project?.customer}</div>
              </div>
              <div className="bg-[#F8FAFC] rounded-lg p-3 border border-[#F2F4F7]">
                <div className="flex items-center gap-1.5 text-[#667085] mb-1"><MapPin className="w-3.5 h-3.5" /><span className="text-[10px] font-bold uppercase tracking-widest">Location</span></div>
                <div className="font-bold text-[#172033]">{activeActivity.project?.location}</div>
              </div>
              <div className="bg-[#F8FAFC] rounded-lg p-3 border border-[#F2F4F7]">
                <div className="flex items-center gap-1.5 text-[#667085] mb-1"><Calendar className="w-3.5 h-3.5" /><span className="text-[10px] font-bold uppercase tracking-widest">Date</span></div>
                <div className="font-bold text-[#172033]">{new Date(activeActivity.scheduled_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
              </div>
              <div className="bg-[#F8FAFC] rounded-lg p-3 border border-[#F2F4F7]">
                <div className="flex items-center gap-1.5 text-[#667085] mb-1"><Clock className="w-3.5 h-3.5" /><span className="text-[10px] font-bold uppercase tracking-widest">Scheduled</span></div>
                <div className="font-bold text-[#172033]">{activeActivity.scheduled_time}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
