// Sales & Back-Office Roles V1 — Sales' own "My Dashboard" (plan §6). Mirrors
// TechDashboard's header + AttendanceBanner pattern, minus every
// ticket/project section: Sales never touches tickets or projects at all, so
// this page reads nothing from AppContext beyond identity/navigation — the
// same isolation AttendanceBanner itself already guarantees.
//
// Lead summary cards (Open Leads / Won / Overdue) come
// from /api/sales-leads/mine/summary, or — while a Super Admin is viewing as
// this employee — the read-only /view-as/:id/summary. In that mode the
// AttendanceBanner is not rendered: check-in/out acts as the employee and
// needs their own JWT.
import React, { useCallback, useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Briefcase, Trophy, AlarmClock } from 'lucide-react';
import { AttendanceBanner } from './AttendanceBanner';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { LeadStatCard, LeadStatGrid } from '../sales/LeadStatCards';
import { fetchMySummary, fetchViewAsSummary, subscribeToLeadEvents } from '../../services/leadsApiService';

export const SalesDashboard = () => {
  const { currentUser, isViewingAsSales, setActivePage } = useApp();
  const [summary, setSummary] = useState(null);

  const load = useCallback(async () => {
    try {
      setSummary(isViewingAsSales ? await fetchViewAsSummary(currentUser.id) : await fetchMySummary());
    } catch (err) {
      // Isolated: the cards keep their last value; attendance is unaffected.
      console.warn('Lead summary unavailable:', err);
    }
  }, [isViewingAsSales, currentUser?.id]);

  useEffect(() => {
    load();
    const source = subscribeToLeadEvents(() => load());
    const poll = setInterval(load, 30000);
    return () => { source?.close(); clearInterval(poll); };
  }, [load]);

  const goToLeads = () => setActivePage('my-leads');

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
      {!isViewingAsSales && (
        <ErrorBoundary>
          <AttendanceBanner />
        </ErrorBoundary>
      )}

      <ErrorBoundary>
        <LeadStatGrid>
          <LeadStatCard label="Open Leads" icon={Briefcase} tone="blue" stat={summary?.taken} hint={summary?.dueToday ? `${summary.dueToday} follow-up${summary.dueToday === 1 ? '' : 's'} due today` : 'Assigned to you and still in the pipeline'} onClick={goToLeads} />
          <LeadStatCard label="Won" icon={Trophy} tone="green" stat={summary?.won} onClick={goToLeads} />
          <LeadStatCard
            label="Overdue"
            icon={AlarmClock}
            tone={summary?.overdue?.count ? 'red' : 'amber'}
            stat={summary?.overdue}
            hint={summary?.dueSoon?.count ? `${summary.dueSoon.count} more due within 24 hours` : 'Past their stage deadline'}
            onClick={goToLeads}
          />
        </LeadStatGrid>
      </ErrorBoundary>
    </div>
  );
};
