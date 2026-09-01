-- Store the support line a ticket belongs to: AV Support vs EPABX Support.
--
-- Both portals let the requester pick one (the two cards on the customer home
-- screen, the "Service Type" dropdown in the admin modal) but neither ever
-- persisted it — the wizard took it as a prop and dropped it, and the admin
-- modal's value was never mapped into the payload.
--
-- service_type could not be reused: it already holds the support MODE
-- ('onsite_service' / 'remote_support'), which is a different axis.

BEGIN;

ALTER TABLE service_requests
  ADD COLUMN IF NOT EXISTS support_category text NOT NULL DEFAULT 'av';

ALTER TABLE service_requests
  DROP CONSTRAINT IF EXISTS service_requests_support_category_check;

ALTER TABLE service_requests
  ADD CONSTRAINT service_requests_support_category_check
  CHECK (support_category IN ('av', 'epabx'));

-- Existing rows predate the column. They are all AV tickets (EPABX has never
-- been recorded), so the 'av' default is already correct for them.

COMMIT;
