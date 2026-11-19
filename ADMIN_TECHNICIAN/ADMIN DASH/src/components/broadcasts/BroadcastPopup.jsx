import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BroadcastCard } from './BroadcastCard';
import { BROADCAST_TONES, greetingFor } from './broadcastShared';

// Seconds the "Got it" button stays locked. The timer only counts while the
// page is visible: requestAnimationFrame stops in a hidden tab or a phone
// app in the background, and each frame's step is capped, so time spent
// away never counts as reading time.
const LOCK_MS = 5000;
const MAX_FRAME_MS = 100;

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// One short confetti burst for "Well done" broadcasts.
function burstConfetti(canvas) {
  const ctx = canvas?.getContext('2d');
  if (!ctx || prefersReducedMotion()) return () => {};
  const w = (canvas.width = window.innerWidth);
  const h = (canvas.height = window.innerHeight);
  const colors = ['#059669', '#34D399', '#FBBF24', '#004898', '#F472B6', '#60A5FA'];
  const parts = Array.from({ length: 140 }, () => ({
    x: w / 2 + (Math.random() - 0.5) * 80,
    y: h * 0.45,
    vx: (Math.random() - 0.5) * 14,
    vy: -Math.random() * 14 - 4,
    r: Math.random() * 6 + 4,
    a: Math.random() * Math.PI,
    va: (Math.random() - 0.5) * 0.3,
    c: colors[Math.floor(Math.random() * colors.length)]
  }));
  const start = performance.now();
  let raf;
  const frame = (t) => {
    const k = (t - start) / 1800;
    ctx.clearRect(0, 0, w, h);
    for (const p of parts) {
      p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.a += p.va;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - k);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.a);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2);
      ctx.restore();
    }
    if (k < 1) raf = requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, w, h);
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}

// The employee-facing popup. No close button: tapping outside or pressing
// Esc only shakes the card and says what's left. `onDone` runs on "Got it".
export const BroadcastPopup = ({ broadcast, userName, forCheckIn = false, onSeen, onDone }) => {
  const tone = BROADCAST_TONES[broadcast.tone] || BROADCAST_TONES.info;
  const greeting = useMemo(() => greetingFor(userName), [userName]);
  const [elapsed, setElapsed] = useState(0);
  const [ticked, setTicked] = useState(false);
  const [hint, setHint] = useState('');
  const shakeRef = useRef(null);
  const buttonRef = useRef(null);
  const canvasRef = useRef(null);

  const unlocked = elapsed >= LOCK_MS;
  const ready = unlocked && (!tone.ack || ticked);
  const secondsLeft = Math.max(1, Math.ceil((LOCK_MS - elapsed) / 1000));

  // Latest values for the Esc / outside-tap handler without re-binding it every frame.
  const stateRef = useRef({ unlocked, ready, secondsLeft });
  stateRef.current = { unlocked, ready, secondsLeft };

  useEffect(() => {
    let raf;
    let last = null;
    let total = 0;
    const tick = (t) => {
      total += last == null ? 0 : Math.min(MAX_FRAME_MS, t - last);
      last = t;
      setElapsed(Math.min(LOCK_MS, total));
      if (total < LOCK_MS) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [broadcast.id]);

  useEffect(() => {
    onSeen?.(broadcast.id);
    buttonRef.current?.focus({ preventScroll: true });
    // onSeen is the gate's stable callback; run once per broadcast.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [broadcast.id]);

  useEffect(() => {
    if (broadcast.tone === 'kudos') return burstConfetti(canvasRef.current);
  }, [broadcast.id, broadcast.tone]);

  useEffect(() => { if (ready) setHint(''); }, [ready]);

  const nudge = useCallback(() => {
    const s = stateRef.current;
    if (!s.unlocked) setHint(`Please read it. ${s.secondsLeft} more second${s.secondsLeft === 1 ? '' : 's'}.`);
    else if (!s.ready) setHint('Tick the box first, then tap the button.');
    else setHint('Tap "Got it" to continue.');
    const el = shakeRef.current;
    if (el && !prefersReducedMotion()) {
      el.classList.remove('bx-shake');
      void el.offsetWidth; // restart the animation
      el.classList.add('bx-shake');
    }
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); nudge(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [nudge]);

  const handleButton = () => (ready ? onDone(broadcast.id) : nudge());

  const label = !unlocked
    ? `Read this first · ${secondsLeft}s`
    : !ready
      ? 'Tick the box to continue'
      : forCheckIn ? 'Got it, check me in 👍' : 'Got it 👍';

  return (
    <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center sm:p-4">
      <div className="bx-overlay absolute inset-0 bg-[#0F172A]/50 backdrop-blur-[6px]" onClick={nudge} />

      <div ref={shakeRef} className="relative w-full sm:w-[430px]">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="bx-title"
          aria-describedby="bx-message"
          className="bx-panel relative max-h-[92vh] overflow-y-auto overflow-x-hidden bg-white rounded-t-[28px] sm:rounded-3xl shadow-[0_30px_70px_-20px_rgba(15,23,42,0.45)] px-6 sm:px-7 pt-7 pb-[calc(1.75rem+env(safe-area-inset-bottom))] sm:pb-6"
        >
          <BroadcastCard broadcast={broadcast} greeting={greeting} locked={!unlocked}>
            {tone.ack && (
              <label
                className={`relative mt-4 w-full flex items-center gap-2.5 text-left text-[13.5px] font-semibold text-[#1E293B] rounded-xl px-3 py-2.5 border-[1.5px] border-dashed transition-opacity ${unlocked ? 'cursor-pointer' : 'opacity-45 cursor-not-allowed'}`}
                style={{ borderColor: tone.color, background: tone.soft }}
              >
                <input
                  type="checkbox"
                  checked={ticked}
                  disabled={!unlocked}
                  onChange={(e) => setTicked(e.target.checked)}
                  className="w-[18px] h-[18px] shrink-0"
                  style={{ accentColor: tone.color }}
                />
                I've read this and I understand
              </label>
            )}

            <p className="relative min-h-[18px] mt-4 mb-2 text-[12.5px] font-semibold" style={{ color: hint ? tone.ink : '#667085' }} aria-live="polite">
              {hint}
            </p>

            <button
              ref={buttonRef}
              type="button"
              onClick={handleButton}
              aria-disabled={!ready}
              className={`relative w-full overflow-hidden rounded-2xl px-4 py-[15px] text-[15px] font-extrabold transition-colors focus-visible:outline-[3px] focus-visible:outline-offset-[3px] ${ready ? 'bx-ready text-white cursor-pointer hover:brightness-110' : 'cursor-not-allowed'}`}
              style={{ ...(ready ? { background: tone.color } : { background: tone.soft, color: tone.ink }), outlineColor: tone.color }}
            >
              {!ready && (
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 opacity-25"
                  style={{ width: `${(elapsed / LOCK_MS) * 100}%`, background: tone.color }}
                />
              )}
              <span className="relative tabular-nums">{label}</span>
            </button>
            <p className="relative mt-3 text-[11.5px] text-[#98A2B3]">You'll only see this once</p>
          </BroadcastCard>
        </div>
      </div>

      {broadcast.tone === 'kudos' && (
        <canvas ref={canvasRef} aria-hidden="true" className="fixed inset-0 w-full h-full pointer-events-none z-[151]" />
      )}
    </div>
  );
};
