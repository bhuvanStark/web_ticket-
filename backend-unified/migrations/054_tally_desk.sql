-- Tally Desk, Phase 1 (tallyPlan.md): Tally Makers turn won quotations into
-- vouchers and download a TallyPrime XML file that Accounts imports
-- (Import → Transactions). Nothing here talks to Tally.
--
-- Purely additive: new tables only. Quotation tables are read, never
-- changed; the only links into them are ON DELETE CASCADE / SET NULL, so
-- deleting a quotation or a catalog item works exactly as before.
-- Runs inside scripts/migrate.js's transaction.

-- Back-Office employees granted the Tally Maker tag (Super Admin assigns it
-- from the Back-Office roster, like quote_managers).
CREATE TABLE tally_makers (
  back_office_id uuid PRIMARY KEY REFERENCES back_office(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES admins(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now()
);

-- One row: the exact Tally names every voucher uses. Voucher types for
-- Sales Order / Delivery Note / Sales are taken from the company's Tally
-- statistics screen (2026-11-23); the rest are filled in by a Tally Maker.
CREATE TABLE tally_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  company_name text,
  home_state text NOT NULL DEFAULT 'Karnataka',
  godown_name text,
  ledger_sales_goods text,
  ledger_sales_services text,
  ledger_cgst text,
  ledger_sgst text,
  ledger_igst text,
  ledger_round_off text,
  vch_sales_order text,
  vch_proforma text,
  vch_delivery_note text,
  vch_invoice_goods text,
  vch_invoice_services text,
  updated_by uuid REFERENCES back_office(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO tally_settings (id, vch_sales_order, vch_delivery_note, vch_invoice_goods)
VALUES (true, 'Sales Order', 'Delivery Note', 'Sales');

-- Catalog item → its Tally stock item, remembered once set on a voucher.
CREATE TABLE tally_item_map (
  item_id uuid PRIMARY KEY REFERENCES quote_items(id) ON DELETE CASCADE,
  stock_item_name text NOT NULL CHECK (length(btrim(stock_item_name)) > 0),
  unit_name text NOT NULL CHECK (length(btrim(unit_name)) > 0),
  updated_by uuid REFERENCES back_office(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Quote customer (quote_lead_key(customer)) → Tally party ledger and
-- billing details, remembered from the last voucher made for them.
CREATE TABLE tally_parties (
  customer_key text PRIMARY KEY,
  party_ledger text NOT NULL CHECK (length(btrim(party_ledger)) > 0),
  bill_name text,
  bill_address text,
  bill_gstin text,
  bill_state text,
  updated_by uuid REFERENCES back_office(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- A voucher prepared from a won quotation. Lines are copied, so a quote
-- reopened and edited later never changes a voucher already made.
-- draft → downloaded (XML taken, can still be fixed and taken again)
-- → imported (Accounts confirmed it is in Tally; locked).
CREATE TABLE tally_vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_no bigserial UNIQUE,
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  version_id uuid REFERENCES quote_versions(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('sales_order', 'proforma', 'delivery_note', 'invoice')),
  voucher_type text,
  voucher_date date NOT NULL DEFAULT CURRENT_DATE,
  po_number text,
  po_date date,
  party_ledger text,
  bill_name text,
  bill_address text,
  bill_gstin text,
  bill_state text,
  ship_name text,
  ship_address text,
  ship_gstin text,
  ship_state text,
  place_of_supply text,
  narration text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'downloaded', 'imported')),
  tally_voucher_no text,
  download_count integer NOT NULL DEFAULT 0,
  last_downloaded_at timestamptz,
  last_downloaded_by uuid REFERENCES back_office(id) ON DELETE SET NULL,
  created_by uuid REFERENCES back_office(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES back_office(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tally_vouchers_quote ON tally_vouchers (quote_id);

-- source_line_id is the quote line it came from (no FK: quote lines are
-- rewritten on every quote save), used to show qty already on vouchers.
CREATE TABLE tally_voucher_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id uuid NOT NULL REFERENCES tally_vouchers(id) ON DELETE CASCADE,
  source_line_id uuid,
  item_id uuid REFERENCES quote_items(id) ON DELETE SET NULL,
  line_type text NOT NULL CHECK (line_type IN ('supply', 'service')),
  description text NOT NULL,
  hsn_code text,
  stock_item_name text,
  unit_name text,
  qty numeric(12,2) NOT NULL CHECK (qty > 0),
  rate numeric(14,2) NOT NULL CHECK (rate >= 0),
  gst_rate numeric(5,2) NOT NULL DEFAULT 18 CHECK (gst_rate >= 0 AND gst_rate <= 100),
  sort_order integer NOT NULL DEFAULT 0
);
CREATE INDEX idx_tally_voucher_lines_voucher ON tally_voucher_lines (voucher_id);
CREATE INDEX idx_tally_voucher_lines_source ON tally_voucher_lines (source_line_id);

CREATE TRIGGER tally_settings_set_updated_at BEFORE UPDATE ON tally_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER tally_item_map_set_updated_at BEFORE UPDATE ON tally_item_map
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER tally_parties_set_updated_at BEFORE UPDATE ON tally_parties
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER tally_vouchers_set_updated_at BEFORE UPDATE ON tally_vouchers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
