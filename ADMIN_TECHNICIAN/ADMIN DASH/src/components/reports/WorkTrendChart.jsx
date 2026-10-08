// Completed work over the selected period: tickets + project activities,
// stacked per day (or per Monday-start week for ranges over 31 days). Plain
// SVG/HTML — no chart library. Colors are categorical slots 1 and 2 of the
// validated reference palette (blue, orange); both series share one axis
// (count of completed items).
import React, { useMemo, useState } from 'react';
import { addDays, fmtDay } from './techReportFormat';

const SERIES = [
  { key: 'tickets', label: 'Tickets', color: '#2a78d6' },
  { key: 'activities', label: 'Project work', color: '#eb6834' }
];
const PLOT_H = 160;
const GAP = 2; // surface gap between stacked segments

const niceMax = (v) => {
  if (v <= 4) return 4;
  const step = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / step) * step;
};

// Daily points -> Monday-start weekly buckets.
const toWeeks = (trend) => {
  const weeks = [];
  for (const d of trend) {
    const dow = new Date(`${d.day}T00:00:00Z`).getUTCDay();
    const monday = addDays(d.day, -(dow === 0 ? 6 : dow - 1));
    const last = weeks[weeks.length - 1];
    if (last && last.week === monday) { last.tickets += d.tickets; last.activities += d.activities; last.end = d.day; }
    // `start` is the first day actually in range (a range can begin mid-week).
    else weeks.push({ week: monday, start: d.day, end: d.day, tickets: d.tickets, activities: d.activities });
  }
  return weeks.map((w) => ({ ...w, label: w.start === w.end ? fmtDay(w.start) : `${fmtDay(w.start)} – ${fmtDay(w.end)}` }));
};

export const WorkTrendChart = ({ trend }) => {
  const [hover, setHover] = useState(null);
  const weekly = trend.length > 31;
  const buckets = useMemo(
    () => (weekly ? toWeeks(trend) : trend.map((d) => ({ ...d, start: d.day, end: d.day, label: fmtDay(d.day) }))),
    [trend, weekly]
  );
  const max = niceMax(Math.max(0, ...buckets.map((b) => b.tickets + b.activities)));
  const total = buckets.reduce((n, b) => n + b.tickets + b.activities, 0);
  const ticks = [0, max / 2, max];
  // Label every Nth bar so axis text never collides.
  const labelEvery = Math.max(1, Math.ceil(buckets.length / 10));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3" aria-hidden="true">
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#475467]">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} /> {s.label}
          </span>
        ))}
        <span className="text-xs text-[#98A2B3] ml-auto">{weekly ? 'Per week' : 'Per day'}</span>
      </div>

      {total === 0 ? (
        <div className="h-[160px] flex items-center justify-center text-sm text-[#98A2B3] border border-dashed border-[#E4E7EC] rounded-xl">
          No completed tickets or project work in this period.
        </div>
      ) : (
        <div className="flex gap-2">
          {/* y-axis */}
          <div className="relative w-6 shrink-0 text-[10px] text-[#98A2B3]" style={{ height: PLOT_H }}>
            {ticks.map((t) => (
              <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: PLOT_H - (t / max) * PLOT_H }}>{t}</span>
            ))}
          </div>
          <div className="flex-1 min-w-0">
            <div className="relative" style={{ height: PLOT_H }} onMouseLeave={() => setHover(null)}>
              {ticks.map((t) => (
                <div key={t} className="absolute left-0 right-0 border-t border-[#F2F4F7]" style={{ top: PLOT_H - (t / max) * PLOT_H }} />
              ))}
              <div className="absolute inset-0 flex items-end gap-[2px]">
                {buckets.map((b, i) => {
                  const segs = SERIES.map((s) => ({ ...s, v: b[s.key] })).filter((s) => s.v > 0);
                  return (
                    // Hit target is the full column, wider than the bar.
                    <div
                      key={b.start}
                      className="relative flex-1 h-full flex flex-col justify-end items-center cursor-default"
                      onMouseEnter={() => setHover(i)}
                      onFocus={() => setHover(i)}
                      onBlur={() => setHover(null)}
                      tabIndex={0}
                      aria-label={`${b.label}: ${b.tickets} tickets, ${b.activities} project activities`}
                    >
                      {hover === i && <div className="absolute inset-y-0 inset-x-0 bg-[#F2F4F7] rounded-sm" />}
                      <div className="relative w-full max-w-[28px] flex flex-col-reverse" style={{ gap: segs.length > 1 ? GAP : 0 }}>
                        {segs.map((s, k) => (
                          <div
                            key={s.key}
                            style={{
                              height: Math.max(2, (s.v / max) * PLOT_H - (segs.length > 1 ? GAP / 2 : 0)),
                              background: s.color,
                              borderRadius: k === segs.length - 1 ? '4px 4px 0 0' : 0
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              {hover != null && (
                <div
                  className="absolute z-10 -top-2 pointer-events-none bg-white border border-[#E4E7EC] shadow-lg rounded-lg px-3 py-2 text-xs whitespace-nowrap"
                  style={{
                    left: `${((hover + 0.5) / buckets.length) * 100}%`,
                    transform: `translate(${hover > buckets.length / 2 ? 'calc(-100% - 12px)' : '12px'}, 0)`
                  }}
                >
                  <div className="font-bold text-[#172033] mb-1">{buckets[hover].label}</div>
                  {SERIES.map((s) => (
                    <div key={s.key} className="flex items-center gap-2 text-[#475467]">
                      <span className="w-2 h-2 rounded-sm" style={{ background: s.color }} />
                      <span className="flex-1">{s.label}</span>
                      <span className="font-bold text-[#172033] tabular-nums">{buckets[hover][s.key]}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* x-axis */}
            <div className="flex gap-[2px] mt-1.5">
              {buckets.map((b, i) => (
                <div key={b.start} className="flex-1 text-center text-[10px] text-[#98A2B3] truncate">
                  {i % labelEvery === 0 ? (weekly ? fmtDay(b.start) : String(Number(b.start.slice(8)))) : ''}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
