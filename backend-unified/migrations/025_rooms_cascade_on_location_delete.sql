-- Customer deletion fix: rooms.location_id was ON DELETE RESTRICT (see
-- 001_initial_schema.sql), which silently blocked customer deletion. Every
-- customer is provisioned with one location and four canonical AV rooms at
-- creation time (services/customerService.js#createCustomerWithLocation), so
-- DELETE customers -> CASCADE into locations -> RESTRICT on rooms aborted
-- the whole statement with a raw, unhandled 23503 the moment a customer had
-- zero service requests (the one case the app's existing pre-delete check
-- didn't already block on purpose).
--
-- Rooms (and their equipment, already ON DELETE CASCADE) are setup/config
-- data wholly owned by their location — not audit/business history — so
-- they are safe to cascade-delete along with the location. This does NOT
-- touch service_requests.customer_id / location_id / room_id, which stay
-- ON DELETE RESTRICT exactly as before: ticket/service history remains
-- fully protected, and deleting a customer or location that still has
-- service requests continues to be blocked.

BEGIN;

ALTER TABLE rooms DROP CONSTRAINT rooms_location_id_fkey;

ALTER TABLE rooms
  ADD CONSTRAINT rooms_location_id_fkey
  FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE;

COMMIT;
