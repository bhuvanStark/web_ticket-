import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Search,
  Plus,
  Eye,
  Filter
} from 'lucide-react';
import { TableSkeleton } from '../common/SkeletonLoader';

export const RoomsEquipmentPage = () => {
  const {
    customers,
    equipment,
    setSelectedRoomId,
    setIsCreateTicketOpen,
    simulatedLoading
  } = useApp();

  const [selectedCustomerId, setSelectedCustomerId] = useState('ALL');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [search, setSearch] = useState('');

  if (simulatedLoading) return <TableSkeleton rows={5} />;

  // Filter equipment based on Global Search, Customer, and Category
  const filteredEquipment = (equipment || []).filter(eq => {
    const matchesCustomer = selectedCustomerId === 'ALL' || eq.customerId === selectedCustomerId || eq.customerName === (customers.find(c => c.id === selectedCustomerId)?.name);
    const matchesCat = selectedCategory === 'ALL' || eq.category === selectedCategory;
    const matchesSearch =
      (eq.brand || '').toLowerCase().includes(search.toLowerCase()) ||
      (eq.model || '').toLowerCase().includes(search.toLowerCase()) ||
      (eq.serialNumber || '').toLowerCase().includes(search.toLowerCase()) ||
      (eq.roomName || '').toLowerCase().includes(search.toLowerCase()) ||
      (eq.customerName || '').toLowerCase().includes(search.toLowerCase());

    return matchesCustomer && matchesCat && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-[#172033] tracking-tight">Global Asset Inventory</h2>
          <p className="text-xs md:text-sm text-[#667085] mt-0.5">
            Master roster of all registered AV equipment across all corporate facilities.
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="card p-4 bg-white flex flex-col md:flex-row md:items-center justify-between gap-4 border border-[#E4E7EC] shadow-xs">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-[#98A2B3] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
          <input
            type="text"
            placeholder="Search brand, model, serial, or room..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: '40px' }}
            className="form-input text-xs w-full"
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative w-full md:w-48">
            <Filter className="w-3.5 h-3.5 text-[#98A2B3] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              className="form-select text-xs font-semibold pl-8 pr-8 py-1.5 w-full appearance-none bg-white"
            >
              <option value="ALL">All Customers</option>
              {(customers || []).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="relative w-full md:w-48">
            <Filter className="w-3.5 h-3.5 text-[#98A2B3] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="form-select text-xs font-semibold pl-8 pr-8 py-1.5 w-full appearance-none bg-white"
            >
              <option value="ALL">All Categories</option>
              <option value="Display">Display</option>
              <option value="Video Conferencing">Video Conferencing</option>
              <option value="Audio">Audio</option>
              <option value="Room Control">Room Control</option>
            </select>
          </div>
        </div>
      </div>

      {/* Equipment Table */}
      <div className="card overflow-hidden border border-[#E4E7EC] shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse bg-white">
            <thead className="bg-[#F8FAFC] text-[#667085] uppercase font-bold text-[10px] tracking-wider border-b border-[#E4E7EC]">
              <tr>
                <th className="px-5 py-3 text-left w-[20%]">Brand & Model</th>
                <th className="px-5 py-3 text-left w-[12%]">Category</th>
                <th className="px-5 py-3 text-left w-[12%]">Serial Number</th>
                <th className="px-5 py-3 text-left w-[15%]">Installed Room</th>
                <th className="px-5 py-3 text-left w-[12%]">Install Date</th>
                <th className="px-5 py-3 text-left w-[15%]">Warranty Status</th>
                <th className="px-5 py-3 text-left w-[10%]">Health</th>
                <th className="px-5 py-3 text-right w-[4%]">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F2F4F7]">
              {filteredEquipment.length === 0 ? (
                <tr>
                  <td colSpan="8" className="p-8 text-center text-[#667085]">
                    No equipment matches the selected filters.
                  </td>
                </tr>
              ) : (
                filteredEquipment.map(eq => (
                  <tr key={eq.id} className="hover:bg-[#F8FAFC] transition-all">
                    <td className="px-5 py-2.5 whitespace-nowrap">
                      <div className="font-bold text-[#172033]">{eq.brand} {eq.model}</div>
                      <span className="text-[10px] font-semibold text-[#667085]">{eq.customerName}</span>
                    </td>

                    <td className="px-5 py-2.5 whitespace-nowrap">
                      <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-[#EFF5FC] text-[#004898] border border-[#B3D1F2]">
                        {eq.category}
                      </span>
                    </td>

                    <td className="px-5 py-2.5 whitespace-nowrap font-mono text-[11px] font-bold text-[#004898]">
                      {eq.serialNumber}
                    </td>

                    <td className="px-5 py-2.5 whitespace-nowrap font-bold text-[#172033]">
                      {eq.roomName}
                    </td>

                    <td className="px-5 py-2.5 whitespace-nowrap text-[#667085]">
                      {eq.installDate}
                    </td>

                    <td className="px-5 py-2.5 whitespace-nowrap font-bold text-[#027A48]">
                      {eq.warrantyExpiry}
                    </td>

                    <td className="px-5 py-2.5 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        eq.status === 'Operational' 
                          ? 'bg-[#ECFDF3] text-[#027A48]' 
                          : eq.status === 'Malfunctioning'
                            ? 'bg-[#FEF3F2] text-[#B42318]'
                            : 'bg-[#FEF0C7] text-[#B54708]'
                      }`}>
                        {eq.status}
                      </span>
                    </td>

                    <td className="px-5 py-2.5 whitespace-nowrap text-right">
                      <button
                        onClick={() => setSelectedRoomId(eq.roomId || eq.roomName)}
                        className="p-1.5 rounded-lg bg-[#EFF5FC] hover:bg-[#D1E4F9] text-[#004898] border border-[#B3D1F2] transition-all cursor-pointer shadow-2xs inline-flex items-center justify-center"
                        title="View Room Details"
                      >
                        <Eye className="w-3.5 h-3.5 text-[#004898]" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
