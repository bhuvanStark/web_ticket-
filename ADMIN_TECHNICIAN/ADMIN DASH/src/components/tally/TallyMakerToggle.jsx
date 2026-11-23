// "Tally Maker" tag on the Back-Office roster — Super Admin only. The backend
// (PUT /api/tally/makers/:id) enforces the same rule.
import React, { useCallback, useEffect, useState } from 'react';
import { Landmark } from 'lucide-react';
import { fetchTallyMakerIds, setTallyMaker } from '../../services/tallyApiService';

export function useTallyMakers(enabled) {
  const [ids, setIds] = useState(() => new Set());
  const [pending, setPending] = useState(() => new Set());

  useEffect(() => {
    if (!enabled) return;
    fetchTallyMakerIds().then((list) => setIds(new Set(list))).catch(() => {});
  }, [enabled]);

  const toggle = useCallback(async (employee, showToast) => {
    const next = !ids.has(employee.id);
    setPending((p) => new Set(p).add(employee.id));
    try {
      await setTallyMaker(employee.id, next);
      setIds((s) => { const copy = new Set(s); if (next) copy.add(employee.id); else copy.delete(employee.id); return copy; });
      showToast?.(next ? `${employee.full_name} is now a Tally Maker` : `${employee.full_name} is no longer a Tally Maker`, 'success');
    } catch (err) {
      showToast?.(err.message, 'error');
    } finally {
      setPending((p) => { const copy = new Set(p); copy.delete(employee.id); return copy; });
    }
  }, [ids]);

  return { ids, pending, toggle };
}

export const TallyMakerToggle = ({ employee, makers, showToast }) => {
  const on = makers.ids.has(employee.id);
  const busy = makers.pending.has(employee.id);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={busy}
      onClick={() => makers.toggle(employee, showToast)}
      title={on ? 'Remove Tally Maker access' : 'Make Tally Maker'}
      className={`inline-flex items-center gap-2 text-[11px] font-bold px-2.5 py-1 rounded-full border transition-colors disabled:opacity-60 ${
        on ? 'bg-[#ECFDF3] text-[#027A48] border-[#A6F4C5]' : 'bg-white text-[#667085] border-[#E4E7EC] hover:border-[#A6F4C5]'
      }`}
    >
      <span className={`relative w-7 h-4 rounded-full transition-colors ${on ? 'bg-[#12B76A]' : 'bg-[#D0D5DD]'}`}>
        <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all ${on ? 'left-3.5' : 'left-0.5'}`} />
      </span>
      <Landmark className="w-3.5 h-3.5" />
      Tally Maker
    </button>
  );
};
