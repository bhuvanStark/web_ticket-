// Shared popup shell for the Sales module. Rendered into document.body (a
// portal), so it sits above the Header, Sidebar and mobile BottomNav instead
// of being trapped inside <main>'s stacking context. Phones get a bottom
// sheet (full width, pinned header/footer, the body scrolls smoothly
// between them); sm+ gets a centered card. No backdrop blur — it repaints
// the whole page underneath on every list refresh.
//
//   <SalesModal onClose={…} size="md" onSubmit={…}>
//     <ModalHeader title="Add Lead" onClose={…} />
//     <ModalBody>…fields…</ModalBody>
//     <ModalFooter>…buttons…</ModalFooter>
//   </SalesModal>
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const SIZES = { sm: 'sm:max-w-sm', md: 'sm:max-w-md', lg: 'sm:max-w-lg', xl: 'sm:max-w-xl', '2xl': 'sm:max-w-2xl' };

// Open popups, newest last — Escape closes only the top one (a duplicate
// warning opened over the lead form must not close the form too).
const stack = [];

// closeOnBackdrop: only for read-only popups, so a stray tap never throws
// away a half-filled form. tall: fixed height on desktop for popups whose
// content loads in after opening, so the card doesn't jump as it grows.
export const SalesModal = ({ onClose, size = 'md', onSubmit, closeOnBackdrop = false, tall = false, nested = false, children }) => {
  const token = useRef({});
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const me = token.current;
    stack.push(me);
    const onKey = (e) => {
      if (e.key === 'Escape' && stack[stack.length - 1] === me) closeRef.current?.();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      stack.splice(stack.indexOf(me), 1);
    };
  }, []);

  const Panel = onSubmit ? 'form' : 'div';

  return createPortal(
    <div
      className={`sales-modal-overlay fixed inset-0 ${nested ? 'z-[70]' : 'z-[60]'} flex items-end sm:items-center justify-center bg-[#0F172A]/50 sm:p-4`}
      onMouseDown={closeOnBackdrop ? (e) => { if (e.target === e.currentTarget) onClose?.(); } : undefined}
    >
      <Panel
        onSubmit={onSubmit}
        role="dialog"
        aria-modal="true"
        className={`sales-modal-panel relative w-full ${SIZES[size] || SIZES.md} bg-white shadow-2xl border border-[#E4E7EC] flex flex-col
          rounded-t-2xl sm:rounded-2xl max-h-[92dvh] sm:max-h-[88vh] ${tall ? 'sm:h-[min(88vh,780px)]' : ''}`}
      >
        {/* Grab handle — a visual cue that this is a sheet. */}
        <div className="sm:hidden flex justify-center pt-2 shrink-0" aria-hidden="true">
          <span className="h-1 w-10 rounded-full bg-[#D0D5DD]" />
        </div>
        {children}
      </Panel>
    </div>,
    document.body
  );
};

export const ModalHeader = ({ title, subtitle, icon: Icon, onClose, closeDisabled = false, children }) => (
  <div className="flex items-start justify-between gap-3 px-4 sm:px-5 pt-3 pb-3 sm:py-4 border-b border-[#E4E7EC] shrink-0">
    <div className="flex items-start gap-3 min-w-0">
      {Icon && (
        <div className="w-10 h-10 rounded-xl bg-[#004898] text-white flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5" />
        </div>
      )}
      <div className="min-w-0">
        <h3 className="text-base sm:text-lg font-extrabold text-[#172033] leading-snug truncate">{title}</h3>
        {subtitle && <div className="text-xs text-[#667085] mt-0.5">{subtitle}</div>}
        {children}
      </div>
    </div>
    {onClose && (
      <button
        type="button"
        onClick={onClose}
        disabled={closeDisabled}
        aria-label="Close"
        className="-mr-1 p-2 rounded-lg text-[#667085] hover:text-[#172033] hover:bg-[#F2F4F7] transition-colors disabled:opacity-50 shrink-0"
      >
        <X className="w-5 h-5" />
      </button>
    )}
  </div>
);

export const ModalBody = ({ className = '', children }) => (
  <div className={`sales-modal-body flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-5 py-4 ${className}`}>
    {children}
  </div>
);

// Buttons share the row on phones (big tap targets), sit right-aligned on
// desktop. `start` is optional content on the left (e.g. a hint).
export const ModalFooter = ({ start, children }) => (
  <div className="sales-modal-footer shrink-0 border-t border-[#E4E7EC] bg-white px-4 sm:px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-3 rounded-b-none sm:rounded-b-2xl">
    {start && <div className="mb-2 sm:mb-0 sm:hidden">{start}</div>}
    <div className="flex items-center gap-2 sm:justify-end">
      {start && <div className="hidden sm:block mr-auto min-w-0">{start}</div>}
      <div className="flex items-center gap-2 w-full sm:w-auto [&>button]:flex-1 sm:[&>button]:flex-none">
        {children}
      </div>
    </div>
  </div>
);

// Standard footer buttons, so every Sales popup looks the same.
export const btnSecondary = 'px-4 py-2.5 sm:py-2 text-sm font-semibold rounded-lg border border-[#E4E7EC] bg-white text-[#344054] hover:bg-[#F8FAFC] disabled:opacity-60 transition-colors';
export const btnPrimary = 'px-4 py-2.5 sm:py-2 text-sm font-semibold rounded-lg bg-[#004898] text-white hover:bg-[#00346E] disabled:opacity-50 transition-colors inline-flex items-center justify-center gap-1.5';
export const btnDanger = 'px-4 py-2.5 sm:py-2 text-sm font-semibold rounded-lg bg-[#D92D20] text-white hover:bg-[#B42318] disabled:opacity-60 transition-colors';
