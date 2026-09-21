// Attendance Category (V1) — technician check-in/out business logic.
// Additive module: does not import from or touch serviceRequestService.js,
// projectService.js, or projectActivityService.js in any way, and a failure
// here can never affect tickets or projects.
import { supabase } from '../config/supabaseClient.js';
import { indiaDateKey, isValidDateKey, formatDateOnly } from '../utils/indiaTime.js';

const LOCATION_STATUSES = ['gps_captured', 'permission_denied', 'device_unsupported', 'unavailable_error'];

const resolveDateKey = (date) => (isValidDateKey(date) ? date : indiaDateKey());

// Every row this service hands back goes through here first — see
// formatDateOnly's doc comment for why attendance_date specifically needs
// normalizing before it leaves this module.
const normalizeRecord = (record) => (record ? { ...record, attendance_date: formatDateOnly(record.attendance_date) } : record);
const normalizeRecords = (records) => (records || []).map(normalizeRecord);

const computeDurationMinutes = (checkIn, checkOut) => {
  const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  return Math.max(0, Math.round(ms / 60000));
};

// ============================================
// TECHNICIAN SELF-SERVICE
// ============================================

// The authenticated technician's own attendance for "today" (India calendar
// day). Returns null if they haven't checked in — no row is ever created
// just to represent that.
export const getTodayForTechnician = async (technicianId) => {
  const { data, error } = await supabase
    .from('attendance_records')
    .select('*')
    .eq('technician_id', technicianId)
    .eq('attendance_date', indiaDateKey())
    .maybeSingle();
  if (error) throw new Error(`Failed to fetch today's attendance: ${error.message}`);
  return normalizeRecord(data) || null;
};

// One check-in per technician per India day. The UNIQUE(technician_id,
// attendance_date) constraint is the actual source of truth for that rule —
// this insert either succeeds once or fails with 23505 under concurrent
// duplicate check-ins, race-condition-safe by construction rather than by a
// read-then-write check here.
export const checkIn = async (technicianId, location = {}) => {
  const locationStatus = LOCATION_STATUSES.includes(location.status) ? location.status : 'unavailable_error';
  const hasCoords = locationStatus === 'gps_captured' && typeof location.lat === 'number' && typeof location.lng === 'number';

  const insertPayload = {
    technician_id: technicianId,
    attendance_date: indiaDateKey(),
    check_in_time: new Date().toISOString(),
    status: 'checked_in',
    location_status: locationStatus,
    location_lat: hasCoords ? location.lat : null,
    location_lng: hasCoords ? location.lng : null,
    location_accuracy_m: hasCoords ? (location.accuracy ?? null) : null,
    location_captured_at: hasCoords ? new Date().toISOString() : null
  };

  const { data, error } = await supabase.from('attendance_records').insert([insertPayload]).select('*').single();
  if (error) {
    if (error.code === '23505') {
      const existing = await getTodayForTechnician(technicianId);
      // Word the conflict to match what actually happened — the UNIQUE
      // constraint fires the same way whether they're still checked in,
      // already checked out, or already marked absent for today, and
      // "already checked in" was misleading for the latter two.
      const message = existing?.status === 'checked_out'
        ? 'Attendance already completed for today'
        : existing?.status === 'absent'
          ? 'You have already been marked absent for today'
          : 'Already checked in for today';
      const err = new Error(message);
      err.code = 'ALREADY_CHECKED_IN';
      err.existing = existing;
      throw err;
    }
    throw new Error(`Failed to check in: ${error.message}`);
  }
  return normalizeRecord(data);
};

