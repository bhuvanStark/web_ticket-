import React, { useState } from 'react';
import { X, RotateCw, UserCheck, Calendar, Building2, Tv, FileText, CheckCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export function SchedulePMModal({ onClose, onSchedulePM, preselectedInst }) {
  const { installations, technicians, showToast } = useApp();

  const [selectedInstId, setSelectedInstId] = useState(preselectedInst?.id || installations[0]?.id || '');
  const [quarter, setQuarter] = useState('Q1 PM Visit (3 Months)');
  const [assignedEngineer, setAssignedEngineer] = useState(technicians[0]?.name || 'Ravi Kumar');
  const [visitDate, setVisitDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('Routine 3-month PM checkup: firmware updates, acoustic mic array recalibration & display diagnostics.');

  const targetInst = installations.find(i => i.id === selectedInstId) || installations[0];

  const handleSave = (e) => {
    if (e) e.preventDefault();

    if (!targetInst) {
      alert('Please select an installation project.');
      return;
    }

    const updatedPmVisit = {
      quarter: quarter,
      date: visitDate,
      engineer: assignedEngineer,
      status: 'Scheduled',
      notes: notes
    };

    onSchedulePM(targetInst.id, updatedPmVisit);
    showToast(`Scheduled ${quarter} for ${targetInst.roomName} & assigned to ${assignedEngineer}!`, 'success');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-[#E4E7EC] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-[#E4E7EC] bg-[#F8FAFC] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#12B76A] text-white flex items-center justify-center font-bold">
              <RotateCw className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-[#12B76A] uppercase tracking-wider">Preventative Maintenance</span>
              <h3 className="font-extrabold text-lg text-[#172033]">Schedule & Assign PM Visit</h3>
            </div>
          </div>

          <button 
            onClick={onClose} 
            className="p-1 text-[#667085] hover:text-[#172033] rounded-lg hover:bg-white transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
          {/* Target Installation Room */}
          <div>
            <label className="form-label">Select Client Installation & Room</label>
            <select
              value={selectedInstId}
              onChange={(e) => setSelectedInstId(e.target.value)}
              className="form-select font-bold text-[#004898]"
            >
              {installations.map(inst => (
                <option key={inst.id} value={inst.id}>
                  {inst.customerName} — {inst.roomName} ({inst.projectCode})
                </option>
              ))}
            </select>
          </div>

          {/* PM Quarter & Visit Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="form-label">PM Visit Cycle</label>
              <select
                value={quarter}
                onChange={(e) => setQuarter(e.target.value)}
                className="form-select font-bold"
              >
                <option value="Q1 PM Visit (3 Months)">Q1 PM Visit (3 Months Post-Install)</option>
                <option value="Q2 PM Visit (6 Months)">Q2 PM Visit (6 Months Post-Install)</option>
                <option value="Q3 PM Visit (9 Months)">Q3 PM Visit (9 Months Post-Install)</option>
                <option value="Q4 PM Annual Overhaul (12 Months)">Q4 PM Annual Overhaul (12 Months)</option>
              </select>
            </div>

            <div>
              <label className="form-label">Scheduled Visit Date</label>
              <input
                type="date"
                value={visitDate}
                onChange={(e) => setVisitDate(e.target.value)}
                className="form-input"
              />
            </div>
          </div>

          {/* Assign Field Engineer */}
          <div className="p-4 rounded-xl bg-[#EFF5FC] border border-[#B3D1F2] space-y-2">
            <div className="flex items-center gap-2 font-extrabold text-[#004898]">
              <UserCheck className="w-4 h-4" />
              <span>Assign Maintenance Field Technician</span>
            </div>

            <select
              value={assignedEngineer}
              onChange={(e) => setAssignedEngineer(e.target.value)}
              className="form-select border-[#004898] font-bold text-[#172033]"
            >
              {technicians.map(t => (
                <option key={t.id} value={t.name}>
                  {t.name} ({t.role || 'AV Field Engineer'}) — {t.specialization || 'AV Lead'}
                </option>
              ))}
            </select>
          </div>

          {/* PM Checklist Scope */}
          <div>
            <label className="form-label">PM Checklist & Technical Scope</label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Optical lens cleaning, DSP echo cancellation check, cable harness tightening..."
              className="form-textarea"
            />
          </div>

          {/* Action Buttons */}
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
              <span>Schedule & Assign PM Visit</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
