-- The customer app's AV ticket wizard requires a real `rooms` row (room_id)
-- for whichever location the customer selects — "No rooms configured" is a
-- dead end with no way to proceed. Migration 010 seeded the four canonical
-- rooms (Huddle Room, Board Room, Training Room, Town Hall) for every
-- location that existed at the time, but POST /locations never adopted that
-- step, so any location created since (new customer signups, admin-added
-- sites) was left with zero rooms and a permanently stuck AV wizard.
--
-- This backfills the same four canonical rooms for any location missing
-- them. It is idempotent (ON CONFLICT DO NOTHING on the existing
-- (location_id, name) unique constraint) and safe to re-run.

BEGIN;

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

COMMIT;
