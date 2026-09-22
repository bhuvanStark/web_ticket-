// Attendance Category (V1), generalized by Sales & Back-Office Roles V1
// (PLAN_Sales_BackOffice_Unified_Attendance_V1.md §9) into one shared
// service for Technician, Sales, and Back-Office check-in/out — the same
// `attendance_records` table for all three (see migration
// 022_attendance_sales_backoffice.sql), never a second table. Additive
// module: does not import from or touch serviceRequestService.js,
// projectService.js, or projectActivityService.js in any way, and a failure
// here can never affect tickets or projects.
import { supabase } from '../config/supabaseClient.js';
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
      // Word the conflict to match what actually happened — the UNIQUE
      // index fires the same way whether they're still checked in, already
      // checked out, or already marked absent for today, and "already
      // checked in" was misleading for the latter two.
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
// three. Shared by fetchActiveEmployees and rosterForDate so the two always
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

// The full employee+record roster for one day: `activeEmployees` (already
// fetched by the caller — see listForAdmin/listForAdminRange, which fetch it
// once and reuse it across every day in a range export), plus any inactive-
// but-recorded employee for that day, merged and re-sorted alphabetically
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
const rosterForDate = async (dateKey, activeEmployees, employeeTypes) => {
  const allRecords = await fetchRecordsForDate(dateKey);
  const typeSet = new Set(employeeTypes);
  const records = allRecords.filter((r) => typeSet.has(recordEmployeeType(r)));
  const activeKeys = new Set(activeEmployees.map((e) => `${e.employee_type}:${e.id}`));

  // A record whose owner isn't in the active roster (and, per the filter
  // above, is definitely of an in-scope type) belongs to a deactivated
  // employee — keep them; their still-open or otherwise recorded session
  // must not vanish just because they were deactivated after checking in.
  const missingByType = {};
  for (const record of records) {
    const type = recordEmployeeType(record);
    const key = `${type}:${recordOwnerId(record)}`;
    if (activeKeys.has(key)) continue;
    (missingByType[type] ||= []).push(recordOwnerId(record));
  }

  const inactiveGroups = await Promise.all(
    Object.entries(missingByType).map(async ([type, ids]) => {
      const { data, error } = await supabase.from(OWNER_TABLE[type]).select(EMPLOYEE_SELECT).in('id', ids);
      if (error) throw new Error(`Failed to list ${type} roster: ${error.message}`);
      return (data || []).map((e) => ({ ...e, employee_type: type }));
    })
  );

  const employees = [...activeEmployees, ...inactiveGroups.flat()]
    .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
  return { employees, records };
};

// `bucket` is the display/filter state: 'checked_out' -> Present,
// 'checked_in' -> Not Yet Checked Out, 'absent' -> Admin-confirmed absent,
// 'unmarked' -> no check-in, no record. Every row also carries its own
// `date` explicitly (not just whatever's on the record) so a multi-day
// export — see listForAdminRange — can tell rows from different days apart
// even for 'unmarked' rows, which have no attendance_date of their own.
// Only ever matches a record to an employee of the SAME employee_type, so a
// technician and a sales employee who happened to share a UUID (astronomically
// unlikely, but the whole point of tagging by type rather than id alone)
// could never be cross-matched.
const buildRowsForDate = (dateKey, employees, records) => {
  const byKey = new Map(records.map((r) => [`${recordEmployeeType(r)}:${recordOwnerId(r)}`, normalizeRecord(r)]));
  return employees.map((e) => {
    const record = byKey.get(`${e.employee_type}:${e.id}`) || null;
    return {
      employee: { id: e.id, full_name: e.full_name, email: e.email, phone: e.phone, location: e.location || null, employee_type: e.employee_type },
      record,
      bucket: record ? record.status : 'unmarked',
      date: dateKey
    };
  });
};

// Applies the card / branch / employee-id / search filters identically for
// both the single-day list and the multi-day range export, so the two never
// drift apart in what a given filter combination actually means.
// `cardFilter` scopes rows exactly like clicking a KPI card: 'absent'
// additionally includes 'unmarked' rows (the candidates Mark Absent / Mark
// All Absent act on) per the plan's Absent-card behavior — the KPI count
// itself still only ever counts confirmed 'absent' rows, computed separately
// in listForAdmin before this filter runs. Employee-type scoping happens
// earlier, on the roster itself (see listForAdmin/listForAdminRange) — same
// precedent branch filtering already established, so counts stay whole-day
// totals across whatever roster was fetched, and only the returned `rows`
// (never `counts`) reflect branch/search/card scoping.
const scopeRows = (rows, { cardFilter, branch, employeeId, search } = {}) => {
  let scoped = rows;
  if (cardFilter === 'present') scoped = scoped.filter((r) => r.bucket === 'checked_out');
  else if (cardFilter === 'not_yet_checked_out') scoped = scoped.filter((r) => r.bucket === 'checked_in');
  else if (cardFilter === 'absent') scoped = scoped.filter((r) => r.bucket === 'absent' || r.bucket === 'unmarked');

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
  const activeEmployees = await fetchActiveEmployees(employeeType);
  const { employees, records } = await rosterForDate(dateKey, activeEmployees, employeeTypes);
  const rows = buildRowsForDate(dateKey, employees, records);

  const counts = {
    present: rows.filter((r) => r.bucket === 'checked_out').length,
    absent: rows.filter((r) => r.bucket === 'absent').length,
    not_yet_checked_out: rows.filter((r) => r.bucket === 'checked_in').length
  };

  const scoped = scopeRows(rows, { cardFilter, branch, employeeId, search });

  // Distinct branches from the full active roster of whatever employee
  // type(s) are in scope (unfiltered by the current `branch` selection), so
  // the filter dropdown always offers every option, not just whichever one
  // is currently applied.
  const branches = [...new Set(activeEmployees.map((e) => e.location).filter(Boolean))].sort();

  return { date: dateKey, counts, rows: scoped, branches };
};

// Export-only: the same per-day roster/bucket/filter logic as listForAdmin,
// run once per calendar day in [startDate, endDate] and concatenated, so an
// Admin can export "This Week" / "This Month" / a custom range in the exact
// same shape the single-day list already uses — just spanning more days.
// Capped at 366 days so a mistaken or malicious range can't trigger an
// unbounded number of queries.
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
  const activeEmployees = await fetchActiveEmployees(employeeType);
  const allRows = [];
  let cursor = start;
  for (let i = 0; i < dayCount; i += 1) {
    const { employees, records } = await rosterForDate(cursor, activeEmployees, employeeTypes);
    const rows = buildRowsForDate(cursor, employees, records);
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

  const covered = new Set((existing || []).map((r) => `${recordEmployeeType(r)}:${recordOwnerId(r)}`));
  const missing = candidateEmployees.filter((e) => !covered.has(`${e.employee_type}:${e.id}`));
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
