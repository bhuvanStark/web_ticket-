import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { X, Search, UserCheck, AlertCircle } from 'lucide-react';
import { Avatar } from '../common/Avatar';

// Date + Time + multiple technicians, in one action, per spec §5 ("A-style"
// assignment). Visual shell copied from ReassignModal.jsx; the multi-select
// checkbox list is new UI (no existing modal supports selecting more than
// one technician at once).
export const AssignProjectTeamModal = () => {
  const {
    isAssignProjectTeamModalOpen,
    setIsAssignProjectTeamModalOpen,
    selectedProject,
    technicians,
    assignProjectTeam
  } = useApp();

  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (isAssignProjectTeamModalOpen) {
      setDate('');
      setTime('');
      setSearch('');
      setSelectedIds([]);
      setFormError('');
    }
  }, [isAssignProjectTeamModalOpen]);

  if (!isAssignProjectTeamModalOpen || !selectedProject) return null;

  const filteredTechs = (technicians || []).filter((tech) => {
    if (!search.trim()) return true;
    const lower = search.toLowerCase();
    return (tech.name || '').toLowerCase().includes(lower) || (tech.location || '').toLowerCase().includes(lower);
  });

  const toggleTech = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleAssign = async () => {
    if (submitting) return;
    if (!date || !time || selectedIds.length === 0) {
      setFormError('Pick a date, a time, and at least one technician.');
      return;
    }
    setSubmitting(true);
    setFormError('');
    const ok = await assignProjectTeam(selectedProject.id, { date, time, technicianIds: selectedIds });
    setSubmitting(false);
    if (ok) setIsAssignProjectTeamModalOpen(false);
    else setFormError('Could not assign the selected technicians — one or more may already have an activity that day.');
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setIsAssignProjectTeamModalOpen(false)}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-[#E4E7EC] flex items-center justify-between bg-[#F8FAFC]">
          <div>
            <h3 className="text-base font-extrabold text-[#172033]">Assign Technicians</h3>
            <p className="text-xs text-[#667085] mt-0.5">{selectedProject.name} — {selectedProject.id}</p>
          </div>
          <button type="button" onClick={() => setIsAssignProjectTeamModalOpen(false)} className="p-2 hover:bg-[#E4E7EC] rounded-full transition-colors cursor-pointer">
            <X className="w-5 h-5 text-[#667085]" />
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {formError && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-[#FEF3F2] border border-[#FECDCA] text-[#B42318]">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <p className="text-xs font-semibold">{formError}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#172033] mb-1">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-2 py-2 border border-[#E4E7EC] rounded-lg text-xs outline-none focus:border-[#004898]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#172033] mb-1">Time</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full px-2 py-2 border border-[#E4E7EC] rounded-lg text-xs outline-none focus:border-[#004898]"
              />
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-xs font-bold text-[#667085] uppercase tracking-wider">
              Select Technicians {selectedIds.length > 0 && `(${selectedIds.length} selected)`}
            </h4>

            <div className="relative">
              <Search className="w-4 h-4 text-[#98A2B3] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search technicians by name, location..."
                className="w-full pl-9 pr-4 py-2 text-sm border border-[#E4E7EC] rounded-lg focus:outline-none focus:border-[#004898] focus:ring-1 focus:ring-[#004898] transition-all"
              />
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {filteredTechs.length === 0 && (
                <div className="p-3 text-center text-sm text-[#667085]">No technicians match your search.</div>
              )}
              {filteredTechs.map((tech) => (
                <label
                  key={tech.id}
                  className="flex items-center gap-3 p-3 rounded-xl border border-[#E4E7EC] hover:border-[#B3D1F2] hover:bg-[#EFF5FC] cursor-pointer transition-all"
                >
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded text-[#004898] border-gray-300 focus:ring-[#004898] cursor-pointer"
                    checked={selectedIds.includes(tech.id)}
                    onChange={() => toggleTech(tech.id)}
                  />
                  <Avatar src={tech.avatar} name={tech.name} className="w-8 h-8" textClassName="text-xs" />
                  <div className="flex-1">
                    <h5 className="font-bold text-xs text-[#172033]">{tech.name}</h5>
                    <p className="text-[10px] text-[#667085] mt-0.5">{tech.role} • {tech.location}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-[#E4E7EC] flex justify-end gap-3 bg-[#F8FAFC]">
          <button type="button" onClick={() => setIsAssignProjectTeamModalOpen(false)} className="btn btn-secondary text-sm cursor-pointer">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAssign}
            disabled={submitting || !date || !time || selectedIds.length === 0}
            className={`btn btn-primary text-sm shadow-sm cursor-pointer ${(submitting || !date || !time || selectedIds.length === 0) ? 'opacity-50 cursor-not-allowed' : 'bg-[#004898] hover:bg-[#003673]'}`}
          >
            <UserCheck className="w-4 h-4" />
            <span>{submitting ? 'Assigning…' : 'Assign'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
