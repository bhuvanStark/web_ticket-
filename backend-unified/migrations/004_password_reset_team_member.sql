-- Let an invited team member own a password_resets row.
--
-- The customer portal signs in by emailed OTP only. An OTP request/verify may
-- resolve to either a primary customer or an invited team member, so the reset
-- row needs to point at whichever it is — mirroring customer_id / admin_id /
-- technician_id already on this table.

ALTER TABLE password_resets
  ADD COLUMN IF NOT EXISTS team_member_id uuid REFERENCES team_members(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_password_resets_team_member_id
  ON password_resets(team_member_id)
  WHERE team_member_id IS NOT NULL;
