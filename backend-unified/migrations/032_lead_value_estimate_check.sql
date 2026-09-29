-- Sales/Leads audit fix — value_estimate integrity. The Excel importer used
-- to store Number(<text cell>) unchecked, so a cell like "approx 5L" became
-- numeric 'NaN' (valid in PostgreSQL), which turns every SUM it touches into
-- NaN and zeroed the Leads/Analytics ₹ totals; negative values were accepted
-- too. services/leadService.js (parseValueEstimate) now rejects these on
-- create, update, and import; this constraint is the database backstop.
--
-- Existing invalid values (NaN, negative, or above the ₹1,000 crore
-- maximum — keep in step with MAX_VALUE_ESTIMATE in leadService.js) are
-- cleared to NULL ("no estimate") first, each with a lead_history row
-- recording the previous value, so nothing is silently lost. Note NaN sorts
-- above every number in PostgreSQL, so `> 10000000000` also catches it; it
-- is listed explicitly for readability.
--
-- Purely additive to the leads table: no other table's schema is touched.
-- Runs inside scripts/migrate.js's own transaction.

WITH invalid AS (
  SELECT id, value_estimate::text AS previous
  FROM leads
  WHERE value_estimate IS NOT NULL
    AND (value_estimate = 'NaN' OR value_estimate < 0 OR value_estimate > 10000000000)
), cleared AS (
  UPDATE leads l
  SET value_estimate = NULL
  FROM invalid
  WHERE l.id = invalid.id
  RETURNING l.id
)
INSERT INTO lead_history (lead_id, event_type, actor_type, actor_name, details)
SELECT invalid.id, 'edited', 'system', 'Migration 032',
       jsonb_build_object(
         'fields', jsonb_build_array('value_estimate'),
         'reason', 'Invalid value estimate cleared',
         'previous', invalid.previous
       )
FROM invalid
JOIN cleared ON cleared.id = invalid.id;

ALTER TABLE leads
  ADD CONSTRAINT leads_value_estimate_valid
  CHECK (value_estimate IS NULL OR (value_estimate >= 0 AND value_estimate <= 10000000000));
