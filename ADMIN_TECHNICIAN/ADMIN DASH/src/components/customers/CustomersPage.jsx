import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Search, Building2, MapPin, Tv, Eye, ChevronRight, Plus, ShieldCheck, Download, Trash2, AlertTriangle } from 'lucide-react';
import { TableSkeleton } from '../common/SkeletonLoader';
import { NewCustomerModal } from './NewCustomerModal';
import unifiedClient from '../../api/unifiedClient';

export const CustomersPage = () => {
  const { customers, setCustomers, setSelectedCustomerId, deleteCustomer, simulatedLoading, showToast } = useApp();
  const [search, setSearch] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  // Deleting a customer removes their locations and team members too, so it
  // goes through a confirmation step.
  const [pendingDelete, setPendingDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const confirmDelete = async () => {
    if (!pendingDelete || isDeleting) return;
    setIsDeleting(true);
    const ok = await deleteCustomer(pendingDelete.id);
    setIsDeleting(false);
    // Keep the dialog open on failure (e.g. the customer still has tickets)
    // so the toast explains why against the row in question.
    if (ok) setPendingDelete(null);
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const { filename } = await unifiedClient.downloadCsv('customers');
      showToast?.(`Downloaded ${filename}`, 'success');
    } catch (err) {
      showToast?.(err?.message || 'Export failed', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  if (simulatedLoading) return <TableSkeleton rows={4} />;

  const handleAddCustomer = (newCustomer) => {
    setCustomers(prev => [newCustomer, ...prev]);
  };

  const filtered = (customers || []).filter(c =>
    (c.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.industry || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.contactPerson || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-[#172033] tracking-tight">Enterprise Customers</h2>
          <p className="text-xs md:text-sm text-[#667085] mt-0.5">
            Manage corporate client accounts, key contacts, SLA contract tiers, and facility rooms.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="btn btn-secondary shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            <span>{isExporting ? 'Exporting…' : 'Export CSV'}</span>
          </button>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="btn btn-primary shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Customer</span>
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="card p-4 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-[#98A2B3] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
          <input
            type="text"
            placeholder="Search company, industry or contact person..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: '40px' }}
            className="form-input text-xs"
          />
        </div>

        <div className="text-xs font-bold text-[#004898] bg-[#EFF5FC] px-3 py-1.5 rounded-lg border border-[#B3D1F2]">
          Total Corporate Accounts: {filtered.length}
        </div>
      </div>

      {/* Customers Table */}
      <div className="card overflow-hidden border border-[#E4E7EC] shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-[#F8FAFC] text-[#667085] uppercase font-bold text-[10px] tracking-wider border-b border-[#E4E7EC]">
              <tr>
                <th className="px-4 py-3 w-[35%]">Company Profile</th>
                <th className="px-4 py-3 w-[20%]">Coverage</th>
                <th className="px-4 py-3 w-[15%]">Active Tickets</th>
                <th className="px-4 py-3 w-[20%]">SLA Contract Status</th>
                <th className="px-4 py-3 w-[10%] text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E7EC] bg-white">
              {filtered.map((c) => {
                const isPlatinum = (c.status || c.sla_tier || '').toLowerCase().includes('platinum');
                return (
                  <tr key={c.id} className="hover:bg-[#F8FAFC] transition-all">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <img 
                          src={c.avatar || "https://images.unsplash.com/photo-1560179707-f14e90ef3623?w=150&auto=format&fit=crop&q=80"} 
                          alt={c.name} 
                          className="w-10 h-10 rounded-xl object-cover border border-[#D0D5DD] shadow-2xs" 
                        />
                        <div className="flex flex-col gap-1">
                          <button
                            onClick={() => setSelectedCustomerId(c.id)}
                            className="font-extrabold text-sm text-[#004898] hover:underline block text-left leading-tight"
                          >
                            {c.name}
                          </button>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-[#475467] font-semibold">{c.industry || 'Enterprise Technology'}</span>
                            <span className="text-[10px] text-[#98A2B3]">&bull;</span>
                            <span className="text-[11px] text-[#667085] font-medium">{c.contactPerson || 'Alex Rivera'}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-2.5">
                      <div className="flex flex-col gap-0.5 text-xs">
                        <span className="font-bold text-[#172033]">{c.locationsCount || 3} Locations</span>
                        <span className="font-medium text-[#475467]">{c.totalRooms || 26} Managed Rooms</span>
                      </div>
                    </td>

                    <td className="px-4 py-2.5">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold ${
                        (c.activeRequests || 0) > 0 
                          ? 'bg-[#FEF0C7] text-[#B45309]' 
                          : 'bg-[#ECFDF3] text-[#047857]'
                      }`}>
                        {c.activeRequests || 0} Active
                      </span>
                    </td>

                    <td className="px-4 py-2.5">
                      <span className={`inline-flex px-2.5 py-1 rounded-md text-[11px] font-bold border ${
                        isPlatinum 
                          ? 'bg-[#EFF5FC] text-[#004898] border-[#B3D1F2]' 
                          : 'bg-[#F0FDF4] text-[#15803D] border-[#BBF7D0]'
                      }`}>
                        {c.status || c.sla_tier || 'Active SLA'}
                      </span>
                    </td>

                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => setSelectedCustomerId(c.id)}
                        className="p-2 rounded-lg bg-[#EFF5FC] hover:bg-[#D1E4F9] text-[#004898] border border-[#B3D1F2] transition-all cursor-pointer shadow-2xs inline-flex items-center justify-center"
                        title="View Customer Profile"
                      >
                        <Eye className="w-4 h-4 text-[#004898]" />
                      </button>
                      <button
                        onClick={() => setPendingDelete(c)}
                        className="ml-2 p-2 rounded-lg bg-white hover:bg-[#FEF3F2] text-[#D92D20] border border-[#E4E7EC] hover:border-[#FDA29B] transition-all cursor-pointer shadow-2xs inline-flex items-center justify-center"
                        title="Delete Customer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Customer Modal */}
      {isAddModalOpen && (
        <NewCustomerModal
          onClose={() => setIsAddModalOpen(false)}
          onAddCustomer={handleAddCustomer}
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
                <h3 className="text-lg font-bold text-[#172033]">Delete customer</h3>
                <p className="mt-1 text-sm text-[#667085]">
                  This will permanently remove{' '}
                  <span className="font-semibold text-[#172033]">
                    {pendingDelete.company_name || pendingDelete.name || pendingDelete.email}
                  </span>
                  , along with their locations, rooms and team members. A customer
                  with existing service requests cannot be deleted. This cannot be undone.
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
