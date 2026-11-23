// Catalog rules shared by the Items page and its Clean-up screen:
// Brand (group) > shared Category > Item, an item identified by brand +
// model no. Creating a brand or category goes through NewNameField, which
// warns first and lists look-alike names so near-duplicates ("Krammer",
// "Displays") aren't made by mistake. The server blocks exact duplicates.
import React, { useMemo, useState } from 'react';
import { AlertTriangle, Check, Loader2, Plus, X } from 'lucide-react';

export const Modal = ({ title, icon: Icon, onClose, children, wide, busy }) => (
  <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
    <div className={`bg-white w-full ${wide ? 'max-w-4xl' : 'max-w-lg'} rounded-2xl shadow-2xl border border-[#E4E7EC] overflow-hidden flex flex-col max-h-[90vh]`}>
      <div className="p-5 border-b border-[#E4E7EC] bg-[#F8FAFC] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#004898] text-white flex items-center justify-center"><Icon className="w-5 h-5" /></div>
          <h3 className="font-extrabold text-lg text-[#172033]">{title}</h3>
        </div>
        <button onClick={onClose} disabled={busy} className="p-1 text-[#667085] hover:text-[#172033] rounded-lg hover:bg-white disabled:opacity-50"><X className="w-5 h-5" /></button>
      </div>
      {children}
    </div>
  </div>
);

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    for (let j = 1; j <= b.length; j += 1) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

// Names in `list` that look like `name`: same letters, one inside the
// other, a plural, or a typo or two apart.
export function similarNames(name, list) {
  const n = norm(name);
  if (n.length < 2) return [];
  return list.filter((item) => {
    const m = norm(item.name);
    if (!m) return false;
    if (m === n) return true;
    if (Math.min(m.length, n.length) >= 3 && (m.includes(n) || n.includes(m))) return true;
    return Math.min(m.length, n.length) >= 4 && editDistance(m, n) <= 2;
  });
}

export const exactMatch = (name, list) => list.find((item) => norm(item.name) === norm(name));

const looksLike = (a, b) => {
  const x = norm(a);
  const y = norm(b);
  return Boolean(x && y) && (x === y || (Math.min(x.length, y.length) >= 4 && editDistance(x, y) <= 2));
};

// Reads the old "Model Name / Make" text (e.g. "Kramer VM-4HDT",
// "Kramer-VS-44H2A", "55UL5Q") for a likely brand and model no.
// - Starts with a brand's exact name → that brand, and the rest is the model no.
// - Starts with a word that looks like a brand (a typo such as "Krammer", or
//   the item's current brand) → the rest is the model no; no brand suggested.
// - One bare token such as "55UL5Q" → the whole text, but not `confident`, so
//   "Apply suggestions" leaves it for a person to check.
// Anything else (free text) → no suggestion.
export function suggestFromMake(remark, groups, currentGroupName) {
  const raw = String(remark ?? '').trim();
  if (!raw) return {};
  const lower = raw.toLowerCase();
  const names = [...groups.map((g) => ({ id: g.id, name: g.name }))].sort((a, b) => b.name.length - a.name.length);
  let brand = null;
  for (const g of names) {
    const gl = g.name.toLowerCase();
    if (lower.startsWith(gl) && (lower.length === gl.length || /[\s\-_/:]/.test(lower[gl.length]))) { brand = g; break; }
  }
  const firstWord = raw.split(/[\s\-_/:]+/)[0];
  const brandLike = firstWord.length < raw.length
    && (looksLike(firstWord, currentGroupName) || groups.some((g) => looksLike(firstWord, g.name)));
  let rest = null;
  let confident = true;
  if (brand) rest = raw.slice(brand.name.length);
  else if (brandLike) rest = raw.slice(firstWord.length);
  else if (!/\s/.test(raw)) { rest = raw; confident = false; }
  const modelNo = rest == null ? null : rest.replace(/^[\s\-_/:]+/, '').trim();
  const usable = modelNo && modelNo.length <= 100 && modelNo.split(/\s+/).length <= 3;
  return {
    groupId: brand?.id || null,
    groupName: brand?.name || null,
    modelNo: usable ? modelNo : null,
    confident: usable ? confident : false
  };
}

// Inline "+ New brand / + New category" with the check-first warning.
// onCreate(name) creates it; onPick(existing) uses a match instead.
export const NewNameField = ({ kind, existing, onCreate, onPick, onCancel, autoFocus = true }) => {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const matches = useMemo(() => similarNames(name, existing).slice(0, 6), [name, existing]);
  const exact = exactMatch(name, existing);

  const create = async () => {
    const value = name.trim();
    if (!value || exact) return;
    setBusy(true);
    setError('');
    try { await onCreate(value); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <div className="rounded-xl border border-[#FEC84B] bg-[#FFFCF5] p-3 space-y-2.5">
      <p className="flex items-start gap-2 text-[11px] leading-snug text-[#93370D]">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px text-[#DC6803]" />
        <span><b>Check the list first.</b> Only create a new {kind} if it isn't there already — under a slightly different spelling too.</span>
      </p>
      <div className="flex gap-2">
        <input
          autoFocus={autoFocus} value={name} disabled={busy}
          onChange={(e) => { setName(e.target.value); setError(''); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); create(); }
            if (e.key === 'Escape') { e.stopPropagation(); onCancel(); }
          }}
          placeholder={kind === 'brand' ? 'Brand name, e.g. LG' : 'Category name, e.g. Display'}
          className="flex-1 min-w-0 px-3 py-2 text-sm bg-white border border-[#E4E7EC] rounded-lg outline-none focus:border-[#004898] focus:ring-2 focus:ring-[#004898]/10"
        />
        <button type="button" onClick={onCancel} disabled={busy} className="btn btn-secondary !px-2.5 shrink-0" title="Cancel"><X className="w-4 h-4" /></button>
      </div>
      {matches.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#B54708]">{exact ? 'Already exists' : 'Looks similar — is it one of these?'}</p>
          <div className="flex flex-wrap gap-1.5">
            {matches.map((m) => (
              <button key={m.id} type="button" onClick={() => onPick(m)}
                className="inline-flex items-center gap-1 text-xs font-semibold bg-white border border-[#E4E7EC] hover:border-[#004898] hover:text-[#004898] rounded-lg px-2 py-1">
                <Check className="w-3 h-3" />Use “{m.name}”
              </button>
            ))}
          </div>
        </div>
      )}
      {error && <p className="text-[11px] font-semibold text-[#B42318]">{error}</p>}
      <button type="button" onClick={create} disabled={busy || !name.trim() || Boolean(exact)}
        className="btn btn-primary text-xs w-full justify-center disabled:opacity-50">
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
        {!name.trim() ? `Type a ${kind} name` : exact ? `“${exact.name}” exists — use it above`
          : matches.length ? `None of these — create “${name.trim()}”` : `Create ${kind} “${name.trim()}”`}
      </button>
    </div>
  );
};

// Category <select> for a brand: its own categories first, then the shared
// list to reuse, then "+ New category…" (value '__new').
export const CategoryOptions = ({ group, categories }) => {
  const own = new Set((group?.categories || []).map((c) => c.id));
  const mine = categories.filter((c) => own.has(c.id));
  const others = categories.filter((c) => !own.has(c.id));
  return (
    <>
      {mine.length > 0 && (
        <optgroup label={`In ${group.name}`}>
          {mine.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </optgroup>
      )}
      {others.length > 0 && (
        <optgroup label={group ? 'Reuse from other brands' : 'Categories'}>
          {others.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </optgroup>
      )}
      <option value="__new">+ New category…</option>
    </>
  );
};
