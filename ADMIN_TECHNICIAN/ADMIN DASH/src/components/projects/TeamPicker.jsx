import React, { useMemo, useState } from 'react';
import { Search, X, Check } from 'lucide-react';
import { Avatar } from '../common/Avatar';

// Searchable multi-select of technicians, with the picks shown as chips.
export const TeamPicker = ({ label, people, value, onChange, placeholder }) => {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const needle = q.trim().toLowerCase();
  const matches = people.filter((p) => !needle || `${p.name} ${p.role_title || ''} ${p.location || ''}`.toLowerCase().includes(needle));
  const toggle = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  return (
    <div>
      <label className="block text-xs font-bold text-[#172033] mb-1.5">
        {label} {value.length > 0 && <span className="text-[#004898]">({value.length})</span>}
      </label>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {value.map((id) => {
            const p = byId.get(id);
            return (
              <span key={id} className="inline-flex items-center gap-1.5 pl-1 pr-1.5 py-1 rounded-full bg-[#EFF5FC] border border-[#B3D1F2] text-[11px] font-bold text-[#004898]">
                <Avatar src={p?.avatar_url} name={p?.name} className="w-5 h-5" textClassName="text-[8px]" />
                {p?.name || 'Unknown'}
                <button type="button" onClick={() => toggle(id)} className="p-0.5 rounded-full hover:bg-white" aria-label={`Remove ${p?.name || ''}`}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#98A2B3]" />
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          style={{ paddingLeft: '36px' }}
          className="w-full px-3 py-2 border border-[#E4E7EC] rounded-lg text-xs outline-none focus:border-[#004898]"
        />
        {open && (
          <div className="absolute z-20 left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-white border border-[#E4E7EC] rounded-xl shadow-xl py-1">
            {matches.length === 0 ? (
              <div className="px-3 py-3 text-xs text-[#667085]">No technicians match.</div>
            ) : matches.map((p) => {
              const on = value.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => toggle(p.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[#F8FAFC] ${on ? 'bg-[#EFF5FC]' : ''}`}
                >
                  <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${on ? 'bg-[#004898] border-[#004898] text-white' : 'border-[#D0D5DD]'}`}>
                    {on && <Check className="w-3 h-3" strokeWidth={3} />}
                  </span>
                  <Avatar src={p.avatar_url} name={p.name} className="w-6 h-6" textClassName="text-[9px]" />
                  <span className="text-xs font-bold text-[#172033] flex-1 truncate">{p.name}</span>
                  <span className="text-[10px] text-[#98A2B3] truncate max-w-[40%]">{p.role_title || p.location || ''}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