// Shared by the technician self-service route (actorRole: 'technician',
// ownership-checked) and every admin checkout path (actorRole: 'admin',
// unrestricted — mirrors updateActivityStatus's admin/owning-technician
// allow-list in projectActivityService.js).
export const checkOut = async (recordId, { actorRole, actorTechnicianId } = {}) => {
  const { data: existing, error: fetchError } = await supabase
    .from('attendance_records')
    .select('*')
    .eq('id', recordId)
    .maybeSingle();
  if (fetchError) throw new Error(`Failed to fetch attendance record: ${fetchError.message}`);
  if (!existing) {
    const err = new Error('Attendance record not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (actorRole === 'technician' && existing.technician_id !== actorTechnicianId) {
    const err = new Error('This attendance record is not yours');
    err.code = 'FORBIDDEN';
    throw err;
  }
  if (existing.status !== 'checked_in') {
    const err = new Error(`Cannot check out — current status is ${existing.status}`);
    err.code = 'INVALID_TRANSITION';
    throw err;
  }

  const checkOutTime = new Date().toISOString();
  const { data, error } = await supabase
    .from('attendance_records')
    .update({
      check_out_time: checkOutTime,
      status: 'checked_out',
      duration_minutes: computeDurationMinutes(existing.check_in_time, checkOutTime)
    })
    .eq('id', recordId)
    .select('*')
    .single();
  if (error) throw new Error(`Failed to check out: ${error.message}`);
  return normalizeRecord(data);
};

// ============================================
// ADMIN
// ============================================

// Every active technician for the selected day — plus any *inactive*
// technician who still has an attendance row for that day, so a still-open
// (or otherwise recorded) session doesn't vanish just because someone was
// deactivated after checking in — joined against that day's attendance row
// (if any). `bucket` is the display/filter state:
//   'checked_out' -> Present, 'checked_in' -> Not Yet Checked Out,
//   'absent' -> Admin-confirmed absent, 'unmarked' -> no check-in, no record.
// `cardFilter` scopes the returned rows exactly like clicking a KPI card:
// 'absent' additionally includes 'unmarked' rows (the candidates Mark
// Absent / Mark All Absent act on) per the plan's Absent-card behavior,
// while the KPI count itself only ever counts confirmed 'absent' rows.
export const listForAdmin = async ({ date, technicianId, cardFilter, search } = {}) => {
  const dateKey = resolveDateKey(date);

  const { data: activeTechnicians, error: techError } = await supabase
    .from('technicians')
    .select('id, full_name, email, phone')
    .eq('is_active', true)
    .order('full_name', { ascending: true });
  if (techError) throw new Error(`Failed to list technicians: ${techError.message}`);

  const { data: records, error: recError } = await supabase
    .from('attendance_records')
    .select('*')
    .eq('attendance_date', dateKey);
  if (recError) throw new Error(`Failed to list attendance: ${recError.message}`);

  // A technician deactivated after checking in must not disappear along
  // with their still-open (or otherwise recorded) session for this day —
  // the active-only roster above would silently drop that row. Fetch
  // whichever recorded technicians aren't already in the active roster and
  // append them; this never adds a technician who merely has no record
  // (deactivated + no attendance stays invisible, exactly as before).
  const activeIds = new Set((activeTechnicians || []).map((t) => t.id));
  const recordedIds = [...new Set((records || []).map((r) => r.technician_id))];
  const missingIds = recordedIds.filter((id) => !activeIds.has(id));

  let inactiveButRecorded = [];
  if (missingIds.length) {
    const { data: inactiveTechnicians, error: inactiveError } = await supabase
      .from('technicians')
      .select('id, full_name, email, phone')
      .in('id', missingIds);
    if (inactiveError) throw new Error(`Failed to list technicians: ${inactiveError.message}`);
    inactiveButRecorded = inactiveTechnicians || [];
  }

  // Appending the inactive-but-recorded technicians breaks the alphabetical
  // order the active roster already came sorted in — re-sort the merged set
  // rather than leave them tacked on at the end out of order.
  const technicians = [...(activeTechnicians || []), ...inactiveButRecorded]
    .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
  const byTech = new Map((records || []).map((r) => [r.technician_id, r]));

  const rows = technicians.map((t) => {
    const record = normalizeRecord(byTech.get(t.id) || null);
    return {
      technician: { id: t.id, full_name: t.full_name, email: t.email, phone: t.phone },
      record,
      bucket: record ? record.status : 'unmarked'
    };
  });

  const counts = {
    present: rows.filter((r) => r.bucket === 'checked_out').length,
    absent: rows.filter((r) => r.bucket === 'absent').length,
    not_yet_checked_out: rows.filter((r) => r.bucket === 'checked_in').length
  };

  let scoped = rows;
  if (cardFilter === 'present') scoped = scoped.filter((r) => r.bucket === 'checked_out');
  else if (cardFilter === 'not_yet_checked_out') scoped = scoped.filter((r) => r.bucket === 'checked_in');
  else if (cardFilter === 'absent') scoped = scoped.filter((r) => r.bucket === 'absent' || r.bucket === 'unmarked');

  if (technicianId) scoped = scoped.filter((r) => r.technician.id === technicianId);
  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    scoped = scoped.filter((r) => (r.technician.full_name || '').toLowerCase().includes(q));
  }

  return { date: dateKey, counts, rows: scoped };
};

