import React, { useRef, useState } from 'react';
import { X, CheckCircle, PenTool, ShieldCheck } from 'lucide-react';

export const CustomerSignatureModal = ({ isOpen, onClose, ticket, user, onSignComplete }) => {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSigned, setHasSigned] = useState(false);
  const [signerName, setSignerName] = useState(user?.name || '');
  const [signerRole, setSignerRole] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  if (!isOpen || !ticket) return null;

  const report = ticket.serviceReport || {};

  const startDrawing = (e) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.strokeStyle = '#004898';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.stroke();
    setHasSigned(true);
  };

  const stopDrawing = () => setIsDrawing(false);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    setHasSigned(false);
  };

  const handleApproveAndSign = async (e) => {
    e.preventDefault();
    if (!hasSigned) {
      alert('Please draw your signature to complete sign-off.');
      return;
    }
    if (!signerName.trim()) {
      alert('Please enter your name.');
      return;
    }

    // The drawn signature is NOT sent or stored — only the fact that the
    // customer signed, and their typed name.
    const updatedTicket = {
      ...ticket,
      customerSignedNow: true,
      customerSignerName: signerName.trim(),
      customerSignerRole: signerRole.trim(),
      status: 'Completed'
    };

    try {
      setIsSaving(true);
      setSaveError('');
      await onSignComplete(updatedTicket);
      onClose();
    } catch (error) {
      setSaveError(error.message || 'Could not save your sign-off. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const Row = ({ label, value }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '6px 0', borderBottom: '1px solid #EEF2F6' }}>
      <span style={{ fontSize: '11px', color: '#667085', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: '12px', fontWeight: '600', color: '#172033', textAlign: 'right' }}>{value || '—'}</span>
    </div>
  );

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
    }}>
      <div style={{
        backgroundColor: '#ffffff', width: '100%', maxWidth: '560px', maxHeight: '92vh',
        borderRadius: '16px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)',
        border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', backgroundColor: '#EFF5FC', borderBottom: '1px solid #B3D1F2', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ padding: '8px', borderRadius: '10px', backgroundColor: '#004898', color: '#ffffff' }}>
              <ShieldCheck size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#172033', margin: 0 }}>
                Review &amp; Sign Service Report
              </h3>
              <p style={{ fontSize: '11px', color: '#667085', margin: 0 }}>
                Ticket <strong style={{ fontFamily: 'monospace', color: '#004898' }}>{ticket.id || ticket.ticketNumber}</strong>
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#667085' }}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Report summary (read-only) */}
          <div style={{ padding: '12px 14px', borderRadius: '10px', backgroundColor: '#F8FAFC', border: '1px solid #E4E7EC' }}>
            <span style={{ color: '#667085', display: 'block', fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', marginBottom: '6px' }}>
              Field Service Report
            </span>
            <Row label="System" value={report.system} />
            <Row label="Nature of Complaint" value={report.natureOfComplaint} />
            <Row label="Work Done" value={report.workDone} />
            <Row label="Part / Material" value={report.partsMaterial} />
          </div>

          {/* Signature canvas */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <label style={{ fontSize: '11px', fontWeight: '800', color: '#004898', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <PenTool size={13} />
                Draw your signature *
              </label>
              <button type="button" onClick={clearCanvas} style={{ fontSize: '11px', fontWeight: '700', color: '#F04438', background: 'none', border: 'none', cursor: 'pointer' }}>
                Clear
              </button>
            </div>
            <div style={{ border: '2px dashed #004898', borderRadius: '12px', backgroundColor: '#F8FAFC', overflow: 'hidden' }}>
              <canvas
                ref={canvasRef}
                width={500}
                height={130}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
                style={{ width: '100%', height: '130px', cursor: 'crosshair', touchAction: 'none' }}
              />
            </div>
            <p style={{ fontSize: '10px', color: '#667085', marginTop: '4px' }}>
              Your signature is used only to confirm sign-off and is not stored.
            </p>
          </div>

          {/* Signer name / role */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '11px', fontWeight: '800', color: '#344054', display: 'block', marginBottom: '4px' }}>Your Name *</label>
              <input type="text" value={signerName} onChange={(e) => setSignerName(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #E4E7EC', fontSize: '12px' }} />
            </div>
            <div>
              <label style={{ fontSize: '11px', fontWeight: '800', color: '#344054', display: 'block', marginBottom: '4px' }}>Role / Designation</label>
              <input type="text" value={signerRole} onChange={(e) => setSignerRole(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #E4E7EC', fontSize: '12px' }} />
            </div>
          </div>
        </div>

        {saveError && (
          <div style={{ padding: '10px 20px', color: '#B42318', backgroundColor: '#FEF3F2', fontSize: '12px', fontWeight: '700' }}>
            {saveError}
          </div>
        )}

        {/* Footer */}
        <div style={{ padding: '12px 20px', backgroundColor: '#ffffff', borderTop: '1px solid #E4E7EC', display: 'flex', gap: '10px' }}>
          <button type="button" onClick={onClose} disabled={isSaving}
            style={{ flex: 1, padding: '12px', backgroundColor: '#ffffff', color: '#344054', border: '1px solid #E4E7EC', borderRadius: '10px', fontSize: '13px', fontWeight: '800', cursor: 'pointer' }}>
            Cancel
          </button>
          <button type="button" onClick={handleApproveAndSign} disabled={isSaving}
            style={{
              flex: 2, padding: '12px', backgroundColor: '#004898', color: '#ffffff', border: 'none', borderRadius: '10px',
              fontSize: '13px', fontWeight: '800', cursor: isSaving ? 'wait' : 'pointer', opacity: isSaving ? 0.7 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
            }}>
            <CheckCircle size={16} />
            <span>{isSaving ? 'Saving…' : 'Sign & Submit Report'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
