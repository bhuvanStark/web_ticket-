import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, ChevronDown, Megaphone, Users, UserCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { BroadcastComposer } from './BroadcastComposer';
import { BROADCAST_TONES, EMPLOYEE_TYPE_LABELS, splitHighlight, fmtClock, fmtTimeLeft } from './broadcastShared';
import {
  fetchBroadcastsInApi, fetchBroadcastRecipientsInApi, endBroadcastInApi, deleteBroadcastInApi, removeBroadcastRecipientInApi
} from '../../services/broadcastApiService';

// Admin "Broadcasts" page: Active (live, with read receipts) and History.
// Live broadcasts can be ended early and people taken out of them;
// anything can be deleted for good.

const REFRESH_MS = 60 * 1000;

const fmtDateTime = (iso) => (iso
  ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
  : '');

// Portalled for the same reason as BroadcastComposer.
const ConfirmDialog = ({ title, body, confirmLabel, busy, onCancel, onConfirm }) => createPortal(
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
    <div className="w-full max-w-sm rounded-xl bg-white shadow-xl border border-[#E4E7EC]">
      <div className="p-5">
        <h3 className="text-base font-bold text-[#172033]">{title}</h3>
        <p className="mt-1.5 text-sm text-[#475467]">{body}</p>
      </div>
      <div className="flex justify-end gap-2 px-5 py-4 border-t border-[#E4E7EC] bg-[#F9FAFB] rounded-b-xl">
        <button onClick={onCancel} disabled={busy} className="btn btn-secondary text-xs font-bold">Cancel</button>
        <button onClick={onConfirm} disabled={busy} className="btn text-xs font-bold bg-[#D92D20] border-[#D92D20] text-white hover:bg-[#B42318] disabled:opacity-60">
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </div>
  </div>,
  document.body
);

