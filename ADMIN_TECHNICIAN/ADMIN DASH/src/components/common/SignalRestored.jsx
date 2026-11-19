// "Signal restored" — a two-second acknowledgement shown when a field
// service report is submitted and the ticket is completed: a brief burst of
// static, then the picture snaps clear. Purely cosmetic; it reads the
// `celebration` set by AppContext.submitServiceReport and nothing else.
// Reduced-motion users get the clear card straight away, no static.
import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { CheckCircle2 } from 'lucide-react';

const STATIC_MS = 550;
const SHOW_MS = 2300;

export const SignalRestored = () => {
  const { celebration, setCelebration } = useApp();
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [phase, setPhase] = useState('static');

  useEffect(() => {
    if (!celebration) return;
    setPhase(reduceMotion ? 'clear' : 'static');
    const toClear = setTimeout(() => setPhase('clear'), reduceMotion ? 0 : STATIC_MS);
    const done = setTimeout(() => setCelebration(null), SHOW_MS);
    return () => { clearTimeout(toClear); clearTimeout(done); };
  }, [celebration, reduceMotion, setCelebration]);

  if (!celebration) return null;
  const golden = celebration.golden === true;

  return (
    <div className="fixed inset-0 z-[210] pointer-events-none flex items-center justify-center p-4" aria-live="polite">
      <div
        onClick={() => setCelebration(null)}
        className={`pointer-events-auto cursor-pointer w-full max-w-sm rounded-2xl border bg-white shadow-2xl overflow-hidden tt-pop ${
          golden ? 'border-[#F5C84B] ring-4 ring-[#F5C84B]/40' : 'border-[#ABE5C6] ring-4 ring-[#12B76A]/25'
        }`}
      >
        {phase === 'static' ? (
          <div className="h-36 tt-static" />
        ) : (
          <div className="p-6 text-center">
            <div className={`w-12 h-12 rounded-full mx-auto flex items-center justify-center text-white ${golden ? 'bg-[#E0A800]' : 'bg-[#12B76A]'}`}>
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="mt-3 text-lg font-extrabold text-[#172033]">Signal restored</h3>
            <p className="text-xs text-[#667085] mt-1">
              <span className="font-mono font-bold text-[#004898]">{celebration.ticketId}</span> · report signed, ticket completed
            </p>
            {golden && <p className="mt-2 text-[11px] font-bold text-[#B54708]">Golden fix · nice work</p>}
          </div>
        )}
      </div>
    </div>
  );
};
