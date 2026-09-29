// Admin → Sales → Analytics. Needs Attention, overall conversion rate and
// the Sales leaderboard. Self-contained like AdminLeadsTab (own fetch,
// realtime refresh + poll fallback); every number is computed server-side
// by leadService.getAnalytics — this file only formats it.
//
// Conversion rate = Won ÷ (Won + Lost), over leads closed in the selected
// period (India time; weeks start Monday). Open leads are undecided and Dead
// is an Admin disqualification, so neither counts. Leaderboard order: Won ₹,
// then conversion rate, then Won count.
import React, { useCallback, useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { AlertTriangle, Target, Clock3, Inbox, ChevronDown, ChevronUp, Trophy } from 'lucide-react';
import { fetchLeadsAnalytics, subscribeToLeadEvents } from '../../services/leadsApiService';
import { LeadStatCard } from './LeadStatCards';
import { formatInr } from './leadFormat';
import { TableSkeleton } from '../common/SkeletonLoader';

const PERIODS = [
  { id: 'all', label: 'All Time' },
  { id: 'month', label: 'This Month' },
  { id: 'week', label: 'This Week' }
];

const pct = (rate) => (rate == null ? '—' : `${Math.round(rate * 1000) / 10}%`);

const timeLeft = (iso) => {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'any moment';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const daysAgo = (iso) => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return `${d} day${d === 1 ? '' : 's'} ago`;
};

const AttentionGroup = ({ icon: Icon, title, group, renderMeta }) => {
  const [open, setOpen] = useState(false);
  const hasItems = group.items.length > 0;
  return (
    <div className="border border-[#E4E7EC] rounded-xl">
      <button
        onClick={() => hasItems && setOpen((o) => !o)}
        className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-left ${hasItems ? 'cursor-pointer hover:bg-[#F8FAFC]' : 'cursor-default'} rounded-xl`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="w-4 h-4 text-[#B54708] shrink-0" />
          <span className="text-sm font-bold text-[#172033]">{title}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-sm font-extrabold text-[#B54708]">{group.count}</span>
          <span className="text-xs font-bold text-[#344054]">{formatInr(group.value)}</span>
          {hasItems && (open ? <ChevronUp className="w-4 h-4 text-[#667085]" /> : <ChevronDown className="w-4 h-4 text-[#667085]" />)}
        </div>
      </button>
      {open && (
        <div className="border-t border-[#E4E7EC] divide-y divide-[#F2F4F7] max-h-64 overflow-y-auto">
          {group.items.map((item) => (
            <div key={item.id} className="px-4 py-2 flex items-center justify-between gap-3 text-xs">
              <div className="min-w-0">
                <div className="font-bold text-[#172033] truncate">{item.company}</div>
                <div className="text-[#667085]">{renderMeta(item)}</div>
              </div>
              <span className="font-semibold text-[#344054] shrink-0">{item.value_estimate == null ? '—' : formatInr(item.value_estimate)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const MEDALS = {
  1: { emoji: '🥇', ring: 'border-[#F5C542]', bg: 'bg-gradient-to-b from-[#FFF8E1] to-white', label: 'text-[#9A6B00]', height: 'sm:pt-8' },
  2: { emoji: '🥈', ring: 'border-[#C0C7D1]', bg: 'bg-gradient-to-b from-[#F4F6F9] to-white', label: 'text-[#475467]', height: 'sm:pt-5' },
  3: { emoji: '🥉', ring: 'border-[#D9A273]', bg: 'bg-gradient-to-b from-[#FDF1E7] to-white', label: 'text-[#9C5A24]', height: 'sm:pt-3' }
};

const PodiumCard = ({ entry }) => {
  const m = MEDALS[entry.rank];
  return (
    <div className={`rounded-2xl border-2 ${m.ring} ${m.bg} p-5 ${m.height} text-center shadow-sm ${entry.rank === 1 ? 'sm:-mt-4' : ''}`}>
      <div className="text-4xl leading-none mb-2" aria-label={`Rank ${entry.rank}`}>{m.emoji}</div>
      <div className="text-base font-extrabold text-[#172033] truncate">{entry.name}</div>
      {entry.location && <div className="text-[11px] text-[#667085]">{entry.location}</div>}
      <div className={`text-2xl font-extrabold mt-3 ${m.label}`}>{formatInr(entry.wonValue)}</div>
      <div className="text-[11px] font-semibold text-[#667085] uppercase tracking-wider">Won value</div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-white/80 border border-[#E4E7EC] py-1.5">
          <div className="font-extrabold text-[#172033]">{pct(entry.conversionRate)}</div>
          <div className="text-[10px] text-[#667085]">Conversion</div>
        </div>
        <div className="rounded-lg bg-white/80 border border-[#E4E7EC] py-1.5">
          <div className="font-extrabold text-[#172033]">{entry.wonCount}</div>
          <div className="text-[10px] text-[#667085]">Won</div>
        </div>
      </div>
    </div>
  );
};

export const AdminLeadsAnalyticsTab = () => {
  const { showToast } = useApp();
  const [period, setPeriod] = useState('all');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setData(await fetchLeadsAnalytics(period));
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [period, showToast]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  useEffect(() => {
    const source = subscribeToLeadEvents(() => load());
    const poll = setInterval(load, 30000);
    return () => { source?.close(); clearInterval(poll); };
  }, [load]);

  if (loading && !data) return <TableSkeleton rows={4} />;
  if (!data) return <div className="p-8 text-center text-sm text-[#667085]">Analytics are unavailable right now.</div>;

  const { needsAttention, overall, leaderboard } = data;
  const attentionCount = needsAttention.returningSoon.count + needsAttention.stalePool.count;
  const attentionValue = needsAttention.returningSoon.value + needsAttention.stalePool.value;
  const closedCount = overall.wonCount + overall.lostCount;
  // Only people with at least one closed lead in the period make the podium;
  // a podium of zeros says nothing. Everyone else is listed below.
  const podium = leaderboard.filter((e) => e.wonCount + e.lostCount > 0).slice(0, 3);
  const podiumIds = new Set(podium.map((e) => e.salesId));
  const rest = leaderboard.filter((e) => !podiumIds.has(e.salesId));
  const periodLabel = PERIODS.find((p) => p.id === period)?.label;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-[#172033] tracking-tight">Sales Analytics</h2>
          <p className="text-xs text-[#667085] mt-0.5">Conversion and leaderboard reflect leads closed in the selected period (India time).</p>
        </div>
        <div className="inline-flex bg-white border border-[#E4E7EC] rounded-lg p-1 self-start">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${period === p.id ? 'bg-[#004898] text-white shadow-xs' : 'text-[#667085] hover:text-[#172033]'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5 border-l-4 border-l-[#F79009] space-y-3">
          <div className="flex items-center justify-between text-[#667085]">
            <span className="text-xs font-bold uppercase tracking-wider">Needs Attention</span>
            <div className="p-2 rounded-lg bg-[#FEF0C7] text-[#B54708]"><AlertTriangle className="w-5 h-5" /></div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-[#B54708]">{attentionCount}</span>
            <span className="text-sm font-bold text-[#344054]">{formatInr(attentionValue)}</span>
          </div>
          <p className="text-[11px] text-[#667085]">Current state — not affected by the period filter.</p>
          <AttentionGroup
            icon={Clock3}
            title="Returning to pool within 24h"
            group={needsAttention.returningSoon}
            renderMeta={(i) => `${i.assigned_name || 'Unknown'} · returns in ${timeLeft(i.releases_at)}`}
          />
          <AttentionGroup
            icon={Inbox}
            title={`Pool leads untouched ${needsAttention.stalePool.days}+ days`}
            group={needsAttention.stalePool}
            renderMeta={(i) => `Last activity ${daysAgo(i.last_activity_at)}`}
          />
        </div>

        <LeadStatCard label="Overall Conversion Rate" icon={Target} tone="green">
          <div className="text-3xl font-extrabold text-[#027A48]">{pct(overall.conversionRate)}</div>
          <p className="text-xs text-[#344054] mt-1">
            <strong>{overall.wonCount}</strong> won of <strong>{closedCount}</strong> closed · {formatInr(overall.wonValue)} won
          </p>
          <p className="text-[11px] text-[#667085] mt-3 leading-relaxed">
            Won ÷ (Won + Lost) for leads closed {period === 'all' ? 'to date' : period === 'month' ? 'this month' : 'this week'}.
            Open leads (New, Meeting, Proposal, Follow-up) and Dead leads are not counted.
          </p>
        </LeadStatCard>
      </div>

      <div className="card p-5 space-y-5">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-[#F5A300]" />
          <h3 className="text-base font-extrabold text-[#172033]">Leaderboard · {periodLabel}</h3>
          <span className="text-[11px] text-[#667085] ml-auto hidden sm:inline">Ranked by Won ₹ → Conversion → Won count</span>
        </div>

        {podium.length === 0 ? (
          <p className="text-sm text-center text-[#667085] py-6">No leads were won or lost {period === 'all' ? 'yet' : period === 'month' ? 'this month' : 'this week'}.</p>
        ) : (
          // Classic podium order on wider screens (2 · 1 · 3); rank order when stacked.
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:items-end">
            {[podium[1], podium[0], podium[2]].map((entry, i) => (
              entry ? (
                <div key={entry.salesId} className={entry.rank === 1 ? 'order-first sm:order-none' : entry.rank === 2 ? 'order-2 sm:order-none' : 'order-3 sm:order-none'}>
                  <PodiumCard entry={entry} />
                </div>
              ) : <div key={`empty-${i}`} className="hidden sm:block" />
            ))}
          </div>
        )}

        {rest.length > 0 && (
          <div className="overflow-x-auto border border-[#E4E7EC] rounded-xl">
            <table className="w-full text-xs text-left border-collapse bg-white">
              <thead className="bg-[#F8FAFC] text-[#667085] uppercase font-bold text-[10px] tracking-wider border-b border-[#E4E7EC]">
                <tr>
                  <th className="px-4 py-3">Rank</th>
                  <th className="px-4 py-3">Salesperson</th>
                  <th className="px-4 py-3 text-right">Won ₹</th>
                  <th className="px-4 py-3 text-right">Conversion</th>
                  <th className="px-4 py-3 text-right">Won</th>
                  <th className="px-4 py-3 text-right">Lost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F2F4F7]">
                {rest.map((e) => (
                  <tr key={e.salesId} className="hover:bg-[#F8FAFC]">
                    <td className="px-4 py-3 font-bold text-[#667085]">#{e.rank}</td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-[#172033]">{e.name}</div>
                      {e.location && <div className="text-[11px] text-[#667085]">{e.location}</div>}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-[#344054]">{formatInr(e.wonValue)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-[#344054]">{pct(e.conversionRate)}</td>
                    <td className="px-4 py-3 text-right text-[#475467]">{e.wonCount}</td>
                    <td className="px-4 py-3 text-right text-[#475467]">{e.lostCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
