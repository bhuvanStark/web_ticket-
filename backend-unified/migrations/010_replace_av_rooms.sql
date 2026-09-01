-- The AV room set is standardised to exactly four rooms per location:
--   Huddle Room, Board Room, Training Room, Town Hall.
--
-- Existing rooms are re-pointed where a ticket references them, then the old
-- rows are removed and the four canonical rooms are created per location.
--
-- Ticket → new room mapping (from live data at migration time):
--   Boardroom            -> Board Room
--   Meeting Room 01      -> Board Room
--   Meeting Room 02      -> Huddle Room
--   Training Room        -> Training Room
--   Town Hall            -> Town Hall
--   Experience Center    -> Board Room   (no tickets, just for safety)
--   Collaboration Zone   -> Huddle Room  (no tickets)

BEGIN;

-- 1. Make sure the four canonical rooms exist for every location.
INSERT INTO rooms (location_id, name, room_type)
SELECT l.id, r.name, r.name
FROM locations l
CROSS JOIN (VALUES
  ('Huddle Room'),
  ('Board Room'),
  ('Training Room'),
  ('Town Hall')
) AS r(name)
ON CONFLICT (location_id, name) DO NOTHING;

-- 2. Re-point any ticket whose room is about to be removed to the canonical
--    room in the SAME location.
UPDATE service_requests sr
SET room_id = (
  SELECT nr.id
  FROM rooms nr
  WHERE nr.location_id = sr.location_id
    AND nr.name = CASE
      WHEN old.name IN ('Boardroom', 'Meeting Room 01', 'Experience Center') THEN 'Board Room'
      WHEN old.name IN ('Meeting Room 02', 'Collaboration Zone')             THEN 'Huddle Room'
      WHEN old.name = 'Training Room'                                        THEN 'Training Room'
      WHEN old.name = 'Town Hall'                                            THEN 'Town Hall'
      ELSE 'Board Room'
    END
  LIMIT 1
)
FROM rooms old
WHERE sr.room_id = old.id
  AND old.name NOT IN ('Huddle Room', 'Board Room', 'Training Room', 'Town Hall');

-- 3. Delete every room that is not one of the four canonical names and is no
--    longer referenced.
DELETE FROM rooms
WHERE name NOT IN ('Huddle Room', 'Board Room', 'Training Room', 'Town Hall')
  AND id NOT IN (SELECT room_id FROM service_requests WHERE room_id IS NOT NULL)
  AND id NOT IN (SELECT room_id FROM equipment WHERE room_id IS NOT NULL);

-- 4. Normalise room_type to match the name for the canonical rooms.
UPDATE rooms
SET room_type = name
WHERE name IN ('Huddle Room', 'Board Room', 'Training Room', 'Town Hall');

COMMIT;
