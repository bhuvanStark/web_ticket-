-- service_requests.actual_completion_date has been referenced by application
-- code (serviceRequestService.completeServiceRequest, the admin ticket
-- transform's completedAt, the Service History date column) since before it
-- existed as a column. Add it so those reads/writes are safe and the History
-- page can filter/sort by when a job actually finished.
--
-- Written by updateServiceRequestStatus when a ticket reaches a terminal
-- outcome: completed or reassigned (also the legacy resolved / closed).
-- Nullable, no backfill — older terminal rows simply fall back to created_at
-- in the UI until they are next touched.

ALTER TABLE service_requests
  ADD COLUMN IF NOT EXISTS actual_completion_date timestamptz;
