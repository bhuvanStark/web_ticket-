-- Projects workspace (projects-plan.md):
--   * project_members — per-project Managers (assign daily work, incl. to
--     themselves) and a view-only technician team. Replaces the single
--     "Responsible admin" in the UI; responsible_admin_id is left in place
--     untouched so no existing data is lost.
--   * project_files — named project documents stored in Postgres, already
--     compressed by the app (images in the browser, the rest gzipped on the
--     server). STORAGE EXTERNAL stops Postgres from compressing them again.
--   * project_events — the trail (assignments, files, approvals) that feeds
--     the workflow timeline next to the daily activities.
--   * Completion approval: Manager/Admin submits with a completion document
--     -> 'Pending Approval' -> a Super Admin approves (Completed) or rejects
--     with a reason (back to Active).
--   * projects.last_activity_at — "Last updated", bumped by triggers so every
--     write path (including the technician's own accept/complete) counts.
-- Runs inside scripts/migrate.js's transaction.

ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE projects ADD CONSTRAINT projects_status_check
  CHECK (status IN ('Planning', 'Active', 'Pending Approval', 'Completed'));

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz,
  ADD COLUMN IF NOT EXISTS completion_file_id uuid,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS submitted_by_name text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by_name text,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

UPDATE projects p
   SET last_activity_at = GREATEST(
         p.updated_at,
         COALESCE((SELECT max(COALESCE(a.completed_at, a.created_at))
                     FROM project_activities a WHERE a.project_id = p.id), p.updated_at))
 WHERE p.last_activity_at IS NULL;
ALTER TABLE projects ALTER COLUMN last_activity_at SET DEFAULT now();
ALTER TABLE projects ALTER COLUMN last_activity_at SET NOT NULL;

CREATE TABLE IF NOT EXISTS project_members (
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  technician_id uuid NOT NULL REFERENCES technicians(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('manager', 'viewer')),
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, technician_id)
);
CREATE INDEX IF NOT EXISTS idx_project_members_technician ON project_members(technician_id);

CREATE TABLE IF NOT EXISTS project_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('design', 'boq', 'image', 'document', 'completion')),
  display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 120),
  file_name text NOT NULL,
  mime_type text NOT NULL,
  original_size integer NOT NULL CHECK (original_size > 0),
  stored_size integer NOT NULL CHECK (stored_size > 0),
  encoding text NOT NULL CHECK (encoding IN ('identity', 'gzip')),
  data bytea NOT NULL,
  thumbnail bytea,
  uploaded_by_role text NOT NULL CHECK (uploaded_by_role IN ('admin', 'technician')),
  uploaded_by_id uuid,
  uploaded_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE project_files ALTER COLUMN data SET STORAGE EXTERNAL;
ALTER TABLE project_files ALTER COLUMN thumbnail SET STORAGE EXTERNAL;
CREATE INDEX IF NOT EXISTS idx_project_files_project ON project_files(project_id, created_at DESC);

ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_completion_file_id_fkey;
ALTER TABLE projects ADD CONSTRAINT projects_completion_file_id_fkey
  FOREIGN KEY (completion_file_id) REFERENCES project_files(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS project_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_role text,
  actor_id uuid,
  actor_name text,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_project_events_project ON project_events(project_id, created_at DESC);

CREATE OR REPLACE FUNCTION touch_project_last_activity() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE projects SET last_activity_at = now() WHERE id = NEW.project_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS project_activities_touch_project ON project_activities;
CREATE TRIGGER project_activities_touch_project
  AFTER INSERT OR UPDATE ON project_activities
  FOR EACH ROW EXECUTE FUNCTION touch_project_last_activity();

DROP TRIGGER IF EXISTS project_events_touch_project ON project_events;
CREATE TRIGGER project_events_touch_project
  AFTER INSERT ON project_events
  FOR EACH ROW EXECUTE FUNCTION touch_project_last_activity();
