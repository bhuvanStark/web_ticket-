import React from 'react';
import { useApp } from '../../context/AppContext';
import {
  MapPin,
  Building2,
  Tv,
  Wrench,
  CheckCircle,
  FileCheck,
  UserCheck,
  FileText,
  ShieldCheck,
  Download
} from 'lucide-react';
import { StatusBadge, PriorityBadge } from '../common/Badge';
import { generateServiceReportPDF } from '../../utils/pdfReportGenerator';

export const TechJobsPage = () => {
  const {
    tickets,
    currentUser,
    selectedTicketId,
    setSelectedTicketId,
    updateTicketStatus,
    setIsServiceFormOpen
  } = useApp();

  const isSameId = (a, b) => {
    if (!a || !b) return false;
    return a.toString().replace(/^#/, '').toLowerCase().trim() === b.toString().replace(/^#/, '').toLowerCase().trim();
  };

  // Match strictly on the assigned technician's id — see TechDashboard.
  const loggedTechId = (currentUser?.id || '').toLowerCase().trim();

  const myJobs = loggedTechId
    ? tickets.filter(t => (t.assignedToId || '').toLowerCase().trim() === loggedTechId)
    : [];

  // No fallback to the full ticket list: a technician with no assigned jobs
  // must see an empty roster, not everyone else's work.
  const sortedJobs = [...myJobs].sort((a, b) => {
    const timeA = a.createdDate ? new Date(a.createdDate).getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
    const timeB = b.createdDate ? new Date(b.createdDate).getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
    if (timeA && timeB && timeA !== timeB) return timeB - timeA;
    const numA = parseInt((a.id || a.ticketNumber || '').toString().replace(/\D/g, '')) || 0;
    const numB = parseInt((b.id || b.ticketNumber || '').toString().replace(/\D/g, '')) || 0;
    return numB - numA;
  });

  const displayJobs = sortedJobs;

  const activeJob = displayJobs.find(t => isSameId(t.id, selectedTicketId) || isSameId(t.ticketNumber, selectedTicketId)) ||
                    displayJobs[0];

  const previousHandover = activeJob?.previousTechnicianWork || activeJob?.lastHandover || (activeJob?.handoverLogs && activeJob.handoverLogs[0]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-extrabold text-[#172033] tracking-tight">
          Assigned Jobs for {currentUser.name}
        </h2>
        <p className="text-xs md:text-sm text-[#667085] mt-0.5">
          Execute field service calls with real-time status transitions, pending handover logs, and customer sign-off.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Job Selector List */}
        <div className="space-y-3">
          <h3 className="font-extrabold text-sm text-[#172033] uppercase tracking-wider">
            Job Roster ({displayJobs.length})
          </h3>
          {displayJobs.map((t) => {
            const isSelected = activeJob && isSameId(activeJob.id, t.id);
            return (
              <div
                key={t.id}
                onClick={() => {
                  setSelectedTicketId(t.id);
                }}
                className={`p-4 rounded-xl border cursor-pointer transition-all space-y-2 ${
                  isSelected
                    ? 'border-[#004898] bg-[#EFF5FC] ring-2 ring-[#004898]/20 shadow-xs'
                    : 'border-[#E4E7EC] bg-white hover:border-[#B3D1F2]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-xs font-mono text-[#004898]">{t.id}</span>
                  <div className="flex items-center gap-1.5">
                    <StatusBadge status={t.status} />
                    <span className="text-[10px] font-bold text-[#004898] bg-[#EFF5FC] px-2 py-0.5 rounded border border-[#B3D1F2]">
                      {t.assignedTime || '09:30 AM'}
                    </span>
                  </div>
                </div>
                <h4 className="font-extrabold text-xs text-[#172033]">{t.title}</h4>
                <div className="text-[11px] text-[#667085]">
                  {t.customer} • {t.room}
                </div>
              </div>
            );
          })}
        </div>

        {/* Right Column (2/3 width): Selected Job Details & Sequential Stepper */}
        {activeJob ? (
          <div className="lg:col-span-2 space-y-6">
            {/* Active Workflow Stepper Bar */}
            <div className="p-5 bg-white border border-[#E4E7EC] rounded-2xl shadow-sm mb-6">
              <div className="text-[11px] font-bold uppercase tracking-widest text-[#667085] mb-4 flex items-center justify-between">
                <span>Current Field Status: <strong className="text-[#004898] ml-1">{activeJob.status}</strong></span>
              </div>

              {/* Two actions only: Accept the job, then Complete the report. */}
              <div className="flex flex-wrap items-center gap-3">
                {(activeJob.status === 'Assigned' || activeJob.status === 'Unassigned') && (
                  <button
                    onClick={() => updateTicketStatus(activeJob.id, 'Service In Progress', `Job accepted by ${currentUser.name}`)}
                    className="px-5 py-2.5 bg-[#004898] text-white font-extrabold text-sm hover:bg-[#003673] rounded-xl shadow-sm flex items-center gap-2 transition-colors"
                  >
                    <UserCheck className="w-4 h-4" />
                    <span>Accept Job</span>
                  </button>
                )}

                {activeJob.status === 'Service In Progress' && (
                  <button
                    onClick={() => { setSelectedTicketId(activeJob.id); setIsServiceFormOpen(true); }}
                    className="px-5 py-2.5 bg-[#12B76A] text-white font-extrabold text-sm hover:bg-[#0E9384] rounded-xl shadow-sm flex items-center gap-2 transition-colors"
                  >
                    <FileCheck className="w-4 h-4" />
                    <span>Complete Service Form</span>
                  </button>
                )}

                {/* Status Banners */}
                {activeJob.status === 'Awaiting Customer Signature' && (
                  <div className="w-full flex items-center gap-2 px-3.5 py-3 bg-[#EFF5FC] text-[#004898] border border-[#B3D1F2] rounded-xl font-bold text-sm shadow-sm">
                    <FileText className="w-5 h-5 text-[#004898]" />
                    <span>Service Report Sent to Customer App • Awaiting Signature</span>
                  </div>
                )}

                {(activeJob.status === 'Customer Signed / Completed' || activeJob.status === 'Customer Signed' || activeJob.status === 'Resolved' || activeJob.status === 'Closed') && (
                  <div className="w-full flex items-center gap-2 px-3.5 py-3 bg-[#ECFDF3] text-[#027A48] border border-[#ABE5C6] rounded-xl font-bold text-sm shadow-sm">
                    <CheckCircle className="w-5 h-5 text-[#027A48]" />
                    <span>✓ Customer Digitally Signed & Final Service Record Completed</span>
                  </div>
                )}
              </div>
            </div>

            {/* PREVIOUS TECHNICIAN HANDOVER BANNER */}
            {previousHandover && (
              <div className="card p-5 bg-[#FFFAEB] border-2 border-[#FDE68A] rounded-xl space-y-3 shadow-xs">
                <div className="flex items-center justify-between border-b border-[#FDE68A] pb-3">
                  <div className="flex items-center gap-2.5">
                    <img
                      src={previousHandover.technicianAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'}
                      alt={previousHandover.technicianName}
                      className="w-9 h-9 rounded-full object-cover border-2 border-[#B54708]"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-extrabold text-sm text-[#B54708]">
                          Handover from Previous Engineer: {previousHandover.technicianName}
                        </h4>
                        <span className="text-[10px] font-bold bg-[#B54708] text-white px-2 py-0.5 rounded-full">
                          {previousHandover.reason || 'Pending Next Visit'}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#B54708]/80 font-medium">
                        {previousHandover.technicianRole} • Logged on {previousHandover.timestamp}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-white/80 rounded-lg border border-[#FDE68A]">
                    <span className="font-extrabold text-[#B54708] block mb-1 uppercase text-[10px] tracking-wider">
                      🛠️ Work Done Previously by {previousHandover.technicianName}
                    </span>
                    <p className="text-[#172033] font-medium leading-relaxed">
                      "{previousHandover.workCompleted}"
                    </p>
                  </div>

                  <div className="p-3 bg-[#EFF5FC] rounded-lg border border-[#B3D1F2]">
                    <span className="font-extrabold text-[#004898] block mb-1 uppercase text-[10px] tracking-wider flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5" />
                      📝 Handover Instructions for You ({currentUser.name})
                    </span>
                    <p className="text-[#172033] font-bold leading-relaxed">
                      "{previousHandover.handoverNotes}"
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Job Details Card */}
            <div className="bg-white p-6 rounded-2xl border border-[#E4E7EC] shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#F2F4F7] pb-5">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="font-extrabold text-sm text-[#004898] font-mono px-2 py-0.5 bg-[#EFF5FC] rounded border border-[#B3D1F2]">{activeJob.id}</span>
                    <PriorityBadge priority={activeJob.priority} />
                  </div>
                  <h3 className="font-extrabold text-xl text-[#172033]">{activeJob.title}</h3>
                </div>
                <StatusBadge status={activeJob.status} />
              </div>

              {/* Asset Details */}
              <div className="bg-[#F8FAFC] rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row flex-wrap gap-y-6">
                <div className="flex-1 min-w-[140px] space-y-1 sm:border-r border-[#E4E7EC] pr-4">
                  <div className="flex items-center gap-1.5 text-[#667085]">
                    <Building2 className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Customer</span>
                  </div>
                  <div className="font-bold text-[#172033] text-sm">{activeJob.customer}</div>
                </div>

                <div className="flex-1 min-w-[140px] space-y-1 sm:border-r border-[#E4E7EC] sm:px-4">
                  <div className="flex items-center gap-1.5 text-[#667085]">
                    <MapPin className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Location</span>
                  </div>
                  <div className="font-bold text-[#172033] text-sm">{activeJob.location || 'N/A'}</div>
                </div>

                <div className="flex-1 min-w-[140px] space-y-1 sm:border-r border-[#E4E7EC] sm:px-4">
                  <div className="flex items-center gap-1.5 text-[#667085]">
                    <Tv className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Room</span>
                  </div>
                  <div className="font-bold text-[#172033] text-sm">{activeJob.room}</div>
                </div>

                <div className="flex-1 min-w-[140px] space-y-1 sm:pl-4">
                  <div className="flex items-center gap-1.5 text-[#667085]">
                    <Wrench className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Equipment</span>
                  </div>
                  <div className="font-bold text-[#004898] text-sm">{activeJob.equipment || 'AV System'}</div>
                </div>
              </div>

              {/* Customer Description */}
              <div>
                <div className="flex items-center gap-1.5 text-[#667085] mb-2">
                  <FileText className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Customer Issue Description</span>
                </div>
                <p className="text-sm text-[#475467] leading-relaxed italic bg-[#F8FAFC] p-4 rounded-xl border border-[#F2F4F7]">
                  "{activeJob.customerDescription || activeJob.issue || activeJob.title}"
                </p>
              </div>

              {/* Report sign-off status (booleans only — no signature images) */}
              {activeJob.serviceReport && (
                <div className="pt-2">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-[#004898]" />
                      <h3 className="font-extrabold text-sm text-[#172033]">Service Report Sign-off</h3>
                    </div>
                    <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full border ${activeJob.serviceReport.customerSigned ? 'bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]' : 'bg-[#FEF0C7] text-[#B54708] border-[#FEDF89]'}`}>
                      {activeJob.serviceReport.customerSigned ? '✓ SIGNED BY CUSTOMER' : '⏳ AWAITING CUSTOMER'}
                    </span>
                  </div>

                  <div className="bg-white p-5 rounded-xl border border-[#E4E7EC] shadow-sm grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-[#F8FAFC] border border-[#E4E7EC]">
                      <span className="text-[#667085]">Technician signed</span>
                      <span className={`font-extrabold ${activeJob.serviceReport.techSigned ? 'text-[#027A48]' : 'text-[#B42318]'}`}>
                        {activeJob.serviceReport.techSigned ? `Yes · ${activeJob.serviceReport.techSignerName || ''}` : 'No'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-[#F8FAFC] border border-[#E4E7EC]">
                      <span className="text-[#667085]">Customer signed</span>
                      <span className={`font-extrabold ${activeJob.serviceReport.customerSigned ? 'text-[#027A48]' : 'text-[#B42318]'}`}>
                        {activeJob.serviceReport.customerSigned ? `Yes · ${activeJob.serviceReport.customerSignerName || ''}` : 'No'}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => generateServiceReportPDF(activeJob)}
                    className="w-full mt-4 bg-white hover:bg-[#F8FAFC] text-[#004898] border border-[#E4E7EC] font-extrabold text-sm py-3 rounded-xl flex items-center justify-center gap-2 shadow-xs transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Service Report (PDF)</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>

    </div>
  );
};
