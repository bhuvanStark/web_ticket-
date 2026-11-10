-- Unaccepted daily assignments expire after 36 hours (cancelled, never
-- deleted — see projectWorkspaceService.expireUnacceptedAssignments).
-- An automatic expiry is not someone working on the project, so it must not
-- move "Last updated" (it would hide projects that have gone quiet): the
-- sweep sets tasktel.skip_project_touch for its own transaction and the
-- touch trigger skips that.
-- Runs inside scripts/migrate.js's transaction.

CREATE OR REPLACE FUNCTION touch_project_last_activity() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('tasktel.skip_project_touch', true) = 'on' THEN
    RETURN NEW;
  END IF;
  UPDATE projects SET last_activity_at = now() WHERE id = NEW.project_id;
  RETURN NEW;
END;
$$;

-- The sweep looks for old 'Assigned' rows.
CREATE INDEX IF NOT EXISTS idx_project_activities_assigned_created
  ON project_activities(created_at)
  WHERE status = 'Assigned';