// Read-only, admin-only: a technician's own attendance history, or (through
// the admin-scoped route) any technician's, for the "switch into a
// technician's view" impersonation read-only history — see routes/
// adminAttendance.js. actorRole/actorTechnicianId let the same function also
// back a possible future technician self-history endpoint without ever
// trusting a client-supplied technician id for a real technician.
export const getHistoryForTechnician = async (technicianId, { actorRole, actorTechnicianId, limit = 90 } = {}) => {
  if (actorRole === 'technician' && actorTechnicianId !== technicianId) {
    const err = new Error('You are not allowed to view this history');
    err.code = 'FORBIDDEN';
    throw err;
  }
  const { data, error } = await supabase
    .from('attendance_records')
    .select('*')
    .eq('technician_id', technicianId)
    .order('attendance_date', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Failed to fetch attendance history: ${error.message}`);
  return normalizeRecords(data);
};

// Admin explicitly confirms one technician as absent for a day. Rejected
// (409) if that technician already has any attendance row for the day —
// mirrors checkIn's reliance on the UNIQUE constraint rather than a
// read-then-write race. A well-formed but nonexistent technician id is
// rejected with a clean 404 rather than reaching Postgres and surfacing a
// raw foreign-key-violation error.
export const markAbsent = async (technicianId, date, adminId) => {
  const { data: technician, error: techError } = await supabase
    .from('technicians')
    .select('id')
    .eq('id', technicianId)
    .maybeSingle();
  if (techError) throw new Error(`Failed to verify technician: ${techError.message}`);
  if (!technician) {
    const err = new Error('Technician not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const { data, error } = await supabase
    .from('attendance_records')
    .insert([{
      technician_id: technicianId,
      attendance_date: resolveDateKey(date),
      status: 'absent',
      location_status: 'no_location',
      marked_absent_by: adminId || null
    }])
    .select('*')
    .single();
  if (error) {
    if (error.code === '23505') {
      const err = new Error('This technician already has an attendance record for that day');
      err.code = 'ALREADY_HAS_ATTENDANCE';
      throw err;
    }
    // Belt-and-suspenders: covers the narrow race where the technician is
    // removed between the existence check above and this insert.
    if (error.code === '23503') {
      const err = new Error('Technician not found');
      err.code = 'NOT_FOUND';
      throw err;
    }
    throw new Error(`Failed to mark absent: ${error.message}`);
  }
  return normalizeRecord(data);
};

// Marks every active technician who has NO attendance row at all for the
// day as absent, in one batch — technicians who already checked in (or were
// already marked absent) are read here and simply excluded, never touched.
export const markAllAbsent = async (date, adminId) => {
  const dateKey = resolveDateKey(date);

  const { data: technicians, error: techError } = await supabase
    .from('technicians')
    .select('id')
    .eq('is_active', true);
  if (techError) throw new Error(`Failed to list technicians: ${techError.message}`);

  const { data: existing, error: existError } = await supabase
    .from('attendance_records')
    .select('technician_id')
    .eq('attendance_date', dateKey);
  if (existError) throw new Error(`Failed to check existing attendance: ${existError.message}`);

  const covered = new Set((existing || []).map((r) => r.technician_id));
  const missing = (technicians || []).filter((t) => !covered.has(t.id));
  if (!missing.length) return { markedCount: 0, records: [] };

  const rows = missing.map((t) => ({
    technician_id: t.id,
    attendance_date: dateKey,
    status: 'absent',
    location_status: 'no_location',
    marked_absent_by: adminId || null
  }));

  const { data, error } = await supabase.from('attendance_records').insert(rows).select('*');
  if (error) {
    if (error.code === '23505') {
      // A single multi-row INSERT is all-or-nothing: someone in `missing`
      // checked in between the read above and this write. Nothing was
      // written — the admin just needs to retry, and the retry's own fresh
      // read will naturally exclude whoever just checked in.
      const err = new Error('One or more technicians already have attendance for this day — refresh and try again');
      err.code = 'CONFLICT';
      throw err;
    }
    throw new Error(`Failed to mark all absent: ${error.message}`);
  }
  return { markedCount: data.length, records: normalizeRecords(data) };
};

// Check out every currently open ("Not Yet Checked Out") session for a day.
// Per-record, not a single batch statement — a failure on one record must
// never block the rest, and the caller needs to know exactly which ones
// failed (spec's "handle partial failures safely" requirement).
export const bulkCheckOutOpenSessions = async (date) => {
  const dateKey = resolveDateKey(date);
  const { data: openRecords, error } = await supabase
    .from('attendance_records')
    .select('id')
    .eq('attendance_date', dateKey)
    .eq('status', 'checked_in');
  if (error) throw new Error(`Failed to list open sessions: ${error.message}`);

  const results = [];
  for (const record of openRecords || []) {
    try {
      const updated = await checkOut(record.id, { actorRole: 'admin' });
      results.push({ id: record.id, success: true, record: updated });
    } catch (err) {
      results.push({ id: record.id, success: false, error: err.message });
    }
  }
  return { total: results.length, succeeded: results.filter((r) => r.success).length, results };
};
