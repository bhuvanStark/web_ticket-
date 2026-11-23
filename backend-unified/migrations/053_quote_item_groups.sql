-- Item catalog: Group (brand) > Category > Item.
--
-- Rules (enforced in services/quoteService.js):
--   * A group is a brand (LG, Samsung). Names are unique, case-insensitive.
--   * Categories are one shared list (Display, Speaker…). A group uses some
--     of them (quote_group_categories); filtering by a category shows that
--     category's items from every group.
--   * An item is identified by group + model no. New and edited items need a
--     group, a category and a model no.
--
-- Existing data: before this migration the "categories" were mostly brand
-- names, so every category becomes a group with the same id and name, and
-- its items move with it. Items are left without a category or model no;
-- the Items > Clean-up screen lists them until the team fills those in.
-- No item is deleted. The old category rows are removed only after their
-- copy exists as a group. Saved quotes are untouched (quote_lines keeps its
-- own copied category_name).
-- Runs inside scripts/migrate.js's transaction.

CREATE TABLE IF NOT EXISTS quote_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  created_by uuid REFERENCES back_office(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS quote_groups_name_lower_unique ON quote_groups (lower(btrim(name)));
CREATE TRIGGER quote_groups_set_updated_at BEFORE UPDATE ON quote_groups
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Which categories a group uses. Unlinking is refused while items use it.
CREATE TABLE IF NOT EXISTS quote_group_categories (
  group_id uuid NOT NULL REFERENCES quote_groups(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES quote_categories(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, category_id)
);
CREATE INDEX IF NOT EXISTS idx_quote_group_categories_category ON quote_group_categories (category_id);

ALTER TABLE quote_items
  ADD COLUMN group_id uuid REFERENCES quote_groups(id) ON DELETE RESTRICT,
  ADD COLUMN model_no text CHECK (model_no IS NULL OR length(btrim(model_no)) > 0);

-- Old categories → groups (same id, so nothing is lost or renamed).
INSERT INTO quote_groups (id, name, created_by, created_at, updated_at)
SELECT id, name, created_by, created_at, updated_at FROM quote_categories;

UPDATE quote_items SET group_id = category_id;

ALTER TABLE quote_items ALTER COLUMN category_id DROP NOT NULL;
UPDATE quote_items SET category_id = NULL;
DELETE FROM quote_categories;

CREATE INDEX IF NOT EXISTS idx_quote_items_group ON quote_items (group_id);
-- Group + model no identifies an item. Old items have no model no yet, so
-- the rule applies only once it is filled.
CREATE UNIQUE INDEX IF NOT EXISTS quote_items_group_model_no_unique
  ON quote_items (group_id, lower(btrim(model_no))) WHERE model_no IS NOT NULL;
