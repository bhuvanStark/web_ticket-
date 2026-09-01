import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { createTechnicianInApi } from '../../services/adminApiService';
import { Search, MapPin, Eye, Plus, Link2, LogIn, Download, Trash2, AlertTriangle } from 'lucide-react';
import { TableSkeleton } from '../common/SkeletonLoader';
import { Avatar } from '../common/Avatar';
import { NewTechnicianModal } from './NewTechnicianModal';
import { ShareTechLinkModal } from './ShareTechLinkModal';
import unifiedClient from '../../api/unifiedClient';

export const TechniciansPage = () => {
  const { technicians, setTechnicians, setSelectedTechId, loginAsTechnician, deleteTechnician, simulatedLoading, showToast } = useApp();
  const [search, setSearch] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [shareTech, setShareTech] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  // Deleting is destructive and cannot be undone, so it goes through a
  // confirmation step rather than firing straight off the row button.
  const [pendingDelete, setPendingDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const confirmDelete = async () => {
    if (!pendingDelete || isDeleting) return;
    setIsDeleting(true);
    await deleteTechnician(pendingDelete.id);
    setIsDeleting(false);
    setPendingDelete(null);
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const { filename } = await unifiedClient.downloadCsv('technicians');
      showToast?.(`Downloaded ${filename}`, 'success');
    } catch (err) {
      showToast?.(err?.message || 'Export failed', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  if (simulatedLoading) return <TableSkeleton rows={4} />;

  const handleAddTechnician = async (techData) => {
    // techData already uses the DB field names (full_name, email, phone,
    // role_title, specialization, location).
    const response = await createTechnicianInApi(techData);
    if (response && response.data) {
      const d = response.data;
      const created = {
        id: d.id,
        name: d.full_name,
        email: d.email,
        phone: d.phone,
        role: d.role_title,
        specialization: d.specialization,
        location: d.location,
        status: 'Available',
        // A brand-new technician has no jobs yet. Set these explicitly so the
        // roster shows "0 / 0" instead of blank until the next full reload
        // (AppContext recomputes them from tickets on load).
        activeJobsCount: 0,
        completedJobsCount: 0
      };
      if (typeof setTechnicians === 'function') {
        setTechnicians(prev => [created, ...(prev || [])]);
      }
    }
  };

  const filtered = (technicians || []).filter(t =>
    (t.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (t.specialization || '').toLowerCase().includes(search.toLowerCase()) ||
    (t.location || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-[#172033] tracking-tight">Global Technician Roster</h2>
          <p className="text-xs md:text-sm text-[#667085] mt-0.5">
            Manage field service engineers, specializations, operating locations, and workload.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="btn btn-secondary shadow-sm text-xs font-bold disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            <span>{isExporting ? 'Exporting…' : 'Export CSV'}</span>
          </button>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="btn btn-primary shadow-sm text-xs font-bold"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Technician</span>
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="card p-4 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-[#E4E7EC] shadow-xs">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-[#98A2B3] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
          <input
            type="text"
            placeholder="Search technician name, specialization or location..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: '40px' }}
            className="form-input text-xs"
          />
        </div>

        <div className="text-xs font-bold text-[#004898] bg-[#EFF5FC] px-3 py-1.5 rounded-lg border border-[#B3D1F2]">
          Total Active Field Engineers: {filtered.length}
        </div>
      </div>

      {/* Technicians Table */}
      <div className="card overflow-hidden border border-[#E4E7EC] shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse bg-white">
            <thead className="bg-[#F8FAFC] text-[#667085] uppercase font-bold text-[10px] tracking-wider border-b border-[#E4E7EC]">
              <tr>
                <th className="px-6 py-4 text-left w-[40%]">Technician Profile</th>
                <th className="px-6 py-4 text-center w-[20%]">Active / Completed</th>
                <th className="px-6 py-4 text-center w-[20%]">Availability</th>
                <th className="px-6 py-4 text-right w-[20%]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F2F4F7]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan="5" className="p-8 text-center text-[#667085]">
                    No technicians match the selected filters.
                  </td>
                </tr>
              ) : (
                filtered.map(tech => (
                  <tr key={tech.id} className="hover:bg-[#F8FAFC] transition-all">
                    {/* Profile */}
                    <td className="px-6 py-4 align-middle">
                      <div className="flex items-center gap-4">
                        <Avatar
                          src={tech.avatar}
                          name={tech.name}
                          className="w-10 h-10 shadow-2xs"
                        />
                        <div className="flex flex-col gap-1">
                          <button
                            onClick={() => setSelectedTechId(tech.id)}
                            className="font-extrabold text-[13px] text-[#004898] hover:underline text-left leading-none"
                          >
                            {tech.name}
                          </button>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[11px] text-[#475467] font-semibold">{tech.role}</span>
                            <span className="text-[10px] text-[#98A2B3]">&bull;</span>
                            <span className="text-[11px] text-[#667085] font-medium flex items-center gap-1">
                              <MapPin className="w-3 h-3" /> {tech.location}
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Workload */}
                    <td className="px-6 py-4 align-middle text-center">
                      <span className="font-extrabold text-[#004898]">{tech.activeJobsCount ?? 0}</span>
                      <span className="text-[#98A2B3] mx-1">/</span>
                      <span className="font-bold text-[#027A48]">{tech.completedJobsCount ?? 0}</span>
                    </td>

                    {/* Availability */}
                    <td className="px-6 py-4 align-middle text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        tech.availability === 'Available' ? 'bg-[#ECFDF3] text-[#027A48]' : 'bg-[#FEF0C7] text-[#B54708]'
                      }`}>
                        {tech.availability}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4 align-middle">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setShareTech(tech)}
                          className="p-1.5 rounded-lg bg-white hover:bg-[#F8FAFC] text-[#12B76A] border border-[#E4E7EC] transition-all cursor-pointer shadow-2xs inline-flex items-center justify-center"
                          title="Share Login Link"
                        >
                          <Link2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setSelectedTechId(tech.id)}
                          className="p-1.5 rounded-lg bg-white hover:bg-[#F8FAFC] text-[#172033] border border-[#E4E7EC] transition-all cursor-pointer shadow-2xs inline-flex items-center justify-center"
                          title="View Profile"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => loginAsTechnician(tech)}
                          className="p-1.5 rounded-lg bg-[#EFF5FC] hover:bg-[#004898] text-[#004898] hover:text-white border border-[#B3D1F2] hover:border-[#004898] transition-all cursor-pointer shadow-2xs inline-flex items-center justify-center"
                          title="Login as Technician"
                        >
                          <LogIn className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setPendingDelete(tech)}
                          className="p-1.5 rounded-lg bg-white hover:bg-[#FEF3F2] text-[#D92D20] border border-[#E4E7EC] hover:border-[#FDA29B] transition-all cursor-pointer shadow-2xs inline-flex items-center justify-center"
                          title="Delete Technician"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {isAddModalOpen && (
        <NewTechnicianModal
          onClose={() => setIsAddModalOpen(false)}
          onAddTechnician={handleAddTechnician}
        />
      )}
      {shareTech && (
        <ShareTechLinkModal
          tech={shareTech}
          onClose={() => setShareTech(null)}
        />
      )}
      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl border border-[#E4E7EC]">
            <div className="flex items-start gap-3 p-5">
              <div className="shrink-0 w-10 h-10 rounded-full bg-[#FEF3F2] flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-[#D92D20]" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#172033]">Delete technician</h3>
                <p className="mt-1 text-sm text-[#667085]">
                  This will permanently remove{' '}
                  <span className="font-semibold text-[#172033]">
                    {pendingDelete.full_name || pendingDelete.name}
                  </span>
                  . Any tickets assigned to them will move back to the unassigned
                  queue. This cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-[#E4E7EC] bg-[#F9FAFB] rounded-b-xl">
              <button
                onClick={() => setPendingDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 text-sm font-semibold rounded-lg border border-[#E4E7EC] bg-white text-[#344054] hover:bg-[#F8FAFC] transition-all cursor-pointer disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#D92D20] text-white hover:bg-[#B42318] transition-all cursor-pointer disabled:opacity-60"
              >
                {isDeleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

