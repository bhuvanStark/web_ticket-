// Sales & Back-Office Roles V1 — Back-Office's own "My Dashboard" (plan §7:
// basic dashboard shell only — Attendance Check-In/Check-Out/current state,
// no Ticket/Project technician functionality). Identical shape to
// SalesDashboard.jsx; kept as a separate component rather than
// parameterizing one over both roles, matching this codebase's existing
// precedent of small per-role dashboard components (AdminDashboard vs
// TechDashboard) over a generic one.
import React from 'react';
import { useApp } from '../../context/AppContext';
import { Sparkles } from 'lucide-react';
import { AttendanceBanner } from './AttendanceBanner';
import { ErrorBoundary } from '../common/ErrorBoundary';

export const BackOfficeDashboard = () => {
  const { currentUser } = useApp();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-extrabold text-[#172033] tracking-tight">My Dashboard</h2>
        <p className="text-xs md:text-sm text-[#667085] mt-0.5">
          Welcome back, <strong className="text-[#004898]">{currentUser.name}</strong>.
        </p>
      </div>

      <ErrorBoundary>
        <AttendanceBanner />
      </ErrorBoundary>

      <div className="bg-white rounded-2xl p-8 border border-[#E4E7EC] shadow-sm text-center">
        <Sparkles className="w-8 h-8 text-[#B3D1F2] mx-auto mb-3" />
        <p className="text-sm font-semibold text-[#172033]">More Back-Office features are coming soon.</p>
        <p className="text-xs text-[#667085] mt-1">For now, this dashboard covers your daily attendance.</p>
      </div>
    </div>
  );
};
