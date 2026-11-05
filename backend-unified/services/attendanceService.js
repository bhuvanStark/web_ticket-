// Attendance Category (V1), generalized by Sales & Back-Office Roles V1
// (PLAN_Sales_BackOffice_Unified_Attendance_V1.md §9) into one shared
// service for Technician, Sales, and Back-Office check-in/out — the same
// `attendance_records` table for all three (see migration
// 022_attendance_sales_backoffice.sql), never a second table. Additive
// module: does not import from or touch serviceRequestService.js,
// projectService.js, or projectActivityService.js in any way, and a failure
// here can never affect tickets or projects.
import { supabase } from '../config/supabaseClient.js';
import { query } from '../config/database.js';
import { indiaDateKey, isValidDateKey, formatDateOnly, addDaysToDateKey } from '../utils/indiaTime.js';

const LOCATION_STATUSES = ['gps_captured', 'permission_denied', 'device_unsupported', 'unavailable_error'];

// The one place that maps an employee type to its owner column / identity
// table. Every function below that needs to know either goes through this —
// adding a fourth employee type later means extending this object, not
// hunting through the file for hardcoded column names.
const EMPLOYEE_TYPES = ['technician', 'sales', 'back_office'];
const OWNER_COLUMN = { technician: 'technician_id', sales: 'sales_id', back_office: 'back_office_id' };
const OWNER_TABLE = { technician: 'technicians', sales: 'sales', back_office: 'back_office' };
// The fields every one of the three identity tables actually has in common
// (technicians has more — specialization, role_title, status — but those
// don't exist on sales/back_office, so attendance rows only ever carry the
// shared subset). See migration 020_sales_backoffice_identity.sql.
const EMPLOYEE_SELECT = 'id, full_name, email, phone, location';

const isEmployeeType = (value) => EMPLOYEE_TYPES.includes(value);

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

// A record's owner is always exactly one of the three FK columns (DB-
// enforced — attendance_records_owner_check). These read whichever is set,
// so admin-side code never needs to know in advance which type a row is.
const recordEmployeeType = (record) =>
  (record?.technician_id && 'technician') || (record?.sales_id && 'sales') || (record?.back_office_id && 'back_office') || null;
const recordOwnerId = (record) => record?.technician_id || record?.sales_id || record?.back_office_id || null;

// ============================================
// EMPLOYEE SELF-SERVICE (Technician | Sales | Back-Office)
// ============================================

// The authenticated employee's own attendance for "today" (India calendar
// day). Returns null if they haven't checked in — no row is ever created
// just to represent that. `employeeType` never comes from the client — see
// routes/attendance.js, which derives it from the verified JWT's role.
export const getTodayForEmployee = async (employeeType, employeeId) => {
  if (!isEmployeeType(employeeType)) throw new Error(`Unknown employee type: ${employeeType}`);
  const { data, error } = await supabase
    .from('attendance_records')
    .select('*')
    .eq(OWNER_COLUMN[employeeType], employeeId)
    .eq('attendance_date', indiaDateKey())
    .maybeSingle();
  if (error) throw new Error(`Failed to fetch today's attendance: ${error.message}`);
  return normalizeRecord(data) || null;
};

// One check-in per employee per India day. The relevant partial UNIQUE
// index (idx_attendance_records_unique_{technician,sales,back_office}_day)
// is the actual source of truth for that rule — this insert either succeeds
// once or fails with 23505 under concurrent duplicate check-ins, race-
// condition-safe by construction rather than by a read-then-write check here.
export const checkIn = async (employeeType, employeeId, location = {}) => {
  if (!isEmployeeType(employeeType)) throw new Error(`Unknown employee type: ${employeeType}`);
  const locationStatus = LOCATION_STATUSES.includes(location.status) ? location.status : 'unavailable_error';
  const hasCoords = locationStatus === 'gps_captured' && typeof location.lat === 'number' && typeof location.lng === 'number';

  const insertPayload = {
    [OWNER_COLUMN[employeeType]]: employeeId,
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
      const existing = await getTodayForEmployee(employeeType, employeeId);
      // Half-day leave applied before checking in: this check-in is for the
      // other half, so the leave row becomes a normal open session (half_day
      // and leave_reason are kept). Guarded on the status that was read.
      if (existing?.status === 'half_day_leave') {
        const { attendance_date: _date, [OWNER_COLUMN[employeeType]]: _owner, ...sessionFields } = insertPayload;
        const { data: upgraded, error: upgradeError } = await supabase
          .from('attendance_records')
          .update(sessionFields)
          .eq('id', existing.id)
          .eq('status', 'half_day_leave')
          .select('*')
          .maybeSingle();
        if (upgradeError) throw new Error(`Failed to check in: ${upgradeError.message}`);
        if (upgraded) return normalizeRecord(upgraded);
      }
      // Word the conflict to match what actually happened — the UNIQUE
      // index fires the same way whether they're still checked in, already
      // checked out, or already marked absent for today, and "already
      // checked in" was misleading for the latter two.
      const message = existing?.status === 'checked_out'
        ? 'Attendance already completed for today'
        : existing?.status === 'absent'
          ? 'You have already been marked absent for today'
          : existing?.status === 'emergency_holiday'
            ? 'Today has been marked as an emergency holiday for you'
            : existing?.status === 'leave'
              ? 'You are on leave today — cancel the leave to check in'
              : 'Already checked in for today';
      const err = new Error(message);
      err.code = 'ALREADY_CHECKED_IN';
      err.existing = existing;
      throw err;
    }
    // The employee id in a still-valid JWT no longer exists (removed after
    // the token was issued — access tokens live up to ACCESS_TOKEN_EXPIRY
    // days). Without this, the raw FK-violation message reached the client
    // as an unhandled 500; audit finding #4.
    if (error.code === '23503') {
      const err = new Error('Your account could not be found. Please contact your administrator.');
      err.code = 'ACCOUNT_NOT_FOUND';
      throw err;
    }
    throw new Error(`Failed to check in: ${error.message}`);
  }
  return normalizeRecord(data);
};

