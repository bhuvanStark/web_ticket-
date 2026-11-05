// Leave popup shared by the Admin Attendance details modal and the
// employee's My Attendance page: Full Day / Half Day, a required reason and
// (for the employee) the day. Submitting calls `onSubmit({ date, halfDay,
// reason })`; the dialog stays open showing the error if that throws.
import React, { useState } from 'react';
import { X, CalendarMinus } from 'lucide-react';

const MAX_REASON = 500;

export const LeaveDialog = ({
  title = 'Apply Leave',
  subtitle,
  allowFullDay = true,
  showDate = false,
  defaultDate = '',
  minDate,
  maxDate,
  onSubmit,
  onClose
}) => {
  const [halfDay, setHalfDay] = useState(!allowFullDay);
  const [reason, setReason] = useState('');
  const [date, setDate] = useState(defaultDate);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) return setError('Please enter a reason.');
    if (showDate && !date) return setError('Please choose a date.');
    setError('');
    setIsSubmitting(true);
    try {
      await onSubmit({ date: showDate ? date : undefined, halfDay, reason: reason.trim() });
    } catch (err) {
      setError(err?.message || 'Could not apply leave.');
      setIsSubmitting(false);
    }
  };

  const typeButton = (value, label) => (
    <button
      type="button"
      onClick={() => setHalfDay(value)}
      className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
        halfDay === value ? 'bg-[#004898] text-white border-[#004898]' : 'bg-white text-[#475467] border-[#E4E7EC] hover:bg-[#F8FAFC]'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white shadow-xl border border-[#E4E7EC]">
        <div className="flex items-start justify-between px-5 py-4 border-b border-[#E4E7EC]">
          <div>
            <h3 className="text-base font-extrabold text-[#172033] flex items-center gap-2">
              <CalendarMinus className="w-4 h-4 text-[#004898]" /> {title}
            </h3>
            {subtitle && <p className="text-xs text-[#667085] mt-0.5">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#F8FAFC] text-[#667085] cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {allowFullDay && (
            <div className="flex gap-2">
              {typeButton(false, 'Full Day')}
              {typeButton(true, 'Half Day')}
            </div>
          )}

          {showDate && (
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-[#344054]">Date</span>
              <input
                type="date"
                value={date}
                min={minDate}
                max={maxDate}
                onChange={(e) => setDate(e.target.value)}
                className="form-input text-sm"
                required
              />
            </label>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-[#344054]">Reason <span className="text-[#D92D20]">*</span></span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={MAX_REASON}
              placeholder={halfDay ? 'Why do you need a half day off?' : 'Why do you need leave?'}
              className="form-input text-sm resize-none"
              autoFocus
            />
          </label>

          {error && <p className="text-xs font-semibold text-[#B42318]">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-[#E4E7EC] bg-[#F9FAFB] rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-semibold rounded-lg border border-[#E4E7EC] bg-white text-[#344054] hover:bg-[#F8FAFC] transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#004898] text-white hover:bg-[#003A7A] transition-all cursor-pointer disabled:opacity-60"
          >
            {isSubmitting ? 'Submitting…' : 'Submit'}
          </button>
        </div>
      </form>
    </div>
  );
};
