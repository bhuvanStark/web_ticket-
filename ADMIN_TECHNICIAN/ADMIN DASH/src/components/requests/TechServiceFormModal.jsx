import React, { useState, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { X, CheckCircle, PenTool, RotateCcw, Clock } from 'lucide-react';

// Equipment lists per support line. The Equipment/System dropdown switches
// automatically to match the ticket's category.
const AV_SYSTEMS = [
  'Neat VC Bar',
  'Logitech VC Bar',
  'Poly VC Bar',
  'Yealink',
  'Teams',
  'Zoom',
  'Native Platform',
  'Other',
  'Microphone',
  'Speaker',
  'DSP',
  'Audio Controller',
  'Display',
  'Video',
  'Camera',
  'VC System',
  'Room Equipment',
  'Connectivity'
];

const EPABX_SYSTEMS = [
  'OSB',
  'EP Controller',
  'SMB Controller',
  'X5 Series',
  'SIP ATH 3800',
  'HiPath 3550',
  'HiPath 1150',
  'HiPath 1190'
];

export const TechServiceFormModal = () => {
  const {
    selectedTicket,
    isServiceFormOpen,
    setIsServiceFormOpen,
    submitServiceReport,
    currentUser
  } = useApp();

  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSigned, setHasSigned] = useState(false);

  // Customer sign-off — captured here, on the technician's device.
  const custCanvasRef = useRef(null);
  const [isDrawingCust, setIsDrawingCust] = useState(false);
  const [custHasSigned, setCustHasSigned] = useState(false);
  const [customerDetails, setCustomerDetails] = useState('');
  const [customerNotPresent, setCustomerNotPresent] = useState(false);

  const isEpabx = (selectedTicket?.supportCategory || '').toLowerCase() === 'epabx'
    || selectedTicket?.serviceType === 'EPABX';
  const systemOptions = isEpabx ? EPABX_SYSTEMS : AV_SYSTEMS;

  const [system, setSystem] = useState(systemOptions[0]);
  const [natureOfComplaint, setNatureOfComplaint] = useState('');
  const [workDone, setWorkDone] = useState('');
  const [partsMaterial, setPartsMaterial] = useState('');

  if (!isServiceFormOpen || !selectedTicket) return null;

  const pointFromEvent = (canvas, e) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const startDrawing = (e) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { x, y } = pointFromEvent(canvas, e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { x, y } = pointFromEvent(canvas, e);
    ctx.lineTo(x, y);
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

  const startDrawingCust = (e) => {
    setIsDrawingCust(true);
    const canvas = custCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { x, y } = pointFromEvent(canvas, e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const drawCust = (e) => {
    if (!isDrawingCust) return;
    const canvas = custCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { x, y } = pointFromEvent(canvas, e);
    ctx.lineTo(x, y);
    ctx.strokeStyle = '#004898';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.stroke();
    setCustHasSigned(true);
  };

  const stopDrawingCust = () => setIsDrawingCust(false);

  const clearCustCanvas = () => {
    const canvas = custCanvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    setCustHasSigned(false);
  };

  // outcome: 'completed' (default) or 'pending'. Same report either way.
  const submitWithOutcome = async (outcome) => {
    if (!workDone.trim()) {
      alert('Please describe the work done.');
      return;
    }
    if (!hasSigned) {
      alert('Please sign the report before submitting.');
      return;
    }
    if (!customerDetails.trim()) {
      alert('Enter the customer name and phone number.');
      return;
    }
    if (!customerNotPresent && !custHasSigned) {
      alert("Ask the customer to sign, or tick “Customer Not Present”.");
      return;
    }

    // Drawn signatures are not stored — only that each party signed, plus the
    // customer's typed name + phone.
    const saved = await submitServiceReport(selectedTicket.id, {
      system,
      natureOfComplaint,
      workDone: workDone.trim(),
      partsMaterial,
      techSignerName: currentUser?.name || 'Technician',
      customerSignerDetails: customerDetails.trim(),
      customerSignerName: customerDetails.trim(),
      customerPresent: !customerNotPresent,
      outcome
    });
    if (saved) setIsServiceFormOpen(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    submitWithOutcome('completed');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-xl rounded-xl shadow-2xl border border-[#E4E7EC] overflow-hidden my-8">
        <div className="p-5 border-b border-[#E4E7EC] bg-[#F8FAFC] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[#12B76A] text-white flex items-center justify-center">
              <CheckCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-[#172033]">Field Service Report</h3>
              <p className="text-xs text-[#667085]">
                Ticket <span className="font-mono font-bold text-[#004898]">{selectedTicket.id}</span> · {isEpabx ? 'EPABX' : 'AV'}
              </p>
            </div>
          </div>
          <button onClick={() => setIsServiceFormOpen(false)} className="p-1 text-[#667085] hover:text-[#172033]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* 1. System */}
          <div>
            <label className="block text-xs font-bold text-[#172033] mb-1">1. System *</label>
            <select
              value={system}
              onChange={(e) => setSystem(e.target.value)}
              className="w-full px-3 py-2 border border-[#E4E7EC] rounded-lg text-sm outline-none focus:border-[#004898]"
            >
              {systemOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>

          {/* 2. Nature of Complaint */}
          <div>
            <label className="block text-xs font-bold text-[#172033] mb-1">2. Nature of Complaint</label>
            <textarea
              rows={2}
              value={natureOfComplaint}
              onChange={(e) => setNatureOfComplaint(e.target.value)}
              placeholder="What was reported / observed…"
              className="w-full px-3 py-2 border border-[#E4E7EC] rounded-lg text-sm outline-none focus:border-[#004898] resize-y"
            />
          </div>

          {/* 3. Work Done */}
          <div>
            <label className="block text-xs font-bold text-[#172033] mb-1">3. Work Done *</label>
            <textarea
              required
              rows={3}
              value={workDone}
              onChange={(e) => setWorkDone(e.target.value)}
              placeholder="Steps taken to resolve the issue…"
              className="w-full px-3 py-2 border border-[#E4E7EC] rounded-lg text-sm outline-none focus:border-[#004898] resize-y"
            />
          </div>

          {/* 4. Part / Material */}
          <div>
            <label className="block text-xs font-bold text-[#172033] mb-1">4. Part / Material</label>
            <input
              type="text"
              value={partsMaterial}
              onChange={(e) => setPartsMaterial(e.target.value)}
              placeholder="e.g. HDMI cable x1, DSP module"
              className="w-full px-3 py-2 border border-[#E4E7EC] rounded-lg text-sm outline-none focus:border-[#004898]"
            />
          </div>

          {/* 5. Technician signature */}
          <div className="p-4 rounded-xl bg-[#EFF5FC] border border-[#B3D1F2] space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-extrabold text-[#004898] flex items-center gap-1.5 mb-0">
                <PenTool className="w-4 h-4 text-[#004898]" />
                5. Technician Sign-Off *
              </label>
              {hasSigned && (
                <button type="button" onClick={clearCanvas} className="text-xs text-[#F04438] hover:text-[#B42318] font-bold flex items-center gap-1">
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Clear</span>
                </button>
              )}
            </div>

            <div className="relative border-2 border-dashed border-[#B3D1F2] rounded-xl bg-white overflow-hidden">
              <canvas
                ref={canvasRef}
                width={500}
                height={110}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
                className="w-full h-28 touch-none cursor-crosshair"
              />
              {!hasSigned && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center text-[#98A2B3] bg-white/70">
                  <span className="text-xs font-semibold">Draw your signature here</span>
                </div>
              )}
            </div>
            <p className="text-[11px] text-[#475467]">
              Technician: <strong className="text-[#172033]">{currentUser?.name || 'Technician'}</strong> ·
              the signature image is not stored, only that you signed.
            </p>
          </div>

          {/* 6. Customer sign-off — captured on this device */}
          <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E4E7EC] space-y-3">
            <label className="text-xs font-extrabold text-[#004898] flex items-center gap-1.5 mb-0">
              <PenTool className="w-4 h-4 text-[#004898]" />
              6. Customer Sign-Off *
            </label>

            <div>
              <label className="block text-[11px] font-bold text-[#172033] mb-1">Customer Name + Phone Number *</label>
              <input
                type="text"
                required
                value={customerDetails}
                onChange={(e) => setCustomerDetails(e.target.value)}
                placeholder="Ramesh Kumar - 9876543210"
                className="w-full px-3 py-2 border border-[#E4E7EC] rounded-lg text-sm outline-none focus:border-[#004898]"
              />
            </div>

            <label className="flex items-center gap-2 text-xs font-semibold text-[#475467] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={customerNotPresent}
                onChange={(e) => {
                  setCustomerNotPresent(e.target.checked);
                  if (e.target.checked) clearCustCanvas();
                }}
                className="w-4 h-4 accent-[#004898]"
              />
              Customer Not Present
            </label>

            {!customerNotPresent && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[#172033]">Customer Signature *</span>
                  {custHasSigned && (
                    <button type="button" onClick={clearCustCanvas} className="text-xs text-[#F04438] hover:text-[#B42318] font-bold flex items-center gap-1">
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Clear</span>
                    </button>
                  )}
                </div>
                <div className="relative border-2 border-dashed border-[#E4E7EC] rounded-xl bg-white overflow-hidden">
                  <canvas
                    ref={custCanvasRef}
                    width={500}
                    height={110}
                    onMouseDown={startDrawingCust}
                    onMouseMove={drawCust}
                    onMouseUp={stopDrawingCust}
                    onMouseLeave={stopDrawingCust}
                    onTouchStart={startDrawingCust}
                    onTouchMove={drawCust}
                    onTouchEnd={stopDrawingCust}
                    className="w-full h-28 touch-none cursor-crosshair"
                  />
                  {!custHasSigned && (
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center text-[#98A2B3] bg-white/70">
                      <span className="text-xs font-semibold">Ask the customer to sign here</span>
                    </div>
                  )}
                </div>
              </>
            )}
            <p className="text-[11px] text-[#475467]">
              {customerNotPresent
                ? 'Customer not present — the report will complete without a customer signature.'
                : 'The signature image is not stored, only that the customer signed on site.'}
            </p>
          </div>

          <div className="pt-4 border-t border-[#E4E7EC] flex flex-col sm:flex-row items-stretch sm:items-center sm:justify-end gap-2">
            <button type="button" onClick={() => setIsServiceFormOpen(false)} className="btn btn-secondary btn-sm">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => submitWithOutcome('pending')}
              className="btn btn-sm px-5 bg-white hover:bg-[#FFFAEB] text-[#B54708] border border-[#FDE68A] font-bold"
            >
              <Clock className="w-4 h-4" />
              <span>Submit &amp; Mark Pending</span>
            </button>
            <button type="submit" className="btn btn-primary btn-sm px-6 bg-[#004898] hover:bg-[#00346E] border-[#004898] font-bold">
              <CheckCircle className="w-4 h-4" />
              <span>Submit Report &amp; Complete</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
