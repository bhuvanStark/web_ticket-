import React, { useRef, useState, useEffect } from 'react';
import { CheckCircle2, AlertTriangle, ShieldCheck, Eraser, FileText, Download } from 'lucide-react';
import { generateServiceReportPDF } from '../utils/pdfGenerator';

export function ServiceCompletionModal({ ticket, onConfirmResolved, onRejectResolution }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSigned, setHasSigned] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#004898';
  }, []);

  const startDrawing = (e) => {
    setIsDrawing(true);
    setHasSigned(true);
    draw(e);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.beginPath();
    }
  };

  const draw = (e) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSigned(false);
  };

  const handleDownloadPDF = () => {
    const canvas = canvasRef.current;
    const sigUrl = canvas && hasSigned ? canvas.toDataURL('image/png') : null;
    generateServiceReportPDF({
      ticket,
      customerName: ticket?.customerName || "ABC Technologies",
      signatureDataUrl: sigUrl
    });
  };

  const handleConfirm = () => {
    handleDownloadPDF();
    onConfirmResolved();
  };

  if (!ticket) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '90%', overflowY: 'auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '14px' }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'var(--color-success-bg)',
            color: 'var(--color-success)',
            display: 'inline-flex',
            alignItems: 'center',
            justify: 'center',
            marginBottom: '10px'
          }}>
            <CheckCircle2 size={32} />
          </div>

          <h2 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--color-text-primary)', marginBottom: '2px' }}>
            Service Completion & Digital Sign-off
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
            Please sign below to confirm room handover & generate official PDF report.
          </p>
        </div>

        {/* Ticket Summary Card */}
        <div className="card" style={{ marginBottom: '14px', padding: '12px', background: 'var(--color-bg)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>Ticket Reference:</span>
            <span style={{ fontWeight: '800', color: 'var(--color-primary)' }}>#{ticket.id}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>Target Room:</span>
            <span style={{ fontWeight: '700' }}>{ticket.roomName}</span>
          </div>

          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '6px', marginTop: '6px', fontSize: '12px' }}>
            <strong>Resolution Summary:</strong>
            <p style={{ marginTop: '2px', color: 'var(--color-success-text)', fontWeight: '600' }}>
              "{ticket.resolution || 'Replaced faulty PoE injector on Extron TouchLink controller and updated firmwares to v2.8.'}"
            </p>
          </div>
        </div>

        {/* Digital Signature Canvas Box */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <label style={{ fontSize: '12px', fontWeight: '800', color: 'var(--color-text-primary)' }}>
              ✍️ Customer Signature Canvas
            </label>

            {hasSigned && (
              <button
                onClick={clearCanvas}
                style={{ background: 'none', border: 'none', color: 'var(--color-error)', fontSize: '11px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
              >
                <Eraser size={13} />
                <span>Clear Canvas</span>
              </button>
            )}
          </div>

          <div style={{ border: '2px dashed var(--color-primary-glow)', borderRadius: '12px', background: '#FFFFFF', overflow: 'hidden', touchAction: 'none' }}>
            <canvas
              ref={canvasRef}
              width={340}
              height={120}
              onMouseDown={startDrawing}
              onMouseUp={stopDrawing}
              onMouseMove={draw}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchEnd={stopDrawing}
              onTouchMove={draw}
              style={{ width: '100%', height: '120px', display: 'block', cursor: 'crosshair' }}
            />
          </div>
          <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', textAlign: 'center', marginTop: '4px' }}>
            Draw signature using finger or mouse above
          </div>
        </div>

        {/* Action CTA Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            onClick={handleConfirm}
            className="btn-primary"
            style={{ background: 'var(--color-success)', color: '#FFF' }}
          >
            <FileText size={16} />
            <span>Confirm Sign-Off & Download PDF Report</span>
          </button>

          <button
            onClick={handleDownloadPDF}
            className="btn-secondary"
            style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)', borderColor: 'var(--color-primary-glow)' }}
          >
            <Download size={15} />
            <span>Preview PDF Service Report</span>
          </button>

          <button
            onClick={onRejectResolution}
            className="btn-secondary"
            style={{ borderColor: 'var(--color-error)', color: 'var(--color-error)' }}
          >
            <AlertTriangle size={15} />
            <span>Issue Still Exists</span>
          </button>
        </div>
      </div>
    </div>
  );
}