// Shared by the employee self-service route (actorRole: 'technician' |
// 'sales' | 'back_office', ownership-checked against the matching owner
// column) and every admin checkout path (actorRole: 'admin', unrestricted —
// mirrors updateActivityStatus's admin/owning-technician allow-list in
// projectActivityService.js). Never trusts a submitted employee id for
// ownership — actorOwnerId always comes from the verified JWT.
export const checkOut = async (recordId, { actorRole, actorOwnerId } = {}) => {
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
  if (actorRole !== 'admin' && recordOwnerId(existing) !== actorOwnerId) {
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

// Every active employee of one type — `location` carried straight through
// as the Branch value shown/filtered on in the unified Admin Attendance UI
// (same underlying `location` column the Technician form labels "Branch";
// nothing about the column itself changes here). Tags each row with
// `employee_type` so a merged multi-type roster can tell them apart.
const fetchActiveEmployeesOfType = async (employeeType) => {
  const { data, error } = await supabase
    .from(OWNER_TABLE[employeeType])
    .select(EMPLOYEE_SELECT)
    .eq('is_active', true)
    .order('full_name', { ascending: true });
  if (error) throw new Error(`Failed to list ${employeeType} roster: ${error.message}`);
  return (data || []).map((e) => ({ ...e, employee_type: employeeType }));
};

// The employee-type scope for a call: just the one filtered type, or all
// three. Shared by fetchActiveEmployees and rosterFromRecords so the two always
// agree on which types are actually in play for a given request.
const resolveEmployeeTypes = (employeeTypeFilter) =>
  isEmployeeType(employeeTypeFilter) ? [employeeTypeFilter] : EMPLOYEE_TYPES;

// All active employees, of the given type only if `employeeTypeFilter` is
// set, else all three types merged and re-sorted alphabetically by name.
const fetchActiveEmployees = async (employeeTypeFilter) => {
  const types = resolveEmployeeTypes(employeeTypeFilter);
  const groups = await Promise.all(types.map(fetchActiveEmployeesOfType));
  return groups.flat().sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
};

const fetchRecordsForDate = async (dateKey) => {
  const { data, error } = await supabase
    .from('attendance_records')
    .select('*')
    .eq('attendance_date', dateKey);
  if (error) throw new Error(`Failed to list attendance: ${error.message}`);
  return data || [];
};

// Every record in [start, end] in one query (the range export used to run
// one query per day, plus roster lookups per day).
const fetchRecordsInRange = async (start, end) => {
  const { rows } = await query(
    'SELECT * FROM attendance_records WHERE attendance_date BETWEEN $1 AND $2',
    [start, end]
  );
  return rows || [];
};

// ============================================
// HOLIDAYS
// ============================================

// Sundays are holidays by rule (never stored). The weekday is read off the
// calendar date itself, so the server's timezone can't shift it.
export const isSundayDateKey = (dateKey) => {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0;
};

// Stored holidays in [from, to] (both optional), oldest first; within a
// date the all-branch holiday comes first.
export const listHolidays = async ({ from, to } = {}) => {
  const params = [];
  const where = [];
  if (from) { params.push(from); where.push(`holiday_date >= $${params.length}`); }
  if (to) { params.push(to); where.push(`holiday_date <= $${params.length}`); }
  const { rows } = await query(
    `SELECT id, to_char(holiday_date, 'YYYY-MM-DD') AS holiday_date, name, branch, created_at
       FROM holidays
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY holiday_date ASC, branch ASC NULLS FIRST`,
    params
  );
  return rows || [];
};

// The holiday (if any) an employee of `branch` has on `dateKey`: a stored
// holiday for every branch or for theirs, else Sunday. Returns { name } or
// null. `holidays` is a pre-fetched listHolidays() result covering the day.
const holidayFor = (dateKey, branch, holidays) => {
  const stored = holidays.find((h) => h.holiday_date === dateKey && (!h.branch || h.branch === branch));
  if (stored) return { name: stored.name };
  return isSundayDateKey(dateKey) ? { name: 'Sunday' } : null;
};

// The holiday that applies to every employee on a day (Sunday or an
// all-branch holiday) — shown as a banner on the Admin page.
const dayWideHoliday = (dateKey, holidays) => {
  const stored = holidays.find((h) => h.holiday_date === dateKey && !h.branch);
  if (stored) return { name: stored.name };
  return isSundayDateKey(dateKey) ? { name: 'Sunday' } : null;
};

const holidayError = (message, code) => Object.assign(new Error(message), { code });

export const createHoliday = async ({ date, name, branch }, adminId) => {
  const trimmedName = String(name || '').trim();
  const trimmedBranch = branch ? String(branch).trim() : '';
  const { data, error } = await supabase
    .from('holidays')
    .insert([{
      holiday_date: date,
      name: trimmedName,
      branch: trimmedBranch || null,
      created_by: adminId || null
    }])
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') {
      throw holidayError(trimmedBranch
        ? `A holiday is already set for ${trimmedBranch} on that date`
        : 'A holiday for all branches is already set on that date', 'DUPLICATE');
    }
    throw new Error(`Failed to create holiday: ${error.message}`);
  }
  const [created] = (await listHolidays({ from: date, to: date })).filter((h) => h.id === data.id);
  return created;
};

