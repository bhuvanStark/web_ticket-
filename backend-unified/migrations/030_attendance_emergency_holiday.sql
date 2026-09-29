-- Attendance: Admin "Mark Emergency Holiday" (Absent card → Eye flow).
-- Adds one new attendance_records.status value, 'emergency_holiday'. It is
-- shaped exactly like an 'absent' row (no check-in/out, no location) — the
-- only difference is how it is labelled and counted. marked_absent_by is
-- reused as the audit column for "admin who set this non-working status".
--
-- Only the two status CHECK constraints are replaced; no column, index,
-- trigger, or existing row is touched, and every previously valid row stays
-- valid (the new constraints are strict supersets of the old ones).

BEGIN;

ALTER TABLE attendance_records
  DROP CONSTRAINT attendance_records_status_check;

ALTER TABLE attendance_records
  ADD CONSTRAINT attendance_records_status_check
  CHECK (status IN ('checked_in', 'checked_out', 'absent', 'emergency_holiday'));

ALTER TABLE attendance_records
  DROP CONSTRAINT attendance_records_status_consistency;

ALTER TABLE attendance_records
  ADD CONSTRAINT attendance_records_status_consistency CHECK (
    (status IN ('absent', 'emergency_holiday')
      AND check_in_time IS NULL AND check_out_time IS NULL
      AND location_lat IS NULL AND location_lng IS NULL
      AND location_status = 'no_location')
    OR
    (status IN ('checked_in', 'checked_out')
      AND check_in_time IS NOT NULL
      AND location_status <> 'no_location')
  );

COMMIT;
