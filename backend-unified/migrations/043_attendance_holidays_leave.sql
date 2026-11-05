-- Attendance: holidays, leave and half-day leave.
--
-- 1. holidays — admin-managed festival / public holidays (Diwali, Pooja, …).
--    branch NULL = every branch; otherwise only employees whose `location`
--    (the Branch shown on the Attendance page) matches. Sundays are holidays
--    by rule in attendanceService.js and are never stored here. A holiday
--    only labels a day that has no attendance row: anyone who checks in on
--    a holiday is still Present.
--
-- 2. attendance_records gains:
--    - status 'leave'          — full-day leave; shaped like 'absent' (no
--                                check-in, no location).
--    - status 'half_day_leave' — half-day leave applied before any check-in.
--                                Checking in later turns the row into a
--                                normal checked_in row with half_day kept.
--    - half_day                — true on a half-day-leave day, including a
--                                checked_in/checked_out row (worked the
--                                other half).
--    - leave_reason            — required whenever a leave applies.
--    marked_absent_by keeps its meaning (admin who set a non-check-in
--    status); it is NULL when the employee applied the leave themselves.
--
-- Only the two status CHECK constraints are replaced; every existing row
-- stays valid (half_day defaults to false, leave_reason to NULL). Runs
-- inside scripts/migrate.js's transaction.

CREATE TABLE holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date date NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  branch text CHECK (branch IS NULL OR length(btrim(branch)) > 0),
  created_by uuid REFERENCES admins(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One holiday per date per scope (all branches = '').
CREATE UNIQUE INDEX idx_holidays_unique_date_branch
  ON holidays (holiday_date, (COALESCE(branch, '')));

CREATE TRIGGER holidays_set_updated_at
  BEFORE UPDATE ON holidays
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE attendance_records
  ADD COLUMN half_day boolean NOT NULL DEFAULT false,
  ADD COLUMN leave_reason text;

ALTER TABLE attendance_records
  DROP CONSTRAINT attendance_records_status_check;

ALTER TABLE attendance_records
  ADD CONSTRAINT attendance_records_status_check
  CHECK (status IN ('checked_in', 'checked_out', 'absent', 'emergency_holiday', 'admin_present', 'leave', 'half_day_leave'));

ALTER TABLE attendance_records
  DROP CONSTRAINT attendance_records_status_consistency;

ALTER TABLE attendance_records
  ADD CONSTRAINT attendance_records_status_consistency CHECK (
    (status IN ('absent', 'emergency_holiday', 'admin_present', 'leave', 'half_day_leave')
      AND check_in_time IS NULL AND check_out_time IS NULL
      AND location_lat IS NULL AND location_lng IS NULL
      AND location_status = 'no_location')
    OR
    (status IN ('checked_in', 'checked_out')
      AND check_in_time IS NOT NULL
      AND location_status <> 'no_location')
  );

-- half_day is always true on a 'half_day_leave' row, never set on the other
-- no-check-in statuses, and optional on a checked_in/checked_out row.
ALTER TABLE attendance_records
  ADD CONSTRAINT attendance_records_half_day_consistency CHECK (
    (status = 'half_day_leave' AND half_day)
    OR (status IN ('absent', 'emergency_holiday', 'admin_present', 'leave') AND NOT half_day)
    OR status IN ('checked_in', 'checked_out')
  );

-- Every leave carries a reason.
ALTER TABLE attendance_records
  ADD CONSTRAINT attendance_records_leave_reason_required CHECK (
    (status <> 'leave' AND NOT half_day)
    OR length(btrim(COALESCE(leave_reason, ''))) > 0
  );
