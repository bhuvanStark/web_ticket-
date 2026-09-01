-- EPABX tickets have no room: the customer app hides the room picker for the
-- EPABX support line and the admin modal does the same. AV tickets still
-- require a room.
--
-- room_id was NOT NULL since 001. Relax it, and add a category-aware check so
-- an AV ticket can never be saved without a room and an EPABX ticket is not
-- expected to carry one.

BEGIN;

ALTER TABLE service_requests
  ALTER COLUMN room_id DROP NOT NULL;

-- The FK to rooms and its ON DELETE RESTRICT are unchanged; NULL is simply
-- permitted now.

ALTER TABLE service_requests
  DROP CONSTRAINT IF EXISTS service_requests_room_by_category_check;

ALTER TABLE service_requests
  ADD CONSTRAINT service_requests_room_by_category_check
  CHECK (
    (support_category = 'av' AND room_id IS NOT NULL)
    OR support_category = 'epabx'
  );

COMMIT;
