import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Wrench,
  CheckCircle,
  Clock,
  UserCheck,
  Search,
  Building2,
  MapPin,
  Tv,
  FileCheck,
  ChevronRight,
  X,
  Layers,
  Calendar,
  Cpu,
  Plus,
  ShieldCheck,
  RotateCw,
  Award,
  UserPlus
} from 'lucide-react';
import { NewInstallationModal } from './NewInstallationModal';
import { SchedulePMModal } from './SchedulePMModal';

export const InstallationsPage = () => {
  const { installations, setInstallations, role } = useApp();
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'installations' | 'pm_visits'
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedInst, setSelectedInst] = useState(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSchedulePmModalOpen, setIsSchedulePmModalOpen] = useState(false);
  const [selectedInstForPm, setSelectedInstForPm] = useState(null);

  const handleAddNewInstallation = (newProject) => {
    setInstallations(prev => [newProject, ...prev]);
  };

  const handleSchedulePM = (targetInstId, updatedPmVisit) => {
    setInstallations(prev => prev.map(inst => {
      if (inst.id === targetInstId) {
        const existingSchedule = inst.pmSchedule || [];
        const index = existingSchedule.findIndex(p => p.quarter === updatedPmVisit.quarter);
        let newSchedule = [...existingSchedule];
        if (index >= 0) {
          newSchedule[index] = updatedPmVisit;
        } else {
          newSchedule.push(updatedPmVisit);
        }
        return {
          ...inst,
          pmSchedule: newSchedule
        };
      }
      return inst;
    }));
  };

  const openSchedulePmModal = (inst = null) => {
    setSelectedInstForPm(inst);
    setIsSchedulePmModalOpen(true);
  };

  const filteredInstallations = (installations || []).filter(inst => {
    const matchesSearch = 
      inst.projectName.toLowerCase().includes(search.toLowerCase()) ||
      inst.customerName.toLowerCase().includes(search.toLowerCase()) ||
      inst.leadEngineer.toLowerCase().includes(search.toLowerCase()) ||
      inst.roomName.toLowerCase().includes(search.toLowerCase()) ||
      inst.projectCode.toLowerCase().includes(search.toLowerCase());

    const matchesStatus = 
      statusFilter === 'all' || 
      (statusFilter === 'completed' && inst.statusCategory === 'completed') ||
      (statusFilter === 'in_progress' && inst.statusCategory === 'in_progress');

    return matchesSearch && matchesStatus;
  });

  const totalCount = (installations || []).length;
  const completedCount = (installations || []).filter(i => i.statusCategory === 'completed').length;
  const inProgressCount = (installations || []).filter(i => i.statusCategory === 'in_progress').length;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#172033] tracking-tight">
            Onsite Installations & 1-Year PM Maintenance Visits
          </h1>
          <p className="text-xs md:text-sm text-[#667085] mt-1">
            Track hardware room installations, engineer crew assignments, and quarterly 3-month Preventative Maintenance (PM) visits.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {role === 'admin' && (
            <>
              <button 
                onClick={() => openSchedulePmModal()}
                className="btn btn-secondary shadow-sm text-xs font-bold"
              >
                <RotateCw className="w-4 h-4 text-[#12B76A]" />
                <span>Schedule PM Visit</span>
              </button>

              <button 
                onClick={() => setIsCreateModalOpen(true)}
                className="btn btn-primary shadow-sm text-xs font-bold"
              >
                <Plus className="w-4 h-4" />
                <span>New Installation Project</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Metric Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-5 flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-[#667085] uppercase tracking-wider">Total Room Projects</span>
            <div className="text-2xl font-extrabold text-[#172033] mt-1">{totalCount}</div>
            <span className="text-[11px] text-[#0284C7] font-semibold">Active Enterprise Deployments</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-[#EFF5FC] text-[#004898] flex items-center justify-center font-bold">
            <Layers className="w-6 h-6" />
          </div>
        </div>

        <div className="card p-5 flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-[#667085] uppercase tracking-wider">1-Year PM Contracts</span>
            <div className="text-2xl font-extrabold text-[#004898] mt-1">{totalCount * 4} Visits</div>
            <span className="text-[11px] text-[#12B76A] font-semibold">Quarterly (3 Months Cycle)</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-[#F0FDF4] text-[#12B76A] flex items-center justify-center font-bold">
            <RotateCw className="w-6 h-6" />
          </div>
        </div>

        <div className="card p-5 flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-[#667085] uppercase tracking-wider">In Progress / Calibrating</span>
            <div className="text-2xl font-extrabold text-[#F79009] mt-1">{inProgressCount}</div>
            <span className="text-[11px] text-[#F79009] font-semibold">Onsite Engineers Deployed</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-[#FEF0C7] text-[#F79009] flex items-center justify-center font-bold">
            <Clock className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* View Mode Tabs & Filter Bar */}
      <div className="card p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3 py-2 rounded-lg text-xs font-extrabold transition-all flex items-center gap-1.5 ${
              activeTab === 'all'
                ? 'bg-[#004898] text-white shadow-xs'
                : 'bg-[#F6F8FB] text-[#667085] hover:text-[#172033]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>All Deployments ({totalCount})</span>
          </button>

          <button
            onClick={() => setActiveTab('installations')}
            className={`px-3 py-2 rounded-lg text-xs font-extrabold transition-all flex items-center gap-1.5 ${
              activeTab === 'installations'
                ? 'bg-[#004898] text-white shadow-xs'
                : 'bg-[#F6F8FB] text-[#667085] hover:text-[#172033]'
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>Room Installations</span>
          </button>

          <button
            onClick={() => setActiveTab('pm_visits')}
            className={`px-3 py-2 rounded-lg text-xs font-extrabold transition-all flex items-center gap-1.5 ${
              activeTab === 'pm_visits'
                ? 'bg-[#004898] text-white shadow-xs'
                : 'bg-[#F6F8FB] text-[#667085] hover:text-[#172033]'
            }`}
          >
            <RotateCw className="w-3.5 h-3.5 text-[#12B76A]" />
            <span>3-Month PM Visits Schedule</span>
          </button>
        </div>

        {/* Search */}
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#98A2B3]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search project, OEM customer, engineer..."
            className="form-input pl-9 text-xs"
          />
        </div>
      </div>

      {/* Installation Projects List */}
      <div className="space-y-4">
        {filteredInstallations.map((inst) => {
          const isCompleted = inst.statusCategory === 'completed';
          return (
            <div 
              key={inst.id}
              className="card p-5 hover:border-[#004898] transition-all space-y-4"
            >
              <div 
                className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 cursor-pointer"
                onClick={() => setSelectedInst(inst)}
              >
                {/* Left Info */}
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="px-2.5 py-0.5 rounded-md bg-[#EFF5FC] text-[#004898] font-extrabold text-xs">
                      {inst.projectCode}
                    </span>

                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      isCompleted ? 'bg-[#ECFDF3] text-[#047857]' : 'bg-[#FEF0C7] text-[#B45309]'
                    }`}>
                      {inst.status}
                    </span>

                    <span className="px-2.5 py-0.5 rounded-md bg-[#F0FDF4] text-[#15803D] border border-[#BBF7D0] text-[11px] font-bold flex items-center gap-1">
                      <RotateCw className="w-3 h-3 text-[#12B76A]" />
                      <span>{inst.pmContractTier || '1-Year Quarterly PM Plan'}</span>
                    </span>
                  </div>

                  <h3 className="text-base font-extrabold text-[#172033]">
                    {inst.projectName}
                  </h3>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-[#667085]">
                    <div className="flex items-center gap-1.5 font-semibold text-[#172033]">
                      <Building2 className="w-3.5 h-3.5 text-[#004898]" />
                      <span>{inst.customerName}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-[#98A2B3]" />
                      <span>{inst.locationName}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Tv className="w-3.5 h-3.5 text-[#0284C7]" />
                      <span className="font-bold text-[#0284C7]">{inst.roomName}</span>
                    </div>
                  </div>
                </div>

                {/* Right Lead Engineer & Action */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 border-t lg:border-t-0 pt-3 lg:pt-0 border-[#F2F4F7]">
                  <div className="bg-[#F8FAFC] p-3 rounded-xl border border-[#E4E7EC] flex items-center gap-3">
                    <UserCheck className="w-5 h-5 text-[#004898]" />
                    <div>
                      <div className="text-[11px] font-bold text-[#667085] uppercase">Lead Onsite Tech</div>
                      <div className="text-xs font-extrabold text-[#172033]">{inst.leadEngineer}</div>
                    </div>
                  </div>

                  {role === 'admin' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openSchedulePmModal(inst);
                      }}
                      className="px-3 py-2 rounded-xl bg-[#F0FDF4] text-[#15803D] hover:bg-[#DCFCE7] border border-[#BBF7D0] text-xs font-extrabold flex items-center gap-1.5 transition-all shadow-2xs"
                    >
                      <UserPlus className="w-4 h-4 text-[#12B76A]" />
                      <span>Assign PM Tech</span>
                    </button>
                  )}

                  <ChevronRight className="w-5 h-5 text-[#98A2B3] hidden lg:block" />
                </div>
              </div>

              {/* 1-Year Quarterly PM Maintenance Schedule Timeline */}
              <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E4E7EC] space-y-2">
                <div className="flex items-center justify-between text-[11px] font-extrabold text-[#004898]">
                  <span className="flex items-center gap-1.5">
                    <RotateCw className="w-3.5 h-3.5 text-[#12B76A]" />
                    <span>Quarterly Preventative Maintenance (PM) Visit Timeline (Every 3 Months)</span>
                  </span>

                  {role === 'admin' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openSchedulePmModal(inst);
                      }}
                      className="text-[11px] font-extrabold text-[#004898] hover:underline flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3 text-[#004898]" />
                      <span>Assign / Reschedule PM Tech</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
                  {inst.pmSchedule?.map((pm, idx) => (
                    <div 
                      key={idx}
                      onClick={(e) => {
                        e.stopPropagation();
                        openSchedulePmModal(inst);
                      }}
                      className={`p-2.5 rounded-lg border text-xs space-y-1 hover:border-[#004898] cursor-pointer transition-all ${
                        pm.status.includes('Completed')
                          ? 'bg-[#ECFDF3] border-[#A7F3D0]'
                          : 'bg-white border-[#E2E8F0]'
                      }`}
                    >
                      <div className="flex items-center justify-between font-extrabold text-[11px]">
                        <span className={pm.status.includes('Completed') ? 'text-[#047857]' : 'text-[#172033]'}>
                          {pm.quarter}
                        </span>
                        <span className="text-[10px] text-[#667085] font-mono">{pm.date}</span>
                      </div>

                      <div className="text-[11px] text-[#475569] truncate">
                        Tech: <span className="font-bold">{pm.engineer}</span>
                      </div>

                      <div className="text-[10px] text-[#047857] font-semibold truncate">
                        ✓ {pm.notes}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Installation & PM Detail View Modal */}
      {selectedInst && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-[#E4E7EC] overflow-hidden">
            <div className="p-5 border-b border-[#E4E7EC] bg-[#F8FAFC] flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-[#004898] uppercase tracking-wider">{selectedInst.projectCode} • Onsite Installation & PM Visits</span>
                <h3 className="font-extrabold text-lg text-[#172033]">{selectedInst.projectName}</h3>
              </div>
              <button 
                onClick={() => setSelectedInst(null)} 
                className="p-1 text-[#667085] hover:text-[#172033] rounded-lg hover:bg-white transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              {/* Facility & Room Info */}
              <div className="grid grid-cols-2 gap-4 p-4 rounded-xl bg-[#F6F8FB] border border-[#E4E7EC] text-xs">
                <div>
                  <span className="font-bold text-[#667085] uppercase text-[10px]">Customer / Client</span>
                  <div className="font-extrabold text-[#172033] text-sm">{selectedInst.customerName}</div>
                  <div className="text-[#667085] mt-0.5">{selectedInst.locationName}</div>
                </div>

                <div>
                  <span className="font-bold text-[#667085] uppercase text-[10px]">Installed Room</span>
                  <div className="font-extrabold text-[#0284C7] text-sm">{selectedInst.roomName}</div>
                  <div className="text-[#667085] mt-0.5">Dates: {selectedInst.startDate} → {selectedInst.completionDate}</div>
                </div>
              </div>

              {/* 1-Year Quarterly PM Schedule Breakdown */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-bold text-xs uppercase tracking-wider text-[#004898] flex items-center gap-2">
                    <RotateCw className="w-4 h-4 text-[#12B76A]" />
                    <span>1-Year Quarterly Preventative Maintenance (PM) Visit Log (Every 3 Months)</span>
                  </h4>

                  {role === 'admin' && (
                    <button
                      onClick={() => {
                        const current = selectedInst;
                        setSelectedInst(null);
                        openSchedulePmModal(current);
                      }}
                      className="btn btn-secondary btn-sm text-[11px] font-bold"
                    >
                      <UserPlus className="w-3.5 h-3.5 text-[#12B76A]" />
                      <span>Assign PM Tech</span>
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  {selectedInst.pmSchedule?.map((pm, idx) => (
                    <div key={idx} className="p-3.5 rounded-xl border border-[#E4E7EC] bg-[#F8FAFC] space-y-1 text-xs">
                      <div className="flex items-center justify-between font-extrabold">
                        <span className="text-[#004898]">{pm.quarter} — Date: {pm.date}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          pm.status.includes('Completed') ? 'bg-[#ECFDF3] text-[#047857]' : 'bg-[#FEF0C7] text-[#B45309]'
                        }`}>
                          {pm.status}
                        </span>
                      </div>
                      <div className="text-[#475569]">
                        Assigned PM Field Technician: <span className="font-bold text-[#172033]">{pm.engineer}</span>
                      </div>
                      <p className="text-[#667085] text-[11px] pt-1 border-t border-[#E2E8F0] mt-1">
                        Checklist Notes: {pm.notes}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Installed Equipment Specs */}
              <div>
                <h4 className="font-bold text-xs uppercase tracking-wider text-[#667085] mb-2 flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-[#12B76A]" />
                  <span>Installed OEM Hardware Catalog</span>
                </h4>

                <div className="border border-[#E4E7EC] rounded-xl overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-[#F8FAFC] text-[#667085] uppercase font-bold text-[10px]">
                      <tr>
                        <th className="p-3">Equipment Name</th>
                        <th className="p-3">Serial Number</th>
                        <th className="p-3">Category</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E4E7EC]">
                      {selectedInst.equipmentList?.map((eq, idx) => (
                        <tr key={idx} className="hover:bg-[#F8FAFC]">
                          <td className="p-3 font-extrabold text-[#172033]">{eq.name}</td>
                          <td className="p-3 font-mono text-[#004898]">{eq.serial}</td>
                          <td className="p-3 font-semibold text-[#667085]">{eq.category}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Installation Creation Modal */}
      {isCreateModalOpen && (
        <NewInstallationModal
          onClose={() => setIsCreateModalOpen(false)}
          onAddInstallation={handleAddNewInstallation}
        />
      )}

      {/* Schedule / Assign PM Visit Modal */}
      {isSchedulePmModalOpen && (
        <SchedulePMModal
          onClose={() => setIsSchedulePmModalOpen(false)}
          onSchedulePM={handleSchedulePM}
          preselectedInst={selectedInstForPm}
        />
      )}
    </div>
  );
};
