# TaskPro Sales Module + Admin RBAC Implementation Plan

## 1. Admin / Super Admin RBAC

Keep the existing single Admin login. Do NOT create a separate Super Admin login.

### Super Admin
- Full access to every Admin module.
- Create, edit, deactivate/delete admins.
- Promote/demote admins to/from Super Admin.
- Toggle individual page/module permissions for each normal admin.

### Normal Admin
- Uses the same Admin login.
- Can only see and access modules enabled for them.
- Cannot manage Admins or permissions unless explicitly permitted.

### Database
Create one additive migration:
- `admins.is_super_admin BOOLEAN NOT NULL DEFAULT false`
- New `admin_permissions` table:
  - `admin_id UUID REFERENCES admins(id) ON DELETE CASCADE`
  - `module TEXT NOT NULL`
  - `can_access BOOLEAN NOT NULL DEFAULT false`
  - `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`
  - Primary key `(admin_id, module)`

### Initial Super Admin — STRICT

ONLY the existing Admin account for:

`bhuvaneshsundar2006` (the Gmail/account already provided and already present as an Admin)

must be made Super Admin.

Do NOT promote every existing Admin to Super Admin.

All other existing Admin accounts must remain normal Admins by default.

If the current database has multiple accounts/records already marked as Super Admin, normalize them so that ONLY `bhuvaneshsundar2006` remains Super Admin and all others become normal Admins.

Do not create duplicate Admin accounts for this purpose.

Do not modify Customer, Technician, Sales, or Back-Office identity tables.

Do not repurpose the existing `app_settings.role_permissions`; the audit found it is global/decorative and not wired to individual admins.

### Authentication
Keep `POST /api/auth/admin/login`.

Add the real `is_super_admin` value to login/session/me and JWT as `isSuperAdmin`.

Add:
- `requireSuperAdmin`
- `requirePermission(module)`

Super Admin bypasses `admin_permissions`.

Fix the existing frontend bug where every admin can be silently treated as `"Super Admin"` because of the current role fallback.

### Admin safety
- Block self-delete, self-demote and self-deactivate.
- Block removal/deactivation/demotion of the last active Super Admin.
- Enforce these in the backend/service layer.

### Backend enforcement
Do not rely on hidden UI navigation. Every protected Admin module API must check `requirePermission(module)`.

---

# 2. Sales access

Sales is an Admin module controlled by the RBAC above.

### STRICT ISOLATION / REGRESSION RULE

The new Sales module and the new Super Admin/RBAC functionality must be implemented as an isolated addition.

- Do NOT rewrite existing working business logic.
- Do NOT change unrelated Admin pages.
- Do NOT change Customer functionality.
- Do NOT change Technician functionality.
- Do NOT change Sales employee authentication/identity.
- Do NOT change Back-Office functionality.
- Do NOT change existing ticket/project workflows.
- Do NOT change existing permissions/roles outside what is strictly required for the new Admin RBAC.
- Do NOT refactor unrelated code merely for cleanliness.
- Reuse existing authentication, routing, API and permission infrastructure wherever possible.
- Any existing file touched must have the smallest possible change required for this feature.
- Existing behaviour must remain unchanged for users who are not using the new functionality.
- Report any required change outside this scope before implementing it.

The reason for starting with ONLY one Super Admin is to minimize the blast radius and protect all currently working Admin behaviour while the RBAC/Sales system is introduced.

Sales employee functionality itself must remain isolated from Admin RBAC changes except for the explicit Admin Sales-management permissions defined in this plan.

- Super Admin can access it.
- Normal Admins see it only if Sales permission is ON.
- Sales employees continue using the existing Sales login/identity system.

---


# 3. Lead database schema — V1

Use a simple lead table with these fields:

