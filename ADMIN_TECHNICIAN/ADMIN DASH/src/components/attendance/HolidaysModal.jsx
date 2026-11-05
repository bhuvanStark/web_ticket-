// Admin holiday list for the Attendance page: festival / public holidays
// (Diwali, Pooja, …) for every branch or one branch. Sundays are holidays
// automatically and are not listed. On a holiday, employees without
// attendance show as "H · Holiday" instead of Absent, in the page and in
// exports. `onChanged` refreshes the page after an add/remove.
import React, { useCallback, useEffect, useState } from 'react';
import { X, PartyPopper, Trash2, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { fetchHolidaysInApi, createHolidayInApi, deleteHolidayInApi } from '../../services/attendanceApiService';

const fmtDate = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
};

export const HolidaysModal = ({ branches = [], anchorDate, onClose, onChanged }) => {
  const { showToast } = useApp();
  const [year, setYear] = useState(() => Number((anchorDate || new Date().toISOString()).slice(0, 4)));
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [form, setForm] = useState({ date: anchorDate || '', name: '', branch: '' });
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const data = await fetchHolidaysInApi({ from: `${year}-01-01`, to: `${year}-12-31` });
      setHolidays(Array.isArray(data) ? data : []);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => { load(); }, [load]);

  const add = async (e) => {
    e.preventDefault();
    if (!form.date || !form.name.trim()) {
      setFormError('Date and holiday name are required.');
      return;
    }
    setFormError('');
    setIsSaving(true);
    try {
      await createHolidayInApi({ date: form.date, name: form.name.trim(), branch: form.branch || null });
      showToast?.(`Holiday "${form.name.trim()}" added.`, 'success');
      setForm((f) => ({ ...f, name: '' }));
      if (Number(form.date.slice(0, 4)) === year) await load();
      else setYear(Number(form.date.slice(0, 4)));
      onChanged?.();
    } catch (err) {
      setFormError(err?.message || 'Could not add holiday.');
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async (h) => {
    if (!window.confirm(`Remove the holiday "${h.name}" on ${fmtDate(h.holiday_date)}?`)) return;
    setDeletingId(h.id);
    try {
      await deleteHolidayInApi(h.id);
      setHolidays((list) => list.filter((x) => x.id !== h.id));
      showToast?.('Holiday removed.', 'success');
      onChanged?.();
    } catch (err) {
      showToast?.(err?.message || 'Could not remove holiday.', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-xl border border-[#E4E7EC]">
        <div className="flex items-start justify-between px-5 py-4 border-b border-[#E4E7EC]">
          <div>
            <h3 className="text-base font-extrabold text-[#172033] flex items-center gap-2">
              <PartyPopper className="w-4 h-4 text-[#004898]" /> Holidays
            </h3>
            <p className="text-xs text-[#667085] mt-0.5">Sundays are holidays automatically. Add festival and public holidays here.</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#F8FAFC] text-[#667085] cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={add} className="p-5 border-b border-[#E4E7EC] flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              className="form-input text-sm"
              aria-label="Holiday date"
            />
            <select
              value={form.branch}
              onChange={(e) => setForm((f) => ({ ...f, branch: e.target.value }))}
              className="form-input text-sm cursor-pointer"
              aria-label="Branch"
            >
              <option value="">All branches</option>
              {branches.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={form.name}
              maxLength={100}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Holiday name, e.g. Diwali"
              className="form-input text-sm flex-1"
            />
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#004898] text-white hover:bg-[#003A7A] transition-all cursor-pointer disabled:opacity-60 flex items-center gap-1.5 shrink-0"
            >
              <Plus className="w-4 h-4" /> {isSaving ? 'Adding…' : 'Add'}
            </button>
          </div>
          {formError && <p className="text-xs font-semibold text-[#B42318]">{formError}</p>}
        </form>

        <div className="flex items-center justify-between px-5 py-3 bg-[#F8FAFC] border-b border-[#E4E7EC]">
          <button onClick={() => setYear((y) => y - 1)} className="p-1.5 rounded-lg hover:bg-white text-[#475467] cursor-pointer" aria-label="Previous year">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-extrabold text-[#172033]">{year}</span>
          <button onClick={() => setYear((y) => y + 1)} className="p-1.5 rounded-lg hover:bg-white text-[#475467] cursor-pointer" aria-label="Next year">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="p-6 text-center text-xs text-[#667085]">Loading holidays…</p>
          ) : loadFailed ? (
            <p className="p-6 text-center text-xs text-[#B42318]">
              Could not load holidays. <button onClick={load} className="font-bold text-[#004898] hover:underline">Retry</button>
            </p>
          ) : holidays.length === 0 ? (
            <p className="p-6 text-center text-xs text-[#667085]">No holidays added for {year}.</p>
          ) : (
            <ul className="divide-y divide-[#F2F4F7]">
              {holidays.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#172033] break-words">{h.name}</p>
                    <p className="text-xs text-[#667085]">{fmtDate(h.holiday_date)} · {h.branch || 'All branches'}</p>
                  </div>
                  <button
                    onClick={() => remove(h)}
                    disabled={deletingId === h.id}
                    className="p-2 rounded-lg text-[#B91C1C] hover:bg-[#FEF2F2] transition-all cursor-pointer disabled:opacity-50 shrink-0"
                    title="Remove holiday"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};
