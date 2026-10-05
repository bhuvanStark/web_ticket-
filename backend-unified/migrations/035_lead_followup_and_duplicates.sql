-- Sales — next follow-up date + duplicate lookup. Purely additive to the
-- leads table; no other table is touched. Runs inside scripts/migrate.js's
-- transaction.
--
--   * next_follow_up_date — the salesperson's next planned contact (India
--     calendar date). Drives "Due today" in My Leads. Cleared when the lead
--     is closed or released.
--   * Duplicates are Company + Phone (services/leadService.js companyKey /
--     DUP_KEY_SQL): company compared trimmed, single-spaced and
--     lower-cased; phone is already stored normalized. Duplicates are
--     allowed (with a warning) — this index only keeps the lookup fast.

ALTER TABLE leads ADD COLUMN next_follow_up_date date;

CREATE INDEX leads_duplicate_key_idx
  ON leads (phone, lower(regexp_replace(btrim(company), '\s+', ' ', 'g')))
  WHERE archived_at IS NULL;

CREATE INDEX leads_next_follow_up_idx ON leads (assigned_to, next_follow_up_date)
  WHERE next_follow_up_date IS NOT NULL;
