-- Quotation extras: a contact person and an account manager (a Sales
-- employee, whose phone prints on the quotation) on each lead, and editable
-- Terms & Conditions + delivery timeline on each version. Issued versions
-- snapshot the contact / account manager like they do customer and project.

ALTER TABLE quote_leads
  ADD COLUMN contact_person text,
  ADD COLUMN account_manager_id uuid REFERENCES sales(id) ON DELETE SET NULL;

ALTER TABLE quote_versions
  ADD COLUMN terms text,
  ADD COLUMN delivery_timeline text,
  ADD COLUMN issued_contact_person text,
  ADD COLUMN issued_account_manager text,
  ADD COLUMN issued_account_manager_phone text;
