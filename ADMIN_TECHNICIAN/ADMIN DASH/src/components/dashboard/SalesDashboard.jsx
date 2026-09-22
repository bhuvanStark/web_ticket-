// Sales & Back-Office Roles V1 — Sales' own "My Dashboard" (plan §6: basic
// dashboard shell only — Attendance Check-In/Check-Out/current state, rest
// left empty for future Sales features). Mirrors TechDashboard's header +
// AttendanceBanner pattern, minus every ticket/project section: Sales never
// touches tickets or projects at all, so this page reads nothing from
// AppContext except currentUser and showToast — the same isolation
// AttendanceBanner itself already guarantees.
import React from 'react';
import { useApp } from '../../context/AppContext';
import { Sparkles } from 'lucide-react';
import { AttendanceBanner } from './AttendanceBanner';
import { ErrorBoundary } from '../common/ErrorBoundary';

export const SalesDashboard = () => {
  const { currentUser } = useApp();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-extrabold text-[#172033] tracking-tight">My Dashboard</h2>
        <p className="text-xs md:text-sm text-[#667085] mt-0.5">
          Welcome back, <strong className="text-[#004898]">{currentUser.name}</strong>.
        </p>
      </div>

      {/* Own ErrorBoundary so a render failure here can't take anything
          else down with it — same pattern as TechDashboard. */}
      <ErrorBoundary>
        <AttendanceBanner />
      </ErrorBoundary>

      <div className="bg-white rounded-2xl p-8 border border-[#E4E7EC] shadow-sm text-center">
        <Sparkles className="w-8 h-8 text-[#B3D1F2] mx-auto mb-3" />
        <p className="text-sm font-semibold text-[#172033]">More Sales features are coming soon.</p>
        <p className="text-xs text-[#667085] mt-1">For now, this dashboard covers your daily attendance.</p>
      </div>
    </div>
  );
};