const ReceiptBar = ({ total, seen, acknowledged, color }) => {
  const pct = (n) => (total ? (n / total) * 100 : 0);
  return (
    <div className="h-1.5 w-full rounded-full bg-[#F2F4F7] overflow-hidden relative" aria-hidden="true">
      <div className="absolute inset-y-0 left-0 rounded-full opacity-35" style={{ width: `${pct(seen)}%`, background: color }} />
      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct(acknowledged)}%`, background: color }} />
    </div>
  );
};

const recipientStatus = (r) => {
  if (r.acknowledged_at) return { label: `Got it · ${fmtClock(r.acknowledged_at)}`, cls: 'bg-[#ECFDF3] text-[#027A48]' };
  if (r.seen_at) return { label: `Seen · ${fmtClock(r.seen_at)}`, cls: 'bg-[#EFF5FC] text-[#175CD3]' };
  return { label: 'Not seen yet', cls: 'bg-[#F2F4F7] text-[#667085]' };
};

const BroadcastRow = ({ broadcast, expanded, recipients, onToggle, onEnd, onDelete, onRemove, removing }) => {
  const tone = BROADCAST_TONES[broadcast.tone] || BROADCAST_TONES.info;
  const { before, match, after } = splitHighlight(broadcast.headline, broadcast.highlight);
  const live = broadcast.is_live;
  const endedNote = broadcast.ended_at
    ? `Ended ${fmtDateTime(broadcast.ended_at)}${broadcast.ended_by_name ? ` by ${broadcast.ended_by_name}` : ''}`
    : `Expired ${fmtDateTime(broadcast.expires_at)}`;
  const missed = !live ? broadcast.recipient_count - broadcast.seen_count : 0;

  return (
    <div className="bg-white rounded-2xl border border-[#E4E7EC] shadow-xs overflow-hidden">
      <div className="p-4 sm:p-5 flex gap-4">
        <div className="w-12 h-12 rounded-full flex items-center justify-center text-2xl shrink-0" style={{ background: tone.soft }} aria-hidden="true">
          {broadcast.emoji}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="text-[15px] font-extrabold text-[#172033] leading-snug min-w-0 break-words">
              {before}{match && <span className="px-0.5 rounded" style={{ background: tone.soft }}>{match}</span>}{after}
            </h3>
            <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0" style={{ color: tone.ink, background: tone.soft }}>
              {tone.label}
            </span>
          </div>
          <p className="text-xs text-[#667085] line-clamp-2">{broadcast.message}</p>
          <p className="text-[11px] text-[#98A2B3] flex flex-wrap gap-x-2 gap-y-0.5">
            <span className="flex items-center gap-1">
              {broadcast.audience === 'everyone' ? <Users className="w-3 h-3" /> : <UserCheck className="w-3 h-3" />}
              {broadcast.audience === 'everyone' ? 'Everyone' : 'Chosen people'} · {broadcast.recipient_count}
            </span>
            <span>Sent {fmtDateTime(broadcast.created_at)}{broadcast.created_by_name ? ` by ${broadcast.created_by_name}` : ''}</span>
            <span className={live ? 'font-bold text-[#B54708]' : ''}>{live ? fmtTimeLeft(broadcast.expires_at) : endedNote}</span>
          </p>

          <div className="pt-1 space-y-1.5">
            <ReceiptBar total={broadcast.recipient_count} seen={broadcast.seen_count} acknowledged={broadcast.acknowledged_count} color={tone.color} />
            <p className="text-[11px] font-semibold text-[#475467] tabular-nums">
              Seen {broadcast.seen_count}/{broadcast.recipient_count} · Got it {broadcast.acknowledged_count}/{broadcast.recipient_count}
              {missed > 0 && <span className="text-[#B54708]"> · {missed} missed</span>}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button onClick={onToggle} className="text-xs font-bold text-[#004898] flex items-center gap-1 cursor-pointer hover:underline" aria-expanded={expanded}>
              Who's read it <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>
            <span className="flex-1" />
            {live ? (
              <button onClick={onEnd} className="text-xs font-bold text-[#D92D20] border border-[#FDA29B] bg-white hover:bg-[#FEF3F2] rounded-lg px-3 py-1.5 cursor-pointer">
                End now
              </button>
            ) : (
              <button onClick={onDelete} className="text-xs font-bold text-[#667085] hover:text-[#D92D20] border border-[#E4E7EC] bg-white rounded-lg px-3 py-1.5 cursor-pointer">
                Delete
              </button>
            )}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-[#F2F4F7] bg-[#FCFCFD]">
          {!recipients ? (
            <p className="px-5 py-4 text-xs text-[#667085]">Loading…</p>
          ) : recipients.length === 0 ? (
            <p className="px-5 py-4 text-xs text-[#667085]">Nobody is left in this broadcast.</p>
          ) : (
            <ul className="divide-y divide-[#F2F4F7] max-h-80 overflow-y-auto">
              {recipients.map((r) => {
                const status = recipientStatus(r);
                const key = `${r.employee_type}:${r.employee_id}`;
                return (
                  <li key={key} className="px-5 py-2.5 flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-[#172033] truncate">{r.full_name}</p>
                      <p className="text-[11px] text-[#98A2B3]">{EMPLOYEE_TYPE_LABELS[r.employee_type]}</p>
                    </div>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${status.cls}`}>{status.label}</span>
                    {live && (
                      <button
                        onClick={() => onRemove(r)}
                        disabled={removing === key}
                        className="text-[11px] font-bold text-[#D92D20] hover:underline cursor-pointer disabled:opacity-50 shrink-0"
                      >
                        {removing === key ? 'Removing…' : 'Remove'}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export const BroadcastsPage = () => {
  const { showToast } = useApp();
  const [broadcasts, setBroadcasts] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [tab, setTab] = useState('active');
  const [composerOpen, setComposerOpen] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [recipients, setRecipients] = useState({});
  const [confirm, setConfirm] = useState(null); // { action: 'end' | 'delete', broadcast }
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(null);

  const load = useCallback(async () => {
    try {
      setBroadcasts(await fetchBroadcastsInApi());
      setLoadError(null);
    } catch (err) {
      setLoadError(err.message || 'Could not load broadcasts');
    }
  }, []);

  const loadRecipients = useCallback(async (id) => {
    try {
      const data = await fetchBroadcastRecipientsInApi(id);
      setRecipients((prev) => ({ ...prev, [id]: data }));
    } catch (err) {
      showToast(err.message || 'Could not load who read it', 'error');
    }
  }, [showToast]);

  // Refresh receipts and move expired broadcasts to History.
  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const toggleExpanded = (id) => {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    loadRecipients(id);
  };

  const runConfirm = async () => {
    const { action, broadcast } = confirm;
    setBusy(true);
    try {
      if (action === 'end') await endBroadcastInApi(broadcast.id);
      else await deleteBroadcastInApi(broadcast.id);
      showToast(action === 'end' ? 'Broadcast ended.' : 'Broadcast deleted.', 'success');
      setConfirm(null);
      await load();
    } catch (err) {
      showToast(err.message || 'Something went wrong', 'error');
    } finally {
      setBusy(false);
    }
  };

  const removeRecipient = async (broadcast, r) => {
    const key = `${r.employee_type}:${r.employee_id}`;
    setRemoving(key);
    try {
      await removeBroadcastRecipientInApi(broadcast.id, r.employee_type, r.employee_id);
      showToast(`${r.full_name} removed. They can be added to a new broadcast now.`, 'success');
      await Promise.all([load(), loadRecipients(broadcast.id)]);
    } catch (err) {
      showToast(err.message || 'Could not remove them', 'error');
    } finally {
      setRemoving(null);
    }
  };

  const active = (broadcasts || []).filter((b) => b.is_live);
  const history = (broadcasts || []).filter((b) => !b.is_live);
  const list = tab === 'active' ? active : history;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-[#172033] tracking-tight">Broadcasts</h2>
          <p className="text-xs md:text-sm text-[#667085] mt-0.5">
            Popups your employees must read when they open the app, before they can check in. Each one lasts 24 hours.
          </p>
        </div>
        <button onClick={() => setComposerOpen(true)} className="btn btn-primary shadow-sm text-xs font-bold">
          <Plus className="w-4 h-4" />
          <span>New broadcast</span>
        </button>
      </div>

      <div className="flex gap-1 border-b border-[#E4E7EC]">
        {[{ id: 'active', label: 'Active', count: active.length }, { id: 'history', label: 'History', count: history.length }].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-bold border-b-2 -mb-px cursor-pointer transition-colors ${
              tab === t.id ? 'border-[#004898] text-[#004898]' : 'border-transparent text-[#667085] hover:text-[#172033]'
            }`}
          >
            {t.label} <span className="ml-1 text-xs font-extrabold tabular-nums">{broadcasts ? t.count : ''}</span>
          </button>
        ))}
      </div>

      {loadError ? (
        <div className="p-6 text-sm text-[#D92D20] bg-white rounded-2xl border border-[#E4E7EC]">{loadError}</div>
      ) : !broadcasts ? (
        <div className="p-6 text-sm text-[#667085] bg-white rounded-2xl border border-[#E4E7EC]">Loading broadcasts…</div>
      ) : list.length === 0 ? (
        <div className="p-10 text-center bg-white rounded-2xl border border-dashed border-[#D0D5DD]">
          <div className="w-12 h-12 mx-auto rounded-full bg-[#EFF5FC] text-[#004898] flex items-center justify-center">
            <Megaphone className="w-6 h-6" />
          </div>
          <p className="mt-3 text-sm font-extrabold text-[#172033]">{tab === 'active' ? 'No live broadcasts' : 'No past broadcasts yet'}</p>
          <p className="mt-1 text-xs text-[#667085]">
            {tab === 'active' ? 'Send one to everyone, or pick the people who need to see it.' : 'Ended and expired broadcasts show up here with their read receipts.'}
          </p>
          {tab === 'active' && (
            <button onClick={() => setComposerOpen(true)} className="btn btn-primary text-xs font-bold mt-4">
              <Plus className="w-4 h-4" /> New broadcast
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4">
          {list.map((b) => (
            <BroadcastRow
              key={b.id}
              broadcast={b}
              expanded={expandedId === b.id}
              recipients={recipients[b.id]}
              onToggle={() => toggleExpanded(b.id)}
              onEnd={() => setConfirm({ action: 'end', broadcast: b })}
              onDelete={() => setConfirm({ action: 'delete', broadcast: b })}
              onRemove={(r) => removeRecipient(b, r)}
              removing={removing}
            />
          ))}
        </div>
      )}

      {composerOpen && (
        <BroadcastComposer
          onClose={() => setComposerOpen(false)}
          onSent={() => { setComposerOpen(false); setTab('active'); load(); }}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.action === 'end' ? 'End this broadcast now?' : 'Delete this broadcast?'}
          body={confirm.action === 'end'
            ? "Anyone who hasn't tapped Got it stops seeing it, and everyone in it can get a new broadcast. It moves to History."
            : 'It and its read receipts are removed for good.'}
          confirmLabel={confirm.action === 'end' ? 'End now' : 'Delete'}
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={runConfirm}
        />
      )}
    </div>
  );
};
