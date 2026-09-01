-- Columns the admin forms actually collect but had nowhere to store.
--
-- * service_requests.area  — free-typed sub-locality on a ticket (e.g. "3rd
--   Floor East Wing"), asked in both the customer wizard and the admin modal.
-- * customers.industry / contact_person / contact_role — the onboarding form
--   collects these; the create route silently dropped them.
-- * technicians.location — the "Onboard Technician" form and the create route
--   both reference a location, but the column never existed, so every
--   technician insert 500'd.

BEGIN;

ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS area text;

ALTER TABLE customers ADD COLUMN IF NOT EXISTS industry text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS contact_person text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS contact_role text;

ALTER TABLE technicians ADD COLUMN IF NOT EXISTS location text;

COMMIT;
