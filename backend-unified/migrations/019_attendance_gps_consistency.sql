-- Attendance Category (V1) follow-up — closes an audit-identified schema
-- gap. The existing attendance_records_status_consistency constraint (see
-- 018_attendance.sql) ties location_status <> 'no_location' to
-- checked_in/checked_out rows, but nothing tied location_status =
-- 'gps_captured' specifically to latitude/longitude actually being present
-- (or the other three non-GPS statuses to them being absent). The
-- application code (attendanceService.checkIn) has always kept these
-- consistent, so this does not change any existing valid row — it only
-- closes the gap for any future write path.
--
-- Purely additive: does not alter any existing column, or any table outside
-- attendance_records.

BEGIN;

ALTER TABLE attendance_records
  ADD CONSTRAINT attendance_records_gps_lat_lng_consistency CHECK (
    (location_status = 'gps_captured' AND location_lat IS NOT NULL AND location_lng IS NOT NULL)
    OR (location_status <> 'gps_captured' AND location_lat IS NULL AND location_lng IS NULL)
  );

COMMIT;
