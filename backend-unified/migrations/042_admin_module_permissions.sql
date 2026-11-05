-- Admin RBAC: four modules are now enforced per admin that were open to
-- every admin before — 'projects' (the toggle existed but no route checked
-- it) and the new 'approvals', 'back_office' and 'attendance' toggles.
--
-- requirePermission denies by default when an admin has no row for a
-- module, so without this every existing normal admin would silently lose
-- pages they use today. Grant those four to every existing non-super admin
-- that has no row yet; an explicit row a Super Admin already saved (e.g.
-- projects = false) is left exactly as it is. Admins created from now on
-- get access only when a Super Admin grants it, like every other module.
-- Runs inside scripts/migrate.js's transaction.

INSERT INTO admin_permissions (admin_id, module, can_access)
SELECT a.id, m.module, true
  FROM admins a
 CROSS JOIN (VALUES ('projects'), ('approvals'), ('back_office'), ('attendance')) AS m(module)
 WHERE a.is_super_admin = false
ON CONFLICT (admin_id, module) DO NOTHING;
