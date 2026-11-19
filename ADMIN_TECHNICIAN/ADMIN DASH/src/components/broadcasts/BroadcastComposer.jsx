import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Search, Users, UserCheck, AlertTriangle, RotateCcw, Send } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { BroadcastCard } from './BroadcastCard';
import {
  BROADCAST_TONES, BROADCAST_TEMPLATES, BROADCAST_LIMITS, EMOJI_CHOICES, EMPLOYEE_TYPE_LABELS,
  splitHighlight, greetingFor, fmtTimeLeft
} from './broadcastShared';
import {
  fetchBroadcastEmployeesInApi, createBroadcastInApi, removeBroadcastRecipientInApi
} from '../../services/broadcastApiService';

// "New broadcast": template → tone, emoji, headline, highlight, message,
// steps → audience. The live preview on the right is the real popup card.
// Anyone already in a live broadcast is greyed out in the picker (one live
// broadcast per person); "Remove" there takes them out of it.

const ROLE_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'technician', label: 'Technician' },
  { id: 'sales', label: 'Sales' },
  { id: 'back_office', label: 'Back-Office' }
];

const keyOf = (e) => `${e.employee_type}:${e.id}`;

const emptyForm = () => {
  const t = BROADCAST_TEMPLATES[0];
  return { templateId: t.id, tone: t.tone, emoji: t.emoji, headline: t.headline, highlight: t.highlight, message: t.message, steps: [...t.steps] };
};

const Counter = ({ value, max }) => (
  <span className={`text-[11px] tabular-nums ${value > max ? 'text-[#D92D20] font-bold' : 'text-[#98A2B3]'}`}>{value}/{max}</span>
);

