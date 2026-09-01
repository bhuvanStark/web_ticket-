import React, { useState } from 'react';
import { X, Wrench, Building2, MapPin, Tv, UserCheck, Calendar, Cpu, CheckCircle, FileText } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export function NewInstallationModal({ onClose, onAddInstallation }) {
  const { customers, technicians, showToast } = useApp();

  const [projectName, setProjectName] = useState('Logitech Rally Bar 4K & Tap IP Executive Suite Installation');
  const [projectCode] = useState(`PRJ-2026-${Math.floor(1000 + Math.random() * 9000)}`);
  const [selectedCustomer, setSelectedCustomer] = useState(customers[0]?.name || 'Logitech Enterprise Solutions');
  const [locationName, setLocationName] = useState('Embassy GolfLinks Tech Park, Bengaluru');
  const [roomName, setRoomName] = useState('Executive Boardroom 01');
  const [leadEngineer, setLeadEngineer] = useState(technicians[0]?.name || 'Ravi Kumar');
  const [selectedCrew, setSelectedCrew] = useState(['Ravi Kumar', 'Suresh Menon']);
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [completionDate, setCompletionDate] = useState('Target 25 Aug 2026');
  const [statusCategory, setStatusCategory] = useState('in_progress'); // 'in_progress' | 'completed' | 'scheduled'
  const [wiringDiagramRef, setWiringDiagramRef] = useState(`DWG-AV-${Math.floor(100 + Math.random() * 900)}.pdf`);
  const [notes, setNotes] = useState('Onsite hardware mounting and 4K video signal routing in progress.');

  // Predefined equipment options
  const [selectedEquipment, setSelectedEquipment] = useState([
    { name: 'Logitech Rally Bar 4K', serial: `LOGI-RB-${Math.floor(10000 + Math.random() * 90000)}`, category: 'Video' },
    { name: 'Logitech Tap IP Touch Controller', serial: `LOGI-TAP-${Math.floor(1000 + Math.random() * 9000)}`, category: 'Control' },
    { name: 'Biamp TesiraFORTÉ VT4 DSP', serial: `BIAMP-TF-${Math.floor(1000 + Math.random() * 9000)}`, category: 'Audio' }
  ]);

  const AVAILABLE_HARDWARE_OPTIONS = [
    { name: 'Logitech Rally Bar 4K', category: 'Video' },
    { name: 'Logitech Tap IP Touch Controller', category: 'Control' },
    { name: 'Neat Board 65 4K Touch Display', category: 'Display' },
    { name: 'Barco ClickShare CX-50 Gen2', category: 'Presentation' },
    { name: 'Crestron CP4 Control Processor', category: 'Control' },
    { name: 'Crestron DM-NVX-360 4K Encoder', category: 'Matrix' },
    { name: 'Biamp TesiraFORTÉ VT4 DSP', category: 'Audio' },
    { name: 'Shure MXA910 Ceiling Array Mic', category: 'Audio' }
  ];

  const toggleEquipmentOption = (opt) => {
    const exists = selectedEquipment.some(e => e.name === opt.name);
    if (exists) {
      setSelectedEquipment(selectedEquipment.filter(e => e.name !== opt.name));
    } else {
      setSelectedEquipment([
        ...selectedEquipment,
        {
          name: opt.name,
          serial: `SN-${opt.category.toUpperCase()}-${Math.floor(10000 + Math.random() * 90000)}`,
          category: opt.category
        }
      ]);
    }
  };

  const toggleCrewMember = (techName) => {
    if (selectedCrew.includes(techName)) {
      setSelectedCrew(selectedCrew.filter(c => c !== techName));
    } else {
      setSelectedCrew([...selectedCrew, techName]);
    }
  };

  const handleSave = (e) => {
    if (e) e.preventDefault();

    const finalProjectName = projectName.trim() || 'Logitech Rally Bar 4K Executive Suite Installation';
    const leadObj = technicians.find(t => t.name === leadEngineer);

    const statusLabel = 
      statusCategory === 'completed' 
        ? 'Commissioned & Handed Over' 
        : statusCategory === 'in_progress' 
        ? 'In Progress (Onsite Testing)' 
        : 'Scheduled for Onsite Setup';

    const newProject = {
      id: `INST-${Date.now()}`,
      projectCode: projectCode,
      projectName: finalProjectName,
      customerName: selectedCustomer,
      locationName: locationName || 'Bengaluru HQ',
      roomName: roomName || 'Boardroom 01',
      leadEngineer: leadEngineer,
      leadEngineerRole: leadObj?.role || 'Senior AV Field Engineer',
      crewMembers: selectedCrew.length > 0 ? selectedCrew : [leadEngineer],
      startDate: startDate,
      completionDate: completionDate,
      status: statusLabel,
      statusCategory: statusCategory,
      type: "installation",
      pmContractTier: "1-Year Enterprise PM Plan (4 Visits every 3 months)",
      pmSchedule: [
        { quarter: "Q1 PM Visit (3 Months)", date: "15 Nov 2026", engineer: leadEngineer, status: "Scheduled", notes: "First 3-month routine PM diagnostic & firmware check." },
        { quarter: "Q2 PM Visit (6 Months)", date: "15 Feb 2027", engineer: selectedCrew[1] || leadEngineer, status: "Scheduled", notes: "Acoustic mic array & display color calibration." },
        { quarter: "Q3 PM Visit (9 Months)", date: "15 May 2027", engineer: leadEngineer, status: "Scheduled", notes: "Touch panel sensitivity & matrix switcher audit." },
        { quarter: "Q4 PM Annual Overhaul (12 Months)", date: "15 Aug 2027", engineer: leadEngineer, status: "Scheduled", notes: "Full hardware warranty renewal inspection." }
      ],
      equipmentList: selectedEquipment,
      wiringDiagramRef: wiringDiagramRef,
      signoffBy: statusCategory === 'completed' ? `${leadEngineer} & Client IT Director` : 'Pending Onsite Completion',
      notes: notes
    };

    onAddInstallation(newProject);
    showToast(`Created installation project ${projectCode} & assigned ${leadEngineer}!`, 'success');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-[#E4E7EC] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-[#E4E7EC] bg-[#F8FAFC] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#004898] text-white flex items-center justify-center font-bold">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-[#004898] uppercase tracking-wider">{projectCode}</span>
              <h3 className="font-extrabold text-lg text-[#172033]">New Onsite Installation Project</h3>
            </div>
          </div>

          <button 
            onClick={onClose} 
            className="p-1 text-[#667085] hover:text-[#172033] rounded-lg hover:bg-white transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSave} className="p-6 space-y-5 overflow-y-auto flex-1 text-xs">
          {/* Project Title */}
          <div>
            <label className="form-label">Project Name / Scope</label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="e.g. Logitech Rally Bar 4K & Tap IP Executive Suite Installation"
              className="form-input font-bold text-[#172033]"
            />
          </div>

          {/* Customer & Location */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="form-label">Client / Customer Enterprise</label>
              <select
                value={selectedCustomer}
                onChange={(e) => setSelectedCustomer(e.target.value)}
                className="form-select"
              >
                {customers.map(c => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label">Installed Room Name</label>
              <input
                type="text"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="e.g. Executive Boardroom 01"
                className="form-input"
              />
            </div>
          </div>

          <div>
            <label className="form-label">Facility Address / Campus Location</label>
            <input
              type="text"
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              placeholder="e.g. Embassy GolfLinks Tech Park, Bengaluru"
              className="form-input"
            />
          </div>

          {/* Lead Onsite Installation Engineer */}
          <div className="p-4 rounded-xl bg-[#EFF5FC] border border-[#B3D1F2] space-y-3">
            <div className="flex items-center gap-2 font-extrabold text-[#004898]">
              <UserCheck className="w-4 h-4" />
              <span>Assign Lead Onsite Installation Engineer</span>
            </div>

            <select
              value={leadEngineer}
              onChange={(e) => setLeadEngineer(e.target.value)}
              className="form-select border-[#004898] font-bold text-[#172033]"
            >
              {technicians.map(t => (
                <option key={t.id} value={t.name}>
                  {t.name} ({t.role || 'AV Field Engineer'}) — {t.specialization || 'AV Lead'}
                </option>
              ))}
            </select>

            {/* Crew Selection */}
            <div>
              <label className="text-[11px] font-bold text-[#475569] block mb-1.5">
                Select Installation Crew Members:
              </label>
              <div className="flex flex-wrap gap-2">
                {technicians.map(t => {
                  const isCrew = selectedCrew.includes(t.name);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleCrewMember(t.name)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${
                        isCrew
                          ? 'bg-[#004898] text-white border-[#004898]'
                          : 'bg-white text-[#475569] border-[#CBD5E1] hover:border-[#004898]'
                      }`}
                    >
                      {isCrew ? '✓ ' : '+ '}{t.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Hardware Equipment Installed */}
          <div>
            <label className="form-label mb-2 flex items-center justify-between">
              <span>Deployed OEM Hardware Specs</span>
              <span className="text-[11px] text-[#0284C7] font-semibold">{selectedEquipment.length} Selected</span>
            </label>

            <div className="grid grid-cols-2 gap-2">
              {AVAILABLE_HARDWARE_OPTIONS.map(opt => {
                const isSelected = selectedEquipment.some(e => e.name === opt.name);
                return (
                  <div
                    key={opt.name}
                    onClick={() => toggleEquipmentOption(opt)}
                    className={`p-2.5 rounded-lg border cursor-pointer flex items-center justify-between text-xs transition-all ${
                      isSelected
                        ? 'bg-[#ECFDF3] border-[#A7F3D0] text-[#047857] font-bold'
                        : 'bg-[#F8FAFC] border-[#E4E7EC] text-[#475569]'
                    }`}
                  >
                    <span>{opt.name}</span>
                    {isSelected && <CheckCircle className="w-4 h-4 text-[#12B76A]" />}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Dates & Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="form-label">Installation Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="form-input"
              />
            </div>

            <div>
              <label className="form-label">Project Status</label>
              <select
                value={statusCategory}
                onChange={(e) => setStatusCategory(e.target.value)}
                className="form-select font-bold"
              >
                <option value="in_progress">In Progress (Testing & Calibration)</option>
                <option value="completed">Commissioned & Verified (Handover Approved)</option>
                <option value="scheduled">Scheduled for Onsite Setup</option>
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="form-label">Engineering Handover Notes</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Enter acoustic tuning, video resolution testing, or matrix routing notes..."
              className="form-textarea"
            />
          </div>

          {/* Submit Action */}
          <div className="pt-3 border-t border-[#E4E7EC] flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSave}
              className="btn btn-primary"
            >
              <CheckCircle className="w-4 h-4" />
              <span>Create Project & Assign Engineer</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
