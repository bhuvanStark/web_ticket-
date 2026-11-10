// "Quote Manager" tag on the Back-Office roster — Super Admin only. The
// backend (PUT /api/quotes/managers/:id) enforces the same rule.
import React, { useCallback, useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { fetchQuoteManagerIds, setQuoteManager } from '../../services/quoteApiService';

export function useQuoteManagers(enabled) {
  const [ids, setIds] = useState(() => new Set());
  const [pending, setPending] = useState(() => new Set());

  useEffect(() => {
    if (!enabled) return;
    fetchQuoteManagerIds().then((list) => setIds(new Set(list))).catch(() => {});
  }, [enabled]);

  const toggle = useCallback(async (employee, showToast) => {
    const next = !ids.has(employee.id);
    setPending((p) => new Set(p).add(employee.id));
    try {
      await setQuoteManager(employee.id, next);
      setIds((s) => { const copy = new Set(s); if (next) copy.add(employee.id); else copy.delete(employee.id); return copy; });
      showToast?.(next ? `${employee.full_name} is now a Quote Manager` : `${employee.full_name} is no longer a Quote Manager`, 'success');
    } catch (err) {
      showToast?.(err.message, 'error');
    } finally {
      setPending((p) => { const copy = new Set(p); copy.delete(employee.id); return copy; });
    }
  }, [ids]);

  return { ids, pending, toggle };
}

export const QuoteManagerToggle = ({ employee, managers, showToast }) => {
  const on = managers.ids.has(employee.id);
  const busy = managers.pending.has(employee.id);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={busy}
      onClick={() => managers.toggle(employee, showToast)}
      title={on ? 'Remove Quote Manager access' : 'Make Quote Manager'}
      className={`inline-flex items-center gap-2 text-[11px] font-bold px-2.5 py-1 rounded-full border transition-colors disabled:opacity-60 ${
        on ? 'bg-[#EFF5FC] text-[#004898] border-[#B3D1F2]' : 'bg-white text-[#667085] border-[#E4E7EC] hover:border-[#B3D1F2]'
      }`}
    >
      <span className={`relative w-7 h-4 rounded-full transition-colors ${on ? 'bg-[#004898]' : 'bg-[#D0D5DD]'}`}>
        <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all ${on ? 'left-3.5' : 'left-0.5'}`} />
      </span>
      <FileText className="w-3.5 h-3.5" />
      Quote Manager
    </button>
  );
};