const Section = ({ title, hint, children }) => (
  <section className="space-y-2.5">
    <div>
      <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-[#667085]">{title}</h4>
      {hint && <p className="text-xs text-[#98A2B3] mt-0.5">{hint}</p>}
    </div>
    {children}
  </section>
);

export const BroadcastComposer = ({ onClose, onSent }) => {
  const { showToast, currentUser } = useApp();
  const [form, setForm] = useState(emptyForm);
  const [audience, setAudience] = useState('custom');
  const [selected, setSelected] = useState(() => new Set());
  const [roleFilter, setRoleFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [employees, setEmployees] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [sending, setSending] = useState(false);
  const [mobileTab, setMobileTab] = useState('edit');
  const [previewKey, setPreviewKey] = useState(0);

  const loadEmployees = useCallback(async () => {
    try {
      const data = await fetchBroadcastEmployeesInApi();
      setEmployees(data || []);
      setLoadError(null);
      // Drop anyone who is now busy or gone from the selection.
      const free = new Set((data || []).filter((e) => !e.live_broadcast).map(keyOf));
      setSelected((prev) => new Set([...prev].filter((k) => free.has(k))));
    } catch (err) {
      setLoadError(err.message || 'Could not load employees');
    }
  }, []);

  useEffect(() => { loadEmployees(); }, [loadEmployees]);

  const set = (field) => (e) => setForm((f) => ({ ...f, templateId: null, [field]: e.target.value }));

  const applyTemplate = (t) => {
    setForm({ templateId: t.id, tone: t.tone, emoji: t.emoji, headline: t.headline, highlight: t.highlight, message: t.message, steps: [...t.steps] });
    setPreviewKey((k) => k + 1);
  };

  const setStep = (i, value) => setForm((f) => ({ ...f, templateId: null, steps: f.steps.map((s, j) => (j === i ? value : s)) }));
  const addStep = () => setForm((f) => ({ ...f, steps: [...f.steps, ''] }));
  const removeStep = (i) => setForm((f) => ({ ...f, templateId: null, steps: f.steps.filter((_, j) => j !== i) }));

  const busyCount = useMemo(() => (employees || []).filter((e) => e.live_broadcast).length, [employees]);
  const everyoneBlocked = busyCount > 0;

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (employees || []).filter((e) =>
      (roleFilter === 'all' || e.employee_type === roleFilter) &&
      (!q || e.full_name.toLowerCase().includes(q) || (e.location || '').toLowerCase().includes(q))
    );
  }, [employees, roleFilter, search]);
  const shownFree = shown.filter((e) => !e.live_broadcast);
  const allShownSelected = shownFree.length > 0 && shownFree.every((e) => selected.has(keyOf(e)));

  const toggle = (e) => setSelected((prev) => {
    const next = new Set(prev);
    const k = keyOf(e);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });
  const toggleAllShown = () => setSelected((prev) => {
    const next = new Set(prev);
    shownFree.forEach((e) => (allShownSelected ? next.delete(keyOf(e)) : next.add(keyOf(e))));
    return next;
  });

  const removeFromLive = async (e) => {
    setRemoving(keyOf(e));
    try {
      await removeBroadcastRecipientInApi(e.live_broadcast.id, e.employee_type, e.id);
      showToast(`${e.full_name} removed from "${e.live_broadcast.headline}".`, 'success');
      await loadEmployees();
    } catch (err) {
      showToast(err.message || 'Could not remove them', 'error');
    } finally {
      setRemoving(null);
    }
  };

  // Mirrors the backend checks (services/broadcastService.js) so Send is
  // only enabled for something the server will accept.
  const steps = form.steps.map((s) => s.trim()).filter(Boolean);
  const highlightMissing = form.highlight.trim() !== '' && !splitHighlight(form.headline, form.highlight).match;
  const recipientCount = audience === 'everyone' ? (employees || []).length : selected.size;
  const problems = [
    !form.headline.trim() && 'Add a headline',
    form.headline.trim().length > BROADCAST_LIMITS.headline && 'Headline is too long',
    form.highlight.trim().length > BROADCAST_LIMITS.highlight && 'Highlight is too long',
    highlightMissing && 'The highlight must be a word or phrase from the headline',
    !form.message.trim() && 'Add a message',
    form.message.trim().length > BROADCAST_LIMITS.message && 'Message is too long',
    steps.some((s) => s.length > BROADCAST_LIMITS.step) && `Keep each step under ${BROADCAST_LIMITS.step} characters`,
    !form.emoji.trim() && 'Pick an emoji',
    audience === 'everyone' && everyoneBlocked && 'Everyone is unavailable while some people are in a live broadcast',
    recipientCount === 0 && (audience === 'everyone' ? 'There are no active employees' : 'Pick at least one person')
  ].filter(Boolean);

  const send = async () => {
    if (problems.length || sending) return;
    setSending(true);
    try {
      await createBroadcastInApi({
        tone: form.tone,
        emoji: form.emoji.trim(),
        headline: form.headline.trim(),
        highlight: form.highlight.trim() || null,
        message: form.message.trim(),
        steps,
        audience,
        recipients: audience === 'custom'
          ? (employees || []).filter((e) => selected.has(keyOf(e))).map((e) => ({ employee_type: e.employee_type, employee_id: e.id }))
          : []
      });
      showToast(`Broadcast sent to ${recipientCount} ${recipientCount === 1 ? 'person' : 'people'}.`, 'success');
      onSent?.();
    } catch (err) {
      showToast(err.message || 'Could not send the broadcast', 'error');
      loadEmployees();
      setSending(false);
    }
  };

  const tone = BROADCAST_TONES[form.tone];
  const firstPick = (employees || []).find((e) => selected.has(keyOf(e)));
  const previewBroadcast = {
    tone: form.tone,
    emoji: form.emoji || '📢',
    headline: form.headline || 'Your headline',
    highlight: form.highlight,
    message: form.message || 'Your message shows here.',
    steps,
    created_by_name: currentUser?.name,
    created_at: new Date().toISOString()
  };

  const inputCls = 'w-full px-3 py-2 border border-[#E4E7EC] rounded-lg text-sm text-[#172033] outline-none focus:border-[#004898] bg-white';

  const editor = (
    <div className="space-y-6">
      <Section title="Start from a template" hint="Fills everything in. Change any text before sending.">
        <div className="flex flex-wrap gap-2">
          {BROADCAST_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => applyTemplate(t)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all cursor-pointer ${
                form.templateId === t.id ? 'bg-[#004898] border-[#004898] text-white' : 'bg-white border-[#E4E7EC] text-[#475467] hover:border-[#004898]'
              }`}
            >
              {t.emoji} {t.name}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Tone" hint={tone.ack ? 'Employees must tick "I understand" before Got it.' : form.tone === 'kudos' ? 'Opens with a confetti burst.' : null}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {Object.entries(BROADCAST_TONES).map(([id, t]) => (
            <button
              key={id}
              type="button"
              onClick={() => setForm((f) => ({ ...f, templateId: null, tone: id }))}
              className="px-3 py-2 rounded-xl text-xs font-extrabold border-2 transition-all cursor-pointer"
              style={form.tone === id
                ? { background: t.soft, borderColor: t.color, color: t.ink }
                : { background: '#fff', borderColor: '#E4E7EC', color: '#475467' }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Emoji">
        <div className="flex flex-wrap items-center gap-1.5">
          {EMOJI_CHOICES.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => setForm((f) => ({ ...f, templateId: null, emoji }))}
              aria-label={`Use ${emoji}`}
              className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center border-2 transition-all cursor-pointer ${
                form.emoji === emoji ? 'border-[#004898] bg-[#EFF5FC]' : 'border-transparent hover:bg-[#F2F4F7]'
              }`}
            >
              {emoji}
            </button>
          ))}
          <input
            id="bx-emoji-other"
            value={EMOJI_CHOICES.includes(form.emoji) ? '' : form.emoji}
            onChange={set('emoji')}
            maxLength={16}
            placeholder="Other"
            aria-label="Other emoji"
            className="w-20 h-10 px-2 border border-[#E4E7EC] rounded-xl text-center text-lg outline-none focus:border-[#004898]"
          />
        </div>
      </Section>

      <Section title="Headline">
        <input id="bx-headline" value={form.headline} onChange={set('headline')} placeholder="e.g. Turn on location when you check in" className={`${inputCls} font-bold`} />
        <div className="flex justify-end"><Counter value={form.headline.trim().length} max={BROADCAST_LIMITS.headline} /></div>
      </Section>

      <Section title="Highlight" hint="A word or phrase from the headline. It gets a marker swipe in the tone's colour.">
        <input id="bx-highlight" value={form.highlight} onChange={set('highlight')} placeholder="e.g. location" className={inputCls} />
        {highlightMissing && (
          <p className="text-xs font-semibold text-[#B54708] flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> "{form.highlight.trim()}" isn't in the headline
          </p>
        )}
      </Section>

      <Section title="Message">
        <textarea id="bx-message-input" value={form.message} onChange={set('message')} rows={4} placeholder="What do you want them to know or do?" className={`${inputCls} resize-y leading-relaxed`} />
        <div className="flex justify-end"><Counter value={form.message.trim().length} max={BROADCAST_LIMITS.message} /></div>
      </Section>

      <Section title="Steps (optional)" hint="Up to 3 short steps, shown as numbered chips.">
        <div className="space-y-2">
          {form.steps.map((step, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full text-white text-xs font-extrabold flex items-center justify-center shrink-0" style={{ background: tone.color }}>{i + 1}</span>
              <input id={`bx-step-${i}`} value={step} onChange={(e) => setStep(i, e.target.value)} maxLength={BROADCAST_LIMITS.step} placeholder="e.g. Tap Check In" className={inputCls} />
              <button type="button" onClick={() => removeStep(i)} aria-label={`Remove step ${i + 1}`} className="p-2 text-[#98A2B3] hover:text-[#D92D20] rounded-lg cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          {form.steps.length < BROADCAST_LIMITS.steps && (
            <button type="button" onClick={addStep} className="text-xs font-bold text-[#004898] flex items-center gap-1 cursor-pointer hover:underline">
              <Plus className="w-3.5 h-3.5" /> Add step
            </button>
          )}
        </div>
      </Section>

      <Section title="Send to">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setAudience('everyone')}
            className={`text-left p-3 rounded-xl border-2 transition-all cursor-pointer ${audience === 'everyone' ? 'border-[#004898] bg-[#EFF5FC]' : 'border-[#E4E7EC] bg-white hover:border-[#B3D1F2]'}`}
          >
            <span className="flex items-center gap-2 text-sm font-extrabold text-[#172033]"><Users className="w-4 h-4 text-[#004898]" /> Everyone</span>
            <span className="block text-xs text-[#667085] mt-0.5">
              {employees ? `${employees.length} active employees` : 'Loading…'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setAudience('custom')}
            className={`text-left p-3 rounded-xl border-2 transition-all cursor-pointer ${audience === 'custom' ? 'border-[#004898] bg-[#EFF5FC]' : 'border-[#E4E7EC] bg-white hover:border-[#B3D1F2]'}`}
          >
            <span className="flex items-center gap-2 text-sm font-extrabold text-[#172033]"><UserCheck className="w-4 h-4 text-[#004898]" /> Choose people</span>
            <span className="block text-xs text-[#667085] mt-0.5">{selected.size} selected</span>
          </button>
        </div>

        {audience === 'everyone' && everyoneBlocked && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-[#FFFAEB] border border-[#FEDF89] text-xs text-[#93370D]">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
            <span>
              {busyCount === 1 ? '1 person already has' : `${busyCount} people already have`} a live broadcast, so Everyone can't be used yet.{' '}
              <button type="button" onClick={() => setAudience('custom')} className="font-bold underline cursor-pointer">Choose people instead</button>
            </span>
          </div>
        )}

        {audience === 'custom' && (
          <div className="border border-[#E4E7EC] rounded-xl bg-white overflow-hidden">
            <div className="p-3 space-y-2.5 border-b border-[#E4E7EC] bg-[#F9FAFB]">
              <div className="flex flex-wrap gap-1.5">
                {ROLE_FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setRoleFilter(f.id)}
                    className={`px-3 py-1 rounded-full text-xs font-bold border transition-all cursor-pointer ${
                      roleFilter === f.id ? 'bg-[#172033] border-[#172033] text-white' : 'bg-white border-[#E4E7EC] text-[#475467] hover:border-[#98A2B3]'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="relative">
                <Search className="w-4 h-4 text-[#98A2B3] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
                <input
                  id="bx-search"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or branch"
                  className={inputCls}
                />
              </div>
              <label className="flex items-center gap-2 text-xs font-bold text-[#475467] cursor-pointer w-fit">
                <input type="checkbox" checked={allShownSelected} onChange={toggleAllShown} disabled={!shownFree.length} className="w-4 h-4 accent-[#004898]" />
                Select all shown ({shownFree.length})
              </label>
            </div>

            <ul className="max-h-72 overflow-y-auto divide-y divide-[#F2F4F7]">
              {loadError ? (
                <li className="p-4 text-xs text-[#D92D20]">{loadError}</li>
              ) : !employees ? (
                <li className="p-4 text-xs text-[#667085]">Loading employees…</li>
              ) : shown.length === 0 ? (
                <li className="p-4 text-xs text-[#667085]">Nobody matches.</li>
              ) : shown.map((e) => {
                const busy = e.live_broadcast;
                return (
                  <li key={keyOf(e)} className={`flex items-center gap-3 px-3 py-2.5 ${busy ? 'bg-[#F9FAFB]' : ''}`}>
                    <input
                      type="checkbox"
                      id={`bx-pick-${e.id}`}
                      checked={selected.has(keyOf(e))}
                      disabled={!!busy}
                      onChange={() => toggle(e)}
                      className="w-4 h-4 accent-[#004898] shrink-0 disabled:cursor-not-allowed"
                    />
                    <label htmlFor={`bx-pick-${e.id}`} className={`min-w-0 flex-1 ${busy ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                      <span className={`block text-sm font-bold truncate ${busy ? 'text-[#98A2B3]' : 'text-[#172033]'}`}>{e.full_name}</span>
                      {busy ? (
                        <span className="block text-[11px] text-[#667085] truncate">
                          {busy.emoji} In "{busy.headline}" · {fmtTimeLeft(busy.expires_at)}
                        </span>
                      ) : (
                        <span className="block text-[11px] text-[#98A2B3] truncate">{e.location || 'No branch'}</span>
                      )}
                    </label>
                    <span className="text-[10px] font-bold uppercase tracking-wide text-[#667085] bg-[#F2F4F7] px-2 py-0.5 rounded-full shrink-0">
                      {EMPLOYEE_TYPE_LABELS[e.employee_type]}
                    </span>
                    {busy && (
                      <button
                        type="button"
                        onClick={() => removeFromLive(e)}
                        disabled={removing === keyOf(e)}
                        className="text-[11px] font-bold text-[#D92D20] hover:underline cursor-pointer disabled:opacity-50 shrink-0"
                      >
                        {removing === keyOf(e) ? 'Removing…' : 'Remove'}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </Section>
    </div>
  );

  const preview = (
    <div className="flex flex-col items-center gap-3">
      <div className="w-full max-w-[400px] bg-white rounded-3xl shadow-[0_24px_60px_-24px_rgba(15,23,42,0.35)] border border-[#E4E7EC] overflow-hidden px-6 pt-7 pb-6">
        <BroadcastCard key={previewKey} broadcast={previewBroadcast} greeting={greetingFor(firstPick?.full_name)} locked>
          {tone.ack && (
            <div className="mt-4 w-full flex items-center gap-2.5 text-left text-[13.5px] font-semibold text-[#1E293B] rounded-xl px-3 py-2.5 border-[1.5px] border-dashed" style={{ borderColor: tone.color, background: tone.soft }}>
              <span className="w-[18px] h-[18px] rounded border-2 border-[#98A2B3] bg-white shrink-0" /> I've read this and I understand
            </div>
          )}
          <div className="mt-5 w-full rounded-2xl px-4 py-[15px] text-[15px] font-extrabold overflow-hidden" style={{ background: tone.soft, color: tone.ink }}>
            Read this first · 5s
          </div>
          <p className="mt-3 text-[11.5px] text-[#98A2B3]">You'll only see this once</p>
        </BroadcastCard>
      </div>
      <button type="button" onClick={() => setPreviewKey((k) => k + 1)} className="text-xs font-bold text-[#667085] hover:text-[#004898] flex items-center gap-1.5 cursor-pointer">
        <RotateCcw className="w-3.5 h-3.5" /> Replay animation
      </button>
    </div>
  );

  // Portalled to <body>: <main> is its own stacking context (relative z-0),
  // so inside it the mobile bottom nav would cover the Send button.
  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-stretch sm:items-center justify-center sm:p-4">
      <div className="bg-white w-full max-w-6xl sm:rounded-2xl shadow-2xl border border-[#E4E7EC] overflow-hidden flex flex-col sm:max-h-[94vh]">
        <div className="px-5 py-4 border-b border-[#E4E7EC] bg-[#F8FAFC] flex items-center justify-between gap-3">
          <div>
            <h3 className="font-extrabold text-lg text-[#172033]">New broadcast</h3>
            <p className="text-xs text-[#667085]">Pops up when they open the app and before Check In. Live for 24 hours.</p>
          </div>
          <button onClick={onClose} disabled={sending} aria-label="Close" className="p-1.5 text-[#667085] hover:text-[#172033] rounded-lg hover:bg-white transition-all disabled:opacity-50 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="lg:hidden flex border-b border-[#E4E7EC]">
          {['edit', 'preview'].map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setMobileTab(tab)}
              className={`flex-1 py-2.5 text-xs font-extrabold capitalize border-b-2 cursor-pointer ${mobileTab === tab ? 'border-[#004898] text-[#004898]' : 'border-transparent text-[#667085]'}`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0 grid lg:grid-cols-[minmax(0,1fr)_440px]">
          <div className={`overflow-y-auto p-5 sm:p-6 ${mobileTab === 'edit' ? 'block' : 'hidden'} lg:block`}>
            {editor}
          </div>
          <div className={`overflow-y-auto p-5 sm:p-6 bg-[#F2F4F7] border-l border-[#E4E7EC] ${mobileTab === 'preview' ? 'block' : 'hidden'} lg:block`}>
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#667085] mb-4 text-center">What they'll see</p>
            {preview}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-[#E4E7EC] bg-[#F9FAFB] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className={`text-xs font-semibold ${problems.length ? 'text-[#B54708]' : 'text-[#667085]'}`}>
            {problems.length ? problems[0] : `Sends to ${recipientCount} ${recipientCount === 1 ? 'person' : 'people'} · live for 24 hours`}
          </p>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} disabled={sending} className="btn btn-secondary text-xs font-bold">Cancel</button>
            <button type="button" onClick={send} disabled={!!problems.length || sending} className="btn btn-primary text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed">
              <Send className="w-4 h-4" /> {sending ? 'Sending…' : 'Send broadcast'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