| Field | Required on Excel import | Rule |
|---|---|---|
| `id` | System | UUID |
| `company` | **YES** | Required |
| `person_to_contact` | No | `NULL` allowed |
| `email` | No | `NULL` allowed |
| `phone` | **YES** | Required |
| `value_estimate` | No | `NULL` allowed |
| `status` | System | Default `NEW` |
| `assigned_to` | No | `NULL` = common pool |
| `accepted_at` | No | `NULL` until accepted |
| `created_at` | System | Auto-generated |
| `updated_at` | System | Auto-updated |

### Excel import requirements

The Excel file is expected to provide:

- Company — **mandatory**
- Phone — **mandatory**
- Person to Contact — optional
- Email — optional
- Value Estimate — optional

If optional fields are missing or blank, import them as `NULL`.

Do NOT reject an otherwise valid lead merely because optional information is missing. The Admin can edit and complete the lead later.

### Phone validation

Phone is mandatory, but validation should accept reasonable formatting variations such as:

- `9876543210`
- `+91 98765 43210`
- `09876543210`

Do not make the importer unnecessarily strict about formatting.

---

# 4. Lead duplicate validation — V1

For the first version, duplicate detection must use **ONLY the phone number**.

Rule:

`Excel phone → already exists in leads? → YES = duplicate / NO = valid`

Do NOT currently use:

- company
- email
- person name
- value estimate

for duplicate detection.

Phone is mandatory specifically so every imported lead can participate in this duplicate check.

Keep duplicate-validation logic modular so additional identifiers can be added later without redesigning the import system.

When an Excel row is flagged as a duplicate, clearly identify the row and phone number and let the Admin decide how to handle it.


# 5. Lead allocation

Support BOTH:

### Direct assignment
Admin assigns a lead to a specific salesperson.

### Common pool
Eligible Sales employees see an available lead and can click `Accept Lead`.

The first successful claimant owns the lead.

### Concurrent acceptance
Use an atomic backend/database claim. Never rely on frontend availability checks.

If another salesperson wins first, the losing user gets:

> This lead was just accepted by another salesperson.

Use database state as the source of truth.

### Realtime
Use realtime updates/events plus API refresh fallback so other Sales users see the lead become unavailable quickly.

---

# 6. Lead lifecycle

Keep status and ownership separate.

Example:
- `status`: New / Meeting / Proposal / Follow-up / Won / Lost / Dead
- `assigned_to`: salesperson ID or NULL

### Five-day rule
- Timer starts when salesperson accepts the lead.
- Record `accepted_at`.
- If it has NOT reached `Meeting` after 5 days, release it to the common pool.
- Once it reaches `Meeting`, the acceptance timer stops.
- This must be server-side, not browser-dependent.

### Dead
Only an Admin explicitly marks a lead `Dead`. Do not automatically mark old leads Dead.

### Release
A salesperson may release their lead, but must provide a reason. Record it in history.

### Salesperson deactivation
When a salesperson is deactivated, their active/unclosed leads return to the common pool. Preserve all history.

---

# 7. Pipeline permissions

Use flexible stage movement.

Only:
- the salesperson who owns the lead
- authorised Admins

can mark a lead Won/Lost.

A salesperson cannot modify another salesperson's assigned lead.

---

# 8. Excel lead import

Use:

`Upload → Validate → Preview → Confirm → Transactional Import`

Validate the uploaded firm's Excel against the V1 lead schema.

Required:
- Company
- Phone

Optional:
- Person to Contact
- Email
- Value Estimate

If optional fields are missing, store `NULL`; do not reject the row.

If required fields fail:
- Show failed row numbers and exact errors.
- Do not silently invent/fill fake data.
- Admin fixes failed rows and reuploads them.

### Duplicates — V1
Detect duplicates using **phone number only**.

Do not currently use email, company, person name, or value estimate.

Keep this logic modular so more duplicate criteria can be added later.

### Import failure
Use a database transaction so a failed confirmed batch rolls back rather than leaving a partial import.

Set a reasonable V1 file/row limit.

---

# 9. History and deletion

Preserve:
- assignment
- acceptance
- release
- salesperson changes
- status changes
- follow-ups
- timestamps
- actor

