-- Sales & Back-Office Roles V1 — generalizes attendance_records (see
-- 018_attendance.sql) into the one shared attendance table for Technician,
-- Sales, and Back-Office, per the plan's locked design decision: "Use the
-- existing attendance_records table... Do not create a second attendance
-- table." Existing Technician rows are not moved, copied, or duplicated —
-- this migration only widens the schema; it writes nothing.
--
-- technician_id becomes nullable so a Sales/Back-Office row (which has
-- neither) is representable; an exclusive-owner CHECK then guarantees every
-- row still belongs to exactly one employee. The single table-wide
-- UNIQUE(technician_id, attendance_date) from 018 is replaced with three
-- partial unique indexes (one per owner column) — a plain UNIQUE constraint
-- on a nullable column does not enforce "one row per day" the way the
-- original NOT NULL column did (though a technician_id-only UNIQUE would
-- still work by not restraining the other two columns; using partial
-- indexes for all three keeps the "one row per employee per day" rule
-- symmetric and explicit across all three owner types, per the plan's
-- "role-specific unique indexes" instruction).
--
-- ON DELETE RESTRICT for sales_id/back_office_id mirrors technician_id's
-- existing precedent: attendance history must always keep pointing at who
-- it belongs to, even if that employee is later deactivated/removed.

BEGIN;

ALTER TABLE attendance_records
  ALTER COLUMN technician_id DROP NOT NULL;

ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS sales_id uuid REFERENCES sales(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS back_office_id uuid REFERENCES back_office(id) ON DELETE RESTRICT;

ALTER TABLE attendance_records
  DROP CONSTRAINT IF EXISTS attendance_records_unique_per_day;

CREATE UNIQUE INDEX idx_attendance_records_unique_technician_day
  ON attendance_records(technician_id, attendance_date)
  WHERE technician_id IS NOT NULL;

CREATE UNIQUE INDEX idx_attendance_records_unique_sales_day
  ON attendance_records(sales_id, attendance_date)
  WHERE sales_id IS NOT NULL;

CREATE UNIQUE INDEX idx_attendance_records_unique_back_office_day
  ON attendance_records(back_office_id, attendance_date)
  WHERE back_office_id IS NOT NULL;

ALTER TABLE attendance_records
  ADD CONSTRAINT attendance_records_owner_check
  CHECK (num_nonnulls(technician_id, sales_id, back_office_id) = 1);

CREATE INDEX IF NOT EXISTS idx_attendance_records_sales
  ON attendance_records(sales_id)
  WHERE sales_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_records_back_office
  ON attendance_records(back_office_id)
  WHERE back_office_id IS NOT NULL;

COMMIT;
