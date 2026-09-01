-- Field service report filled in by the technician, then signed by the customer.
--
-- One row per service_request. Deliberately does NOT store the signature images:
-- only whether each party has signed, when, and their typed name. The report
-- body is five plain fields (system + three free-text + a parts line).

BEGIN;

CREATE TABLE service_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id uuid NOT NULL UNIQUE REFERENCES service_requests(id) ON DELETE CASCADE,

  -- Equipment/system the work was done on. The allowed values differ by the
  -- ticket's support_category (AV vs EPABX); the UI enforces the correct list.
  system text,
  nature_of_complaint text,
  work_done text,
  parts_material text,

  tech_signed boolean NOT NULL DEFAULT false,
  tech_signed_at timestamptz,
  tech_signer_name text,

  customer_signed boolean NOT NULL DEFAULT false,
  customer_signed_at timestamptz,
  customer_signer_name text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX service_reports_request_idx ON service_reports (service_request_id);

CREATE TRIGGER service_reports_set_updated_at
  BEFORE UPDATE ON service_reports
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