Deletion:
- Hard delete only when there is no dependent history.
- Otherwise archive/soft-delete.
- Do not destroy meaningful sales history just to make deletion succeed.

---

# 10. Implementation order

### Phase 1 — Audit
Verify existing Admin auth, schema, JWT, routes, frontend role handling, Sales schema/routes, and migration state.

### Phase 2 — RBAC foundation
1. Add `is_super_admin`.
2. Add `admin_permissions`.
3. Set ONLY `bhuvaneshsundar2006` to `is_super_admin = true`.
4. Ensure every other existing Admin has `is_super_admin = false`.
5. Do NOT mass-promote existing Admins.
4. Update login/session/me.
5. Add JWT `isSuperAdmin`.
6. Add `requireSuperAdmin`.
7. Add `requirePermission`.
8. Fix the existing frontend Super Admin fallback bug.

### Phase 3 — Admin management
Build admin list, create/edit, deactivate/delete, promote/demote, and per-module permission toggles.

### Phase 4 — Backend enforcement
Apply permissions module-by-module and test with real Super Admin and restricted Admin accounts.

### Phase 5 — Sales leads
Implement direct assignment, common pool, atomic claiming, ownership, release, 5-day timeout, deactivation reassignment and lifecycle rules.

### Phase 6 — Excel
Implement validation, preview, failed-row reporting, duplicate detection and transactional import.

### Phase 7 — Realtime
Implement claim events/updates with API fallback.

### Phase 8 — Sales UI
Build the agreed Sales dashboard, lead list/pipeline, lead detail/history, follow-ups and Excel import UI using existing application patterns.

---

# 11. Acceptance tests

### RBAC
- Super Admin sees everything.
- Restricted Admin sees only enabled modules.
- Restricted Admin cannot bypass permissions through direct API calls.
- Super Admin can change permissions.
- Super Admin cannot lock/delete themselves.
- Last Super Admin cannot be removed.

### Leads
- Two simultaneous accepts → exactly one winner.
- Losing user gets a clear message.
- Other users see the lead become unavailable quickly.
- Database remains correct if realtime fails.

### Five-day rule
- Starts at acceptance.
- Returns to pool after 5 days if not Meeting.
- Stops once Meeting is reached.
- Dead remains Dead.

### Excel
- Valid file imports.
- Invalid rows are clearly reported.
- Duplicates are flagged.
- Failed batch rolls back.
- No fake data is silently generated.

### Deactivation
- Active leads of a deactivated salesperson return to the pool.
- History remains intact.

### Security
- Salesperson cannot access another salesperson's protected data.
- Restricted Admin cannot access protected APIs.
- UI and backend permissions match.

---

# 12. Existing migration warning

The audit found migrations `023` and `024` exist on disk but are not recorded as applied in the live `schema_migrations`, while later migrations `025` and `026` are applied.

Before adding the RBAC migration, reconcile this safely. Do not blindly edit or delete migration history.

---

# 13. Final implementation constraint

The primary objective is to add the Sales module and the required Admin/Super Admin controls WITHOUT disturbing existing working functionality.

The implementation should be treated as an isolated feature branch conceptually:
- New RBAC capability
- New Sales management capability
- Minimal integration points
- No unrelated refactoring
- No broad role migration
- No mass promotion of existing Admins

Initial state:

`bhuvaneshsundar2006` → Super Admin

`all other existing Admins` → Normal Admin

Only the Super Admin can later choose to promote another Admin.

# 14. Final architecture

Existing Admin login
        ↓
admins.is_super_admin
        ↓
┌──────────────────┬────────────────────┐
│ Super Admin      │ Normal Admin       │
│ Full access      │ admin_permissions  │
│                  │ Module ON/OFF      │
└──────────────────┴────────────────────┘
                         ↓
                    Sales access
                         ↓
              ┌──────────┴──────────┐
              │                     │
        Direct assignment      Common pool
                                    ↓
                              Atomic Accept
                                    ↓
                           First claimant wins
                                    ↓
                         5-day Meeting deadline
                                    ↓
                           Sales pipeline
