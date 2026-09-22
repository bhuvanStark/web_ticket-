-- Sales & Back-Office Roles V1 (PLAN_Sales_BackOffice_Unified_Attendance_V1.md)
-- — identity tables. Purely additive: does not alter technicians, admins, or
-- any existing table/column/constraint. Sales and Back-Office are deliberately
-- NOT technicians (never inserted into `technicians`, never referenced by
-- service_requests/project_activities assignment) — separate identity tables,
-- same basic shape as `technicians` for now, no shared `staff` table per the
-- plan's locked design decision.

BEGIN;

CREATE TABLE sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  full_name text NOT NULL,
  phone text,
  location text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX sales_email_lower_unique ON sales (lower(email));

CREATE TABLE back_office (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  full_name text NOT NULL,
  phone text,
  location text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX back_office_email_lower_unique ON back_office (lower(email));

CREATE TRIGGER sales_set_updated_at
  BEFORE UPDATE ON sales
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER back_office_set_updated_at
  BEFORE UPDATE ON back_office
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
