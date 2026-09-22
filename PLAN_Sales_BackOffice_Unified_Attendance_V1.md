# PLAN — Sales & Back-Office Roles + Unified Attendance V1

## 1. Objective

Add two new employee roles:
- **Sales**
- **Back-Office**

Both get OTP login, attendance, and basic employee management. They remain separate from Technicians for Ticket/Project assignment.

Roles become:

`Admin | Technician | Sales | Back-Office`

---

## 2. Locked Design Decisions

### Attendance — ONE common table

Use the **existing `attendance_records`** table for:
- Technician
- Sales
- Back-Office

**Do not create a second attendance table.**

Existing Technician rows are not moved, copied, or duplicated.

Add nullable:
- `sales_id`
- `back_office_id`

Keep:
- `technician_id`

Add an exclusive-owner constraint:

`exactly one of technician_id / sales_id / back_office_id`

Use role-specific unique indexes to maintain **one attendance row per employee per India calendar day**.

All existing status, time, location, GPS, and attendance consistency constraints must continue working.

### Login — ONE LoginScreen

Use four tabs:

`Admin | Technician | Sales | Back-Office`

Reuse the existing OTP flow.

JWT roles:
- `admin`
- `technician`
- `sales`
- `back_office`

### Identity — SEPARATE tables

Create:
- `sales`
- `back_office`

Use the same basic fields as Technician for now:
- id
- email
- full_name
- phone
- location
- is_active
- created_at
- updated_at

Do **not** create a shared `staff` table.

---

## 3. Critical Role Separation

Sales and Back-Office are **not Technicians**.

Therefore:
- Never insert them into `technicians`.
- They must not appear in Ticket technician assignment dropdowns.
- They must not appear in Project technician assignment dropdowns.
- They cannot be assigned Service Requests or Project Activities.
- Existing Technician assignment and authorization behavior must remain unchanged.

---

## 4. Admin — Sales Page

Add a Sales management page.

Admin can:
- View Sales employees
- Add Sales employees
- Use the same fields/form style as Technician
- Search/filter using the existing employee-page pattern
- Activate/deactivate where supported by the Technician pattern

No advanced Sales functionality in V1.

---

## 5. Admin — Back-Office Page

Add a Back-Office management page.

Admin can:
- View Back-Office employees
- Add Back-Office employees
- Use the same fields/form style as Technician
- Search/filter using the existing employee-page pattern
- Activate/deactivate where supported by the Technician pattern

No advanced Back-Office functionality in V1.

---

## 6. Sales Dashboard

Basic dashboard shell only.

V1:
- Attendance
- Check-In
- Request GPS/location only after clicking Check-In
- Check-Out
- Current attendance state

Leave the rest empty for future Sales features.

---

## 7. Back-Office Dashboard

Basic dashboard shell only.

V1:
- Attendance
- Check-In
- Request GPS/location only after clicking Check-In
- Check-Out
- Current attendance state

No Ticket/Project technician functionality.

---

## 8. Unified Admin Attendance

The existing Admin Attendance page becomes the attendance view for:

`Technician | Sales | Back-Office`

### Employee list

Show:
- Employee Name
- Employee Type
- Branch/Location
- Attendance status
- Check-in/check-out information
- Existing state-specific actions

### Employee Type filter

`All | Technician | Sales | Back-Office`

### Branch filter

Use the **existing `location` field** as Branch/Location.

Do not create another branch field.

Filters must work with:
- selected date
- employee type
- branch/location
- employee name/search

### Existing KPI cards

Preserve:
1. Total Present
2. Total Absent
3. Not Yet Checked Out

Keep existing semantics:
- No automatic absence creation
- Admin explicitly marks absent
- Open sessions = Not Yet Checked Out
- Check Out All only applies to open sessions

---

## 9. Attendance Backend

Generalize the existing attendance service without breaking Technician behavior.

### Sales self-service

Sales JWT determines identity.

Sales can only:
- Read own attendance
- Check self in
- Check self out

### Back-Office self-service

Back-Office JWT determines identity.

Back-Office can only:
- Read own attendance
- Check self in
- Check self out

Never trust a submitted employee ID to determine ownership.

### Admin

Admin can:
- View unified attendance
- Filter by date/type/location/name
- Mark eligible employees absent
- Check out open sessions

Admin must **not** gain a generic check-in-as-employee action.

---

## 10. OTP Authentication — Reuse Existing Login Logic

Sales and Back-Office must use the **exact same login mechanism as the current Admin and Technician login**.

- Reuse the existing OTP request flow.
- Reuse the existing OTP verification flow.
- Reuse the existing OTP expiry/validation logic.
- Reuse the existing password-reset/OTP database pattern.
- Reuse the existing JWT creation/session logic.
- Reuse the existing email delivery mechanism.
- Do **not** create a separate authentication system, password-login system, or new OTP implementation.
- Only extend the existing logic to recognize the new Sales and Back-Office identity tables/roles.
- Database ownership should follow the same connection/pattern already used by Admin/Technician OTP authentication.

Expected endpoints following current conventions:

- `/api/password-reset/sales/request-otp`
- `/api/password-reset/sales/verify-otp`
- `/api/password-reset/back-office/request-otp`
- `/api/password-reset/back-office/verify-otp`

The implementation should behave like the existing Admin/Technician OTP login, with only the identity table and JWT role differing.

Extend the existing OTP ownership model with:
- `sales_id`
- `back_office_id`

**Important:** inspect and reuse the current Admin/Technician implementation rather than inventing a new authentication/database flow.

---

## 11. Authorization

Add:
- `requireSales`
- `requireBackOffice`

or an equivalent generic role helper.

Keep:
- `requireAdmin`
- `requireTechnician`

unchanged in behavior.

