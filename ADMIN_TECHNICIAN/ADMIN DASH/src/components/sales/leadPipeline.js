// Sales pipeline V2 — one place for the lead stage vocabulary used across the
// Sales screens (labels, colours, stage windows, allowed moves, the Ref ID
// example and the battery timer). Mirrors backend-unified/services/
// leadService.js (STAGE_DAYS, STAGE_TRANSITIONS, PROPOSAL_STAGES,
// REF_ID_TEMPLATE) — the backend enforces every rule; this copy only lets
// the UI explain them before a request is sent. Keep the two in step.

export const STATUS_LABEL = {
  new: 'New', meeting: 'Meeting', proposal: 'Proposal', follow_up: 'Follow-up', hold: 'Hold',
  won: 'Won', lost: 'Lost', dead: 'Dead'
};

export const STATUS_COLOR = {
  new: 'bg-[#EFF5FC] text-[#004898]',
  meeting: 'bg-[#FFFAEB] text-[#B54708]',
  proposal: 'bg-[#F4F3FF] text-[#5925DC]',
  follow_up: 'bg-[#ECFDF3] text-[#027A48]',
  hold: 'bg-[#F2F4F7] text-[#344054]',
  won: 'bg-[#ECFDF3] text-[#027A48]',
  lost: 'bg-[#FEF3F2] text-[#B42318]',
  dead: 'bg-[#F2F4F7] text-[#475467]'
};

export const STAGE_DAYS = { new: 10, meeting: 7, proposal: 10, follow_up: 10, hold: 20 };
export const ACTIVE_STATUSES = Object.keys(STAGE_DAYS);
export const ALL_STATUSES = [...ACTIVE_STATUSES, 'won', 'lost', 'dead'];
export const CLOSED_STATUSES = ['won', 'lost', 'dead'];
export const PROPOSAL_STAGES = ['proposal', 'follow_up', 'hold'];

// Won only from Proposal onwards, so every win carries a proposal.
export const STAGE_TRANSITIONS = {
  new: ['meeting', 'lost'],
  meeting: ['proposal', 'lost'],
  proposal: ['follow_up', 'hold', 'won', 'lost'],
  follow_up: ['hold', 'won', 'lost'],
  hold: ['follow_up', 'won', 'lost']
};

// Moving between Follow-up and Hold keeps the running stage clock.
export const keepsStageClock = (from, to) => ['follow_up', 'hold'].includes(from) && ['follow_up', 'hold'].includes(to);

// Required reason for Lost/Dead (mirrors leadService.LOST_REASONS); 'other'
// also needs a note. 'duplicate' is what the auto-close writes.
export const LOST_REASONS = {
  price: 'Price too high',
  competitor: 'Went with a competitor',
  no_budget: 'No budget',
  no_response: 'No response',
  not_interested: 'Not interested',
  duplicate: 'Duplicate lead',
  other: 'Other'
};
export const lostReasonLabel = (lead) => (lead?.lost_reason
  ? `${LOST_REASONS[lead.lost_reason] || lead.lost_reason}${lead.lost_note ? ` — ${lead.lost_note}` : ''}`
  : null);

// Statuses the actor may move `status` to (excluding the current one).
export const nextStatuses = (status, isAdmin) =>
  isAdmin ? (status === 'won' ? [] : ALL_STATUSES.filter((s) => s !== status)) : (STAGE_TRANSITIONS[status] || []);

export const REF_ID_TEMPLATE = 'TTTPL / BLR / 26-27 / BAL / CN / 2026-02-10 / A';
const squash = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();
export const isRefIdTemplate = (value) => squash(value) === squash(REF_ID_TEMPLATE);

export const money = (v) => (v == null ? '—' : `₹${Number(v).toLocaleString('en-IN')}`);

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// Battery state for an active lead, null for a closed one or one whose
// timer is paused (a Won request waiting for Admin — see isWonPending).
// One urgency rule everywhere (same as Analytics' "due in <24h"):
//   level: 'ok' (green) · 'soon' (amber, <24h left) · 'overdue' (red)
// `fraction` (share of the stage window left) only sets how full it looks.
export function stageTimer(lead, now = Date.now()) {
  const days = STAGE_DAYS[lead?.status];
  if (!days || !lead.status_changed_at || lead.won_requested_at) return null;
  const deadline = new Date(lead.status_changed_at).getTime() + days * DAY;
  const ms = deadline - now;
  const fraction = Math.max(0, Math.min(1, ms / (days * DAY)));
  const level = ms <= 0 ? 'overdue' : ms <= DAY ? 'soon' : 'ok';
  return { days, deadline, ms, fraction, level, overdue: ms <= 0, label: timerLabel(ms) };
}

export function timerLabel(ms) {
  const abs = Math.abs(ms);
  const d = Math.floor(abs / DAY);
  const h = Math.floor((abs % DAY) / HOUR);
  const span = d >= 2 ? `${d}d` : d === 1 ? `1d ${h}h` : `${h}h`;
  if (ms <= 0) return `Overdue ${abs < HOUR ? '' : span}`.trim();
  return abs < HOUR ? '<1h left' : `${span} left`;
}

// A Sales Won waiting for Admin approval: locked for Sales, timer paused.
export const isWonPending = (lead) => !!lead?.won_requested_at;

// Admin may assign only Unassigned or New leads, never Won/Lost/Dead —
// mirrors leadService.isAssignable/assignBlockReason.
export const isAssignable = (lead) => !!lead && ACTIVE_STATUSES.includes(lead.status) && (!lead.assigned_to || lead.status === 'new');
export function assignBlockReason(lead) {
  if (lead.status === 'won') return 'Won leads cannot be reassigned';
  if (CLOSED_STATUSES.includes(lead.status)) return `${STATUS_LABEL[lead.status]} lead — change its status first to reopen it`;
  if (!isAssignable(lead)) return 'Only New or Unassigned leads can be assigned — the salesperson must release it first';
  return null;
}

// India calendar date 'YYYY-MM-DD' (follow-up dates are India dates).
export const todayKey = (now = Date.now()) => new Date(now + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Next follow-up chip: { label, due } where due = today or earlier.
export function followUpInfo(lead) {
  const d = lead?.next_follow_up_date;
  if (!d || CLOSED_STATUSES.includes(lead.status)) return null;
  const today = todayKey();
  const [, m, day] = d.split('-').map(Number);
  const label = d === today ? 'Follow-up today' : d < today ? `Follow-up overdue (${day} ${MONTHS[m - 1]})` : `Follow-up ${day} ${MONTHS[m - 1]}`;
  return { label, due: d <= today };
}

// Lead lists show 15 rows per page, fetched page by page from the server.
export const LEADS_PAGE_SIZE = 15;
export const pageCount = (total, pageSize = LEADS_PAGE_SIZE) => Math.max(1, Math.ceil((total || 0) / pageSize));