export const deleteHoliday = async (id) => {
  const { data, error } = await supabase.from('holidays').delete().eq('id', id).select('id');
  if (error) throw new Error(`Failed to delete holiday: ${error.message}`);
  if (!data?.length) throw holidayError('Holiday not found', 'NOT_FOUND');
};

// Stored holidays that apply to one employee (all-branch ones plus their
// own branch's), for their My Attendance calendar. Sundays are added by
// the client.
export const listHolidaysForEmployee = async (employeeType, employeeId, { from, to } = {}) => {
  if (!isEmployeeType(employeeType)) throw new Error(`Unknown employee type: ${employeeType}`);
  const { data: employee, error } = await supabase
    .from(OWNER_TABLE[employeeType])
    .select('location')
    .eq('id', employeeId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load employee: ${error.message}`);
  const branch = employee?.location || null;
  const holidays = await listHolidays({ from, to });
  return holidays
    .filter((h) => !h.branch || h.branch === branch)
    .map((h) => ({ date: h.holiday_date, name: h.name }));
};

// The employee+record roster for a set of records: `activeEmployees`
// (already fetched by the caller — see listForAdmin/listForAdminRange, which
// fetch it once and reuse it across every day in a range export), plus any
// inactive-but-recorded employee, merged and re-sorted alphabetically
// (appending the inactive set after the already-sorted active one would
// otherwise leave them out of order at the end).
//
// `employeeTypes` is the same type scope `activeEmployees` was fetched
// with (all three, or just one when the Employee Type filter is active) —
// records are filtered to it FIRST, before anything is diffed against
// activeKeys. Without that filter, a record belonging to an out-of-scope
// type (e.g. a Back-Office check-in while filtering to Sales) would look
// exactly like a deactivated in-scope employee — "owner id not in the
// active roster" — and get incorrectly backfilled as if it were one.
//
// `inactiveCache` (key -> employee) lets a multi-day range look each
// inactive employee up once instead of once per day.
const rosterFromRecords = async (allRecords, activeEmployees, employeeTypes, inactiveCache = new Map()) => {
  const typeSet = new Set(employeeTypes);
  const records = allRecords.filter((r) => typeSet.has(recordEmployeeType(r)));
  const activeKeys = new Set(activeEmployees.map((e) => `${e.employee_type}:${e.id}`));

  // A record whose owner isn't in the active roster (and, per the filter
  // above, is definitely of an in-scope type) belongs to a deactivated
  // employee — keep them; their still-open or otherwise recorded session
  // must not vanish just because they were deactivated after checking in.
  const recordedInactiveKeys = new Set();
  const missingByType = {};
  for (const record of records) {
    const type = recordEmployeeType(record);
    const key = `${type}:${recordOwnerId(record)}`;
    if (activeKeys.has(key)) continue;
    recordedInactiveKeys.add(key);
    if (inactiveCache.has(key)) continue;
    (missingByType[type] ||= new Set()).add(recordOwnerId(record));
  }

  await Promise.all(
    Object.entries(missingByType).map(async ([type, ids]) => {
      const { data, error } = await supabase.from(OWNER_TABLE[type]).select(EMPLOYEE_SELECT).in('id', [...ids]);
      if (error) throw new Error(`Failed to list ${type} roster: ${error.message}`);
      for (const e of data || []) inactiveCache.set(`${type}:${e.id}`, { ...e, employee_type: type });
    })
  );

  const inactive = [...recordedInactiveKeys].map((key) => inactiveCache.get(key)).filter(Boolean);
  const employees = [...activeEmployees, ...inactive]
    .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
  return { employees, records };
};

// `bucket` is the display/filter state: 'checked_out' -> Present,
// 'checked_in' -> Not Yet Checked Out, 'absent' -> Admin-confirmed absent,
// 'leave' / 'half_day_leave' -> on leave, 'holiday' -> no record on the
// employee's Sunday/holiday, 'unmarked' -> no check-in, no record. A record
// always wins over a holiday (working on a holiday is still Present);
// `holiday` carries the holiday name either way. Every row also carries its
// own `date` explicitly (not just whatever's on the record) so a multi-day
// export — see listForAdminRange — can tell rows from different days apart
// even for 'unmarked' rows, which have no attendance_date of their own.
// Only ever matches a record to an employee of the SAME employee_type, so a
// technician and a sales employee who happened to share a UUID (astronomically
// unlikely, but the whole point of tagging by type rather than id alone)
// could never be cross-matched.
const buildRowsForDate = (dateKey, employees, records, holidays = []) => {
  const byKey = new Map(records.map((r) => [`${recordEmployeeType(r)}:${recordOwnerId(r)}`, normalizeRecord(r)]));
  return employees.map((e) => {
    const record = byKey.get(`${e.employee_type}:${e.id}`) || null;
    const holiday = holidayFor(dateKey, e.location || null, holidays);
    return {
      employee: { id: e.id, full_name: e.full_name, email: e.email, phone: e.phone, location: e.location || null, employee_type: e.employee_type },
      record,
      bucket: record ? record.status : holiday ? 'holiday' : 'unmarked',
      holiday: holiday?.name || null,
      date: dateKey
    };
  });
};

// Any leave on the day: full, half-day not yet checked in, or a half-day
// with a check-in for the other half.
const isLeaveRow = (r) => r.bucket === 'leave' || r.bucket === 'half_day_leave' || r.record?.half_day === true;

// Applies the card / branch / employee-id / search filters identically for
// both the single-day list and the multi-day range export, so the two never
// drift apart in what a given filter combination actually means.
// `cardFilter` scopes rows exactly like clicking a KPI card: 'absent'
// additionally includes 'unmarked' rows (the candidates Mark Absent / Mark
// All Absent act on) per the plan's Absent-card behavior — the KPI count
// itself still only ever counts confirmed 'absent' rows, computed separately
// in listForAdmin before this filter runs. Holiday rows are never in the
// Absent list. Employee-type scoping happens
// earlier, on the roster itself (see listForAdmin/listForAdminRange) — same
// precedent branch filtering already established, so counts stay whole-day
// totals across whatever roster was fetched, and only the returned `rows`
// (never `counts`) reflect branch/search/card scoping.
const scopeRows = (rows, { cardFilter, branch, employeeId, search } = {}) => {
  let scoped = rows;
  // Admin-marked present days count as Present (they leave the Absent list).
  if (cardFilter === 'present') scoped = scoped.filter((r) => r.bucket === 'checked_out' || r.bucket === 'admin_present');
  else if (cardFilter === 'not_yet_checked_out') scoped = scoped.filter((r) => r.bucket === 'checked_in');
  // Emergency-holiday rows stay in the Absent card's list (that's where the
  // Eye action marks them), but are never counted in the Absent KPI.
  else if (cardFilter === 'absent') scoped = scoped.filter((r) => r.bucket === 'absent' || r.bucket === 'unmarked' || r.bucket === 'emergency_holiday');
  else if (cardFilter === 'leave') scoped = scoped.filter(isLeaveRow);

  if (branch) scoped = scoped.filter((r) => r.employee.location === branch);
  if (employeeId) scoped = scoped.filter((r) => r.employee.id === employeeId);
  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    scoped = scoped.filter((r) => (r.employee.full_name || '').toLowerCase().includes(q));
  }
  return scoped;
};

export const listForAdmin = async ({ date, employeeId, cardFilter, branch, employeeType, search } = {}) => {
  const dateKey = resolveDateKey(date);

  // Employee-type scoping happens on the roster itself (before rows are
  // built), same as branch — so switching the Employee Type tab changes
  // which employees are even considered, not just a post-hoc row filter.
  const employeeTypes = resolveEmployeeTypes(employeeType);
  const [activeEmployees, dayRecords, holidays] = await Promise.all([
    fetchActiveEmployees(employeeType),
    fetchRecordsForDate(dateKey),
    listHolidays({ from: dateKey, to: dateKey })
  ]);
  const { employees, records } = await rosterFromRecords(dayRecords, activeEmployees, employeeTypes);
  const rows = buildRowsForDate(dateKey, employees, records, holidays);

  const counts = {
    present: rows.filter((r) => r.bucket === 'checked_out' || r.bucket === 'admin_present').length,
    absent: rows.filter((r) => r.bucket === 'absent').length,
    not_yet_checked_out: rows.filter((r) => r.bucket === 'checked_in').length,
    leave: rows.filter(isLeaveRow).length,
    holiday: rows.filter((r) => r.bucket === 'holiday').length
  };

  const scoped = scopeRows(rows, { cardFilter, branch, employeeId, search });

  // Distinct branches from the full active roster of whatever employee
  // type(s) are in scope (unfiltered by the current `branch` selection), so
  // the filter dropdown always offers every option, not just whichever one
  // is currently applied.
  const branches = [...new Set(activeEmployees.map((e) => e.location).filter(Boolean))].sort();

  return { date: dateKey, counts, rows: scoped, branches, holiday: dayWideHoliday(dateKey, holidays) };
};

// Export-only: the same per-day roster/bucket/filter logic as listForAdmin,
// run once per calendar day in [startDate, endDate] and concatenated, so an
// Admin can export "This Week" / "This Month" / a custom range in the exact
// same shape the single-day list already uses — just spanning more days.
// Records and holidays for the whole range are read once up front. Capped at
// 366 days so a mistaken or malicious range can't produce an unbounded
// result.
const MAX_RANGE_DAYS = 366;

export const listForAdminRange = async ({ startDate, endDate, cardFilter, branch, employeeType, search } = {}) => {
  const start = resolveDateKey(startDate);
  const end = resolveDateKey(endDate);
  if (start > end) {
    const err = new Error('start date must not be after end date');
    err.code = 'INVALID_RANGE';
    throw err;
  }

  const dayCount = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) + 1;
  if (dayCount > MAX_RANGE_DAYS) {
    const err = new Error(`Date range too large — max ${MAX_RANGE_DAYS} days`);
    err.code = 'INVALID_RANGE';
    throw err;
  }

  const employeeTypes = resolveEmployeeTypes(employeeType);
  const [activeEmployees, rangeRecords, holidays] = await Promise.all([
    fetchActiveEmployees(employeeType),
    fetchRecordsInRange(start, end),
    listHolidays({ from: start, to: end })
  ]);

  const recordsByDay = new Map();
  for (const record of rangeRecords) {
    const key = formatDateOnly(record.attendance_date);
    if (!recordsByDay.has(key)) recordsByDay.set(key, []);
    recordsByDay.get(key).push(record);
  }

  const inactiveCache = new Map();
  const allRows = [];
  let cursor = start;
  for (let i = 0; i < dayCount; i += 1) {
    const { employees, records } = await rosterFromRecords(recordsByDay.get(cursor) || [], activeEmployees, employeeTypes, inactiveCache);
    const rows = buildRowsForDate(cursor, employees, records, holidays);
    allRows.push(...scopeRows(rows, { cardFilter, branch, search }));
    cursor = addDaysToDateKey(cursor, 1);
  }

  return { rows: allRows };
};

// Read-only, admin-only: an employee's own attendance history, or (through
// the admin-scoped route) any employee's, for the "switch into a
// technician's view" impersonation read-only history — see routes/
// adminAttendance.js. actorRole/actorOwnerId let the same function also back
// a possible future employee self-history endpoint without ever trusting a
// client-supplied employee id for a real employee.
export const getHistoryForEmployee = async (employeeType, employeeId, { actorRole, actorOwnerId, limit = 90 } = {}) => {
  if (!isEmployeeType(employeeType)) throw new Error(`Unknown employee type: ${employeeType}`);
  if (actorRole !== 'admin' && actorOwnerId !== employeeId) {
    const err = new Error('You are not allowed to view this history');
    err.code = 'FORBIDDEN';
    throw err;
  }
  const { data, error } = await supabase
    .from('attendance_records')
    .select('*')
    .eq(OWNER_COLUMN[employeeType], employeeId)
    .order('attendance_date', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Failed to fetch attendance history: ${error.message}`);
  return normalizeRecords(data);
};

