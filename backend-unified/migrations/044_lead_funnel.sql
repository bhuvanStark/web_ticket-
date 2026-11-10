-- Sales — Product and the Funnel. Purely additive to the leads table; no
-- other table is touched. Runs inside scripts/migrate.js's transaction.
--
--   * product — free-text product category (AV, VC, EPABX, …), set on the
--     lead form. Filtered case-insensitively in the Funnel.
--   * funnel_starred_at — a starred lead is in the Funnel (the shared Excel
--     pipeline sheet this replaces). NULL = not in the Funnel. Admin can
--     star any lead; a salesperson stars their own (services/leadService.js
--     setFunnelStar). The Funnel's date filter uses this date.
--   * funnel_backup_value / funnel_order_closed_value / funnel_remark — the
--     Funnel's costing columns. "Value" is the lead's value_estimate; these
--     two amounts and the short remark are entered on the Funnel card.
--     Kept when a lead is un-starred, so starring it again restores them.

ALTER TABLE leads ADD COLUMN product text;
ALTER TABLE leads ADD COLUMN funnel_starred_at timestamptz;
ALTER TABLE leads ADD COLUMN funnel_backup_value numeric(14,2);
ALTER TABLE leads ADD COLUMN funnel_order_closed_value numeric(14,2);
ALTER TABLE leads ADD COLUMN funnel_remark text;

-- Same ₹0 – ₹1,000 crore range as leads_value_estimate_valid (migration 032).
ALTER TABLE leads
  ADD CONSTRAINT leads_funnel_backup_value_valid
  CHECK (funnel_backup_value IS NULL OR (funnel_backup_value >= 0 AND funnel_backup_value <= 10000000000));
ALTER TABLE leads
  ADD CONSTRAINT leads_funnel_order_closed_value_valid
  CHECK (funnel_order_closed_value IS NULL OR (funnel_order_closed_value >= 0 AND funnel_order_closed_value <= 10000000000));

CREATE INDEX leads_funnel_idx ON leads (funnel_starred_at DESC) WHERE funnel_starred_at IS NOT NULL AND archived_at IS NULL;
