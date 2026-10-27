-- Staff removal (PLAN_Staff_Removal.md). "Remove" keeps a fired employee's
-- row so their name stays on past work, but locks them out for good:
-- is_active = false plus a token_version bump, which the auth middleware
-- checks on every request (middleware/auth.js checkStaffSession).
--
-- * technicians / back_office get token_version (admins and sales already
--   have it, migration 029).
-- * removed_at / removed_by record the removal. removed_by is the admin's
--   id with no FK, so removing that admin later can never break it.
-- * leads.archive_reason marks leads archived because their owner was
--   removed ('owner_removed'); those still count in the company Won/Lost
--   totals. NULL for every other archive.
--
-- Purely additive: no existing column, constraint or row is changed. Runs
-- inside scripts/migrate.js's transaction.

ALTER TABLE technicians ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 0;
ALTER TABLE back_office ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 0;

ALTER TABLE technicians ADD COLUMN IF NOT EXISTS removed_at timestamptz;
ALTER TABLE technicians ADD COLUMN IF NOT EXISTS removed_by uuid;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS removed_at timestamptz;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS removed_by uuid;
ALTER TABLE back_office ADD COLUMN IF NOT EXISTS removed_at timestamptz;
ALTER TABLE back_office ADD COLUMN IF NOT EXISTS removed_by uuid;

ALTER TABLE leads ADD COLUMN IF NOT EXISTS archive_reason text;
