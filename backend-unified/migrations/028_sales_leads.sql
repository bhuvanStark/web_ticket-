-- TaskPro Sales Module V1 (TaskPro_Sales_RBAC_plan.md §3-9) — leads +
-- append-only history. Purely additive: does not touch admins, customers,
-- technicians, or the sales/back_office identity tables (only adds an FK
-- *from* leads *to* sales — sales itself is unchanged).
--
-- Schema notes:
--   * `phone` is mandatory (plan §3) specifically so every lead can
--     participate in the phone-only duplicate check (§4) — duplicate
--     detection is application-level (services/leadService.js), not a DB
--     UNIQUE constraint, so more identifiers can be added later without a
--     schema change (§4 "keep duplicate-validation logic modular").
--   * `status` covers the pipeline (§6): New/Meeting/Proposal/Follow-up/
--     Won/Lost/Dead. `assigned_to` (nullable = common pool) is deliberately
--     a separate axis from `status`, per §6 "Keep status and ownership
--     separate".
--   * `meeting_reached_at` is set once, the first time a lead's status
--     becomes 'meeting', and never cleared even if the status later moves
--     elsewhere (flexible stage movement, §7) — this is what lets the
--     5-day-rule sweep (leadService.releaseOverdueLeads) know the
--     acceptance timer has permanently stopped for this lead (§6 "Once it
--     reaches Meeting, the acceptance timer stops"), without re-deriving it
--     from history on every check.
--   * `archived_at` backs the §9 "hard delete only when there is no
--     dependent history; otherwise archive" rule — a lead with only its
--     'created' history row can be hard-deleted; anything with real
--     activity (assignment, acceptance, status change, ...) is archived
--     instead, and archived leads are excluded from normal listings.

BEGIN;

CREATE TABLE leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company text NOT NULL,
  person_to_contact text,
  email text,
  phone text NOT NULL,
  value_estimate numeric(14,2),
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'meeting', 'proposal', 'follow_up', 'won', 'lost', 'dead')),
  assigned_to uuid REFERENCES sales(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  meeting_reached_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX leads_phone_idx ON leads (phone);
CREATE INDEX leads_assigned_to_idx ON leads (assigned_to);
CREATE INDEX leads_status_idx ON leads (status);

CREATE TRIGGER leads_set_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Append-only audit trail (§9: assignment, acceptance, release, salesperson
-- changes, status changes, follow-ups, timestamps, actor — all preserved).
-- actor_id is intentionally not a foreign key: an admin or sales account
-- referenced by an old history row may later be deleted, and the row must
-- still read sensibly — actor_name is a point-in-time snapshot for exactly
-- that reason.
CREATE TABLE lead_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('admin', 'sales', 'system')),
  actor_id uuid,
  actor_name text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX lead_history_lead_id_idx ON lead_history (lead_id);

COMMIT;
