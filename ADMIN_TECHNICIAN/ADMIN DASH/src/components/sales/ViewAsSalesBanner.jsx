// Shown above every Sales page while a Super Admin is viewing as a Sales
// employee. Always visible (mobile has no Sidebar, so this is the exit
// there) and makes the read-only nature of the view explicit.
import React from 'react';
import { Eye, ArrowLeft } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const ViewAsSalesBanner = () => {
  const { isViewingAsSales, currentUser, switchRole } = useApp();
  if (!isViewingAsSales) return null;
  return (
    <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-[#B3D1F2] bg-[#EFF5FC] px-4 py-3">
      <div className="flex items-center gap-2 text-sm text-[#004898]">
        <Eye className="w-4 h-4 shrink-0" />
        <span>
          Viewing as <strong>{currentUser?.name || 'Sales employee'}</strong> — read-only. Actions are disabled.
        </span>
      </div>
      <button
        onClick={() => switchRole('admin')}
        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#B3D1F2] bg-white px-3 py-1.5 text-xs font-bold text-[#004898] hover:bg-[#F8FAFC] shrink-0"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Admin
      </button>
    </div>
  );
};
