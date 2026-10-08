// Admin → Sales → Analytics. Live pipeline (5 active stages, due <24h,
// overdue), Needs Attention, overall conversion rate and the Sales
// leaderboard. Self-contained like AdminLeadsTab (own fetch, realtime
// refresh + poll fallback); every number is computed server-side by
// leadService.getAnalytics — this file only formats it.
//
// The leaderboard is ranked by number of Won leads only (ties share a rank);
// value and conversion rate are not part of the ranking. Clicking a name
// opens that person's pipeline summary. The period filter (India time;
// weeks start Monday) applies to Won/Lost outcomes only — the pipeline is
// always "right now".
import React, { useCallback, useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { AlertTriangle, Target, Clock3, ChevronDown, ChevronUp, Trophy, AlarmClock } from 'lucide-react';
import { fetchLeadsAnalytics, subscribeToLeadEvents } from '../../services/leadsApiService';
import { LeadStatCard } from './LeadStatCards';
import { PipelineSummaryBar } from './PipelineSummaryBar';
import { formatInr } from './leadFormat';
import { STATUS_LABEL, timerLabel } from './leadPipeline';
import { TableSkeleton } from '../common/SkeletonLoader';
import { SalesModal, ModalHeader, ModalBody } from './SalesModal';

const PERIODS = [
  { id: 'all', label: 'All Time' },
  { id: 'month', label: 'This Month' },
  { id: 'week', label: 'This Week' }
];
const periodPhrase = (period) => (period === 'all' ? 'to date' : period === 'month' ? 'this month' : 'this week');

const pct = (rate) => (rate == null ? '—' : `${Math.round(rate * 1000) / 10}%`);
const openCount = (pipeline) => Object.values(pipeline || {}).reduce((n, s) => n + s.count, 0);
const overdueCount = (pipeline) => Object.values(pipeline || {}).reduce((n, s) => n + s.overdue, 0);

const AttentionGroup = ({ icon: Icon, title, tone, group }) => {
  const [open, setOpen] = useState(false);
  const hasItems = group.items.length > 0;
  return (
    <div className="border border-[#E4E7EC] rounded-xl">
      <button
        onClick={() => hasItems && setOpen((o) => !o)}
        className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-left ${hasItems ? 'cursor-pointer hover:bg-[#F8FAFC]' : 'cursor-default'} rounded-xl`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Icon className={`w-4 h-4 shrink-0 ${tone}`} />
          <span className="text-sm font-bold text-[#172033]">{title}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className={`text-sm font-extrabold ${tone}`}>{group.count}</span>
          {hasItems && (open ? <ChevronUp className="w-4 h-4 text-[#667085]" /> : <ChevronDown className="w-4 h-4 text-[#667085]" />)}
        </div>
      </button>
      {open && (
        <div className="border-t border-[#E4E7EC] divide-y divide-[#F2F4F7] max-h-64 overflow-y-auto">
          {group.items.map((item) => (
            <div key={item.id} className="px-4 py-2 flex items-center justify-between gap-3 text-xs">
              <div className="min-w-0">
                <div className="font-bold text-[#172033] truncate">{item.company}</div>
                <div className="text-[#667085]">{item.assigned_name || 'Unknown'} · {STATUS_LABEL[item.status]}</div>
              </div>
              <span className={`font-bold shrink-0 ${tone}`}>{timerLabel(new Date(item.deadline).getTime() - Date.now())}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const MEDALS = {
  1: { emoji: '🥇', ring: 'border-[#F5C542]', bg: 'bg-gradient-to-b from-[#FFF8E1] to-white', label: 'text-[#9A6B00]' },
  2: { emoji: '🥈', ring: 'border-[#C0C7D1]', bg: 'bg-gradient-to-b from-[#F4F6F9] to-white', label: 'text-[#475467]' },
  3: { emoji: '🥉', ring: 'border-[#D9A273]', bg: 'bg-gradient-to-b from-[#FDF1E7] to-white', label: 'text-[#9C5A24]' }
};

const NameButton = ({ entry, onOpen, className = '' }) => (
  <button onClick={() => onOpen(entry)} className={`font-extrabold text-[#172033] hover:text-[#004898] hover:underline truncate max-w-full ${className}`} title="View pipeline">
    {entry.name}
  </button>
);

const PodiumCard = ({ entry, onOpen }) => {
  const m = MEDALS[entry.rank] || MEDALS[3];
  return (
    <div className={`rounded-2xl border-2 ${m.ring} ${m.bg} p-3 sm:p-4 text-center shadow-sm min-w-0`}>
      <div className="text-3xl leading-none mb-2" aria-label={`Rank ${entry.rank}`}>{m.emoji}</div>
      <NameButton entry={entry} onOpen={onOpen} className="text-sm sm:text-base block mx-auto" />
      {entry.location && <div className="text-[11px] text-[#667085]">{entry.location}</div>}
      <div className={`text-3xl font-extrabold mt-2 ${m.label}`}>{entry.wonCount}</div>
      <div className="text-[11px] font-semibold text-[#667085] uppercase tracking-wider">Won</div>
      <div className="mt-2 text-[11px] text-[#667085]">{entry.lostCount} lost · {openCount(entry.pipeline)} open</div>
    </div>
  );
};

const SalespersonModal = ({ entry, period, onClose }) => (
  <SalesModal onClose={onClose} size="2xl" closeOnBackdrop>
      <ModalHeader title={entry.name} subtitle={[entry.location, `Rank #${entry.rank}`].filter(Boolean).join(' · ')} onClose={onClose} />
      <ModalBody className="space-y-4 pb-6">
        <div>
          <h4 className="text-xs font-bold text-[#667085] uppercase tracking-wider mb-2">Current pipeline</h4>
          <PipelineSummaryBar stages={entry.pipeline} closed={{ won: entry.wonCount, lost: entry.lostCount }} />
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg border border-[#E4E7EC] py-2"><div className="text-lg font-extrabold text-[#172033]">{openCount(entry.pipeline)}</div><div className="text-[11px] text-[#667085]">Open</div></div>
          <div className="rounded-lg border border-[#FECDCA] bg-[#FEF3F2] py-2"><div className="text-lg font-extrabold text-[#B42318]">{overdueCount(entry.pipeline)}</div><div className="text-[11px] text-[#B42318]">Overdue</div></div>
          <div className="rounded-lg border border-[#ABEFC6] bg-[#ECFDF3] py-2"><div className="text-lg font-extrabold text-[#027A48]">{entry.wonCount}</div><div className="text-[11px] text-[#027A48]">Won</div></div>
        </div>
        <p className="text-[11px] text-[#667085]">Stages show leads open right now. Won/Lost are for leads closed {periodPhrase(period)}.</p>
      </ModalBody>
  </SalesModal>
);

export const AdminLeadsAnalyticsTab = () => {
  const { showToast } = useApp();
  const [period, setPeriod] = useState('all');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [person, setPerson] = useState(null);

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

  const { pipeline, needsAttention, overall, leaderboard } = data;
  const closedCount = overall.wonCount + overall.lostCount;
  // Only people with at least one win make the podium; everyone else is
  // listed below in rank order.
  const podium = leaderboard.filter((e) => e.wonCount > 0).slice(0, 3);
  const podiumIds = new Set(podium.map((e) => e.salesId));
  const rest = leaderboard.filter((e) => !podiumIds.has(e.salesId));
  const periodLabel = PERIODS.find((p) => p.id === period)?.label;
  // Keep the selected person's numbers fresh across refreshes.
  const personEntry = person ? leaderboard.find((e) => e.salesId === person.salesId) || person : null;

  return (
    <div className="sales-module space-y-5 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-[#172033] tracking-tight">Sales Analytics</h2>
          <p className="text-xs text-[#667085] mt-0.5">Pipeline is live. Conversion and leaderboard reflect leads closed in the selected period (India time).</p>
        </div>
        <div className="grid grid-cols-3 sm:inline-flex bg-white border border-[#E4E7EC] rounded-lg p-1 sm:self-start">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={`px-3 py-2 sm:py-1.5 text-xs font-bold rounded-md transition-all whitespace-nowrap ${period === p.id ? 'bg-[#004898] text-white shadow-xs' : 'text-[#667085] hover:text-[#172033]'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-extrabold text-[#172033] w-full sm:w-auto sm:mr-auto">Pipeline now <span className="font-semibold text-[#667085]">· {pipeline.active} open</span></h3>
          <span className="inline-flex items-center gap-1 rounded-full bg-[#FFFAEB] border border-[#FEDF89] px-2.5 py-1 text-[11px] font-bold text-[#B54708]">
            <Clock3 className="w-3.5 h-3.5" /> {pipeline.dueSoon} due in &lt;24h
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-[#FEF3F2] border border-[#FECDCA] px-2.5 py-1 text-[11px] font-bold text-[#B42318]">
            <AlarmClock className="w-3.5 h-3.5" /> {pipeline.overdue} overdue
          </span>
        </div>
        <PipelineSummaryBar stages={pipeline.stages} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-4 sm:p-5 border-l-4 border-l-[#F79009] space-y-3">
          <div className="flex items-center justify-between text-[#667085]">
            <span className="text-xs font-bold uppercase tracking-wider">Needs Attention</span>
            <div className="p-2 rounded-lg bg-[#FEF0C7] text-[#B54708]"><AlertTriangle className="w-5 h-5" /></div>
          </div>
          <p className="text-[11px] text-[#667085]">Overdue leads stay with their salesperson. To act on one, open the Leads tab and use the <strong>Overdue</strong> or <strong>Expired</strong> filter (Give back, Give to another salesperson, or Ignore).</p>
          <AttentionGroup icon={AlarmClock} title="Overdue" tone="text-[#B42318]" group={needsAttention.overdue} />
          <AttentionGroup icon={Clock3} title="Due within 24 hours" tone="text-[#B54708]" group={needsAttention.dueSoon} />
        </div>

        <LeadStatCard label="Overall Conversion Rate" icon={Target} tone="green">
          <div className="text-3xl font-extrabold text-[#027A48]">{pct(overall.conversionRate)}</div>
          <p className="text-xs text-[#344054] mt-1">
            <strong>{overall.wonCount}</strong> won of <strong>{closedCount}</strong> closed · {formatInr(overall.wonValue)} won
          </p>
          <p className="text-[11px] text-[#667085] mt-3 leading-relaxed">
            Won ÷ (Won + Lost) for leads closed {periodPhrase(period)}. Open and Dead leads are not counted.
          </p>
        </LeadStatCard>
      </div>

      <div className="card p-4 sm:p-5 space-y-5">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-[#F5A300]" />
          <h3 className="text-base font-extrabold text-[#172033]">Leaderboard · {periodLabel}</h3>
          <span className="text-[11px] text-[#667085] ml-auto hidden sm:inline">Ranked by Won leads · click a name for their pipeline</span>
        </div>

        {podium.length === 0 ? (
          <p className="text-sm text-center text-[#667085] py-4">No leads were won {period === 'all' ? 'yet' : periodPhrase(period)}.</p>
        ) : (
          <div className="grid grid-cols-1 min-[420px]:grid-cols-3 gap-2 sm:gap-4">
            {podium.map((entry) => <PodiumCard key={entry.salesId} entry={entry} onOpen={setPerson} />)}
          </div>
        )}

        {rest.length > 0 && (
          <div className="md:hidden border border-[#E4E7EC] rounded-xl divide-y divide-[#F2F4F7]">
            {rest.map((e) => (
              <button key={e.salesId} onClick={() => setPerson(e)} className="w-full px-3.5 py-3 flex items-center gap-3 text-left active:bg-[#F8FAFC]">
                <span className="w-8 text-xs font-bold text-[#667085] shrink-0">#{e.rank}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-extrabold text-sm text-[#172033] truncate">{e.name}</span>
                  <span className="block text-[11px] text-[#667085] truncate">
                    {e.lostCount} lost · {openCount(e.pipeline)} open
                    {overdueCount(e.pipeline) > 0 && <span className="text-[#B42318] font-semibold"> · {overdueCount(e.pipeline)} overdue</span>}
                  </span>
                </span>
                <span className="text-right shrink-0">
                  <span className="block text-lg font-extrabold text-[#027A48] leading-none">{e.wonCount}</span>
                  <span className="block text-[10px] font-semibold text-[#667085] uppercase">Won</span>
                </span>
              </button>
            ))}
          </div>
        )}
        {rest.length > 0 && (
          <div className="hidden md:block overflow-x-auto border border-[#E4E7EC] rounded-xl">
            <table className="w-full text-xs text-left border-collapse bg-white">
              <thead className="bg-[#F8FAFC] text-[#667085] uppercase font-bold text-[10px] tracking-wider border-b border-[#E4E7EC]">
                <tr>
                  <th className="px-4 py-3">Rank</th>
                  <th className="px-4 py-3">Salesperson</th>
                  <th className="px-4 py-3 text-right">Won</th>
                  <th className="px-4 py-3 text-right">Lost</th>
                  <th className="px-4 py-3 text-right">Open</th>
                  <th className="px-4 py-3 text-right">Overdue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F2F4F7]">
                {rest.map((e) => (
                  <tr key={e.salesId} className="hover:bg-[#F8FAFC]">
                    <td className="px-4 py-3 font-bold text-[#667085]">#{e.rank}</td>
                    <td className="px-4 py-3">
                      <NameButton entry={e} onOpen={setPerson} />
                      {e.location && <div className="text-[11px] text-[#667085]">{e.location}</div>}
                    </td>
                    <td className="px-4 py-3 text-right font-extrabold text-[#027A48]">{e.wonCount}</td>
                    <td className="px-4 py-3 text-right text-[#475467]">{e.lostCount}</td>
                    <td className="px-4 py-3 text-right text-[#475467]">{openCount(e.pipeline)}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${overdueCount(e.pipeline) ? 'text-[#B42318]' : 'text-[#98A2B3]'}`}>{overdueCount(e.pipeline)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {personEntry && <SalespersonModal entry={personEntry} period={period} onClose={() => setPerson(null)} />}
    </div>
  );
};
