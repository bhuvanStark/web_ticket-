import React, { useState, useRef, useEffect } from 'react';
import { X, CheckCircle, PenTool, RotateCcw, Printer, Download, Save, ShieldCheck, CheckSquare, FileText, Check } from 'lucide-react';

export const PMReportCustomerModal = ({ isOpen, onClose, pmReport, onSaveCustomerSignature }) => {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSigned, setHasSigned] = useState(!!pmReport?.customerSignature);
  const [customerName, setCustomerName] = useState(pmReport?.customerName || 'Alex Rivera');
  const [customerRemarks, setCustomerRemarks] = useState(pmReport?.customerRemarks || 'Satisfied with Preventive Maintenance work performed.');

  // Pre-load saved signature if available
  useEffect(() => {
    if (pmReport?.customerSignature && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        setHasSigned(true);
      };
      img.src = pmReport.customerSignature;
    }
  }, [pmReport, isOpen]);

  if (!isOpen || !pmReport) return null;

  const handleStartDraw = (e) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const handleDraw = (e) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    ctx.lineTo(x, y);
    ctx.strokeStyle = '#004898';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.stroke();
    setHasSigned(true);
  };

  const handleClearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSigned(false);
  };

  const handleSubmitSignature = () => {
    const canvas = canvasRef.current;
    const sigUrl = (canvas && hasSigned) ? canvas.toDataURL('image/png') : pmReport.customerSignature;
    
    if (!hasSigned && !sigUrl) {
      alert('Please draw your digital signature inside the signature box before approving.');
      return;
    }

    const updatedPmReport = {
      ...pmReport,
      customerSignature: sigUrl,
      customerName,
      customerRemarks,
      status: 'Signed & Completed'
    };

    // Save to LocalStorage for persistent PM Reports state
    try {
      const raw = localStorage.getItem('tasktel_pm_reports');
      const list = raw ? JSON.parse(raw) : [];
      const updatedList = [updatedPmReport, ...list.filter(r => r.pmNo !== updatedPmReport.pmNo)];
      localStorage.setItem('tasktel_pm_reports', JSON.stringify(updatedList));
    } catch (e) {
      console.warn('Failed to save PM report to localStorage:', e);
    }

    if (onSaveCustomerSignature) {
      onSaveCustomerSignature(updatedPmReport);
    }
    onClose();
  };

  const defaultParams = [
    { id: 1, title: '1. Checked System Input Voltage', checked: true, remarks: '230V AC ±2% Normal' },
    { id: 2, title: '2. Checked System Power Supply', checked: true, remarks: 'UPS & SMPS Output Nominal' },
    { id: 3, title: '3. Checked System Earthing', checked: true, remarks: '< 1.2 Ohms Resistance Verified' },
    { id: 4, title: '4. Checked Complete System Hardware', checked: true, remarks: 'Cleaned Fan Filters & Chassis' },
    { id: 5, title: '5. Checked the Operator Console', checked: true, remarks: 'Touch Console & Keypad Active' },
    { id: 6, title: '6. Are IPM/GD fuses used For the Trunk Lines', checked: true, remarks: 'All Protection Fuses Intact' },
    { id: 7, title: '7. Performed the System Data Backup', checked: true, remarks: 'Cloud & USB Data Backup Taken' },
    { id: 8, title: '8. Checked Call Billing:-serial/Ip Based', checked: true, remarks: 'IP CDR Logging Synchronized' },
    { id: 9, title: '9. System is Installed in Ac Room.', checked: true, remarks: 'AC Ambient Temp at 20°C' },
    { id: 10, title: '10. Checked the Voicemail/DID Unit.', checked: true, remarks: 'Auto-Attendant & DID Operational' },
    {
      id: 11,
      title: '11. Are you looking Additional Features.',
      checked: false,
      remarks: 'Customer interested in IP Trunking & PRI line backup',
      subOptions: [
        { label: 'a. Unified Communication', checked: true },
        { label: 'b. Ip Trunking/Ip phones', checked: true },
        { label: 'c. PRI line', checked: false },
        { label: 'd. Additional Extensions', checked: true }
      ]
    }
  ];

  const parameters = pmReport.parameters || defaultParams;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '12px'
    }}>
      <div style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '560px',
        maxHeight: '90vh',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.3)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* Modal Header */}
        <div style={{
          padding: '16px 20px',
          background: 'linear-gradient(135deg, #004898 0%, #002D62 100%)',
          color: '#FFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ShieldCheck size={22} color="#60A5FA" />
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: '800', margin: 0 }}>PREVENTIVE MAINTENANCE REPORT</h3>
              <div style={{ fontSize: '11px', color: '#93C5FD' }}>No. <strong style={{ color: '#FDE047' }}>{pmReport.pmNo || '25842'}</strong> • {pmReport.companyName || 'ABC Technologies'}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#FFF', cursor: 'pointer' }}>
            <X size={22} />
          </button>
        </div>

        {/* Scrollable Document Content */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Header Specs Table */}
          <div style={{ background: '#F8FAFC', padding: '12px 14px', borderRadius: '10px', border: '1px solid #E4E7EC', fontSize: '12px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
            <div><strong>Company:</strong> {pmReport.companyName || 'ABC Technologies'}</div>
            <div><strong>Date:</strong> {pmReport.date || '2026-08-21'}</div>
            <div><strong>Contact:</strong> {pmReport.contactPerson || 'Alex Rivera'}</div>
            <div><strong>Times:</strong> {pmReport.arrTime || '10:30 AM'} - {pmReport.depTime || '01:45 PM'}</div>
            <div style={{ gridColumn: 'span 2' }}><strong>PBX / Model:</strong> {pmReport.pbxModel || 'Crestron Flex UC-BX30-T'}</div>
          </div>

          {/* 11 System Parameters Checklist */}
          <div>
            <h4 style={{ fontSize: '13px', fontWeight: '800', color: '#004898', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CheckSquare size={16} />
              <span>11 System Parameters Checklist</span>
            </h4>

            <div style={{ border: '1px solid #E4E7EC', borderRadius: '8px', overflow: 'hidden', fontSize: '11px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#004898', color: '#FFF', textAlign: 'left', fontSize: '10px', textTransform: 'uppercase' }}>
                    <th style={{ padding: '8px' }}>System Parameters</th>
                    <th style={{ padding: '8px', textAlign: 'center', width: '60px' }}>Status</th>
                    <th style={{ padding: '8px' }}>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {parameters.map((p, idx) => (
                    <tr key={p.id} style={{ borderBottom: '1px solid #F1F5F9', background: idx % 2 === 0 ? '#FFF' : '#F8FAFC' }}>
                      <td style={{ padding: '8px', fontWeight: '700', color: '#172033' }}>
                        {p.title}
                        {p.subOptions && (
                          <div style={{ marginTop: '4px', paddingLeft: '8px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px', fontSize: '10px', color: '#475467', fontWeight: 'normal' }}>
                            {p.subOptions.map((s, i) => (
                              <span key={i}>[{s.checked ? '✓' : ' '}] {s.label}</span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'center', fontWeight: '800', color: p.checked ? '#047857' : '#B42318' }}>
                        {p.checked ? '✓ PASS' : '—'}
                      </td>
                      <td style={{ padding: '8px', color: '#475467', fontFamily: 'monospace' }}>
                        {p.remarks}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Engineer & Customer Remarks */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}>
            <div style={{ background: '#EFF5FC', border: '1px solid #B3D1F2', padding: '10px', borderRadius: '8px' }}>
              <strong style={{ color: '#004898' }}>Engineer's Remarks:</strong>
              <div style={{ marginTop: '4px', color: '#172033', fontFamily: 'monospace' }}>{pmReport.engineerRemarks || 'All 10 Core System Checks completed cleanly.'}</div>
            </div>

            <div>
              <label style={{ fontWeight: '800', color: '#172033', display: 'block', marginBottom: '4px' }}>Customer's Feedback / Remarks:</label>
              <textarea
                rows={2}
                value={customerRemarks}
                onChange={e => setCustomerRemarks(e.target.value)}
                style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #E4E7EC', fontSize: '12px' }}
              />
            </div>
          </div>

          {/* Digital Signature Pads */}
          <div style={{ borderTop: '1px solid #E4E7EC', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '12px', fontWeight: '800', color: '#172033' }}>Customer Digital Signature & Stamp</span>
              <button onClick={handleClearCanvas} style={{ fontSize: '11px', color: '#B42318', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <RotateCcw size={12} /> Clear Signature
              </button>
            </div>

            <div style={{ border: '2px dashed #004898', borderRadius: '10px', background: '#F8FAFC', height: '100px', position: 'relative', overflow: 'hidden' }}>
              <canvas
                ref={canvasRef}
                width={500}
                height={100}
                onMouseDown={handleStartDraw}
                onMouseMove={handleDraw}
                onMouseUp={() => setIsDrawing(false)}
                onTouchStart={handleStartDraw}
                onTouchMove={handleDraw}
                onTouchEnd={() => setIsDrawing(false)}
                style={{ width: '100%', height: '100%', cursor: 'crosshair', touchAction: 'none' }}
              />
              {!hasSigned && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontSize: '12px', pointerEvents: 'none', gap: '6px' }}>
                  <PenTool size={16} />
                  <span>Draw Customer Signature inside box</span>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Modal Footer Actions */}
        <div style={{ padding: '12px 20px', background: '#F8FAFC', borderTop: '1px solid #E4E7EC', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button
            onClick={() => window.print()}
            style={{ padding: '8px 14px', background: '#FFF', border: '1px solid #E4E7EC', borderRadius: '8px', fontSize: '12px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Printer size={14} />
            <span>Print PM Sheet</span>
          </button>

          <button
            onClick={handleSubmitSignature}
            style={{ padding: '10px 18px', background: '#004898', color: '#FFF', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
          >
            <Check size={16} />
            <span>Save & Sign PM Report</span>
          </button>
        </div>
      </div>
    </div>
  );
};
