import React, { useState } from 'react';
import {
  MessageSquare, CheckCircle, MapPin, Monitor, FileText, PenTool, Building, User
} from 'lucide-react';
import { generateServiceReportPDF } from '../utils/pdfGenerator';
import { CustomerSignatureModal } from '../components/CustomerSignatureModal';

export function RequestTrackingScreen({
  ticket,
  user,
  onBack,
  onUpdateTicket
}) {
  // Company shown on a ticket comes from the ticket's own customer record when
  // available, otherwise the logged-in account. Deliberately does NOT fall back
  // to customerName, which holds the person's name rather than the company.
  const companyAccountName = ticket?.company || ticket?.companyName || user?.company || '—';
  const [activeTab, setActiveTab] = useState('status');
  const [showSignModal, setShowSignModal] = useState(false);

  if (!ticket) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center text-white space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-[#004898]/20 border border-[#004898]/50 flex items-center justify-center text-[#38BDF8]">
          <FileText className="w-7 h-7" />
        </div>
        <h3 className="font-extrabold text-lg text-white">No Service Ticket Selected</h3>
        <p className="text-xs text-[#94A3B8] max-w-xs leading-relaxed">
          The requested service ticket could not be loaded. Please return to the home screen to view your active tickets.
        </p>
        <button
          onClick={onBack}
          className="btn bg-[#004898] hover:bg-[#00346E] text-white font-extrabold text-xs px-6 py-3 rounded-xl shadow-lg transition-all"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  const report = ticket.serviceReport || null;
  const isCompleted = !!ticket.isCompleted || ticket.currentStepIndex === 1;
  const needsSignature = !!ticket.awaitingCustomerSignature && !isCompleted;

  const handleSignComplete = async (updatedTicket) => {
    if (onUpdateTicket) return await onUpdateTicket(updatedTicket);
    return updatedTicket;
  };

  // Two-state customer timeline.
  const steps = [
    { label: 'Request Submitted', desc: 'Service request created' },
    { label: 'Completed', desc: 'Service completed & report signed' }
  ];
  const stepIndex = isCompleted ? 1 : 0;

  const statusLabel = isCompleted ? 'Completed' : needsSignature ? 'Awaiting Your Signature' : 'Request Submitted';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--color-bg)' }}>
      {/* Ticket Header Card */}
      <div style={{ background: 'var(--color-surface)', padding: '16px 20px', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--color-text-primary)', margin: 0, paddingRight: '12px' }}>
            {ticket.issue || ticket.title || 'Service Request'}
          </h2>
          <span className="badge badge-assigned" style={{
            backgroundColor: isCompleted ? '#ECFDF5' : '#EFF5FC',
            color: isCompleted ? '#047857' : '#004898',
            border: '1px solid #B3D1F2',
            fontWeight: '800',
            whiteSpace: 'nowrap'
          }}>
            {statusLabel}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '12px' }}>
          {(ticket.roomName || ticket.room) && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Monitor size={14} color="var(--color-primary)" />
                <span style={{ fontWeight: '700', color: 'var(--color-text-primary)' }}>{ticket.roomName || ticket.room}</span>
              </div>
              <span>•</span>
            </>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <MapPin size={14} />
            <span>{ticket.locationName || ticket.location || '—'}</span>
          </div>
        </div>

        {/* Shared Company Request Info Box */}
        <div style={{ marginTop: '8px', padding: '8px 12px', background: '#F8FAFC', borderRadius: '8px', border: '1px solid #E4E7EC', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#004898', fontWeight: '700' }}>
            <Building size={14} />
            <span>Company Account: {companyAccountName}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#475467' }}>
            <User size={13} color="#004898" />
            <span>Created by: <strong style={{ color: '#172033' }}>{ticket.createdBy?.name || user?.name || '—'}</strong></span>
          </div>
        </div>
      </div>

      {/* Tabs Bar — the Equipment & Details tab only appears once the report is signed */}
      <div style={{ display: 'flex', background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)' }}>
        {[
          { key: 'status', label: 'Timeline Status' },
          ...(isCompleted ? [{ key: 'details', label: 'Equipment & Details' }] : [])
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              flex: 1,
              padding: '12px',
              border: 'none',
              background: 'none',
              fontSize: '13px',
              fontWeight: activeTab === tab.key ? '700' : '600',
              color: activeTab === tab.key ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              borderBottom: activeTab === tab.key ? '2px solid var(--color-primary)' : '2px solid transparent',
              cursor: 'pointer'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Tab Content View */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

        {/* ================= TIMELINE TAB ================= */}
        {(activeTab === 'status' || !isCompleted) && (
          <div>
            {/* Report pending customer signature */}
            {needsSignature && (
              <div
                onClick={() => setShowSignModal(true)}
                style={{
                  marginBottom: '18px',
                  padding: '16px',
                  backgroundColor: '#EFF5FC',
                  border: '2px solid #004898',
                  borderRadius: '14px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  boxShadow: '0 4px 12px rgba(0,72,152,0.1)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ padding: '10px', backgroundColor: '#004898', color: '#ffffff', borderRadius: '10px' }}>
                    <PenTool size={22} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '800', color: '#004898' }}>
                      Service Report Ready for Your Signature
                    </h4>
                    <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#344054' }}>
                      The field service report is complete. Review the work done and sign to close the ticket.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowSignModal(true)}
                  style={{
                    backgroundColor: '#004898',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 14px',
                    fontSize: '12px',
                    fontWeight: '800',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  Review &amp; Sign &rarr;
                </button>
              </div>
            )}

            {/* Signed & completed */}
            {isCompleted && (
              <div
                style={{
                  marginBottom: '18px',
                  padding: '16px',
                  backgroundColor: '#ECFDF3',
                  border: '2px solid #ABE5C6',
                  borderRadius: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  boxShadow: '0 4px 12px rgba(16,185,129,0.1)'
                }}
              >
                <div style={{ padding: '10px', backgroundColor: '#10B981', color: '#ffffff', borderRadius: '10px' }}>
                  <CheckCircle size={22} />
                </div>
                <div>
                  <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '800', color: '#027A48' }}>
                    Service Completed &amp; Report Signed
                  </h4>
                  <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#344054' }}>
                    You can download the signed service report from the Equipment &amp; Details tab.
                  </p>
                </div>
              </div>
            )}

            {/* Timeline View — two states only */}
            <h3 style={{ fontSize: '15px', fontWeight: '800', color: 'var(--color-text-primary)', marginBottom: '14px' }}>
              Service Status
            </h3>

            <div className="timeline-container">
              <div className="timeline-line" />
              {steps.map((step, idx) => {
                const isPassed = idx <= stepIndex;
                const isCurrent = idx === stepIndex;
                return (
                  <div
                    key={idx}
                    className={`timeline-step ${isPassed ? 'completed' : ''} ${isCurrent ? 'current' : ''}`}
                  >
                    <div className="timeline-dot">
                      {isPassed ? '✓' : idx + 1}
                    </div>
                    <div>
                      <div style={{
                        fontSize: '14px',
                        fontWeight: isCurrent ? '800' : isPassed ? '700' : '500',
                        color: isCurrent ? 'var(--color-primary)' : isPassed ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)'
                      }}>
                        {step.label}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                        {step.desc}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ================= DETAILS TAB (only after sign-off) ================= */}
        {isCompleted && activeTab === 'details' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="card" style={{ background: '#ECFDF5', border: '1px solid #A7F3D0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <div>
                  <h4 style={{ fontSize: '14px', fontWeight: '800', color: '#047857' }}>
                    Signed Field Service Report
                  </h4>
                  <p style={{ fontSize: '11px', color: '#065F46', marginTop: '2px' }}>
                    Work summary, parts used and both sign-off records.
                  </p>
                </div>
                <button
                  onClick={() => generateServiceReportPDF({ ticket, customerName: companyAccountName })}
                  className="btn-primary"
                  style={{ width: 'auto', background: '#047857', padding: '8px 14px', fontSize: '12px', whiteSpace: 'nowrap', flexShrink: 0 }}
                >
                  <FileText size={14} />
                  <span>Download PDF</span>
                </button>
              </div>
            </div>

            <div className="card">
              <h4 style={{ fontSize: '14px', fontWeight: '800', color: 'var(--color-text-primary)', marginBottom: '10px' }}>
                Issue Description
              </h4>
              <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: '1.5' }}>
                {ticket.description}
              </p>
            </div>

            {report && (
              <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: '800', color: 'var(--color-text-primary)' }}>
                  Service Report
                </h4>
                {[
                  ['System', report.system],
                  ['Nature of Complaint', report.natureOfComplaint],
                  ['Work Done', report.workDone],
                  ['Part / Material', report.partsMaterial]
                ].map(([label, value]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', borderBottom: '1px solid var(--color-border)', paddingBottom: '8px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', flexShrink: 0 }}>{label}</span>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--color-text-primary)', textAlign: 'right' }}>{value || '—'}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                  <span>Technician signed</span>
                  <span style={{ fontWeight: '700', color: report.techSigned ? '#047857' : '#B42318' }}>{report.techSigned ? 'Yes' : 'No'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                  <span>Customer signed</span>
                  <span style={{ fontWeight: '700', color: report.customerSigned ? '#047857' : '#B42318' }}>{report.customerSigned ? 'Yes' : 'No'}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= NOTES (activity) ================= */}
        {activeTab === 'notes' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {(!ticket.notes || ticket.notes.length === 0) ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-text-tertiary)', background: 'var(--color-surface)', borderRadius: '12px', border: '1px dashed var(--color-border)' }}>
                <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'center' }}>
                  <MessageSquare size={32} opacity={0.5} />
                </div>
                <h4 style={{ fontSize: '15px', fontWeight: '800', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>No Activity Yet</h4>
              </div>
            ) : (
              ticket.notes.map((n, i) => (
                <div key={i} className="card" style={{ padding: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--color-text-tertiary)', marginBottom: '4px' }}>
                    <span style={{ fontWeight: '700', color: 'var(--color-primary)' }}>{n.author}</span>
                    <span>{n.time}</span>
                  </div>
                  <p style={{ fontSize: '13px', color: 'var(--color-text-primary)' }}>{n.text}</p>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Customer Signature Modal — sign-only */}
      <CustomerSignatureModal
        isOpen={showSignModal}
        onClose={() => setShowSignModal(false)}
        ticket={ticket}
        user={user}
        onSignComplete={handleSignComplete}
      />
    </div>
  );
}