// Admin explicitly confirms one employee as absent for a day. Rejected (409)
// if that employee already has any attendance row for the day — mirrors
// checkIn's reliance on the UNIQUE index rather than a read-then-write race.
// A well-formed but nonexistent employee id is rejected with a clean 404
// rather than reaching Postgres and surfacing a raw foreign-key-violation
// error.
export const markAbsent = async (employeeType, employeeId, date, adminId) => {
  if (!isEmployeeType(employeeType)) throw new Error(`Unknown employee type: ${employeeType}`);
  const { data: employee, error: lookupError } = await supabase
    .from(OWNER_TABLE[employeeType])
    .select('id')
    .eq('id', employeeId)
    .maybeSingle();
  if (lookupError) throw new Error(`Failed to verify employee: ${lookupError.message}`);
  if (!employee) {
    const err = new Error('Employee not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const { data, error } = await supabase
    .from('attendance_records')
    .insert([{
      [OWNER_COLUMN[employeeType]]: employeeId,
      attendance_date: resolveDateKey(date),
      status: 'absent',
      location_status: 'no_location',
      marked_absent_by: adminId || null
    }])
    .select('*')
    .single();
  if (error) {
    if (error.code === '23505') {
      const err = new Error('This employee already has an attendance record for that day');
      err.code = 'ALREADY_HAS_ATTENDANCE';
      throw err;
    }
    // Belt-and-suspenders: covers the narrow race where the employee is
    // removed between the existence check above and this insert.
    if (error.code === '23503') {
      const err = new Error('Employee not found');
      err.code = 'NOT_FOUND';
      throw err;
    }
    throw new Error(`Failed to mark absent: ${error.message}`);
  }
  return normalizeRecord(data);
};

// Admin marks one employee's day as an Emergency Holiday — offered from the
// Absent card's Eye flow on 'unmarked' (no row → insert) and 'absent' (row
// converted in place) days. Days with a real check-in are never converted,
// and neither is a day that's already an emergency holiday (409 for both).
// The 'absent' → holiday update is guarded on status = 'absent' so a
// concurrent change to the row can never be silently overwritten.
export const markEmergencyHoliday = async (employeeType, employeeId, date, adminId) => {
  if (!isEmployeeType(employeeType)) throw new Error(`Unknown employee type: ${employeeType}`);
  const dateKey = resolveDateKey(date);
  const { data: employee, error: lookupError } = await supabase
    .from(OWNER_TABLE[employeeType])
    .select('id')
    .eq('id', employeeId)
    .maybeSingle();
  if (lookupError) throw new Error(`Failed to verify employee: ${lookupError.message}`);
  if (!employee) {
    const err = new Error('Employee not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const { data: existing, error: existingError } = await supabase
    .from('attendance_records')
    .select('*')
    .eq(OWNER_COLUMN[employeeType], employeeId)
    .eq('attendance_date', dateKey)
    .maybeSingle();
  if (existingError) throw new Error(`Failed to check existing attendance: ${existingError.message}`);

  const conflict = (message) => {
    const err = new Error(message);
    err.code = 'ALREADY_HAS_ATTENDANCE';
    return err;
  };

  if (existing) {
    if (existing.status === 'emergency_holiday') throw conflict('This day is already marked as an emergency holiday');
    if (existing.status !== 'absent') throw conflict('This employee already checked in that day');
    const { data, error } = await supabase
      .from('attendance_records')
      .update({ status: 'emergency_holiday', marked_absent_by: adminId || null })
      .eq('id', existing.id)
      .eq('status', 'absent')
      .select('*')
      .maybeSingle();
    if (error) throw new Error(`Failed to mark emergency holiday: ${error.message}`);
    if (!data) throw conflict('Attendance for that day changed — refresh and try again');
    return normalizeRecord(data);
  }

  const { data, error } = await supabase
    .from('attendance_records')
    .insert([{
      [OWNER_COLUMN[employeeType]]: employeeId,
      attendance_date: dateKey,
      status: 'emergency_holiday',
      location_status: 'no_location',
      marked_absent_by: adminId || null
    }])
    .select('*')
    .single();
  if (error) {
    if (error.code === '23505') throw conflict('Attendance for that day changed — refresh and try again');
    if (error.code === '23503') {
      const err = new Error('Employee not found');
      err.code = 'NOT_FOUND';
      throw err;
    }
    throw new Error(`Failed to mark emergency holiday: ${error.message}`);
  }
  return normalizeRecord(data);
};

// Admin marks one employee present for a day without a real check-in — a
// deliberate admin override of the "only a check-in makes you present" rule,
// so it gets its own 'admin_present' status (no times, no location; see
// migration 038) rather than a fabricated checked_out row, and the UI labels
// it "Marked by admin". Offered on 'unmarked' (insert), 'absent' and
// 'emergency_holiday' (converted in place) days; never on a day with a real
// check-in. The in-place update is guarded on the status that was read, so a
// concurrent change to the row can never be silently overwritten.
const ADMIN_PRESENT_CONVERTIBLE = ['absent', 'emergency_holiday'];

export const markPresentByAdmin = async (employeeType, employeeId, date, adminId) => {
  if (!isEmployeeType(employeeType)) throw new Error(`Unknown employee type: ${employeeType}`);
  const dateKey = resolveDateKey(date);
  const { data: employee, error: lookupError } = await supabase
    .from(OWNER_TABLE[employeeType])
    .select('id')
    .eq('id', employeeId)
    .maybeSingle();
  if (lookupError) throw new Error(`Failed to verify employee: ${lookupError.message}`);
  if (!employee) {
    const err = new Error('Employee not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const { data: existing, error: existingError } = await supabase
    .from('attendance_records')
    .select('*')
    .eq(OWNER_COLUMN[employeeType], employeeId)
    .eq('attendance_date', dateKey)
    .maybeSingle();
  if (existingError) throw new Error(`Failed to check existing attendance: ${existingError.message}`);

  const conflict = (message) => {
    const err = new Error(message);
    err.code = 'ALREADY_HAS_ATTENDANCE';
    return err;
  };

  if (existing) {
    if (existing.status === 'admin_present') throw conflict('This day is already marked present by an admin');
    if (!ADMIN_PRESENT_CONVERTIBLE.includes(existing.status)) throw conflict('This employee already checked in that day');
    const { data, error } = await supabase
      .from('attendance_records')
      .update({ status: 'admin_present', marked_absent_by: adminId || null })
      .eq('id', existing.id)
      .eq('status', existing.status)
      .select('*')
      .maybeSingle();
    if (error) throw new Error(`Failed to mark present: ${error.message}`);
    if (!data) throw conflict('Attendance for that day changed — refresh and try again');
    return normalizeRecord(data);
  }

  const { data, error } = await supabase
    .from('attendance_records')
    .insert([{
      [OWNER_COLUMN[employeeType]]: employeeId,
      attendance_date: dateKey,
      status: 'admin_present',
      location_status: 'no_location',
      marked_absent_by: adminId || null
    }])
    .select('*')
    .single();
  if (error) {
    if (error.code === '23505') throw conflict('Attendance for that day changed — refresh and try again');
    if (error.code === '23503') {
      const err = new Error('Employee not found');
      err.code = 'NOT_FOUND';
      throw err;
    }
    throw new Error(`Failed to mark present: ${error.message}`);
  }
  return normalizeRecord(data);
};

// ============================================
// LEAVE (employee self-service and admin)
// ============================================

// How far ahead an employee may plan their own leave.
const MAX_LEAVE_DAYS_AHEAD = 90;
const LEAVE_STATUSES = ['leave', 'half_day_leave'];

const leaveError = (message, code) => Object.assign(new Error(message), { code });

// Employees may apply or cancel only from today up to MAX_LEAVE_DAYS_AHEAD;
// admins may act on any day (e.g. recording a past leave).
const assertEmployeeLeaveWindow = (dateKey) => {
  const today = indiaDateKey();
  if (dateKey < today) throw leaveError('Leave for a past day can only be recorded by an admin', 'INVALID_DATE');
  if (dateKey > addDaysToDateKey(today, MAX_LEAVE_DAYS_AHEAD)) {
    throw leaveError(`Leave can be applied at most ${MAX_LEAVE_DAYS_AHEAD} days ahead`, 'INVALID_DATE');
  }
};

const loadEmployeeForLeave = async (employeeType, employeeId) => {
  const { data, error } = await supabase
    .from(OWNER_TABLE[employeeType])
    .select('id, location')
    .eq('id', employeeId)
    .maybeSingle();
  if (error) throw new Error(`Failed to verify employee: ${error.message}`);
  if (!data) throw leaveError('Employee not found', 'NOT_FOUND');
  return data;
};

const findDayRecord = async (employeeType, employeeId, dateKey) => {
  const { data, error } = await supabase
    .from('attendance_records')
    .select('*')
    .eq(OWNER_COLUMN[employeeType], employeeId)
    .eq('attendance_date', dateKey)
    .maybeSingle();
  if (error) throw new Error(`Failed to check existing attendance: ${error.message}`);
  return data;
};

// Full-day leave (status 'leave') or half-day leave. Half-day before any
// check-in is stored as 'half_day_leave' (checking in later keeps it, see
// checkIn); on a day already checked in it only flags that row half_day.
// `actor` is { role: 'admin', adminId } or { role: 'employee' } — the
// employee id always comes from the verified JWT for an employee. An admin
// may also turn an 'absent' day into leave. Applied immediately; the reason
// is stored with the day and shown in records and exports.
export const applyLeave = async (employeeType, employeeId, { date, halfDay = false, reason } = {}, actor = {}) => {
  if (!isEmployeeType(employeeType)) throw new Error(`Unknown employee type: ${employeeType}`);
  const isAdmin = actor.role === 'admin';
  const dateKey = resolveDateKey(date);
  const leaveReason = String(reason || '').trim();
  if (!leaveReason) throw leaveError('A reason is required', 'INVALID');
  if (!isAdmin) assertEmployeeLeaveWindow(dateKey);

  const employee = await loadEmployeeForLeave(employeeType, employeeId);
  const holiday = holidayFor(dateKey, employee.location || null, await listHolidays({ from: dateKey, to: dateKey }));
  if (holiday) throw leaveError(`That day is already a holiday (${holiday.name})`, 'CONFLICT');

  const markedBy = isAdmin ? actor.adminId || null : null;
  const leaveStatus = halfDay ? 'half_day_leave' : 'leave';
  const existing = await findDayRecord(employeeType, employeeId, dateKey);
  const changed = () => leaveError('Attendance for that day changed — refresh and try again', 'CONFLICT');

  if (!existing) {
    const { data, error } = await supabase
      .from('attendance_records')
      .insert([{
        [OWNER_COLUMN[employeeType]]: employeeId,
        attendance_date: dateKey,
        status: leaveStatus,
        half_day: halfDay,
        leave_reason: leaveReason,
        location_status: 'no_location',
        marked_absent_by: markedBy
      }])
      .select('*')
      .single();
    if (error) {
      if (error.code === '23505') throw changed();
      if (error.code === '23503') throw leaveError('Employee not found', 'NOT_FOUND');
      throw new Error(`Failed to apply leave: ${error.message}`);
    }
    return normalizeRecord(data);
  }

  if (LEAVE_STATUSES.includes(existing.status) || existing.half_day) {
    throw leaveError('Leave is already applied for that day', 'CONFLICT');
  }

  // Half-day on a day already checked in: the check-in covers the other half.
  if (halfDay && ['checked_in', 'checked_out'].includes(existing.status)) {
    const { data, error } = await supabase
      .from('attendance_records')
      .update({ half_day: true, leave_reason: leaveReason })
      .eq('id', existing.id)
      .eq('status', existing.status)
      .eq('half_day', false)
      .select('*')
      .maybeSingle();
    if (error) throw new Error(`Failed to apply leave: ${error.message}`);
    if (!data) throw changed();
    return normalizeRecord(data);
  }

  if (isAdmin && existing.status === 'absent') {
    const { data, error } = await supabase
      .from('attendance_records')
      .update({ status: leaveStatus, half_day: halfDay, leave_reason: leaveReason, marked_absent_by: markedBy })
      .eq('id', existing.id)
      .eq('status', 'absent')
      .select('*')
      .maybeSingle();
    if (error) throw new Error(`Failed to apply leave: ${error.message}`);
    if (!data) throw changed();
    return normalizeRecord(data);
  }

  if (['checked_in', 'checked_out'].includes(existing.status)) {
    throw leaveError('Already checked in that day — apply a half-day leave instead', 'CONFLICT');
  }
  throw leaveError('That day already has an attendance status', 'CONFLICT');
};

// Removes a leave: a full/half-day leave row with no check-in is deleted
// (the day goes back to no record); a half-day flag on a checked-in day is
// cleared. Same actor/date rules as applyLeave.
export const cancelLeave = async (employeeType, employeeId, { date } = {}, actor = {}) => {
  if (!isEmployeeType(employeeType)) throw new Error(`Unknown employee type: ${employeeType}`);
  const dateKey = resolveDateKey(date);
  if (actor.role !== 'admin') assertEmployeeLeaveWindow(dateKey);

  const existing = await findDayRecord(employeeType, employeeId, dateKey);
  if (!existing || (!LEAVE_STATUSES.includes(existing.status) && !existing.half_day)) {
    throw leaveError('No leave on that day', 'NOT_FOUND');
  }

  if (LEAVE_STATUSES.includes(existing.status)) {
    const { data, error } = await supabase
      .from('attendance_records')
      .delete()
      .eq('id', existing.id)
      .eq('status', existing.status)
      .select('id');
    if (error) throw new Error(`Failed to cancel leave: ${error.message}`);
    if (!data?.length) throw leaveError('Attendance for that day changed — refresh and try again', 'CONFLICT');
    return null;
  }

  const { data, error } = await supabase
    .from('attendance_records')
    .update({ half_day: false, leave_reason: null })
    .eq('id', existing.id)
    .eq('half_day', true)
    .select('*')
    .maybeSingle();
  if (error) throw new Error(`Failed to cancel leave: ${error.message}`);
  if (!data) throw leaveError('Attendance for that day changed — refresh and try again', 'CONFLICT');
  return normalizeRecord(data);
};

// The employee-type/branch/search scoping shared by both bulk actions below
// — audit fix: they previously ignored the Admin page's active filters
// entirely, so "Mark All Absent (2)"/"Check Out All (2)" (a count computed
// from the currently *filtered* rows) could silently act on a much larger,
// unfiltered set. Reuses the same fetchActiveEmployees(employeeType) the
// list/export endpoints already scope by, then narrows further by
// branch/search exactly like scopeRows does for the on-screen rows, so the
// bulk action's real effect always matches what the button's count implied.
const scopedEmployeeCandidates = async ({ employeeType, branch, search } = {}) => {
  const employees = await fetchActiveEmployees(employeeType);
  let scoped = employees;
  if (branch) scoped = scoped.filter((e) => e.location === branch);
  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    scoped = scoped.filter((e) => (e.full_name || '').toLowerCase().includes(q));
  }
  return scoped;
};

// Marks every active employee *within the given scope* who has NO
// attendance row at all for the day as absent, in one batch — employees who
// already checked in (or were already marked absent) are read here and
// simply excluded, never touched. `employeeType`/`branch`/`search` narrow
// the candidate set to match whatever the Admin page's filters currently
// show; omitting all three marks absent across the whole day's roster, same
// as before this fix.
export const markAllAbsent = async (date, adminId, { branch, employeeType, search } = {}) => {
  const dateKey = resolveDateKey(date);

  const candidateEmployees = await scopedEmployeeCandidates({ employeeType, branch, search });

  const { data: existing, error: existError } = await supabase
    .from('attendance_records')
    .select('technician_id, sales_id, back_office_id')
    .eq('attendance_date', dateKey);
  if (existError) throw new Error(`Failed to check existing attendance: ${existError.message}`);

  // Nobody is marked absent on their own Sunday/holiday.
  const holidays = await listHolidays({ from: dateKey, to: dateKey });
  const covered = new Set((existing || []).map((r) => `${recordEmployeeType(r)}:${recordOwnerId(r)}`));
  const missing = candidateEmployees.filter((e) =>
    !covered.has(`${e.employee_type}:${e.id}`) && !holidayFor(dateKey, e.location || null, holidays));
  if (!missing.length) return { markedCount: 0, records: [] };

  // Every row must carry the exact same set of keys — PostgresQueryBuilder's
  // multi-row INSERT requires uniform columns across the whole batch (see
  // config/databaseClient.js), so a mixed-type `missing` set (e.g. some
  // Technicians and some Sales still unmarked the same day — an entirely
  // ordinary case, not an edge case) previously produced rows keyed
  // `technician_id` for one and `sales_id` for another and crashed the
  // whole insert with "All inserted rows must have the same columns"
  // instead of marking anyone absent. Setting all three owner columns
  // explicitly (only one non-null per row) keeps every row's key set
  // identical while still satisfying attendance_records_owner_check.
  const rows = missing.map((e) => ({
    technician_id: e.employee_type === 'technician' ? e.id : null,
    sales_id: e.employee_type === 'sales' ? e.id : null,
    back_office_id: e.employee_type === 'back_office' ? e.id : null,
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
      const err = new Error('One or more employees already have attendance for this day — refresh and try again');
      err.code = 'CONFLICT';
      throw err;
    }
    // Belt-and-suspenders, same as markAbsent's singular path: covers the
    // narrow race where an employee in `missing` is deleted between the
    // read above and this insert. Nothing was written (all-or-nothing
    // multi-row insert) — the admin just needs to retry.
    if (error.code === '23503') {
      const err = new Error('One or more employees could not be found — refresh and try again');
      err.code = 'CONFLICT';
      throw err;
    }
    throw new Error(`Failed to mark all absent: ${error.message}`);
  }
  return { markedCount: data.length, records: normalizeRecords(data) };
};

// Check out every currently open ("Not Yet Checked Out") session for a day
// *within the given scope*, across whichever employee type(s) that implies.
// `employeeType`/`branch`/`search` narrow it to match the Admin page's
// currently applied filters (same scoping as markAllAbsent above); omitting
// all three checks out every open session for the day, same as before this
// fix. Per-record, not a single batch statement — a failure on one record
// must never block the rest, and the caller needs to know exactly which
// ones failed (spec's "handle partial failures safely" requirement).
export const bulkCheckOutOpenSessions = async (date, { branch, employeeType, search } = {}) => {
  const dateKey = resolveDateKey(date);
  const candidateEmployees = await scopedEmployeeCandidates({ employeeType, branch, search });
  const candidateKeys = new Set(candidateEmployees.map((e) => `${e.employee_type}:${e.id}`));

  const { data: openRecords, error } = await supabase
    .from('attendance_records')
    .select('id, technician_id, sales_id, back_office_id')
    .eq('attendance_date', dateKey)
    .eq('status', 'checked_in');
  if (error) throw new Error(`Failed to list open sessions: ${error.message}`);

  const scopedOpenRecords = (openRecords || []).filter((r) => candidateKeys.has(`${recordEmployeeType(r)}:${recordOwnerId(r)}`));

  const results = [];
  for (const record of scopedOpenRecords) {
    try {
      const updated = await checkOut(record.id, { actorRole: 'admin' });
      results.push({ id: record.id, success: true, record: updated });
    } catch (err) {
      results.push({ id: record.id, success: false, error: err.message });
    }
  }
  return { total: results.length, succeeded: results.filter((r) => r.success).length, results };
};
