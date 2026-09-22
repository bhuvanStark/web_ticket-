-- Sales & Back-Office Roles V1 — extends password_resets (the same table
-- every portal's OTP sign-in already uses; see 012_password_resets_technician_owner.sql
-- for precedent) with sales_id/back_office_id, and widens the exactly-one-
-- owner constraint to cover them. Additive only: every existing row already
-- has exactly one of the prior five owner columns set, so the new constraint
-- validates against current data unchanged.

BEGIN;

ALTER TABLE password_resets
  ADD COLUMN IF NOT EXISTS sales_id uuid REFERENCES sales(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS back_office_id uuid REFERENCES back_office(id) ON DELETE CASCADE;

ALTER TABLE password_resets
  DROP CONSTRAINT IF EXISTS password_resets_owner_check;

ALTER TABLE password_resets
  ADD CONSTRAINT password_resets_owner_check
  CHECK (num_nonnulls(customer_id, admin_id, technician_id, team_member_id, sales_id, back_office_id) = 1);

CREATE INDEX IF NOT EXISTS idx_password_resets_sales_id
  ON password_resets(sales_id)
  WHERE sales_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_password_resets_back_office_id
  ON password_resets(back_office_id)
  WHERE back_office_id IS NOT NULL;

COMMIT;
