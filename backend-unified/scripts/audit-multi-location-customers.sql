-- Read-only. Run against production BEFORE applying migration 024
-- (024_customer_single_location_facility_area.sql), which will refuse to
-- run on its own if this condition is true — this script exists so the
-- audit can be reviewed by a human ahead of time, not just discovered at
-- migration time.
--
-- Migration 024 adds UNIQUE(customer_id) to `locations`, encoding the
-- product rule "one customer = one service location". Any customer listed
-- below already has more than one `locations` row and needs a manual
-- decision before that constraint can be applied: which location is the
-- real one, and what happens to the rooms/tickets tied to the others (rooms
-- are ON DELETE RESTRICT on location_id, so an extra location's rooms can't
-- simply be dropped if any ticket ever referenced them). Nothing here
-- merges or deletes anything automatically.
--
-- Usage: psql "$DATABASE_URL" -f scripts/audit-multi-location-customers.sql

SELECT
  c.id                         AS customer_id,
  c.company_name,
  c.email,
  count(l.id)                  AS location_count,
  array_agg(l.id ORDER BY l.created_at)   AS location_ids,
  array_agg(l.name ORDER BY l.created_at) AS location_names,
  array_agg(
    (SELECT count(*) FROM service_requests sr WHERE sr.location_id = l.id)
    ORDER BY l.created_at
  )                             AS tickets_per_location
FROM customers c
JOIN locations l ON l.customer_id = c.id
GROUP BY c.id, c.company_name, c.email
HAVING count(l.id) > 1
ORDER BY count(l.id) DESC;
