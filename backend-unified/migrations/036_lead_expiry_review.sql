-- Sales — Admin review of expired stages. Purely additive to leads.
--
-- When an assigned lead passes its stage deadline it stays with its
-- salesperson (who can keep working it) and also appears in Admin's
-- "Expired" queue. Admin can Ignore it, give it back to the same salesperson
-- (restarts at New with a fresh timer), or give a fresh copy to another
-- salesperson (services/leadService.js resolveExpiredLead).
--
-- expiry_handled_at records the last time Admin dealt with the expiry. The
-- lead is in the queue while it is overdue and expiry_handled_at is older
-- than its current stage (status_changed_at) — so an ignored lead returns
-- only if a later stage expires too.

ALTER TABLE leads ADD COLUMN expiry_handled_at timestamptz;
