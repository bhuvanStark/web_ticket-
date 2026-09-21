-- Attendance Category (V1): technician daily check-in/check-out, isolated
-- from the Service Ticket and Project Category systems. This migration is
-- purely additive — it does not alter any existing table, column,
-- constraint, or trigger.
--
-- One row per technician per India calendar day (UNIQUE constraint below),
-- covering three mutually exclusive states via `status`:
--   'checked_in'  — checked in, no checkout yet (Admin's "Not Yet Checked Out")
--   'checked_out' — a completed session for the day ("Present")
--   'absent'      — Admin-confirmed absence, created only on explicit Admin
--                    action (never automatically) and carries no check-in/out
--                    or location data at all.
-- A technician with no row at all for a day is simply "unmarked / no
-- check-in" — the plan explicitly forbids auto-creating a row to represent
-- that state, so `check_in_time` must be nullable (the plan's suggested
-- schema marks it NOT NULL, but that's incompatible with an absent row
-- sharing this same one-row-per-day table).

BEGIN;

CREATE TABLE attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- RESTRICT, not SET NULL: same precedent as project_activities.technician_id
  -- — attendance history must always keep pointing at who it belongs to, even
  -- if the technician is later deactivated/removed.
  technician_id uuid NOT NULL REFERENCES technicians(id) ON DELETE RESTRICT,
  -- Defaulted from the India calendar day as a server-side safety net, but
  -- every write path in attendanceService.js sets this explicitly.
  attendance_date date NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Kolkata')::date),
  check_in_time timestamptz,
  check_out_time timestamptz,
  location_lat double precision,
  location_lng double precision,
  location_accuracy_m double precision,
  location_status text NOT NULL DEFAULT 'no_location',
  location_captured_at timestamptz,
  status text NOT NULL,
  duration_minutes integer,
  -- Audit trail for Mark Absent / Mark All Absent. SET NULL (not RESTRICT):
  -- an admin account being removed later must never block deleting it, and
  -- the attendance record itself must survive regardless.
  marked_absent_by uuid REFERENCES admins(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT attendance_records_unique_per_day UNIQUE (technician_id, attendance_date),

  CONSTRAINT attendance_records_status_check
    CHECK (status IN ('checked_in', 'checked_out', 'absent')),

  CONSTRAINT attendance_records_location_status_check
    CHECK (location_status IN ('gps_captured', 'permission_denied', 'device_unsupported', 'unavailable_error', 'no_location')),

  -- Ties check-in/checkout/location presence to status: an absent row has
  -- none of them; a checked_in/checked_out row always has a real check-in
  -- and a real (non-'no_location') location outcome.
  CONSTRAINT attendance_records_status_consistency CHECK (
    (status = 'absent'
      AND check_in_time IS NULL AND check_out_time IS NULL
      AND location_lat IS NULL AND location_lng IS NULL
      AND location_status = 'no_location')
    OR
    (status IN ('checked_in', 'checked_out')
      AND check_in_time IS NOT NULL
      AND location_status <> 'no_location')
  ),

  CONSTRAINT attendance_records_checked_out_has_checkout
    CHECK (status <> 'checked_out' OR check_out_time IS NOT NULL),

  CONSTRAINT attendance_records_checkout_after_checkin
    CHECK (check_out_time IS NULL OR check_in_time IS NULL OR check_out_time > check_in_time),

  CONSTRAINT attendance_records_duration_nonneg
    CHECK (duration_minutes IS NULL OR duration_minutes >= 0),

  CONSTRAINT attendance_records_lat_range
    CHECK (location_lat IS NULL OR (location_lat >= -90 AND location_lat <= 90)),

  CONSTRAINT attendance_records_lng_range
    CHECK (location_lng IS NULL OR (location_lng >= -180 AND location_lng <= 180)),

  CONSTRAINT attendance_records_accuracy_nonneg
    CHECK (location_accuracy_m IS NULL OR location_accuracy_m >= 0)
);

CREATE INDEX idx_attendance_records_date ON attendance_records(attendance_date);
CREATE INDEX idx_attendance_records_tech ON attendance_records(technician_id);

CREATE TRIGGER attendance_records_set_updated_at
  BEFORE UPDATE ON attendance_records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
