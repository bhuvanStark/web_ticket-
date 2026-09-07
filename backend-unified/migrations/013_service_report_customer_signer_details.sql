-- Customer sign-off now happens on the technician's device (TechServiceFormModal),
-- not in the customer app. The technician always records the customer's contact
-- as one free-text line ("Name - Phone", e.g. "Ramesh Kumar - 9876543210"),
-- whether or not the customer is physically present to sign.
--
-- One nullable text column. The existing signature columns on service_reports
-- (tech_signed*/customer_signed*/*_signer_name) are unchanged and keep working.

ALTER TABLE service_reports
  ADD COLUMN IF NOT EXISTS customer_signer_details text;
