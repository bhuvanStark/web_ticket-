import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { 
  Users, 
  ShieldAlert, 
  Search, 
  Plus, 
  MoreVertical,
  CheckCircle2,
  XCircle,
  Shield,
  Eye,
  Edit,
  Trash2,
  Download,
  ChevronDown,
  FileText,
  FileSpreadsheet,
  FileIcon
} from 'lucide-react';

export const UserManagementPage = () => {
  const { staff, setStaff, rolePermissions, setRolePermissions, currentUser } = useApp();
  const [activeTab, setActiveTab] = useState('staff'); // 'staff' | 'roles'
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal State
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('invite'); // 'invite' | 'edit'
  const [editAdminId, setEditAdminId] = useState(null);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffRole, setNewStaffRole] = useState('Dispatcher');
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);

  const filteredStaff = staff.filter(user => 
    user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getRoleBadge = (roleName) => {
    switch(roleName) {
      case 'Super Admin':
        return <span className="bg-[#FAF5FF] text-[#6941C6] border border-[#E9D7FE] px-2.5 py-1 rounded-lg text-xs font-bold inline-flex items-center gap-1.5"><ShieldAlert className="w-3.5 h-3.5" /> Super Admin</span>;
      case 'Dispatcher':
        return <span className="bg-[#F0F9FF] text-[#0284C7] border border-[#BAE6FD] px-2.5 py-1 rounded-lg text-xs font-bold inline-flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" /> Dispatcher</span>;
      case 'Service Manager':
        return <span className="bg-[#FFFBEB] text-[#B45309] border border-[#FDE68A] px-2.5 py-1 rounded-lg text-xs font-bold inline-flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" /> Service Manager</span>;
      default:
        return <span className="bg-[#F8FAFC] text-[#475569] border border-[#E2E8F0] px-2.5 py-1 rounded-lg text-xs font-bold inline-flex items-center gap-1.5">{roleName}</span>;
    }
  };

  const getStatusBadge = (status) => {
    if (status === 'Active') {
      return <span className="bg-[#ECFDF5] text-[#047857] px-2 py-0.5 rounded-full text-[11px] font-bold inline-flex items-center gap-1"><div className="w-1.5 h-1.5 bg-[#10B981] rounded-full"></div> Active</span>;
    }
    return <span className="bg-[#F1F5F9] text-[#64748B] px-2 py-0.5 rounded-full text-[11px] font-bold inline-flex items-center gap-1"><div className="w-1.5 h-1.5 bg-[#94A3B8] rounded-full"></div> Offline</span>;
  };

  const modules = [
    { id: 'dashboard', label: 'Admin Dashboard' },
    { id: 'requests', label: 'Service Requests' },
    { id: 'customers', label: 'Customer Database' },
    { id: 'rooms', label: 'Rooms & Equipment' },
    { id: 'technicians', label: 'Technician Roster' },
    { id: 'installations', label: 'Onsite Installations' },
    { id: 'inventory', label: 'Spare Parts Stock' },
    { id: 'demos', label: 'Demo Management' },
    { id: 'calendar', label: 'Service Calendar (Dispatch)' },
    { id: 'history', label: 'Service History' },
    { id: 'reports', label: 'Reports & Analytics' },
    { id: 'settings', label: 'System Settings' },
    { id: 'staff', label: 'Admin Roles Management' },
  ];

  const openEditModal = (admin) => {
    setModalMode('edit');
    setEditAdminId(admin.id);
    setNewStaffName(admin.name);
    setNewStaffEmail(admin.email);
    setNewStaffRole(admin.role);
    setIsInviteModalOpen(true);
  };

  const openInviteModal = () => {
    setModalMode('invite');
    setEditAdminId(null);
    setNewStaffName('');
    setNewStaffEmail('');
    setNewStaffRole('Dispatcher');
    setIsInviteModalOpen(true);
  };

  const handleInviteStaff = (e) => {
    e.preventDefault();
    if (!newStaffName || !newStaffEmail) return;

    if (modalMode === 'edit' && editAdminId) {
      setStaff(staff.map(s => s.id === editAdminId ? {
        ...s,
        name: newStaffName,
        email: newStaffEmail,
        role: newStaffRole,
      } : s));
    } else {
      const newStaffMember = {
        id: `STAFF-00${staff.length + 1}`,
        name: newStaffName,
        email: newStaffEmail,
        role: newStaffRole,
        status: 'Offline',
        lastActive: 'Never',
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(newStaffName)}&background=004898&color=fff`
      };
      setStaff([newStaffMember, ...staff]);
    }

    setIsInviteModalOpen(false);
    setNewStaffName('');
    setNewStaffEmail('');
  };

  const removeStaff = (id) => {
    setStaff(staff.filter(s => s.id !== id));
  };

  const togglePermission = (roleName, moduleId) => {
    if (roleName === 'Super Admin') return; // Cannot modify Super Admin
    
    setRolePermissions(prev => ({
      ...prev,
      [roleName]: {
        ...prev[roleName],
        [moduleId]: !prev[roleName][moduleId]
      }
    }));
  };

  const handleExport = () => {
    // Define headers
    const headers = ['ID', 'Name', 'Email', 'Role', 'Status', 'Last Active'];
    
    // Map staff data to CSV rows
    const csvRows = staff.map(user => {
      return [
        user.id,
        `"${user.name}"`, // Quote strings to handle commas in names
        `"${user.email}"`,
        `"${user.role}"`,
        user.status,
        `"${user.lastActive}"`
      ].join(',');
    });
    
    // Combine headers and rows
    const csvContent = [headers.join(','), ...csvRows].join('\n');
    
    // Create Blob and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'admin_roster_export.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setIsExportMenuOpen(false);
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
            Manage internal dashboard admin users, assign roles, and configure access permissions.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <button 
              className="btn btn-secondary flex items-center gap-2"
              onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
            >
              <Download className="w-4 h-4 text-[#004898]" />
              Export
              <ChevronDown className="w-4 h-4 text-[#667085]" />
            </button>

            {isExportMenuOpen && (
              <>
                <div 
                  className="fixed inset-0 z-10" 
                  onClick={() => setIsExportMenuOpen(false)}
                />
                <div className="absolute right-0 mt-2 w-48 bg-white border border-[#E4E7EC] rounded-xl shadow-lg z-20 py-2">
                  <button 
                    className="w-full text-left px-4 py-2 text-sm text-[#172033] hover:bg-[#F8FAFC] flex items-center gap-2 transition-colors"
                    onClick={() => {
                      alert('PDF export requires additional libraries. Please use CSV for now.');
                      setIsExportMenuOpen(false);
                    }}
                  >
                    <FileText className="w-4 h-4 text-[#F04438]" />
                    Export as PDF
                  </button>
                  <button 
                    className="w-full text-left px-4 py-2 text-sm text-[#172033] hover:bg-[#F8FAFC] flex items-center gap-2 transition-colors"
                    onClick={() => {
                      alert('Excel export requires additional libraries. Please use CSV for now.');
                      setIsExportMenuOpen(false);
                    }}
                  >
                    <FileSpreadsheet className="w-4 h-4 text-[#12B76A]" />
                    Export as Excel
                  </button>
                  <button 
                    className="w-full text-left px-4 py-2 text-sm text-[#172033] hover:bg-[#F8FAFC] flex items-center gap-2 transition-colors"
                    onClick={handleExport}
                  >
                    <FileText className="w-4 h-4 text-[#475467]" />
                    Export as CSV
                  </button>
                  <button 
                    className="w-full text-left px-4 py-2 text-sm text-[#172033] hover:bg-[#F8FAFC] flex items-center gap-2 transition-colors"
                    onClick={() => {
                      alert('DOC export requires additional libraries. Please use CSV for now.');
                      setIsExportMenuOpen(false);
                    }}
                  >
                    <FileIcon className="w-4 h-4 text-[#004898]" />
                    Export as DOC
                  </button>
                </div>
              </>
            )}
          </div>
          <button className="btn btn-primary" onClick={openInviteModal}>
            <Plus className="w-4 h-4" />
            Invite Admin
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-[#E4E7EC] mb-6">
        <button 
          onClick={() => setActiveTab('staff')}
          className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors ${
            activeTab === 'staff' 
              ? 'text-[#004898] border-[#004898]' 
              : 'text-[#667085] border-transparent hover:text-[#172033]'
          }`}
        >
          Admin Roster
        </button>
        <button
          onClick={() => setActiveTab('roles')}
          className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors ${
            activeTab === 'roles'
              ? 'border-[#004898] text-[#004898]'
              : 'border-transparent text-[#667085] hover:text-[#172033]'
          }`}
        >
          Role Permissions Matrix
        </button>
      </div>

      {activeTab === 'staff' && (
        <div className="bg-white border border-[#E4E7EC] rounded-2xl shadow-sm flex flex-col overflow-hidden min-h-0">
          {/* Table Toolbar */}
          <div className="p-4 border-b border-[#F2F4F7] flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-[#98A2B3] absolute left-3.5 top-3" />
              <input
                type="text"
                placeholder="Search admin by name or role..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-[#E4E7EC] rounded-xl text-sm focus:outline-none focus:border-[#004898] transition-colors"
              />
            </div>
            <div className="flex items-center gap-2 text-sm font-semibold text-[#475467]">
              <span className="w-2 h-2 rounded-full bg-[#12B76A]"></span>
              {filteredStaff.length} Admins Found
            </div>
          </div>

          {/* Users Table */}
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-[#F8FAFC] sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="px-6 py-4 text-[11px] font-extrabold text-[#475467] uppercase tracking-wider border-b border-[#E4E7EC]">Admin User</th>
                  <th className="px-6 py-4 text-[11px] font-extrabold text-[#475467] uppercase tracking-wider border-b border-[#E4E7EC]">Assigned Role</th>
                  <th className="px-6 py-4 text-[11px] font-extrabold text-[#475467] uppercase tracking-wider border-b border-[#E4E7EC]">Status</th>
                  <th className="px-6 py-4 text-[11px] font-extrabold text-[#475467] uppercase tracking-wider border-b border-[#E4E7EC]">Last Active</th>
                  <th className="px-6 py-4 text-[11px] font-extrabold text-[#475467] uppercase tracking-wider border-b border-[#E4E7EC] text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F2F4F7] bg-white">
                {filteredStaff.map((user) => (
                  <tr key={user.id} className="hover:bg-[#F8FAFC] transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <img 
                          src={user.avatar} 
                          alt={user.name} 
                          className="w-10 h-10 rounded-full object-cover border border-[#E4E7EC]"
                        />
                        <div>
                          <div className="text-sm font-bold text-[#172033]">{user.name}</div>
                          <div className="text-xs text-[#667085]">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {getRoleBadge(user.role)}
                    </td>
                    <td className="px-6 py-4">
                      {getStatusBadge(user.status)}
                    </td>
                    <td className="px-6 py-4 text-sm text-[#475467] font-medium">
                      {user.lastActive}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => openEditModal(user)}
                          className="p-1.5 text-[#667085] hover:text-[#004898] hover:bg-[#EFF5FC] rounded-md transition-colors" 
                          title="Edit User"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => removeStaff(user.id)}
                          className="p-1.5 text-[#667085] hover:text-[#F04438] hover:bg-[#FEF3F2] rounded-md transition-colors" 
                          title="Remove User"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                
                {filteredStaff.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-[#667085]">
                      No staff members found matching your search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'roles' && (
        <div className="bg-white border border-[#E4E7EC] rounded-2xl shadow-sm flex flex-col overflow-hidden min-h-0">
          <div className="p-6 border-b border-[#F2F4F7] bg-[#F8FAFC]">
            <h3 className="text-base font-extrabold text-[#172033]">Role Permissions Matrix</h3>
            <p className="text-xs text-[#667085] mt-1">Review what each pre-defined role is allowed to access within the dashboard.</p>
          </div>
          
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-white sticky top-0 z-10 shadow-sm border-b border-[#E4E7EC]">
                <tr>
                  <th className="px-6 py-4 text-[11px] font-extrabold text-[#475467] uppercase tracking-wider bg-white w-1/3">Module / Feature</th>
                  <th className="px-6 py-4 text-center">
                    <div className="flex flex-col items-center gap-1">
                      {getRoleBadge('Super Admin')}
                    </div>
                  </th>
                  <th className="px-6 py-4 text-center">
                    <div className="flex flex-col items-center gap-1">
                      {getRoleBadge('Service Manager')}
                    </div>
                  </th>
                  <th className="px-6 py-4 text-center">
                    <div className="flex flex-col items-center gap-1">
                      {getRoleBadge('Dispatcher')}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F2F4F7] bg-white">
                {modules.map((mod, idx) => (
                  <tr key={idx} className="hover:bg-[#F8FAFC] transition-colors">
                    <td className="px-6 py-4 text-sm font-bold text-[#172033] bg-white">
                      {mod.label}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex justify-center cursor-not-allowed opacity-75" title="Super Admin permissions cannot be changed">
                         <button className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors bg-[#12B76A]`}>
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform translate-x-6`} />
                         </button>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex justify-center">
                         <button 
                           onClick={() => togglePermission('Service Manager', mod.id)}
                           className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none ${rolePermissions['Service Manager'][mod.id] ? 'bg-[#12B76A]' : 'bg-[#E4E7EC]'}`}
                         >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${rolePermissions['Service Manager'][mod.id] ? 'translate-x-6' : 'translate-x-1'}`} />
                         </button>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex justify-center">
                         <button 
                           onClick={() => togglePermission('Dispatcher', mod.id)}
                           className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none ${rolePermissions['Dispatcher'][mod.id] ? 'bg-[#12B76A]' : 'bg-[#E4E7EC]'}`}
                         >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${rolePermissions['Dispatcher'][mod.id] ? 'translate-x-6' : 'translate-x-1'}`} />
                         </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Invite Staff Modal */}
      {isInviteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#172033]/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-[#F2F4F7] flex items-center justify-between">
              <div>
                <h2 className="text-xl font-extrabold text-[#172033]">
                  {modalMode === 'edit' ? 'Edit Admin User' : 'Invite Admin User'}
                </h2>
                <p className="text-sm text-[#667085] mt-1">
                  {modalMode === 'edit' ? 'Update details for this admin user.' : 'Add a new admin to the internal dashboard.'}
                </p>
              </div>
              <button 
                onClick={() => setIsInviteModalOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-[#667085] hover:bg-[#F2F4F7] transition-colors"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleInviteStaff} className="p-6 flex-1 overflow-auto">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[#344054] mb-1.5">Full Name</label>
                  <input
                    type="text"
                    required
                    value={newStaffName}
                    onChange={(e) => setNewStaffName(e.target.value)}
                    className="w-full bg-[#F8FAFC] border border-[#E4E7EC] text-sm text-[#172033] rounded-xl px-4 py-3 focus:outline-none focus:border-[#004898] transition-colors placeholder:text-[#98A2B3]"
                    placeholder="e.g. John Doe"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#344054] mb-1.5">Email Address</label>
                  <input
                    type="email"
                    required
                    value={newStaffEmail}
                    onChange={(e) => setNewStaffEmail(e.target.value)}
                    className="w-full bg-[#F8FAFC] border border-[#E4E7EC] text-sm text-[#172033] rounded-xl px-4 py-3 focus:outline-none focus:border-[#004898] transition-colors placeholder:text-[#98A2B3]"
                    placeholder="e.g. john@tasktel-av.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#344054] mb-1.5">Assign Role</label>
                  <select
                    value={newStaffRole}
                    onChange={(e) => setNewStaffRole(e.target.value)}
                    className="w-full bg-[#F8FAFC] border border-[#E4E7EC] text-sm text-[#172033] rounded-xl px-4 py-3 focus:outline-none focus:border-[#004898] transition-colors"
                  >
                    <option value="Dispatcher">Dispatcher (Limited Access)</option>
                    <option value="Service Manager">Service Manager (Elevated Access)</option>
                    <option value="Super Admin">Super Admin (Full Access)</option>
                  </select>
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-[#F2F4F7] flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsInviteModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl border border-[#D0D5DD] text-[#344054] font-bold text-sm hover:bg-[#F8FAFC] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-[#004898] text-white font-bold text-sm hover:bg-[#00346E] transition-colors"
                >
                  {modalMode === 'edit' ? 'Save Changes' : 'Send Invite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
