import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Users,
  ShieldAlert,
  Search,
  Plus,
  XCircle
} from 'lucide-react';
import { fetchAdminAdmins, createAdminInApi } from '../../services/adminApiService';

export const UserManagementPage = () => {
  const { rolePermissions, currentUser, showToast } = useApp();
  const [searchQuery, setSearchQuery] = useState('');

  const [admins, setAdmins] = useState([]);
  const [isLoadingAdmins, setIsLoadingAdmins] = useState(true);

  // Add Admin modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminDepartment, setNewAdminDepartment] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const loadAdmins = async () => {
    setIsLoadingAdmins(true);
    const data = await fetchAdminAdmins();
    setAdmins(Array.isArray(data) ? data : []);
    setIsLoadingAdmins(false);
  };

  useEffect(() => {
    loadAdmins();
  }, []);

  const filteredAdmins = admins.filter(a =>
    (a.full_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (a.email || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusBadge = (isActive) => {
    if (isActive) {
      return <span className="bg-[#ECFDF5] text-[#047857] px-2 py-0.5 rounded-full text-[11px] font-bold inline-flex items-center gap-1"><div className="w-1.5 h-1.5 bg-[#10B981] rounded-full"></div> Active</span>;
    }
    return <span className="bg-[#F1F5F9] text-[#64748B] px-2 py-0.5 rounded-full text-[11px] font-bold inline-flex items-center gap-1"><div className="w-1.5 h-1.5 bg-[#94A3B8] rounded-full"></div> Inactive</span>;
  };

  const openAddModal = () => {
    setNewAdminName('');
    setNewAdminEmail('');
    setNewAdminDepartment('');
    setIsAddModalOpen(true);
  };

  const handleAddAdmin = async (e) => {
    e.preventDefault();
    if (!newAdminName || !newAdminEmail || isSaving) return;

    setIsSaving(true);
    try {
      await createAdminInApi({
        full_name: newAdminName,
        email: newAdminEmail,
        department: newAdminDepartment.trim() || null
      });
      showToast(`Admin ${newAdminName} created successfully`, 'success');
      setIsAddModalOpen(false);
      await loadAdmins();
    } catch (err) {
      showToast(`Could not create admin: ${err.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const hasAccess = currentUser && rolePermissions[currentUser.role]?.staff;

  if (!hasAccess) {
    return (
      <div className="page-body flex items-center justify-center h-full">
         <div className="text-center max-w-md">
            <ShieldAlert className="w-16 h-16 text-[#F04438] mx-auto mb-4" />
            <h1 className="text-2xl font-extrabold text-[#172033] mb-2">Access Denied</h1>
            <p className="text-[#667085]">You do not have the required administrative permissions to view or manage Admin Roles.</p>
         </div>
      </div>
    );
  }

  return (
    <div className="page-body flex flex-col h-full">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-[#172033] tracking-tight">Admin Roles</h1>
          <p className="text-sm text-[#667085] mt-1">
            Manage internal dashboard admin users.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="btn btn-primary" onClick={openAddModal}>
            <Plus className="w-4 h-4" />
            Add Admin
          </button>
        </div>
      </div>

      <div className="bg-white border border-[#E4E7EC] rounded-2xl shadow-sm flex flex-col overflow-hidden min-h-0">
        {/* Table Toolbar */}
        <div className="p-4 border-b border-[#F2F4F7] flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-[#98A2B3] absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Search admin by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-[#E4E7EC] rounded-xl text-sm focus:outline-none focus:border-[#004898] transition-colors"
            />
          </div>
          <div className="flex items-center gap-2 text-sm font-semibold text-[#475467]">
            <span className="w-2 h-2 rounded-full bg-[#12B76A]"></span>
            {filteredAdmins.length} Admins Found
          </div>
        </div>

        {/* Admin Roster Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#F8FAFC] sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-6 py-4 text-[11px] font-extrabold text-[#475467] uppercase tracking-wider border-b border-[#E4E7EC]">Admin User</th>
                <th className="px-6 py-4 text-[11px] font-extrabold text-[#475467] uppercase tracking-wider border-b border-[#E4E7EC]">Department</th>
                <th className="px-6 py-4 text-[11px] font-extrabold text-[#475467] uppercase tracking-wider border-b border-[#E4E7EC]">Status</th>
                <th className="px-6 py-4 text-[11px] font-extrabold text-[#475467] uppercase tracking-wider border-b border-[#E4E7EC]">Added On</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F2F4F7] bg-white">
              {isLoadingAdmins ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-[#667085]">
                    Loading admins…
                  </td>
                </tr>
              ) : filteredAdmins.map((admin) => (
                <tr key={admin.id} className="hover:bg-[#F8FAFC] transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#004898] to-[#00346E] text-white font-bold flex items-center justify-center shrink-0">
                        <Users className="w-4.5 h-4.5" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-[#172033]">{admin.full_name}</div>
                        <div className="text-xs text-[#667085]">{admin.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-[#475467] font-medium">
                    {admin.department || '—'}
                  </td>
                  <td className="px-6 py-4">
                    {getStatusBadge(admin.is_active)}
                  </td>
                  <td className="px-6 py-4 text-sm text-[#475467] font-medium">
                    {admin.created_at ? new Date(admin.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                  </td>
                </tr>
              ))}

              {!isLoadingAdmins && filteredAdmins.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-[#667085]">
                    No admins found matching your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Admin Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#172033]/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-[#F2F4F7] flex items-center justify-between">
              <div>
                <h2 className="text-xl font-extrabold text-[#172033]">Add Admin User</h2>
                <p className="text-sm text-[#667085] mt-1">Add a new admin to the internal dashboard.</p>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-[#667085] hover:bg-[#F2F4F7] transition-colors"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddAdmin} className="p-6 flex-1 overflow-auto">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[#344054] mb-1.5">Full Name</label>
                  <input
                    type="text"
                    required
                    value={newAdminName}
                    onChange={(e) => setNewAdminName(e.target.value)}
                    className="w-full bg-[#F8FAFC] border border-[#E4E7EC] text-sm text-[#172033] rounded-xl px-4 py-3 focus:outline-none focus:border-[#004898] transition-colors placeholder:text-[#98A2B3]"
                    placeholder="e.g. John Doe"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#344054] mb-1.5">Email Address</label>
                  <input
                    type="email"
                    required
                    value={newAdminEmail}
                    onChange={(e) => setNewAdminEmail(e.target.value)}
                    className="w-full bg-[#F8FAFC] border border-[#E4E7EC] text-sm text-[#172033] rounded-xl px-4 py-3 focus:outline-none focus:border-[#004898] transition-colors placeholder:text-[#98A2B3]"
                    placeholder="e.g. john@tasktel-av.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#344054] mb-1.5">Department <span className="font-normal text-[#98A2B3]">(optional)</span></label>
                  <input
                    type="text"
                    value={newAdminDepartment}
                    onChange={(e) => setNewAdminDepartment(e.target.value)}
                    className="w-full bg-[#F8FAFC] border border-[#E4E7EC] text-sm text-[#172033] rounded-xl px-4 py-3 focus:outline-none focus:border-[#004898] transition-colors placeholder:text-[#98A2B3]"
                    placeholder="e.g. Operations"
                  />
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-[#F2F4F7] flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  disabled={isSaving}
                  className="px-5 py-2.5 rounded-xl border border-[#D0D5DD] text-[#344054] font-bold text-sm hover:bg-[#F8FAFC] transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2.5 rounded-xl bg-[#004898] text-white font-bold text-sm hover:bg-[#00346E] transition-colors disabled:opacity-60"
                >
                  {isSaving ? 'Adding…' : 'Add Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
