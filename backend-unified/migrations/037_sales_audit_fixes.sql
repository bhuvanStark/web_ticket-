-- Sales audit fixes. Purely additive to the Sales module (leads only); no
-- ticket, project, attendance or identity table is touched. Runs inside
-- scripts/migrate.js's transaction.
--
--   * lost_reason / lost_note — why a lead was closed Lost or Dead. Required
--     for new Lost/Dead moves (services/leadService.js LOST_REASONS);
--     existing closed leads keep NULL. Cleared when a lead is reopened.
--     'duplicate' is also what the system writes when another lead for the
--     same customer is Won (auto-close).
--   * won_requested_at / won_requested_by — a Sales "Won" on a lead that has
--     duplicates waits here for Admin approval. While set, the lead is
--     locked for Sales and its stage timer is paused; on reject the paused
--     time is given back.
--   * lead_company_key() — the one definition of "same company": lower-case,
--     punctuation removed, common suffixes (Pvt, Private, Ltd, Limited, LLP,
--     Inc, Co, P) dropped. Mirrored by companyKey() in leadService.js — keep
--     the two in step. Falls back to the punctuation-stripped name when the
--     name is nothing but suffixes (e.g. "Ltd").

ALTER TABLE leads ADD COLUMN lost_reason text;
ALTER TABLE leads ADD COLUMN lost_note text;
ALTER TABLE leads ADD COLUMN won_requested_at timestamptz;
ALTER TABLE leads ADD COLUMN won_requested_by uuid;

ALTER TABLE leads
  ADD CONSTRAINT leads_lost_reason_check
  CHECK (lost_reason IS NULL OR lost_reason IN ('price', 'competitor', 'no_budget', 'no_response', 'not_interested', 'duplicate', 'other'));

CREATE INDEX leads_won_requested_idx ON leads (won_requested_at) WHERE won_requested_at IS NOT NULL;

CREATE OR REPLACE FUNCTION lead_company_key(company text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE WHEN k = '' THEN b ELSE k END
  FROM (
    SELECT b, btrim(regexp_replace(
             regexp_replace(' ' || b || ' ', ' (pvt|private|ltd|limited|llp|inc|co|p)(?= )', ' ', 'g'),
             ' +', ' ', 'g')) AS k
    FROM (SELECT btrim(regexp_replace(lower(coalesce(company, '')), '[^a-z0-9\u0080-￿]+', ' ', 'g')) AS b) s1
  ) s2
$$;

DROP INDEX IF EXISTS leads_duplicate_key_idx;
CREATE INDEX leads_duplicate_key_idx ON leads (phone, lead_company_key(company)) WHERE archived_at IS NULL;
