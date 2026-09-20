-- Project Category V1: long-running/multi-day projects, separate from
-- Service Tickets. Core rule (see PLAN_Project_Category_V1.md §3): one
-- Project + one working date + one technician = one independent Daily
-- Project Activity row. Never a shared activity for multiple technicians.
--
-- This migration is purely additive — it does not alter any existing table,
-- column, constraint, or trigger belonging to the Service Ticket system.

BEGIN;

-- Project IDs must NOT be MAX(id)+1 (race-prone under concurrent inserts).
-- A real sequence is atomic by construction, per the spec's explicit
-- requirement (§12).
CREATE SEQUENCE IF NOT EXISTS project_id_seq START WITH 1;

CREATE TABLE projects (
  -- Human-readable, sequence-backed, e.g. PRJ-001. Text, not uuid.
  id text PRIMARY KEY DEFAULT ('PRJ-' || LPAD(nextval('project_id_seq')::text, 3, '0')),
  name text NOT NULL,
  -- Free text, matching the existing admin-raised-ticket precedent
  -- (service_requests.customer_org / facility_location, migration 011)
  -- rather than an FK into customers/locations.
  customer text NOT NULL,
  location text NOT NULL,
  start_date date,
  end_date date,
  description text,
  responsible_admin_id uuid REFERENCES admins(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'Planning',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT projects_status_check CHECK (status IN ('Planning', 'Active', 'Completed'))
);

CREATE TABLE project_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  -- Never SET NULL: a completed activity must always keep pointing at who
  -- actually did the work, even if the technician is later deactivated.
  technician_id uuid NOT NULL REFERENCES technicians(id) ON DELETE RESTRICT,
  scheduled_date date NOT NULL,
  scheduled_time time NOT NULL,
  status text NOT NULL DEFAULT 'Assigned',
  completion_notes text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_activities_status_check
    CHECK (status IN ('Assigned', 'Accepted', 'Completed', 'Cancelled'))
);

CREATE TRIGGER projects_set_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_project_activities_project ON project_activities(project_id);
CREATE INDEX idx_project_activities_tech_date ON project_activities(technician_id, scheduled_date);
CREATE INDEX idx_projects_status ON projects(status);

-- Partial unique index (excludes Cancelled rows): prevents two ACTIVE daily
-- activities for the same project+technician+date (the spec's uniqueness
-- rule, §12), while still allowing a technician to be re-assigned to the
-- same project/date after an earlier assignment there was cancelled — a
-- plain table-wide UNIQUE would permanently block that.
CREATE UNIQUE INDEX idx_project_activities_unique_active
  ON project_activities(project_id, technician_id, scheduled_date)
  WHERE status <> 'Cancelled';

COMMIT;
