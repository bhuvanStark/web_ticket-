import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { BroadcastPopup } from './BroadcastPopup';
import { fetchMyBroadcastInApi, markBroadcastSeenInApi, acknowledgeBroadcastInApi } from '../../services/broadcastApiService';

// Shows an employee's broadcast:
//   1. when the app opens, and again whenever they come back to it or every
//      few minutes while it's open (so one sent mid-day still pops up);
//   2. before Check In — AttendanceBanner awaits ensureBroadcastSeen(), which
//      re-checks the server and holds the check-in until "Got it".
// Only for a real employee session. An admin viewing as a technician or
// Sales employee holds an admin token and never sees it.
//
// A broadcast problem must never block attendance: any failed request here
// just means no popup, and Check In carries on.

const POLL_MS = 5 * 60 * 1000;
const EMPLOYEE_ROLES = ['tech', 'sales', 'back_office'];

const BroadcastContext = createContext({ ensureBroadcastSeen: async () => {} });

export const useBroadcastGate = () => useContext(BroadcastContext);

export const BroadcastGate = ({ children }) => {
  const { role, baseRole, currentUser } = useApp();
  const isEmployee = EMPLOYEE_ROLES.includes(role) && role === baseRole;
  const [broadcast, setBroadcast] = useState(null);
  const [forCheckIn, setForCheckIn] = useState(false);
  const waiters = useRef([]);
  // "Got it" taps whose request may still be in flight, so a poll landing
  // in that gap can't bring the same popup back.
  const acknowledged = useRef(new Set());

  const releaseWaiters = useCallback(() => {
    setForCheckIn(false);
    waiters.current.forEach((resolve) => resolve());
    waiters.current = [];
  }, []);

  // Keeps the same object while the id is unchanged, so a poll never
  // restarts an open popup's timer. If the broadcast is gone (an admin ended
  // it, it expired, or they were removed), a held Check In carries on.
  const load = useCallback(async () => {
    try {
      const fetched = await fetchMyBroadcastInApi();
      const next = fetched && !acknowledged.current.has(fetched.id) ? fetched : null;
      setBroadcast((prev) => (prev && next && prev.id === next.id ? prev : next));
      if (!next) releaseWaiters();
      return next;
    } catch {
      return null;
    }
  }, [releaseWaiters]);

  useEffect(() => {
    if (!isEmployee) {
      setBroadcast(null);
      releaseWaiters();
      return undefined;
    }
    load();
    const timer = setInterval(load, POLL_MS);
    const onVisible = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isEmployee, currentUser?.id, load, releaseWaiters]);

  const ensureBroadcastSeen = useCallback(async () => {
    if (!isEmployee) return;
    const pending = await load();
    if (!pending) return;
    setForCheckIn(true);
    await new Promise((resolve) => waiters.current.push(resolve));
  }, [isEmployee, load]);

  const handleSeen = useCallback((id) => {
    markBroadcastSeenInApi(id).catch(() => {});
  }, []);

  // Close straight away; if the request fails, the next check shows it again.
  const handleDone = useCallback((id) => {
    acknowledged.current.add(id);
    setBroadcast(null);
    releaseWaiters();
    acknowledgeBroadcastInApi(id).catch(() => acknowledged.current.delete(id));
  }, [releaseWaiters]);

  return (
    <BroadcastContext.Provider value={{ ensureBroadcastSeen }}>
      {children}
      {isEmployee && broadcast && (
        <BroadcastPopup
          key={broadcast.id}
          broadcast={broadcast}
          userName={currentUser?.name}
          forCheckIn={forCheckIn}
          onSeen={handleSeen}
          onDone={handleDone}
        />
      )}
    </BroadcastContext.Provider>
  );
};
