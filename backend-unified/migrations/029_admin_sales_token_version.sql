-- Audit fix P0-1 (TaskPro_Sales_RBAC_plan.md audit) — session revocation.
-- Adds a per-account "security stamp" to admins and sales: bumped whenever
-- an account's access-relevant state changes (deactivate, delete-adjacent
-- reassignment, promote/demote), and embedded in every JWT issued at
-- login/refresh (see middleware/auth.js, routes/auth.js,
-- routes/passwordReset.js). requireAdmin/requireSuperAdmin/
-- requirePermission/requireSales now reject any token whose embedded
-- token_version doesn't match the current DB value, even if the token's
-- signature and expiry are otherwise still valid — closing the gap where a
-- deactivated or just-demoted account's existing token kept working for up
-- to 7 days (the access token lifetime).
--
-- Purely additive: no existing column, table, or other identity table
-- (customers, technicians, back_office) is touched.

BEGIN;

ALTER TABLE admins ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 0;

COMMIT;
