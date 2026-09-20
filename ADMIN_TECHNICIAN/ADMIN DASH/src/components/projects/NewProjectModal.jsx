import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { X, Briefcase, AlertCircle } from 'lucide-react';
import { fetchResponsibleAdmins } from '../../services/projectApiService';

// Create/Edit form for a Project. Shell copied from CreateTicketModal.jsx to
// match the existing ticket-modal visual language exactly.
export const NewProjectModal = () => {
  const {
    isNewProjectModalOpen,
    setIsNewProjectModalOpen,
    projectModalMode,
    selectedProject,
    createProject,
    updateProject
  } = useApp();

  const isEdit = projectModalMode === 'edit' && selectedProject;

  const [name, setName] = useState('');
  const [customer, setCustomer] = useState('');
  const [location, setLocation] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [description, setDescription] = useState('');
  const [responsibleAdminId, setResponsibleAdminId] = useState('');
  const [admins, setAdmins] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Reset the form to the right starting values whenever the modal (re)opens.
  useEffect(() => {
    if (!isNewProjectModalOpen) return;
    setFormError('');
    if (isEdit) {
      setName(selectedProject.name || '');
      setCustomer(selectedProject.customer || '');
      setLocation(selectedProject.location || '');
      setStartDate((selectedProject.start_date || '').slice(0, 10));
      setEndDate((selectedProject.end_date || '').slice(0, 10));
      setDescription(selectedProject.description || '');
      setResponsibleAdminId(selectedProject.responsible_admin_id || '');
    } else {
      setName('');
      setCustomer('');
      setLocation('');
      setStartDate('');
      setEndDate('');
      setDescription('');
      setResponsibleAdminId('');
    }
  }, [isNewProjectModalOpen, isEdit, selectedProject]);

  // Isolated: the admin dropdown is a small convenience list. If it fails to
  // load, the form still works — the field just falls back to unassigned.
  useEffect(() => {
    if (!isNewProjectModalOpen) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchResponsibleAdmins();
        if (!cancelled) setAdmins(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setAdmins([]);
      }
    })();
    return () => { cancelled = true; };
  }, [isNewProjectModalOpen]);

  if (!isNewProjectModalOpen) return null;

  const handleSubmit = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (submitting) return;

    if (!name.trim() || !customer.trim() || !location.trim()) {
      setFormError('Project name, customer and location are required.');
      return;
    }

    setSubmitting(true);
    setFormError('');
    const payload = {
      name: name.trim(),
      customer: customer.trim(),
      location: location.trim(),
      start_date: startDate || null,
      end_date: endDate || null,
      description: description.trim() || null,
      responsible_admin_id: responsibleAdminId || null
    };

    const ok = isEdit
      ? await updateProject(selectedProject.id, payload)
      : await createProject(payload);

    setSubmitting(false);
    if (ok) setIsNewProjectModalOpen(false);
    else setFormError('Could not save the project. Please try again.');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl border border-[#E4E7EC] overflow-hidden my-8">
        <div className="p-5 border-b border-[#E4E7EC] bg-[#F8FAFC] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[#004898] text-white flex items-center justify-center">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-[#172033]">{isEdit ? 'Edit Project' : 'New Project'}</h3>
              <p className="text-xs text-[#667085]">{isEdit ? `Editing ${selectedProject.id}` : 'Create a new long-running project'}</p>
            </div>
          </div>
          <button
            onClick={() => setIsNewProjectModalOpen(false)}
            disabled={submitting}
            className="p-1 text-[#667085] hover:text-[#172033] rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {formError && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-[#FEF3F2] border border-[#FECDCA] text-[#B42318]">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <p className="text-xs font-semibold">{formError}</p>
            </div>
          )}

          <div className="p-4 rounded-xl border border-[#E4E7EC] space-y-3">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#004898]">1. Project Details</h4>

            <div>
              <label className="block text-xs font-bold text-[#172033] mb-1">Project Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Infosys AV Installation"
                className="w-full px-3 py-2 border border-[#E4E7EC] rounded-lg text-sm outline-none focus:border-[#004898]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-[#172033] mb-1">Customer *</label>
                <input
                  type="text"
                  required
                  value={customer}
                  onChange={(e) => setCustomer(e.target.value)}
                  placeholder="e.g. Infosys"
                  className="w-full px-3 py-2 border border-[#E4E7EC] rounded-lg text-xs font-bold text-[#004898] outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#172033] mb-1">Location *</label>
                <input
                  type="text"
                  required
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Bangalore HQ"
                  className="w-full px-3 py-2 border border-[#E4E7EC] rounded-lg text-xs outline-none focus:border-[#004898]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-[#172033] mb-1">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-2 py-2 border border-[#E4E7EC] rounded-lg text-xs outline-none focus:border-[#004898]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#172033] mb-1">Expected End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-2 py-2 border border-[#E4E7EC] rounded-lg text-xs outline-none focus:border-[#004898]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#172033] mb-1">Responsible Admin</label>
              <select
                value={responsibleAdminId}
                onChange={(e) => setResponsibleAdminId(e.target.value)}
                className="w-full px-3 py-2 border border-[#E4E7EC] rounded-lg text-xs font-semibold outline-none focus:border-[#004898]"
              >
                <option value="">Unassigned</option>
                {admins.map((a) => (
                  <option key={a.id} value={a.id}>{a.full_name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#172033] mb-1">Description / Scope <span className="font-normal text-[#98A2B3]">(optional)</span></label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Brief scope of work for this project"
                className="w-full px-3 py-2 border border-[#E4E7EC] rounded-lg text-xs outline-none focus:border-[#004898] resize-none"
              />
            </div>
          </div>
        </form>

        <div className="p-5 border-t border-[#E4E7EC] bg-[#FAFCFF] flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => setIsNewProjectModalOpen(false)}
            disabled={submitting}
            className="px-4 py-2.5 text-xs font-bold text-[#475467] hover:text-[#172033] hover:bg-[#F2F4F7] rounded-lg transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="px-6 py-2.5 bg-[#004898] hover:bg-[#003673] text-white font-extrabold text-xs rounded-lg transition-all shadow-xs cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Project'}
          </button>
        </div>
      </div>
    </div>
  );
};
