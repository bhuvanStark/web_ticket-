import React from 'react';
import { BROADCAST_TONES, splitHighlight } from './broadcastShared';

// The broadcast's content: TASKTEL label, tone label, emoji, greeting, headline
// with its highlight, message and steps. Rendered by the employee popup and
// by the admin composer's live preview, so both always look the same.
// `children` is the action area (the popup's button; a stand-in in preview).
export const BroadcastCard = ({ broadcast, greeting, locked = false, children }) => {
  const tone = BROADCAST_TONES[broadcast.tone] || BROADCAST_TONES.info;
  const { before, match, after } = splitHighlight(broadcast.headline, broadcast.highlight);
  const steps = (broadcast.steps || []).filter((step) => step && step.trim());

  return (
    <div
      className={`relative flex flex-col items-center text-center ${locked ? 'bx-locked' : ''}`}
      style={{ '--bx-color': tone.color, '--bx-soft': tone.soft }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-x-7 -top-7 h-44"
        style={{ background: `radial-gradient(120% 100% at 50% 0%, ${tone.soft} 0%, rgba(255,255,255,0) 72%)` }}
      />

      <div className="relative w-full flex items-center justify-between gap-3 mb-3.5">
        <span className="flex items-center gap-2 min-w-0 text-xs font-semibold text-[#667085]">
          <span className="w-[22px] h-[22px] rounded-md bg-[#004898] text-white text-[11px] font-extrabold flex items-center justify-center shrink-0">T</span>
          <span className="truncate">TASKTEL</span>
        </span>
        <span
          className="shrink-0 text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full"
          style={{ color: tone.ink, background: tone.soft }}
        >
          {tone.label}
        </span>
      </div>

      <div className="relative w-[92px] h-[92px] flex items-center justify-center mt-1 mb-3.5">
        <span className="bx-ring absolute inset-0 rounded-full" />
        <span className="bx-ring absolute inset-0 rounded-full" />
        <span className="absolute inset-2.5 rounded-full" style={{ background: tone.soft }} />
        <span className="bx-emoji relative text-[46px] leading-none" aria-hidden="true">{broadcast.emoji}</span>
      </div>

      {greeting && <p className="relative text-[13px] font-semibold text-[#667085] mb-1">{greeting}</p>}
      <h2
        id="bx-title"
        className="relative text-[22px] leading-tight font-extrabold tracking-tight text-[#0F172A] max-w-[22ch] break-words"
        style={{ textWrap: 'balance' }}
      >
        {before}
        {match && <mark key={match} className="bx-mark">{match}</mark>}
        {after}
      </h2>
      <p id="bx-message" className="relative mt-2.5 text-[14.5px] leading-relaxed text-[#334155] max-w-[38ch] whitespace-pre-line break-words">
        {broadcast.message}
      </p>

      {steps.length > 0 && (
        <ol className="relative mt-3.5 flex flex-wrap justify-center gap-2">
          {steps.map((step, i) => (
            <li
              key={i}
              className="flex items-center gap-2 text-left text-[13px] font-semibold text-[#1E293B] bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl py-2 pl-2 pr-3"
            >
              <span
                className="w-[22px] h-[22px] rounded-full text-white text-xs font-extrabold flex items-center justify-center shrink-0"
                style={{ background: tone.color }}
              >
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      )}

      {children}
    </div>
  );
};
