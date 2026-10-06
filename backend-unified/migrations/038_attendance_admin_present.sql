-- Attendance: Admin "Mark Present" (Eye flow). Adds one new
-- attendance_records.status value, 'admin_present' — a day an admin has
-- explicitly marked as present without a real check-in. Shaped exactly like
-- an 'absent' / 'emergency_holiday' row (no check-in/out, no location); it
-- is labelled "Present · Marked by admin" and counted in the Present KPI.
-- marked_absent_by is reused as the audit column for "admin who set this
-- status", same as 030 did for emergency_holiday.
--
-- Only the two status CHECK constraints are replaced; no column, index,
-- trigger, or existing row is touched, and every previously valid row stays
-- valid (the new constraints are strict supersets of the old ones). Runs
-- inside scripts/migrate.js's transaction.

ALTER TABLE attendance_records
  DROP CONSTRAINT attendance_records_status_check;

ALTER TABLE attendance_records
  ADD CONSTRAINT attendance_records_status_check
  CHECK (status IN ('checked_in', 'checked_out', 'absent', 'emergency_holiday', 'admin_present'));

ALTER TABLE attendance_records
  DROP CONSTRAINT attendance_records_status_consistency;

ALTER TABLE attendance_records
  ADD CONSTRAINT attendance_records_status_consistency CHECK (
    (status IN ('absent', 'emergency_holiday', 'admin_present')
      AND check_in_time IS NULL AND check_out_time IS NULL
      AND location_lat IS NULL AND location_lng IS NULL
      AND location_status = 'no_location')
    OR
    (status IN ('checked_in', 'checked_out')
      AND check_in_time IS NOT NULL
      AND location_status <> 'no_location')
  );
