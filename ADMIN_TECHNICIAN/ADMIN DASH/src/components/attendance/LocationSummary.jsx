// "📍 Koramangala, Bengaluru · 10:42 AM" — the latest captured check-in
// location as a short area name plus capture time, shown next to the
// existing View on Map link. Labels are cached for the page's lifetime so
// AttendancePage's 3s poll never re-requests them; while a lookup is
// pending or if it fails, it falls back to "Location captured".
import React, { useEffect, useState } from 'react';
import { reverseGeocodeInApi } from '../../services/attendanceApiService';

const labelCache = new Map(); // "lat,lng" -> label | null
const pending = new Map(); // "lat,lng" -> Promise

const keyOf = (lat, lng) => `${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}`;

const lookup = (lat, lng) => {
  const key = keyOf(lat, lng);
  if (!pending.has(key)) {
    pending.set(key, reverseGeocodeInApi(lat, lng)
      .then((label) => { labelCache.set(key, label); return label; })
      .catch(() => null) // transient failure: not cached, retried on a later mount
      .finally(() => pending.delete(key)));
  }
  return pending.get(key);
};

const fmtCaptureTime = (d) => (d ? new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : null);

export const LocationSummary = ({ lat, lng, capturedAt, className = '' }) => {
  const key = keyOf(lat, lng);
  const [label, setLabel] = useState(() => labelCache.get(key) ?? null);

  useEffect(() => {
    if (labelCache.has(key)) {
      setLabel(labelCache.get(key));
      return undefined;
    }
    let cancelled = false;
    lookup(lat, lng).then((result) => { if (!cancelled) setLabel(result); });
    return () => { cancelled = true; };
  }, [key, lat, lng]);

  const time = fmtCaptureTime(capturedAt);
  return (
    <span className={className} title={`${lat}, ${lng}`}>
      📍 {label || 'Location captured'}{time && <> &middot; {time}</>}
    </span>
  );
};
