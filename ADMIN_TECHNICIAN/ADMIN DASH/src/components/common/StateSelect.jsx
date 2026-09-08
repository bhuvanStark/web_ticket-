import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { INDIA_STATES } from '../../utils/indiaStates';

// Searchable single-select for an Indian state. Type to filter, click / Enter to
// pick. Strict: `value` is only ever one of INDIA_STATES (or '').
export const StateSelect = ({
  value = '',
  onChange,
  placeholder = 'Select a state…',
  className = 'w-full px-3 py-2 border border-[#E4E7EC] rounded-lg text-xs outline-none focus:border-[#004898]',
  id,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const wrapRef = useRef(null);

  useEffect(() => {
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const q = query.trim().toLowerCase();
  const matches = q
    ? INDIA_STATES.filter(s => s.toLowerCase().includes(q))
    : INDIA_STATES;

  const pick = (state) => {
    onChange?.(state);
    setQuery('');
    setOpen(false);
  };

  const handleKeyDown = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { setOpen(true); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, matches.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (matches[activeIdx]) pick(matches[activeIdx]); }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-[#98A2B3] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          autoComplete="off"
          value={open ? query : value}
          placeholder={value || placeholder}
          onFocus={() => { setOpen(true); setActiveIdx(0); }}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setActiveIdx(0); }}
          onKeyDown={handleKeyDown}
          className={`${className} pl-8 pr-7`}
        />
        <ChevronDown className="w-4 h-4 text-[#98A2B3] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>

      {open && (
        <ul className="absolute z-30 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-[#E4E7EC] rounded-lg shadow-lg py-1 text-xs">
          {matches.length === 0 && (
            <li className="px-3 py-2 text-[#98A2B3]">No state matches “{query}”.</li>
          )}
          {matches.map((s, i) => (
            <li
              key={s}
              onMouseDown={(e) => { e.preventDefault(); pick(s); }}
              onMouseEnter={() => setActiveIdx(i)}
              className={`px-3 py-2 cursor-pointer ${
                i === activeIdx ? 'bg-[#EFF5FC] text-[#004898] font-semibold' : 'text-[#172033]'
              } ${s === value ? 'font-bold' : ''}`}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
