-- Sales/Leads — free-text Remarks on a lead (Lead Details popup). The latest
-- saved value lives on the lead itself so reopening the lead shows it;
-- every save also appends a 'remarks_updated' lead_history row
-- (services/leadService.js updateRemarks), so earlier values are never lost.
--
-- Purely additive to the leads table (nullable, no default, no backfill):
-- no other table's schema is touched. Runs inside scripts/migrate.js's own
-- transaction.

ALTER TABLE leads ADD COLUMN remarks text;
