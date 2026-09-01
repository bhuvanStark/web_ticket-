import React, { useCallback, useEffect, useState } from 'react';
import {
  KeyRound, Ticket, Check, X, RefreshCw, Building2, Clock, AlertTriangle, Inbox
} from 'lucide-react';
import unifiedClient from '../../api/unifiedClient';

const relativeTime = (iso) => {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

export const ApprovalsPage = () => {
  const [resets, setResets] = useState([]);
  const [requests, setRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [actioningId, setActioningId] = useState(null);
  const [flash, setFlash] = useState(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const [resetRes, requestRes] = await Promise.all([
        unifiedClient.getPendingPasswordResets(),
        // Newly raised tickets that nobody has picked up yet.
        unifiedClient.getAllServiceRequests(10, 0, 'request_received').catch(() => ({ data: [] }))
      ]);
      setResets(resetRes.data || []);
      setRequests(requestRes.data || []);
    } catch (err) {
      setError(err?.data?.error || err?.message || 'Could not load pending items.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [load]);

  const act = async (id, action) => {
    setActioningId(id);
    setFlash(null);
    try {
      const res = action === 'approve'
        ? await unifiedClient.approvePasswordReset(id)
        : await unifiedClient.rejectPasswordReset(id);
      setFlash({ tone: 'ok', text: res.message || 'Done.' });
      await load();
    } catch (err) {
      setFlash({ tone: 'error', text: err?.data?.error || err?.message || 'Action failed.' });
    } finally {
      setActioningId(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-extrabold text-[#172033]">Approvals &amp; Alerts</h1>
          <p className="text-xs text-[#667085] mt-0.5">
            Password reset requests awaiting your decision, and newly raised service requests.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="flex items-center gap-1.5 px-3 py-2 bg-white border border-[#E4E7EC] rounded-xl text-xs font-bold text-[#344054] hover:bg-[#F8FAFC] cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {flash && (
        <div className={`p-3 rounded-xl text-xs font-semibold border ${
          flash.tone === 'ok'
            ? 'bg-[#ECFDF3] border-[#ABE5C6] text-[#027A48]'
            : 'bg-[#FEE2E2] border-[#FCA5A5] text-[#B91C1C]'
        }`}>
          {flash.text}
        </div>
      )}

      {error && (
        <div className="p-3 rounded-xl bg-[#FEE2E2] border border-[#FCA5A5] text-xs font-semibold text-[#B91C1C]">
          {error}
        </div>
      )}

      {/* Password reset requests */}
      <section className="bg-white border border-[#E4E7EC] rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[#E4E7EC] bg-[#F8FAFC] flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-[#004898]" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#172033]">
            Password Reset Requests
          </h2>
          {resets.length > 0 && (
            <span className="ml-1 px-2 py-0.5 bg-[#004898] text-white text-[10px] font-bold rounded-full">
              {resets.length}
            </span>
          )}
        </div>

        {isLoading ? (
          <p className="p-6 text-center text-xs text-[#667085]">Loading…</p>
        ) : resets.length === 0 ? (
          <EmptyRow icon={Inbox} text="No password reset requests waiting." />
        ) : (
          <div className="divide-y divide-[#F2F4F7]">
            {resets.map((r) => (
              <div key={r.id} className="p-4 flex items-start gap-3 flex-wrap sm:flex-nowrap">
                <div className="w-9 h-9 shrink-0 rounded-full bg-[#EFF5FC] grid place-items-center text-[#004898] font-extrabold text-xs">
                  {(r.customer_name || r.email || '?').slice(0, 2).toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm text-[#172033]">
                    {r.customer_name || 'Unknown user'}
                  </div>
                  <div className="text-xs text-[#667085] break-all">{r.email}</div>
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-[#667085] flex-wrap">
                    {r.company_name && (
                      <span className="flex items-center gap-1">
                        <Building2 className="w-3 h-3" /> {r.company_name}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {relativeTime(r.created_at)}
                    </span>
                    {r.is_expired && (
                      <span className="flex items-center gap-1 text-[#B42318] font-bold">
                        <AlertTriangle className="w-3 h-3" /> Expired
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={actioningId === r.id || r.is_expired}
                    onClick={() => act(r.id, 'approve')}
                    title={r.is_expired ? 'This request has expired' : 'Email a reset link to this user'}
                    className="flex items-center gap-1.5 px-3 py-2 bg-[#004898] text-white text-xs font-bold rounded-xl hover:bg-[#003673] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Check className="w-3.5 h-3.5" />
                    {actioningId === r.id ? 'Working…' : 'Approve & Send'}
                  </button>
                  <button
                    type="button"
                    disabled={actioningId === r.id}
                    onClick={() => act(r.id, 'reject')}
                    className="flex items-center gap-1.5 px-3 py-2 bg-white border border-[#E4E7EC] text-[#B42318] text-xs font-bold rounded-xl hover:bg-[#FEF3F2] cursor-pointer disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" />
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Newly raised service requests */}
      <section className="bg-white border border-[#E4E7EC] rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[#E4E7EC] bg-[#F8FAFC] flex items-center gap-2">
          <Ticket className="w-4 h-4 text-[#004898]" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#172033]">
            New Service Requests
          </h2>
          {requests.length > 0 && (
            <span className="ml-1 px-2 py-0.5 bg-[#004898] text-white text-[10px] font-bold rounded-full">
              {requests.length}
            </span>
          )}
        </div>

        {isLoading ? (
          <p className="p-6 text-center text-xs text-[#667085]">Loading…</p>
        ) : requests.length === 0 ? (
          <EmptyRow icon={Inbox} text="No unassigned service requests." />
        ) : (
          <div className="divide-y divide-[#F2F4F7]">
            {requests.map((t) => (
              <div key={t.id} className="p-4 flex items-start gap-3">
                <div className="w-9 h-9 shrink-0 rounded-full bg-[#EFF5FC] grid place-items-center">
                  <Ticket className="w-4 h-4 text-[#004898]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-extrabold text-xs text-[#004898]">
                      {t.ticket_number || t.id?.slice(0, 8)}
                    </span>
                    <span className="px-2 py-0.5 bg-[#EFF5FC] text-[#004898] text-[10px] font-bold rounded-full">
                      Request Submitted
                    </span>
                  </div>
                  <div className="font-bold text-sm text-[#172033] mt-0.5">
                    {t.issue_title || 'Service request'}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-[#667085] flex-wrap">
                    {t.customers?.company_name && (
                      <span className="flex items-center gap-1">
                        <Building2 className="w-3 h-3" /> {t.customers.company_name}
                      </span>
                    )}
                    {t.rooms?.name && <span>{t.rooms.name}</span>}
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {relativeTime(t.created_at)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

const EmptyRow = ({ icon: Icon, text }) => (
  <div className="p-8 text-center">
    <Icon className="w-8 h-8 text-[#D0D5DD] mx-auto mb-2" />
    <p className="text-xs text-[#667085]">{text}</p>
  </div>
);
