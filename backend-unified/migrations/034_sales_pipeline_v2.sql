-- Sales pipeline V2 — stage timers, Hold, Proposal Ref ID, Demand, and the
-- Sales Daily Report. Purely additive to the Sales module: only the leads
-- table changes, plus two new tables; no ticket, project, attendance or
-- identity table is touched. Runs inside scripts/migrate.js's transaction.
--
--   * 'hold' joins the pipeline: New → Meeting → Proposal → Follow-up/Hold →
--     Won/Lost. 'dead' stays (Admin-only, final like Won/Lost).
--   * status_changed_at — when the lead entered its current status. Each
--     active stage has a fixed window counted from here (STAGE_DAYS in
--     services/leadService.js); a New lead's clock also restarts when it is
--     assigned to a different salesperson. Overdue leads are never moved or
--     unassigned automatically (the old 5-day auto-release is gone) — the
--     UI just shows them as overdue.
--   * ref_id — free-text proposal reference, required (with value_estimate)
--     from Proposal onwards. demand — free text, lead module only.

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE leads
  ADD CONSTRAINT leads_status_check
  CHECK (status IN ('new', 'meeting', 'proposal', 'follow_up', 'hold', 'won', 'lost', 'dead'));

ALTER TABLE leads ADD COLUMN status_changed_at timestamptz;
ALTER TABLE leads ADD COLUMN ref_id text;
ALTER TABLE leads ADD COLUMN demand text;

-- Backfill: the latest move into the current status, else (a New lead) its
-- assignment time, else creation.
UPDATE leads l
SET status_changed_at = COALESCE(
  (SELECT MAX(h.created_at) FROM lead_history h
   WHERE h.lead_id = l.id AND h.event_type = 'status_changed' AND h.details->>'to' = l.status),
  CASE WHEN l.status = 'new' THEN l.accepted_at END,
  l.created_at
);

ALTER TABLE leads ALTER COLUMN status_changed_at SET NOT NULL;
ALTER TABLE leads ALTER COLUMN status_changed_at SET DEFAULT now();

-- One report per salesperson per India-time day (report_date is always set
-- server-side from indiaDateKey(), never taken from the client).
CREATE TABLE sales_daily_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  report_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sales_id, report_date)
);

CREATE INDEX sales_daily_reports_date_idx ON sales_daily_reports (report_date DESC);

CREATE TRIGGER sales_daily_reports_set_updated_at
  BEFORE UPDATE ON sales_daily_reports
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- A report line is either an existing lead (lead_id set) or a potential lead
-- (is_potential, typed company name). company is snapshotted for existing
-- leads too, so the line still reads correctly if the lead is later deleted
-- (lead_id then becomes NULL).
CREATE TABLE sales_daily_report_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES sales_daily_reports(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  is_potential boolean NOT NULL DEFAULT false,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  company text NOT NULL,
  comment text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT is_potential OR lead_id IS NULL)
);

CREATE INDEX sales_daily_report_items_report_idx ON sales_daily_report_items (report_id);
CREATE INDEX sales_daily_report_items_lead_idx ON sales_daily_report_items (lead_id);
