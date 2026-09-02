-- Admin "Raise Ticket" collects Customer Organisation and Facility Location as
-- plain text typed on the ticket — they are NOT customer/location profiles and
-- are never looked up, matched, or created. Room for an admin AV ticket is one
-- of four fixed labels, decoupled from the rooms table.
--
-- * service_requests.customer_org      — free-typed organisation on the ticket
-- * service_requests.facility_location — free-typed location on the ticket
-- * service_requests.room_name         — AV room label ('Huddle Room' / 'Board
--   Room' / 'Training Room' / 'Town Hall'); NULL for EPABX
--
-- customer_id / location_id keep their columns, foreign keys and existing data,
-- but become nullable so an admin free-text ticket can omit them. Existing
-- tickets are untouched (all carry customer_id / location_id / room_id and
-- render via the existing relations).

BEGIN;

ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS customer_org      text;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS facility_location text;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS room_name         text;

ALTER TABLE service_requests ALTER COLUMN customer_id DROP NOT NULL;
ALTER TABLE service_requests ALTER COLUMN location_id DROP NOT NULL;

-- room_id has been nullable since 007. Relax its category check so an AV ticket
-- is satisfied by either a rooms FK (customer portal) or a room_name label
-- (admin form). EPABX still requires neither.
ALTER TABLE service_requests
  DROP CONSTRAINT IF EXISTS service_requests_room_by_category_check;

ALTER TABLE service_requests
  ADD CONSTRAINT service_requests_room_by_category_check
  CHECK (
    (support_category = 'av' AND (room_id IS NOT NULL OR room_name IS NOT NULL))
    OR support_category = 'epabx'
  );

COMMIT;
