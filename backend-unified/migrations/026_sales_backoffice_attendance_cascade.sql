-- Sales/Back-Office deletion fix: attendance_records.sales_id and
-- .back_office_id were ON DELETE RESTRICT (see 022_attendance_sales_
-- backoffice.sql), which permanently blocked deleting any Sales or
-- Back-Office employee who had ever clocked in/out.
--
-- Product decision: "Delete" on these two roles is now an explicit,
-- permanent action — it removes the employee AND their attendance history
-- together, and must succeed whether or not attendance rows exist.
-- "Deactivate" (the existing is_active flag) is the safe alternative that
-- keeps both the employee record and all attendance history intact while
-- removing them from active use. This migration only changes the delete
-- rule for sales_id/back_office_id; technician_id keeps its existing
-- ON DELETE RESTRICT untouched — technician attendance-history protection
-- is unrelated to this change and is not part of this fix.

BEGIN;

ALTER TABLE attendance_records DROP CONSTRAINT attendance_records_sales_id_fkey;

ALTER TABLE attendance_records
  ADD CONSTRAINT attendance_records_sales_id_fkey
  FOREIGN KEY (sales_id) REFERENCES sales(id) ON DELETE CASCADE;

ALTER TABLE attendance_records DROP CONSTRAINT attendance_records_back_office_id_fkey;

ALTER TABLE attendance_records
  ADD CONSTRAINT attendance_records_back_office_id_fkey
  FOREIGN KEY (back_office_id) REFERENCES back_office(id) ON DELETE CASCADE;

COMMIT;
