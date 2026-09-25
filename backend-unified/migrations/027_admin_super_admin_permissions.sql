-- Admin RBAC V1 (TaskPro_Sales_RBAC_plan.md) — Super Admin flag + per-admin,
-- per-module permission toggles. Purely additive: no existing column, table,
-- or other identity table (customers, technicians, sales, back_office) is
-- touched or altered.
--
-- Initial Super Admin is set STRICTLY to one confirmed account
-- (bhuvaneshsundar2006@gmail.com) per the plan's "minimize blast radius"
-- requirement — every other existing admin stays a normal admin (the
-- column's own DEFAULT false already guarantees that; this is not a mass
-- promotion). If that account does not exist in the target database yet
-- (e.g. local dev, where it has never been created), the UPDATE below
-- matches zero rows and is a harmless no-op — nothing else in this
-- migration depends on it existing.

BEGIN;

ALTER TABLE admins ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS admin_permissions (
  admin_id uuid NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  module text NOT NULL,
  can_access boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (admin_id, module)
);

CREATE TRIGGER admin_permissions_set_updated_at
  BEFORE UPDATE ON admin_permissions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

UPDATE admins SET is_super_admin = true WHERE lower(email) = lower('bhuvaneshsundar2006@gmail.com');

COMMIT;
