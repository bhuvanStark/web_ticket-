-- Admin "Add Customer" now collects a Facility Location (India state, same
-- dropdown/options as Admin -> Raise Ticket) and an optional Area, and
-- creates the customer's one fixed service location — plus that location's
-- four canonical AV rooms — as a single transactional unit (see
-- services/customerService.js#createCustomerWithLocation). A customer
-- account represents exactly one service location going forward.
--
-- This migration:
--
--   1. Refuses to run at all if any customer already has more than one
--      `locations` row. That is a real data conflict (which location is the
--      "real" one? what happens to rooms/tickets tied to the others, given
--      rooms.location_id is ON DELETE RESTRICT?) and must be resolved by a
--      human, never by a migration silently merging or deleting rows. Run
--      scripts/audit-multi-location-customers.sql against the target
--      database BEFORE applying this migration; this DO block re-checks the
--      same condition at apply time as a hard safety net.
--   2. Adds locations.state / locations.area — nullable, additive. Existing
--      locations are NOT backfilled with a state (there is no reliable way
--      to derive an Indian state from the free-text `city`/`name` already on
--      the row); they simply keep state = NULL until an admin edits them.
--   3. Enforces one location per customer with UNIQUE(customer_id). A NULL
--      customer_id (locations not tied to a real customer account, if any)
--      is unaffected — Postgres permits any number of NULLs under UNIQUE.

DO $$
DECLARE
  violator_count integer;
BEGIN
  SELECT count(*) INTO violator_count
  FROM (
    SELECT customer_id
    FROM locations
    WHERE customer_id IS NOT NULL
    GROUP BY customer_id
    HAVING count(*) > 1
  ) AS multi_location_customers;

  IF violator_count > 0 THEN
    RAISE EXCEPTION
      'Migration 024 aborted: % customer(s) already have more than one locations row. Resolve manually (see scripts/audit-multi-location-customers.sql) before re-running this migration.',
      violator_count;
  END IF;
END $$;

BEGIN;

ALTER TABLE locations ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS area text;
ALTER TABLE locations ADD CONSTRAINT locations_customer_id_unique UNIQUE (customer_id);

COMMIT;
