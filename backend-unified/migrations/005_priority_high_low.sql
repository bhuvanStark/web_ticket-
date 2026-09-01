-- Restrict service_requests.priority to just 'high' and 'low'.
--
-- The column was free text with no constraint, so anything could be written to
-- it. The UIs offered Critical / High / Medium / Low; those collapse onto the
-- two-level scale as: critical -> high, medium -> low.

BEGIN;

-- Normalise whatever is already stored, case-insensitively, before the
-- constraint goes on. Existing rows are all 'high', but this keeps the
-- migration correct against any database that drifted.
UPDATE service_requests
SET priority = CASE
  WHEN lower(coalesce(priority, '')) IN ('critical', 'high', 'urgent', 'p1') THEN 'high'
  WHEN lower(coalesce(priority, '')) IN ('medium', 'low', 'normal', 'p2', 'p3') THEN 'low'
  WHEN lower(coalesce(priority, '')) = '' THEN 'high'
  ELSE 'high'
END;

ALTER TABLE service_requests
  ALTER COLUMN priority SET DEFAULT 'high';

ALTER TABLE service_requests
  DROP CONSTRAINT IF EXISTS service_requests_priority_check;

ALTER TABLE service_requests
  ADD CONSTRAINT service_requests_priority_check
  CHECK (priority IN ('high', 'low'));

COMMIT;
