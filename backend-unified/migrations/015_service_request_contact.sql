-- Free-text "Contact" for a ticket: the admin types Name - Phone - Email in one
-- field when raising the ticket. Stored verbatim; never parsed, matched or
-- linked to a customer/contact record. Shown to the assigned technician.
--
-- One nullable text column. No backfill.

ALTER TABLE service_requests
  ADD COLUMN IF NOT EXISTS contact text;
