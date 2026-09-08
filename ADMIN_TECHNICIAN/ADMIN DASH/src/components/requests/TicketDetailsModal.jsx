import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  X,
  UserCheck,
  Calendar,
  Trash2,
  Download,
  UserX,
  PenTool,
  CheckCircle,
  FileText
} from 'lucide-react';
import { StatusBadge, PriorityBadge } from '../common/Badge';
import { generateServiceReportPDF } from '../../utils/pdfReportGenerator';

export const TicketDetailsModal = () => {
  const {
    selectedTicket,
    setSelectedTicketId,
    isAssignModalOpen,
    setIsAssignModalOpen,
    updateTicketStatus,
    reassignPending,
    role,
    activePage,
    deleteTicket,
    showToast
  } = useApp();

  if (!selectedTicket || isAssignModalOpen) return null;
  
  // Admins see this everywhere. Technicians ONLY see this on the History page.
  if (role === 'tech' && activePage !== 'history') return null;
  const t = selectedTicket;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden my-8 max-h-[90vh] flex flex-col transform scale-100 animate-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="px-8 pt-8 pb-6 border-b border-[#E4E7EC] bg-white flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div className="flex-1 pr-4">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-sm font-extrabold text-[#004898] font-mono px-2.5 py-1 bg-[#EFF5FC] rounded-md">
                {t.id}
              </span>
              <StatusBadge status={t.status} />
              <PriorityBadge priority={t.priority} />
            </div>
            <h2 className="text-2xl md:text-3xl font-black text-[#172033] tracking-tight leading-tight">
              {t.title}
            </h2>
          </div>
          
          <div className="flex items-center gap-3 shrink-0">
            {role === 'admin' && (
              <>
                <button
                  onClick={() => setIsAssignModalOpen(true)}
                  className="btn btn-primary font-bold shadow-sm"
                  title="Assign or change technician for this ticket"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>{t.assignedTo ? 'Reassign Tech' : 'Assign Technician'}</span>
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(`Are you sure you want to delete ticket ${t.id}? This action cannot be undone.`)) {
                      deleteTicket(t.id);
                    }
                  }}
                  className="btn bg-white hover:bg-[#FEF2F2] text-[#B91C1C] border border-[#FCA5A5] font-bold shadow-sm"
                  title="Delete ticket"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
            <button
              onClick={() => setSelectedTicketId(null)}
              className="w-10 h-10 flex items-center justify-center text-[#667085] hover:text-[#172033] hover:bg-[#F8FAFC] rounded-xl transition-colors border border-transparent hover:border-[#E4E7EC]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body Scroll Area */}
        <div className="p-8 overflow-y-auto space-y-8 flex-1 bg-[#F8FAFC]">
          
          {/* URGENT TECHNICIAN REPLACEMENT ALERT CARD */}
          {(t.replacementRequest || t.status === 'Replacement Requested' || t.status === 'Reassignment Requested') && (
            <div className="p-5 bg-white border-l-4 border-[#D92D20] rounded-xl flex items-start gap-4 shadow-sm">
              <div className="w-10 h-10 rounded-full bg-[#FEF3F2] text-[#D92D20] flex items-center justify-center shrink-0">
                <UserX className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-extrabold text-[#912018] text-base">
                  Technician Replacement Requested by {t.replacementRequest?.requestedBy || t.assignedTo || 'Technician'}
                </h4>
                <p className="text-sm text-[#B42318] mt-1">
                  <span className="font-bold">Reason:</span> {t.replacementRequest?.reason || "Field issue requires specialized L3 Audio Engineer."}
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column: Details & Reports */}
            <div className="lg:col-span-2 space-y-8">
              
              {/* Ticket facts — service type, issue type, mode, contact (from the created ticket) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  ['Service Type', t.serviceType || 'AV'],
                  ['Issue Type', t.issueType || '—'],
                  ['Mode', t.serviceMode || 'On-site'],
                  ['Requested', t.assignedTime || t.requestTime || '—'],
                ].map(([k, v]) => (
                  <div key={k} className="bg-white rounded-xl border border-[#E4E7EC] p-3">
                    <div className="text-[10px] font-black uppercase tracking-wider text-[#667085] mb-1">{k}</div>
                    <div className="text-sm font-bold text-[#172033]">{v}</div>
                  </div>
                ))}
                {t.contact && (
                  <div className="bg-white rounded-xl border border-[#E4E7EC] p-3 col-span-2 sm:col-span-4">
                    <div className="text-[10px] font-black uppercase tracking-wider text-[#667085] mb-1">Contact</div>
                    <div className="text-sm font-bold text-[#172033] break-words">{t.contact}</div>
                  </div>
                )}
              </div>

              {/* Customer Description */}
              <div className="space-y-3">
                <h3 className="text-[11px] font-black uppercase tracking-widest text-[#667085]">Customer Description</h3>
                <div className="bg-white p-5 rounded-2xl border border-[#E4E7EC] shadow-sm relative overflow-hidden">
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#004898]"></div>
                  <p className="text-sm text-[#344054] leading-relaxed italic">
                    "{t.customerDescription || '—'}"
                  </p>
                </div>
              </div>

              {/* Field Service Report — shown whenever a report exists
                  (Completed, Pending or Reassigned). Real data only. */}
              {t.serviceReport && (() => {
                const r = t.serviceReport;
                const signDate = (d) => d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
                return (
                <div className="bg-white rounded-2xl border border-[#E4E7EC] shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-[#E4E7EC] bg-gradient-to-r from-[#F0FDF4] to-white flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-[#059669]" />
                      <h3 className="font-extrabold text-[#172033]">
                        Field Service Report
                        <span className="ml-2 text-[10px] font-bold bg-[#EFF5FC] text-[#004898] px-2 py-0.5 rounded-full border border-[#B3D1F2]">{t.serviceMode === 'Remote' ? 'REMOTE' : 'ON-SITE'}</span>
                        {t.status === 'Pending' && <span className="ml-2 text-[10px] font-bold bg-[#FEF0C7] text-[#B54708] px-2 py-0.5 rounded-full border border-[#FDE68A]">PENDING</span>}
                        {t.status === 'Reassigned' && <span className="ml-2 text-[10px] font-bold bg-[#F2F4F7] text-[#475467] px-2 py-0.5 rounded-full border border-[#E4E7EC]">REASSIGNED</span>}
                      </h3>
                    </div>
                    <button
                      onClick={() => generateServiceReportPDF(t)}
                      className="btn btn-sm bg-white hover:bg-[#F8FAFC] text-[#004898] border border-[#E4E7EC] font-bold flex items-center gap-1.5"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download PDF</span>
                    </button>
                  </div>

                  <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <span className="text-[10px] font-black text-[#667085] uppercase tracking-wider mb-2 block">System</span>
                      <p className="text-sm font-semibold text-[#172033] leading-relaxed">{r.system || '—'}</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-black text-[#667085] uppercase tracking-wider mb-2 block">Nature of Complaint</span>
                      <p className="text-sm font-semibold text-[#172033] leading-relaxed">{r.natureOfComplaint || '—'}</p>
                    </div>
                    <div className="md:col-span-2">
                      <span className="text-[10px] font-black text-[#667085] uppercase tracking-wider mb-2 block">Work Done</span>
                      <p className="text-sm font-semibold text-[#172033] leading-relaxed whitespace-pre-line">{r.workDone || '—'}</p>
                    </div>
                    <div className="md:col-span-2">
                      <span className="text-[10px] font-black text-[#667085] uppercase tracking-wider mb-2 block">Part / Material</span>
                      <p className="text-sm font-semibold text-[#172033] leading-relaxed">{r.partsMaterial || '—'}</p>
                    </div>
                  </div>

                  {/* Sign-off */}
                  <div className="px-5 py-5 border-t border-[#E4E7EC] bg-[#F8FAFC] grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white p-4 rounded-xl border border-[#E4E7EC]">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-[10px] font-black uppercase tracking-wider text-[#667085]">Technician Sign-Off</h4>
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${r.techSigned ? 'bg-[#ECFDF5] text-[#059669] border-[#A7F3D0]' : 'bg-[#FEF3F2] text-[#B42318] border-[#FECDCA]'}`}>
                          {r.techSigned ? 'SIGNED' : 'NOT SIGNED'}
                        </span>
                      </div>
                      <div className="text-xs font-black text-[#172033]">{r.techSignerName || '—'}</div>
                      {r.techSignedAt && <div className="text-[10px] text-[#667085] font-bold mt-0.5">{signDate(r.techSignedAt)}</div>}
                    </div>

                    <div className="bg-white p-4 rounded-xl border border-[#E4E7EC]">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-[10px] font-black uppercase tracking-wider text-[#667085]">Customer Sign-Off</h4>
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${r.customerSigned ? 'bg-[#EFF5FC] text-[#004898] border-[#B3D1F2]' : 'bg-[#FEF0C7] text-[#B54708] border-[#FDE68A]'}`}>
                          {r.customerSigned ? 'SIGNED ON SITE' : 'NOT PRESENT'}
                        </span>
                      </div>
                      <div className="text-xs font-black text-[#172033]">{r.customerSignerDetails || r.customerSignerName || '—'}</div>
                      {r.customerSignedAt && <div className="text-[10px] text-[#667085] font-bold mt-0.5">{signDate(r.customerSignedAt)}</div>}
                    </div>
                  </div>
                </div>
                );
              })()}
            </div>

            {/* Right Column: Status & Log */}
            <div className="space-y-6">
              
              {/* Assignment Card */}
              <div className="bg-white p-5 rounded-2xl border border-[#E4E7EC] shadow-sm space-y-5">
                <div>
                  <h3 className="text-[11px] font-black uppercase tracking-widest text-[#667085] mb-2">Preferred Schedule</h3>
                  <div className="flex items-center gap-2 text-sm font-bold text-[#172033]">
                    <Calendar className="w-4 h-4 text-[#004898]" />
                    {t.preferredTime || (t.createdDate || t.createdAt || '').split(',')[0]}
                  </div>
                </div>

                <div className="pt-4 border-t border-[#E4E7EC]">
                  <h3 className="text-[11px] font-black uppercase tracking-widest text-[#667085] mb-3">Assigned To</h3>
                  {t.assignedTo ? (
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#004898] to-[#00346E] text-white font-bold flex items-center justify-center shadow-inner">
                        {t.assignedTo.charAt(0)}
                      </div>
                      <div>
                        <div className="text-sm font-extrabold text-[#172033]">{t.assignedTo}</div>
                        <div className="text-[11px] font-bold text-[#004898]">Senior Technician</div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm font-bold text-[#B54708] bg-[#FFFAEB] px-3 py-2 rounded-lg border border-[#FEDF89] inline-block">
                      Unassigned
                    </div>
                  )}
                </div>
              </div>

              {/* Activity Timeline */}
              <div className="bg-white p-5 rounded-2xl border border-[#E4E7EC] shadow-sm">
                <h3 className="text-[11px] font-black uppercase tracking-widest text-[#667085] mb-5">Activity Log</h3>
                
                <div className="space-y-4 relative pl-3 border-l-2 border-[#F8FAFC]">
                  {t.history && t.history.length > 0 ? (
                    t.history.map((h, i) => (
                      <div key={i} className="relative">
                        <div className="absolute -left-[17px] top-1.5 w-2 h-2 rounded-full bg-[#004898] ring-4 ring-white" />
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-xs font-bold text-[#172033]">{h.action}</span>
                          <span className="text-[10px] font-medium text-[#98A2B3] shrink-0">{h.timestamp || h.time || '12:51 pm'}</span>
                        </div>
                        <p className="text-[11px] text-[#667085] mt-0.5 leading-snug pr-2">{h.details}</p>
                      </div>
                    ))
                  ) : (
                    <div className="relative">
                      <div className="absolute -left-[17px] top-1.5 w-2 h-2 rounded-full bg-[#004898] ring-4 ring-white" />
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-xs font-bold text-[#172033]">Ticket {t.id} created</span>
                        <span className="text-[10px] font-medium text-[#98A2B3] shrink-0">Today</span>
                      </div>
                      <p className="text-[11px] text-[#667085] mt-0.5 leading-snug pr-2">Logged via TaskTel Enterprise Portal.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* PDF Button — whenever a report exists */}
              {t.serviceReport && (
                <button
                  onClick={() => generateServiceReportPDF(t)}
                  className="w-full btn bg-white hover:bg-[#F8FAFC] border-2 border-[#004898] text-[#004898] font-black text-xs py-3 rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all"
                >
                  <FileText className="w-4 h-4" />
                  <span>Download Service Report PDF</span>
                </button>
              )}

              {/* Reassign a Pending ticket — changes ONLY this ticket: Pending -> Reassigned */}
              {role === 'admin' && t.status === 'Pending' && (
                <button
                  onClick={() => {
                    if (window.confirm(`Mark ${t.id} as Reassigned? The technician's report stays on record. No new ticket is created — raise one manually if the work must continue.`)) {
                      reassignPending(t.id);
                    }
                  }}
                  className="w-full btn bg-[#B54708] hover:bg-[#93370D] text-white font-black text-xs py-3 rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all"
                >
                  <UserX className="w-4 h-4" />
                  <span>Reassign (Pending → Reassigned)</span>
                </button>
              )}

            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-6 border-t border-[#E4E7EC] bg-white flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-[11px] font-medium text-[#667085]">
            Ticket created on <strong className="text-[#172033]">{t.createdAt || "21 Aug 2026, 12:51 pm"}</strong>
          </div>
          <button
            onClick={() => setSelectedTicketId(null)}
            className="btn btn-secondary font-bold text-sm px-6"
          >
            Close
          </button>
        </div>
        
      </div>
    </div>
  );
};
