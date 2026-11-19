// "Lights out" — the end-of-day screen shown right after an employee checks
// out: their own day in one line, then a row of rack LEDs switching off one
// by one. Cosmetic only. It reads the `lightsOut` summary AppContext.checkOut
// builds from data already in that employee's own session (their attendance
// record and, for a technician, their own completed tickets). Click or wait.
import React, { useEffect } from 'react';
import { useApp } from '../../context/AppContext';

const LED_COUNT = 8;
const AUTO_CLOSE_MS = 4200;

const fmtDuration = (minutes) => {
  if (minutes == null) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

export const LightsOut = () => {
  const { lightsOut, setLightsOut } = useApp();

  useEffect(() => {
    if (!lightsOut) return;
    const t = setTimeout(() => setLightsOut(null), AUTO_CLOSE_MS);
    return () => clearTimeout(t);
  }, [lightsOut, setLightsOut]);

  if (!lightsOut) return null;

  const parts = [];
  if (lightsOut.jobsCompleted > 0) parts.push(`${lightsOut.jobsCompleted} ${lightsOut.jobsCompleted === 1 ? 'job' : 'jobs'} completed`);
  const worked = fmtDuration(lightsOut.minutes);
  if (worked) parts.push(`${worked} on the clock`);
  const firstName = (lightsOut.name || '').split(' ')[0];

  return (
    <div
      onClick={() => setLightsOut(null)}
      className="fixed inset-0 z-[210] bg-[#0B1220]/95 text-white flex flex-col items-center justify-center text-center p-6 cursor-pointer tt-pop"
      role="dialog"
      aria-label="Checked out"
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/50">Checked out</p>
      <h2 className="text-3xl font-extrabold mt-2">Good night{firstName ? `, ${firstName}` : ''}.</h2>
      {parts.length > 0 && <p className="text-sm text-white/70 mt-2">{parts.join(' · ')}</p>}
      <div className="flex items-center gap-3 mt-8" aria-hidden="true">
        {Array.from({ length: LED_COUNT }).map((_, i) => (
          <span key={i} className="tt-led" style={{ animationDelay: `${600 + i * 220}ms` }} />
        ))}
      </div>
      <p className="text-[11px] text-white/40 mt-8">Tap anywhere to close</p>
    </div>
  );
};
