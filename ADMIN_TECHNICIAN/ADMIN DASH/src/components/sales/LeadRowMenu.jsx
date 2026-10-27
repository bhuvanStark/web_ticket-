// "⋯" overflow menu for a lead row's secondary actions (Details, Assign,
// Edit, Delete / Release). Rendered in a portal with fixed positioning so the
// table's overflow wrappers can never clip it; it opens upward when there is
// no room below. Closes on outside click, Escape, scroll or resize.
//
// items: [{ label, icon, onClick, disabled?, reason?, danger?, divider? }]
// `reason` explains a disabled item, shown under its label (titles don't
// show on touch screens).
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';

const MENU_WIDTH = 224;

export const LeadRowMenu = ({ items, label = 'More actions', className = '' }) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const r = buttonRef.current.getBoundingClientRect();
    const menuHeight = menuRef.current?.offsetHeight || 0;
    const left = Math.max(8, Math.min(r.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8));
    const below = r.bottom + 6;
    const top = below + menuHeight > window.innerHeight - 8 ? Math.max(8, r.top - menuHeight - 6) : below;
    setPos({ top, left });
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const close = () => setOpen(false);
    const onDown = (e) => {
      if (menuRef.current?.contains(e.target) || buttonRef.current?.contains(e.target)) return;
      close();
    };
    const onKey = (e) => { if (e.key === 'Escape') { close(); buttonRef.current?.focus(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => { setPos(null); setOpen((v) => !v); }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        className={`p-2 md:p-1.5 rounded-lg border bg-white text-[#475467] hover:bg-[#F8FAFC] hover:text-[#172033] ${open ? 'border-[#B3D1F2] bg-[#EFF5FC]' : 'border-[#E4E7EC]'} ${className}`}
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{ position: 'fixed', top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: MENU_WIDTH, visibility: pos ? 'visible' : 'hidden' }}
          className="z-[60] rounded-xl border border-[#E4E7EC] bg-white py-1.5 shadow-xl"
        >
          {items.filter(Boolean).map((item) => {
            const Icon = item.icon;
            return (
              <React.Fragment key={item.label}>
                {item.divider && <div className="my-1.5 border-t border-[#F2F4F7]" />}
                <button
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={() => { setOpen(false); item.onClick(); }}
                  className={`w-full flex items-start gap-2.5 px-3 py-2 text-left text-[13px] font-semibold disabled:cursor-not-allowed ${
                    item.danger ? 'text-[#D92D20] hover:bg-[#FEF3F2]' : 'text-[#344054] hover:bg-[#F8FAFC]'
                  } disabled:hover:bg-transparent`}
                >
                  {Icon && <Icon className={`w-4 h-4 mt-px shrink-0 ${item.disabled ? 'opacity-40' : ''}`} />}
                  <span className="min-w-0">
                    <span className={item.disabled ? 'opacity-40' : ''}>{item.label}</span>
                    {item.disabled && item.reason && (
                      <span className="block text-[11px] font-normal text-[#667085] leading-snug mt-0.5">{item.reason}</span>
                    )}
                  </span>
                </button>
              </React.Fragment>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
};
