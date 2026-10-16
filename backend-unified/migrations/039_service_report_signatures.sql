-- Drawn signatures for the field service report (technician + customer),
-- stored as vector strokes: an SVG path string of only "M x y" / "L x y"
-- commands with integer coordinates in the canvas space (width x height).
-- Only path data is stored — the <svg> markup is built at render time, so
-- nothing stored here can inject markup.
--
-- Separate table on purpose: list endpoints embed service_reports (*), and
-- signatures must never ride along with those. The tech_signed /
-- customer_signed booleans on service_reports stay the source of truth for
-- "was it signed". Rows are kept indefinitely for now; a 5-year purge
-- (npm run signatures:purge) exists but is not scheduled, and would delete
-- only these drawings, never those booleans and names.
--
-- One row per (report, party). A resubmitted report keeps the first
-- signatures (INSERT ... ON CONFLICT DO NOTHING in signatureService.js).
-- Purely additive; no existing table is touched. Runs inside
-- scripts/migrate.js's transaction.

CREATE TABLE service_report_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_report_id uuid NOT NULL REFERENCES service_reports(id) ON DELETE CASCADE,
  party text NOT NULL CHECK (party IN ('technician', 'customer')),
  path_data text NOT NULL CHECK (path_data ~ '^M[ML0-9 ]*$' AND length(path_data) <= 40000),
  width smallint NOT NULL CHECK (width > 0),
  height smallint NOT NULL CHECK (height > 0),
  signer_name text,
  signed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service_report_id, party)
);

CREATE INDEX service_report_signatures_signed_at_idx ON service_report_signatures (signed_at);
