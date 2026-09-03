-- password_resets was built with a per-identity owner column for each portal:
-- customer_id / admin_id (001), team_member_id (004). technician_id was
-- referenced by the reset routes (OTP sign-in + emailed link) but its column
-- was never created, so every /api/password-reset/technician/* request 500s
-- with: column "technician_id" of relation "password_resets" does not exist.
--
-- The owner CHECK from 001 was also never widened for team_member_id, so
-- invited-team-member OTP sign-in fails the same table's constraint. Both are
-- fixed here by adding technician_id and replacing the check with an
-- exactly-one-owner rule that covers all four identity types.
--
-- Additive only. Every existing row already has exactly one of customer_id /
-- admin_id set, so the new constraint validates against current data.

BEGIN;

ALTER TABLE password_resets
  ADD COLUMN IF NOT EXISTS technician_id uuid REFERENCES technicians(id) ON DELETE CASCADE;

ALTER TABLE password_resets
  DROP CONSTRAINT IF EXISTS password_resets_owner_check;

ALTER TABLE password_resets
  ADD CONSTRAINT password_resets_owner_check
  CHECK (num_nonnulls(customer_id, admin_id, technician_id, team_member_id) = 1);

CREATE INDEX IF NOT EXISTS idx_password_resets_technician_id
  ON password_resets(technician_id)
  WHERE technician_id IS NOT NULL;

COMMIT;
