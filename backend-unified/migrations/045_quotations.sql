-- Quotation module (Back-Office "Quote Manager"). Purely additive: new tables
-- only, no existing table/column/constraint is touched. Quote leads are a
-- separate resource from Sales `leads` and are never linked to them.
-- Runs inside scripts/migrate.js's transaction.

-- Back-Office employees granted the Quote Manager tag (Super Admin assigns
-- it from the Back-Office roster). Removing the employee drops the grant.
CREATE TABLE quote_managers (
  back_office_id uuid PRIMARY KEY REFERENCES back_office(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES admins(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now()
);

-- Item catalog: a category is a basket items are filed under.
CREATE TABLE quote_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  created_by uuid REFERENCES back_office(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX quote_categories_name_lower_unique ON quote_categories (lower(btrim(name)));

-- price is the cost (OSP); the quote turns it into a selling price with SM.
CREATE TABLE quote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES quote_categories(id) ON DELETE RESTRICT,
  series text,
  model_name text NOT NULL CHECK (length(btrim(model_name)) > 0),
  hsn_code text,
  price numeric(14,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  gst_rate numeric(5,2) NOT NULL DEFAULT 18 CHECK (gst_rate >= 0 AND gst_rate <= 100),
  remark text,
  created_by uuid REFERENCES back_office(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES back_office(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Model name identifies an item (Excel import updates by it).
CREATE UNIQUE INDEX quote_items_model_lower_unique ON quote_items (lower(btrim(model_name)));
CREATE INDEX idx_quote_items_category ON quote_items (category_id);

CREATE TABLE quote_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer text NOT NULL CHECK (length(btrim(customer)) > 0),
  project text,
  site_location text,
  created_by uuid REFERENCES back_office(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES quote_leads(id) ON DELETE RESTRICT,
  project_ref text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'won', 'lost')),
  po_number text,
  po_date date,
  lost_reason text,
  created_by uuid REFERENCES back_office(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'won' OR (po_number IS NOT NULL AND po_date IS NOT NULL)),
  CHECK (status <> 'lost' OR lost_reason IS NOT NULL)
);
CREATE INDEX idx_quotes_lead ON quotes (lead_id);

-- V1, V2, … of a quote. Only the latest version is editable; totals are
-- cached on save for the listing.
CREATE TABLE quote_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  version_no integer NOT NULL CHECK (version_no > 0),
  quote_date date NOT NULL DEFAULT CURRENT_DATE,
  sm numeric(6,4) NOT NULL DEFAULT 0.85 CHECK (sm > 0 AND sm <= 2),
  rounding_step integer NOT NULL DEFAULT 100 CHECK (rounding_step IN (1, 10, 100, 1000)),
  notes text,
  supply_osp numeric(16,2) NOT NULL DEFAULT 0,
  supply_price numeric(16,2) NOT NULL DEFAULT 0,
  services_osp numeric(16,2) NOT NULL DEFAULT 0,
  services_price numeric(16,2) NOT NULL DEFAULT 0,
  gst_total numeric(16,2) NOT NULL DEFAULT 0,
  grand_total numeric(16,2) NOT NULL DEFAULT 0,
  created_by uuid REFERENCES back_office(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES back_office(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (quote_id, version_no)
);

-- A solution (free-text name, e.g. "48 Seater Boardroom") or the
-- Pre-Installation Planning & Migration Services (PPM) block.
CREATE TABLE quote_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES quote_versions(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'solution' CHECK (kind IN ('solution', 'ppm')),
  name text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0
);
CREATE INDEX idx_quote_sections_version ON quote_sections (version_id);

-- Item fields are copied onto the line, so later catalog edits never change
-- a saved quote. sm_override / price_override set = individual margin.
CREATE TABLE quote_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES quote_sections(id) ON DELETE CASCADE,
  line_type text NOT NULL DEFAULT 'supply' CHECK (line_type IN ('supply', 'service')),
  item_id uuid REFERENCES quote_items(id) ON DELETE SET NULL,
  category_name text,
  series text,
  model_name text,
  description text,
  hsn_code text,
  uom text NOT NULL DEFAULT 'Nos',
  qty numeric(12,2) NOT NULL DEFAULT 1 CHECK (qty >= 0),
  osp_unit numeric(14,2) NOT NULL DEFAULT 0 CHECK (osp_unit >= 0),
  sm_override numeric(6,4) CHECK (sm_override IS NULL OR (sm_override > 0 AND sm_override <= 2)),
  price_override numeric(14,2) CHECK (price_override IS NULL OR price_override >= 0),
  gst_rate numeric(5,2) NOT NULL DEFAULT 18 CHECK (gst_rate >= 0 AND gst_rate <= 100),
  sort_order integer NOT NULL DEFAULT 0
);
CREATE INDEX idx_quote_lines_section ON quote_lines (section_id);

CREATE TRIGGER quote_categories_set_updated_at BEFORE UPDATE ON quote_categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER quote_items_set_updated_at BEFORE UPDATE ON quote_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER quote_leads_set_updated_at BEFORE UPDATE ON quote_leads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER quotes_set_updated_at BEFORE UPDATE ON quotes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER quote_versions_set_updated_at BEFORE UPDATE ON quote_versions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
