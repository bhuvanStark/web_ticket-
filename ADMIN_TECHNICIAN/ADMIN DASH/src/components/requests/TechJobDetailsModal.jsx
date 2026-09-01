import React from 'react';
import { useApp } from '../../context/AppContext';
import {
  X,
  MapPin,
  Building2,
  Tv,
  CheckCircle,
  FileCheck,
  UserCheck,
  FileText,
  Download
} from 'lucide-react';
import { StatusBadge, PriorityBadge } from '../common/Badge';
import { generateServiceReportPDF } from '../../utils/pdfReportGenerator';

export const TechJobDetailsModal = () => {
  const {
    tickets,
    currentUser,
    updateTicketStatus,
    setIsServiceFormOpen,
    selectedTicketId,
    setSelectedTicketId,
    role,
    activePage
  } = useApp();

  // Prevent modal from showing if we are on the split-pane 'my-jobs' page or 'history' page
  if (!selectedTicketId || role !== 'tech' || activePage === 'my-jobs' || activePage === 'history') return null;

  const ticketId = selectedTicketId;
  const onClose = () => setSelectedTicketId(null);

  const isSameId = (a, b) => {
    if (!a || !b) return false;
    return a.toString().replace(/^#/, '').toLowerCase().trim() === b.toString().replace(/^#/, '').toLowerCase().trim();
  };

  const activeJob = tickets.find(t => isSameId(t.id, ticketId) || isSameId(t.ticketNumber, ticketId));

  if (!activeJob) return null;

  const previousHandover = activeJob?.previousTechnicianWork || activeJob?.lastHandover || (activeJob?.handoverLogs && activeJob.handoverLogs[0]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
      <div className="bg-[#F8FAFC] w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col transform scale-100 animate-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#E4E7EC] bg-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span className="font-extrabold text-sm text-[#004898] font-mono px-3 py-1 bg-[#EFF5FC] rounded-lg border border-[#B3D1F2]">
              {activeJob.id}
            </span>
            <PriorityBadge priority={activeJob.priority} />
            <StatusBadge status={activeJob.status} />
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#667085] hover:text-[#172033] hover:bg-[#F1F5F9] rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 md:p-6 overflow-y-auto space-y-6 flex-1">
          
          {/* Main Title & Details */}
          <div className="bg-white p-5 rounded-2xl border border-[#E4E7EC] shadow-sm space-y-5">
            <h3 className="font-extrabold text-xl md:text-2xl text-[#172033]">{activeJob.title}</h3>
            
            <div className="flex flex-col sm:flex-row flex-wrap gap-6 sm:gap-10 border-b border-[#F2F4F7] pb-5">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-[#667085]">
                  <Building2 className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Customer</span>
                </div>
                <div className="font-bold text-[#172033] text-sm">{activeJob.customer}</div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-[#667085]">
                  <MapPin className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Location</span>
                </div>
                <div className="font-bold text-[#172033] text-sm">{activeJob.location || 'N/A'}</div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-[#667085]">
                  <Tv className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Room</span>
                </div>
                <div className="font-bold text-[#172033] text-sm">{activeJob.room}</div>
              </div>
            </div>

            <div>
              <div className="flex items-center gap-1.5 text-[#667085] mb-2">
                <FileText className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Description</span>
              </div>
              <p className="text-sm text-[#475467] leading-relaxed italic bg-[#F8FAFC] p-3 rounded-xl border border-[#F2F4F7]">
                "{activeJob.customerDescription || activeJob.title}"
              </p>
            </div>
          </div>

          {/* Active Workflow Stepper Bar (Hide if completed) */}
          {activeJob.status !== 'Resolved' && activeJob.status !== 'Closed' && activeJob.status !== 'Customer Signed / Completed' && activeJob.status !== 'Customer Signed' && (
            <div className="p-5 bg-white border border-[#E4E7EC] rounded-2xl shadow-sm">
              <div className="text-[11px] font-bold uppercase tracking-widest text-[#667085] mb-4 flex items-center justify-between">
                <span>Current Field Status: <strong className="text-[#004898] ml-1">{activeJob.status}</strong></span>
              </div>

              {/* Two actions only: Accept, then Complete report. */}
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
                    onClick={() => {
                      setSelectedTicketId(activeJob.id);
                      setIsServiceFormOpen(true);
                      onClose();
                    }}
                    className="px-5 py-2.5 bg-[#12B76A] text-white font-extrabold text-sm hover:bg-[#0E9384] rounded-xl shadow-sm flex items-center gap-2 transition-colors"
                  >
                    <FileCheck className="w-4 h-4" />
                    <span>Complete Service Form</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* PREVIOUS TECHNICIAN HANDOVER BANNER */}
          {previousHandover && (
            <div className="p-5 bg-[#FFFAEB] border-2 border-[#FDE68A] rounded-xl space-y-3 shadow-sm">
              <div className="flex items-center justify-between border-b border-[#FDE68A] pb-3">
                <div className="flex items-center gap-3">
                  <img
                    src={previousHandover.technicianAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'}
                    alt={previousHandover.technicianName}
                    className="w-10 h-10 rounded-full object-cover border-2 border-[#B54708]"
                  />
                  <div>
                    <h4 className="font-extrabold text-sm text-[#B54708]">
                      Handover from Previous Engineer: {previousHandover.technicianName}
                    </h4>
                    <span className="text-[10px] font-bold bg-[#B54708] text-white px-2 py-0.5 rounded-full inline-block mt-1">
                      {previousHandover.reason || 'Pending Next Visit'}
                    </span>
                  </div>
                </div>
              </div>
              <div>
                <strong className="text-xs text-[#93370D] block mb-1">Work Completed Previously:</strong>
                <p className="text-sm text-[#B54708] bg-white p-3 rounded-lg border border-[#FDE68A]">
                  {previousHandover.workCompleted}
                </p>
              </div>
              <div>
                <strong className="text-xs text-[#93370D] block mb-1">Instructions for You:</strong>
                <p className="text-sm text-[#B54708] font-bold bg-white p-3 rounded-lg border border-[#FDE68A]">
                  {previousHandover.handoverNotes}
                </p>
              </div>
            </div>
          )}

          {/* Service Completion Report & Sign-off Section (If completed) */}
          {(activeJob.status === 'Customer Signed / Completed' || activeJob.status === 'Customer Signed' || activeJob.status === 'Resolved' || activeJob.status === 'Closed' || activeJob.status === 'Awaiting Customer Signature') && (
            <div className="space-y-6">
              
              {/* Service Details */}
              <div className="bg-white rounded-2xl border border-[#E4E7EC] shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-[#E4E7EC] bg-gradient-to-r from-[#EFF5FC] to-white flex items-center gap-2">
                  <FileText className="w-5 h-5 text-[#004898]" />
                  <h3 className="font-extrabold text-[#172033]">Service Completion Details</h3>
                </div>
                
                <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <span className="text-[10px] font-black text-[#667085] uppercase tracking-wider mb-2 block">System</span>
                    <p className="text-sm font-semibold text-[#172033]">{activeJob.serviceReport?.system || '—'}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-black text-[#667085] uppercase tracking-wider mb-2 block">Nature of Complaint</span>
                    <p className="text-sm font-semibold text-[#172033] leading-relaxed">{activeJob.serviceReport?.natureOfComplaint || '—'}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-black text-[#667085] uppercase tracking-wider mb-2 block">Work Done</span>
                    <p className="text-sm font-semibold text-[#172033] leading-relaxed">{activeJob.serviceReport?.workDone || '—'}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-black text-[#667085] uppercase tracking-wider mb-2 block">Part / Material</span>
                    <p className="text-sm font-semibold text-[#172033]">{activeJob.serviceReport?.partsMaterial || '—'}</p>
                  </div>
                </div>
              </div>

              {/* Sign-off status (booleans only; no signature images stored) */}
              <div className="bg-white rounded-2xl border border-[#E4E7EC] shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-[#E4E7EC] bg-gradient-to-r from-[#F0FDF4] to-white flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-[#059669]" />
                    <h3 className="font-extrabold text-[#172033]">Sign-off Status</h3>
                  </div>
                  <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider ${activeJob.serviceReport?.customerSigned ? 'bg-[#ECFDF3] text-[#027A48]' : 'bg-[#FEF0C7] text-[#B54708]'}`}>
                    {activeJob.serviceReport?.customerSigned ? '✓ SIGNED BY CUSTOMER' : '⏳ AWAITING CUSTOMER'}
                  </span>
                </div>

                <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-[#F8FAFC] border border-[#E4E7EC] text-xs">
                    <span className="text-[#667085]">Technician signed</span>
                    <span className={`font-extrabold ${activeJob.serviceReport?.techSigned ? 'text-[#027A48]' : 'text-[#B42318]'}`}>
                      {activeJob.serviceReport?.techSigned ? `Yes · ${activeJob.serviceReport?.techSignerName || ''}` : 'No'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-[#F8FAFC] border border-[#E4E7EC] text-xs">
                    <span className="text-[#667085]">Customer signed</span>
                    <span className={`font-extrabold ${activeJob.serviceReport?.customerSigned ? 'text-[#027A48]' : 'text-[#B42318]'}`}>
                      {activeJob.serviceReport?.customerSigned ? `Yes · ${activeJob.serviceReport?.customerSignerName || ''}` : 'No'}
                    </span>
                  </div>
                  <div className="sm:col-span-2 flex justify-end">
                    <button
                      onClick={() => generateServiceReportPDF(activeJob)}
                      className="flex items-center gap-2 px-4 py-2.5 bg-[#F8FAFC] hover:bg-[#EFF5FC] text-[#004898] border border-[#E4E7EC] hover:border-[#B3D1F2] rounded-lg font-bold text-xs shadow-sm transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download PDF</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
