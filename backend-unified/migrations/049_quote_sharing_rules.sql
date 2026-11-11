-- Quotation sharing rules. Every Quote Manager works the same leads and
-- quotes, so the data model now enforces who edits, when a version freezes
-- and that nothing is duplicated:
--   * a lead is unique on customer + project (case / spacing ignored), and
--     project is required
--   * one quotation per lead
--   * a version is Draft until it is issued to the client, then frozen; the
--     customer / project / site it went out with are snapshotted on it
--   * one editor at a time per quotation (an expiring edit lease)
--   * deleting a quotation needs Super Admin approval
--   * an activity log of who did what
--
-- Existing data that breaks the new rules stops this migration with a list
-- (run `node scripts/check-quote-rules.js` first to see it without applying).

CREATE OR REPLACE FUNCTION quote_lead_key(value text) RETURNS text
  LANGUAGE sql IMMUTABLE AS $$ SELECT lower(regexp_replace(btrim(coalesce(value, '')), '\s+', ' ', 'g')) $$;

DO $$
DECLARE
  blank text;
  dup_leads text;
  dup_quotes text;
BEGIN
  SELECT string_agg(format('    - "%s" (lead %s)', customer, id), E'\n') INTO blank
    FROM quote_leads WHERE quote_lead_key(project) = '';
  SELECT string_agg(format('    - "%s" / "%s" — %s leads', d.customer, d.project, d.n), E'\n') INTO dup_leads
    FROM (SELECT min(customer) AS customer, min(project) AS project, count(*) AS n
            FROM quote_leads WHERE quote_lead_key(project) <> ''
           GROUP BY quote_lead_key(customer), quote_lead_key(project) HAVING count(*) > 1) d;
  SELECT string_agg(format('    - "%s" / "%s" — %s quotations', l.customer, l.project, x.n), E'\n') INTO dup_quotes
    FROM (SELECT lead_id, count(*) AS n FROM quotes GROUP BY lead_id HAVING count(*) > 1) x
    JOIN quote_leads l ON l.id = x.lead_id;
  IF blank IS NOT NULL OR dup_leads IS NOT NULL OR dup_quotes IS NOT NULL THEN
    RAISE EXCEPTION '%', E'Quote data breaks the new sharing rules — fix these in Quote Leads / Quotations, then migrate again:\n'
      || CASE WHEN blank IS NULL THEN '' ELSE E'  Leads with no project (add one):\n' || blank || E'\n' END
      || CASE WHEN dup_leads IS NULL THEN '' ELSE E'  Duplicate leads (same customer + project — keep one):\n' || dup_leads || E'\n' END
      || CASE WHEN dup_quotes IS NULL THEN '' ELSE E'  Leads with more than one quotation (keep one):\n' || dup_quotes || E'\n' END;
  END IF;
END $$;

-- Leads: project required, customer + project unique.
ALTER TABLE quote_leads ADD CONSTRAINT quote_leads_project_required CHECK (length(btrim(project)) > 0);
ALTER TABLE quote_leads ALTER COLUMN project SET NOT NULL;
CREATE UNIQUE INDEX quote_leads_customer_project_unique ON quote_leads (quote_lead_key(customer), quote_lead_key(project));

-- One quotation per lead (replaces the plain lookup index).
DROP INDEX IF EXISTS idx_quotes_lead;
CREATE UNIQUE INDEX quotes_lead_unique ON quotes (lead_id);

-- Which version was won, and a pending delete request awaiting the Super Admin.
ALTER TABLE quotes
  ADD COLUMN won_version_id uuid REFERENCES quote_versions(id) ON DELETE SET NULL,
  ADD COLUMN delete_requested_by uuid REFERENCES back_office(id) ON DELETE SET NULL,
  ADD COLUMN delete_requested_at timestamptz,
  ADD COLUMN delete_reason text;

-- Issued = sent to the client, frozen for good. Snapshot of the lead as issued.
ALTER TABLE quote_versions
  ADD COLUMN issued_at timestamptz,
  ADD COLUMN issued_by uuid REFERENCES back_office(id) ON DELETE SET NULL,
  ADD COLUMN issued_customer text,
  ADD COLUMN issued_project text,
  ADD COLUMN issued_site_location text;

-- Quotes already with the client (Under Process / Won / Lost) went out on
-- their latest version: mark it issued so it can't be edited in place.
UPDATE quote_versions v
   SET issued_at = q.updated_at, issued_customer = l.customer, issued_project = l.project,
       issued_site_location = l.site_location
  FROM quotes q JOIN quote_leads l ON l.id = q.lead_id
 WHERE v.quote_id = q.id AND q.status IN ('sent', 'won', 'lost')
   AND v.version_no = (SELECT max(version_no) FROM quote_versions WHERE quote_id = q.id);
UPDATE quotes q SET won_version_id = v.id
  FROM quote_versions v
 WHERE v.quote_id = q.id AND q.status = 'won'
   AND v.version_no = (SELECT max(version_no) FROM quote_versions WHERE quote_id = q.id);

-- Edit lease: one editor per quotation. Its own table so heartbeats don't
-- touch quotes.updated_at (that drives "last activity" and list order).
CREATE TABLE quote_edit_locks (
  quote_id uuid PRIMARY KEY REFERENCES quotes(id) ON DELETE CASCADE,
  back_office_id uuid NOT NULL REFERENCES back_office(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);

-- Activity log. No FK to quotes on purpose: the trail of a deleted
-- quotation (who asked, who approved) outlives it.
CREATE TABLE quote_events (
  id bigserial PRIMARY KEY,
  quote_id uuid NOT NULL,
  version_no integer,
  action text NOT NULL,
  actor_name text,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_quote_events_quote ON quote_events (quote_id, created_at DESC);
