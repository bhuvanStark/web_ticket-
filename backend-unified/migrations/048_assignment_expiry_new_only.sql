-- The 36-hour expiry (047) must only apply to work assigned from now on —
-- never cancel assignments that already existed when it shipped.
--
-- ADD COLUMN with DEFAULT false gives every existing row false without
-- rewriting or updating any row (so no trigger fires and nothing about the
-- existing data changes); the default then flips to true for new rows only.
-- Runs inside scripts/migrate.js's transaction.

ALTER TABLE project_activities ADD COLUMN IF NOT EXISTS auto_expire boolean NOT NULL DEFAULT false;
ALTER TABLE project_activities ALTER COLUMN auto_expire SET DEFAULT true;

DROP INDEX IF EXISTS idx_project_activities_assigned_created;
CREATE INDEX IF NOT EXISTS idx_project_activities_assigned_expiring
  ON project_activities(created_at)
  WHERE status = 'Assigned' AND auto_expire;
