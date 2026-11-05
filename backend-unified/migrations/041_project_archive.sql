-- Projects: delete-with-history goes through a 3-day archive.
-- Deleting a project that has daily-activity history no longer fails
-- outright: after an explicit confirmation the project is archived
-- (archived_at set), hidden from every list, and restorable. Once an
-- archive is older than the retention window, projectService purges the
-- project together with its activities.
--
-- Purely additive: one nullable column plus a partial index. Existing rows
-- stay NULL (= not archived), so nothing about current projects changes.
-- Runs inside scripts/migrate.js's transaction.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_projects_archived_at
  ON projects(archived_at)
  WHERE archived_at IS NOT NULL;