Existing Ticket/Project endpoints must continue rejecting Sales/Back-Office.

Admin Technician impersonation must remain distinct from genuine Technician authentication.

---

## 12. Database Migration

Use additive migrations.

### Identity migration
Create:
- `sales`
- `back_office`

### OTP migration
Extend `password_resets` with:
- `sales_id`
- `back_office_id`

Update its exclusive-owner constraint.

### Attendance migration
Alter existing `attendance_records`:
- add `sales_id`
- add `back_office_id`
- make `technician_id` nullable
- add exclusive-owner constraint
- replace the current unique rule with role-specific partial unique indexes

**Do not copy or move existing Technician attendance rows.**

Test the migration against a current-data copy before production.

---

## 13. Frontend Role Model

Extend the current Admin/Technician role model to:

- admin
- technician
- sales
- back_office

Update only necessary:
- LoginScreen
- App routing/rendering
- Sidebar/navigation
- AppContext/state
- Attendance components

### Navigation

**Admin**
- Existing Admin navigation
- Sales
- Back-Office
- Attendance

**Technician**
- Existing Tickets
- Projects
- History
- Attendance

**Sales**
- Basic dashboard
- Attendance

**Back-Office**
- Basic dashboard
- Attendance

---

## 14. Location / Branch

Use the existing employee `location` field.

In Admin Attendance:
- display it as Branch/Location
- filter by it
- use it in the employee list

No new branch master/table in V1.

---

## 15.1. NON-NEGOTIABLE — Existing System Must Not Be Broken

This V1 is an **additive feature**, following the same isolation principle used when Project and Attendance were added.

**The new Sales/Back-Office V1 must not negatively affect any existing working functionality at any cost.**

Before completion, verify that these continue working exactly as before:

- Admin and Technician login/OTP
- Customer portal/login
- Technician attendance/history
- Admin Attendance
- Service Requests/Tickets
- Ticket creation, assignment, acceptance, completion and history
- Multi-technician functionality
- Projects and Project Activities
- Project assignment
- Technician dashboard
- Service Reports
- Existing Admin pages/navigation
- Existing polling/data refresh
- Existing database relationships and historical data

### Isolation rule

Keep the new functionality **additive and isolated** wherever possible.

Do not unnecessarily rewrite stable existing logic.

If a shared component, service, API, or database table must be extended, preserve its existing behavior and explicitly regression-test the existing path.

**A new feature is not considered successful if an existing feature regresses.**

Final verification must confirm:
1. Existing functionality still works.
2. Existing Technician data/history is preserved.
3. Existing API behavior remains compatible.
4. Existing role boundaries remain intact.
5. Sales/Back-Office functionality is isolated where required.
6. No unrelated files/workflows were changed.

If an implementation risks breaking an existing feature, **stop and resolve the compatibility issue before proceeding.**

## 15. Must NOT Change

Do not disturb:
- Existing Technician accounts
- Existing Technician attendance/history
- Existing Admin attendance behavior
- Service Request assignment
- Project assignment
- Technician dropdowns
- Technician Ticket/Project workflows
- Customer functionality
- Existing Admin/Technician OTP behavior
- Existing Technician impersonation
- Existing polling architecture

This feature is additive.

---

## 16. Testing

### Database
- Migration succeeds
- Existing Technician attendance rows unchanged
- No duplicate rows
- Exclusive owner constraint works
- One-row-per-day works independently for all 3 employee types

### Authentication
- Admin OTP works
- Technician OTP works
- Sales OTP works
- Back-Office OTP works
- Wrong-role access rejected

### Attendance
For all three employee types:
- Check-in
- Duplicate check-in rejection
- Check-out
- History
- Location/GPS states
- Admin listing
- Mark absent
- Open session
- Check Out All
- Date filter
- Employee-type filter
- Branch/location filter

### Isolation
Verify:
- Sales absent from Technician assignment dropdowns
- Back-Office absent from Technician assignment dropdowns
- Sales rejected by Technician-only endpoints
- Back-Office rejected by Technician-only endpoints
- Sales/Back-Office cannot modify another employee's attendance
- Customer/team-member access remains blocked

### Frontend
- Lint
- Build
- Existing Technician/Admin regression
- Sales login/dashboard
- Back-Office login/dashboard
- Sales Admin page
- Back-Office Admin page
- Unified Attendance

### Final checks
- `git diff --check`
- Review all changed files
- No secrets
- No unrelated changes
- **Do not commit/push until explicitly approved.**

---

## 17. V1 Scope

### Included
- Sales identity
- Back-Office identity
- OTP login
- Four-tab LoginScreen
- Sales Admin page
- Back-Office Admin page
- Basic Sales dashboard
- Basic Back-Office dashboard
- Unified existing attendance table
- Unified Admin Attendance
- Employee-type filter
- Branch/location filter
- Existing GPS/location capture

### Not Included
- Sales CRM/leads/opportunities
- Back-Office business workflows
- Ticket assignment to Sales/Back-Office
- Project assignment to Sales/Back-Office
- Advanced attendance analytics
- New branch master
- Advanced role/permission management
- Extra employee fields beyond current Technician-style fields

---

## 18. Implementation Order

1. Inspect current auth, employee management, and attendance code.
2. Create Sales/Back-Office identity migration.
3. Extend OTP ownership/authentication.
4. Add role authorization.
5. Safely extend existing `attendance_records`.
6. Generalize attendance backend.
7. Build unified Admin Attendance filters.
8. Add Sales Admin page.
9. Add Back-Office Admin page.
10. Extend LoginScreen to four roles.
11. Add Sales dashboard shell.
12. Add Back-Office dashboard shell.
13. Run tests/build/lint/regression checks.
14. Review complete diff.
15. **STOP — wait for explicit approval before commit/push.**
