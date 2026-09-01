import React, { useState, useRef } from 'react';
import { X, CheckCircle, PenTool, RotateCcw, Printer, Download, Save, ShieldCheck, CheckSquare, Square } from 'lucide-react';

export const PMReportModal = ({ isOpen, onClose, ticket, customer, onSavePMReport, initialData }) => {
  const [activeTab, setActiveTab] = useState('edit'); // 'edit' or 'print'

  // Top PM Header Data
  const [pmNo, setPmNo] = useState(initialData?.pmNo || `2584${Math.floor(10 + Math.random() * 89)}`);
  const [companyName, setCompanyName] = useState(initialData?.companyName || ticket?.company || customer?.name || 'ABC Technologies');
  const [address, setAddress] = useState(initialData?.address || ticket?.location || 'Indiranagar, 1st Stage, Bangalore - 560 038');
  const [telephoneNo, setTelephoneNo] = useState(initialData?.telephoneNo || '+91 80 41133001');
  const [contactPerson, setContactPerson] = useState(initialData?.contactPerson || ticket?.contactPerson || 'Alex Rivera');
  const [pbxModel, setPbxModel] = useState(initialData?.pbxModel || 'Crestron Flex UC-BX30-T / Cisco Enterprise PBX');
  const [date, setDate] = useState(initialData?.date || new Date().toISOString().split('T')[0]);
  const [arrTime, setArrTime] = useState(initialData?.arrTime || '10:30 AM');
  const [depTime, setDepTime] = useState(initialData?.depTime || '01:45 PM');

  // 11 SYSTEM PARAMETERS Checklist (Matching exact paper document format)
  const defaultParameters = [
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

  const [parameters, setParameters] = useState(initialData?.parameters || defaultParameters);
  const [engineerRemarks, setEngineerRemarks] = useState(initialData?.engineerRemarks || 'All 10 Core System Checks completed. Cleaned dust from rack enclosure, updated system firmware to latest release, and executed cloud database backup.');
  const [customerRemarks, setCustomerRemarks] = useState(initialData?.customerRemarks || 'Preventive Maintenance performed satisfactorily. All room AV systems testing 100% operational.');

  const [engineerName, setEngineerName] = useState(initialData?.engineerName || 'Karan Verma');
  const [customerName, setCustomerName] = useState(initialData?.customerName || 'Alex Rivera');

  // Signature Canvas Refs & State
  const engCanvasRef = useRef(null);
  const custCanvasRef = useRef(null);
  const [engDrawing, setEngDrawing] = useState(false);
  const [custDrawing, setCustDrawing] = useState(false);
  const [engSigned, setEngSigned] = useState(!!initialData?.engineerSignature);
  const [custSigned, setCustSigned] = useState(!!initialData?.customerSignature);
  const [engSigUrl, setEngSigUrl] = useState(initialData?.engineerSignature || null);
  const [custSigUrl, setCustSigUrl] = useState(initialData?.customerSignature || null);

  if (!isOpen) return null;

  const toggleParamChecked = (id) => {
    setParameters(prev => prev.map(p => p.id === id ? { ...p, checked: !p.checked } : p));
  };

  const handleRemarkChange = (id, text) => {
    setParameters(prev => prev.map(p => p.id === id ? { ...p, remarks: text } : p));
  };

  const toggleSubOption = (paramId, subIndex) => {
    setParameters(prev => prev.map(p => {
      if (p.id === paramId && p.subOptions) {
        const updatedSubs = [...p.subOptions];
        updatedSubs[subIndex] = { ...updatedSubs[subIndex], checked: !updatedSubs[subIndex].checked };
        return { ...p, subOptions: updatedSubs };
      }
      return p;
    }));
  };

  // Canvas Drawing Handlers
  const handleStartDraw = (ref, setDraw) => (e) => {
    setDraw(true);
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const handleDraw = (ref, isDrawing, setSigned) => (e) => {
    if (!isDrawing) return;
    const canvas = ref.current;
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
    setSigned(true);
  };

  const handleClearCanvas = (ref, setSigned, setUrl) => () => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSigned(false);
    setUrl(null);
  };

  const handleSave = () => {
    const engUrl = engCanvasRef.current ? engCanvasRef.current.toDataURL() : engSigUrl;
    const custUrl = custCanvasRef.current ? custCanvasRef.current.toDataURL() : custSigUrl;

    const pmReportPayload = {
      pmNo,
      companyName,
      address,
      telephoneNo,
      contactPerson,
      pbxModel,
      date,
      arrTime,
      depTime,
      parameters,
      engineerRemarks,
      customerRemarks,
      engineerName,
      customerName,
      engineerSignature: engSigned ? engUrl : engSigUrl,
      customerSignature: custSigned ? custUrl : custSigUrl,
      status: (engSigned && custSigned) ? 'Signed & Completed' : 'Pending Signatures'
    };

    if (onSavePMReport) {
      onSavePMReport(pmReportPayload);
    }
    onClose();
  };

  const handlePrint = () => {
    setActiveTab('print');
    setTimeout(() => {
      window.print();
    }, 400);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-[9999] p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl border border-slate-200 flex flex-col max-h-[92vh] overflow-hidden">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#004898] text-white">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-6 h-6 text-sky-300" />
            <div>
              <h3 className="text-lg font-extrabold tracking-tight">PREVENTIVE MAINTENANCE REPORT</h3>
              <p className="text-xs text-sky-200">Official TaskTel Technologeese PM Checklist • No: <span className="font-mono font-bold text-yellow-300">{pmNo}</span></p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab(activeTab === 'edit' ? 'print' : 'edit')}
              className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-bold transition-all"
            >
              {activeTab === 'edit' ? '🖨️ View Print Layout' : '✏️ Edit Report Data'}
            </button>
            <button onClick={onClose} className="text-white/80 hover:text-white p-1">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Modal Content Scrollable Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'edit' ? (
            /* EDIT FORM VIEW */
            <div className="space-y-6">
              {/* Company & Details Header Section */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                <div className="space-y-3">
                  <div>
                    <label className="font-extrabold text-slate-700 block mb-1">Company Name :</label>
                    <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} className="w-full p-2 border rounded-lg font-bold text-slate-800" />
                  </div>
                  <div>
                    <label className="font-extrabold text-slate-700 block mb-1">Address :</label>
                    <input type="text" value={address} onChange={e => setAddress(e.target.value)} className="w-full p-2 border rounded-lg text-slate-800" />
                  </div>
                  <div>
                    <label className="font-extrabold text-slate-700 block mb-1">Telephone No :</label>
                    <input type="text" value={telephoneNo} onChange={e => setTelephoneNo(e.target.value)} className="w-full p-2 border rounded-lg text-slate-800" />
                  </div>
                  <div>
                    <label className="font-extrabold text-slate-700 block mb-1">Contact Person :</label>
                    <input type="text" value={contactPerson} onChange={e => setContactPerson(e.target.value)} className="w-full p-2 border rounded-lg text-slate-800 font-bold" />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="font-extrabold text-slate-700 block mb-1">Report No :</label>
                      <input type="text" value={pmNo} onChange={e => setPmNo(e.target.value)} className="w-full p-2 border rounded-lg font-mono font-bold text-red-600" />
                    </div>
                    <div className="flex-1">
                      <label className="font-extrabold text-slate-700 block mb-1">Date :</label>
                      <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full p-2 border rounded-lg text-slate-800 font-bold" />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="font-extrabold text-slate-700 block mb-1">Arr. Time :</label>
                      <input type="text" value={arrTime} onChange={e => setArrTime(e.target.value)} className="w-full p-2 border rounded-lg text-slate-800" />
                    </div>
                    <div className="flex-1">
                      <label className="font-extrabold text-slate-700 block mb-1">Dep. Time :</label>
                      <input type="text" value={depTime} onChange={e => setDepTime(e.target.value)} className="w-full p-2 border rounded-lg text-slate-800" />
                    </div>
                  </div>

                  <div>
                    <label className="font-extrabold text-slate-700 block mb-1">PBX / System Model :</label>
                    <input type="text" value={pbxModel} onChange={e => setPbxModel(e.target.value)} className="w-full p-2 border rounded-lg font-bold text-slate-800" />
                  </div>
                </div>
              </div>

              {/* 11 SYSTEM PARAMETERS TABLE */}
              <div>
                <h4 className="text-sm font-extrabold text-[#004898] mb-2 uppercase tracking-wide flex items-center gap-2">
                  <CheckSquare className="w-4 h-4" />
                  <span>11 System Parameters Checklist</span>
                </h4>

                <div className="border border-slate-300 rounded-xl overflow-hidden shadow-xs">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-[#004898] text-white font-extrabold uppercase">
                      <tr>
                        <th className="p-3 w-1/2">SYSTEM PARAMETERS</th>
                        <th className="p-3 w-24 text-center">CHECKED</th>
                        <th className="p-3">REMARKS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {parameters.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50">
                          <td className="p-3 font-bold text-slate-800">
                            {p.title}
                            {p.subOptions && (
                              <div className="mt-2 pl-4 grid grid-cols-2 gap-2 text-[11px] font-normal text-slate-600">
                                {p.subOptions.map((sub, idx) => (
                                  <label key={idx} className="flex items-center gap-1.5 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={sub.checked}
                                      onChange={() => toggleSubOption(p.id, idx)}
                                      className="rounded text-[#004898]"
                                    />
                                    <span>{sub.label}</span>
                                  </label>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              checked={p.checked}
                              onChange={() => toggleParamChecked(p.id)}
                              className="w-4 h-4 text-[#004898] accent-[#004898] rounded cursor-pointer"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={p.remarks}
                              onChange={e => handleRemarkChange(p.id, e.target.value)}
                              placeholder="Enter remarks..."
                              className="w-full p-1.5 border border-slate-200 rounded text-xs text-slate-800"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* REMARKS SECTIONS */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="font-extrabold text-[#004898] block mb-1 text-xs">Engineer's Remarks :</label>
                  <textarea
                    rows={3}
                    value={engineerRemarks}
                    onChange={e => setEngineerRemarks(e.target.value)}
                    className="w-full p-2.5 border rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-[#004898]"
                  />
                </div>
                <div>
                  <label className="font-extrabold text-[#004898] block mb-1 text-xs">Customer's Remarks :</label>
                  <textarea
                    rows={3}
                    value={customerRemarks}
                    onChange={e => setCustomerRemarks(e.target.value)}
                    className="w-full p-2.5 border rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-[#004898]"
                  />
                </div>
              </div>

              {/* DIGITAL SIGNATURES SECTION */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-200">
                {/* Engineer Signature */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="font-extrabold text-slate-800 text-xs">Name of Engineer :</label>
                    <button
                      onClick={handleClearCanvas(engCanvasRef, setEngSigned, setEngSigUrl)}
                      className="text-[11px] text-slate-500 hover:text-red-600 flex items-center gap-1 font-bold"
                    >
                      <RotateCcw className="w-3 h-3" /> Reset
                    </button>
                  </div>
                  <input
                    type="text"
                    value={engineerName}
                    onChange={e => setEngineerName(e.target.value)}
                    className="w-full p-1.5 border rounded-lg text-xs font-bold text-slate-800"
                  />

                  <div className="relative border-2 border-dashed border-slate-300 rounded-xl bg-white overflow-hidden h-28">
                    <canvas
                      ref={engCanvasRef}
                      width={340}
                      height={110}
                      onMouseDown={handleStartDraw(engCanvasRef, setEngDrawing)}
                      onMouseMove={handleDraw(engCanvasRef, engDrawing, setEngSigned)}
                      onMouseUp={() => setEngDrawing(false)}
                      onTouchStart={handleStartDraw(engCanvasRef, setEngDrawing)}
                      onTouchMove={handleDraw(engCanvasRef, engDrawing, setEngSigned)}
                      onTouchEnd={() => setEngDrawing(false)}
                      className="w-full h-full cursor-crosshair touch-none"
                    />
                    {!engSigned && (
                      <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-xs pointer-events-none gap-2">
                        <PenTool className="w-4 h-4 text-slate-400" />
                        <span>Sign & Stamp here (Engineer)</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Customer Signature */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="font-extrabold text-slate-800 text-xs">Name of Customer :</label>
                    <button
                      onClick={handleClearCanvas(custCanvasRef, setCustSigned, setCustSigUrl)}
                      className="text-[11px] text-slate-500 hover:text-red-600 flex items-center gap-1 font-bold"
                    >
                      <RotateCcw className="w-3 h-3" /> Reset
                    </button>
                  </div>
                  <input
                    type="text"
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    className="w-full p-1.5 border rounded-lg text-xs font-bold text-slate-800"
                  />

                  <div className="relative border-2 border-dashed border-slate-300 rounded-xl bg-white overflow-hidden h-28">
                    <canvas
                      ref={custCanvasRef}
                      width={340}
                      height={110}
                      onMouseDown={handleStartDraw(custCanvasRef, setCustDrawing)}
                      onMouseMove={handleDraw(custCanvasRef, custDrawing, setCustSigned)}
                      onMouseUp={() => setCustDrawing(false)}
                      onTouchStart={handleStartDraw(custCanvasRef, setCustDrawing)}
                      onTouchMove={handleDraw(custCanvasRef, custDrawing, setCustSigned)}
                      onTouchEnd={() => setCustDrawing(false)}
                      className="w-full h-full cursor-crosshair touch-none"
                    />
                    {!custSigned && (
                      <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-xs pointer-events-none gap-2">
                        <PenTool className="w-4 h-4 text-slate-400" />
                        <span>Sign & Stamp here (Customer)</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* EXACT PAPER DOCUMENT PRINT FORMAT VIEW */
            <div className="bg-white p-6 border border-slate-300 rounded-xl font-serif text-slate-900 space-y-4 shadow-sm" id="printable-pm-sheet">
              {/* Paper Header */}
              <div className="text-center space-y-1 border-b-2 border-slate-800 pb-3">
                <div className="text-2xl font-bold font-sans tracking-wide text-[#004898] flex items-center justify-center gap-2">
                  <span>🏢 TaskTel Technologeese</span>
                </div>
                <h2 className="text-lg font-extrabold underline tracking-wider text-slate-800">
                  PREVENTIVE MAINTENANCE REPORT
                </h2>
              </div>

              {/* Paper Details Fields */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs font-sans">
                <div><strong>Company Name :</strong> {companyName}</div>
                <div><strong>Date :</strong> {date}</div>
                <div><strong>Address :</strong> {address}</div>
                <div><strong>Arr. Time :</strong> {arrTime}</div>
                <div><strong>Telephone No :</strong> {telephoneNo}</div>
                <div><strong>Dep. Time :</strong> {depTime}</div>
                <div><strong>Contact Person :</strong> {contactPerson}</div>
                <div className="text-right">
                  <strong className="text-red-700 text-sm font-mono font-bold">No. : {pmNo}</strong>
                </div>
                <div className="col-span-2"><strong>PBX Model :</strong> {pbxModel}</div>
              </div>

              {/* Printable Table */}
              <table className="w-full border-collapse border border-slate-800 text-xs font-sans">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-800 font-extrabold text-slate-800">
                    <th className="border border-slate-800 p-2 text-left w-1/2">SYSTEM PARAMETERS</th>
                    <th className="border border-slate-800 p-2 text-center w-24">CHECKED</th>
                    <th className="border border-slate-800 p-2 text-left">REMARKS</th>
                  </tr>
                </thead>
                <tbody>
                  {parameters.map((p) => (
                    <tr key={p.id} className="border-b border-slate-800">
                      <td className="border border-slate-800 p-2 font-medium">
                        {p.title}
                        {p.subOptions && (
                          <div className="mt-1 pl-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                            {p.subOptions.map((sub, idx) => (
                              <span key={idx}>
                                [{sub.checked ? '✓' : ' '}] {sub.label}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="border border-slate-800 p-2 text-center font-bold text-base">
                        {p.checked ? '✓' : '—'}
                      </td>
                      <td className="border border-slate-800 p-2 text-slate-700 font-mono text-[11px]">
                        {p.remarks}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Remarks Box */}
              <div className="space-y-2 text-xs font-sans">
                <div className="border border-slate-800 p-2.5 rounded">
                  <strong>Engineer's Remarks :</strong>
                  <p className="mt-1 text-slate-700 font-mono">{engineerRemarks}</p>
                </div>

                <div className="border border-slate-800 p-2.5 rounded">
                  <strong>Customer's Remarks :</strong>
                  <p className="mt-1 text-slate-700 font-mono">{customerRemarks}</p>
                </div>
              </div>

              {/* Signatures Row */}
              <div className="grid grid-cols-2 gap-8 pt-6 border-t border-slate-400 font-sans text-xs">
                <div>
                  <div className="h-16 border-b border-slate-800 flex items-center justify-center">
                    {engSigUrl ? (
                      <img src={engSigUrl} alt="Engineer Sign" className="max-h-14 object-contain" />
                    ) : (
                      <span className="italic text-slate-400">[Digital Signature & Stamp]</span>
                    )}
                  </div>
                  <div className="mt-2">
                    <div><strong>Name of Engineer:</strong> {engineerName}</div>
                    <div className="text-[11px] text-slate-500 font-bold">Sign & Stamp</div>
                  </div>
                </div>

                <div>
                  <div className="h-16 border-b border-slate-800 flex items-center justify-center">
                    {custSigUrl ? (
                      <img src={custSigUrl} alt="Customer Sign" className="max-h-14 object-contain" />
                    ) : (
                      <span className="italic text-slate-400">[Digital Signature & Stamp]</span>
                    )}
                  </div>
                  <div className="mt-2">
                    <div><strong>Name of Customer:</strong> {customerName}</div>
                    <div className="text-[11px] text-slate-500 font-bold">Sign & Stamp</div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="text-center text-[10px] text-slate-500 pt-4 border-t border-slate-300 font-sans">
                TASKTEL, #169, 9th Cross, Indiranagar, 1st Stage, Bangalore - 560 038<br />
                Tel: +91 80 41133001 / 42059507, Customer Care: 98805 88399<br />
                E-mail: customersupport@taskteltechnologeese.com, www.taskteltechnologeese.com
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-t border-slate-200">
          <div className="flex items-center gap-2 text-xs font-extrabold text-[#004898]">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            <span>Preventive Maintenance Report #{pmNo}</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl font-bold text-xs flex items-center gap-2"
            >
              <Printer className="w-4 h-4" />
              <span>Print PM Sheet</span>
            </button>

            <button
              onClick={handleSave}
              className="px-5 py-2 bg-[#004898] hover:bg-[#002D62] text-white rounded-xl font-extrabold text-xs flex items-center gap-2 shadow-md"
            >
              <Save className="w-4 h-4" />
              <span>Save & Sign PM Report</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
