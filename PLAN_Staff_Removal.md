# PLAN — Removing a Technician / Sales / Back-Office employee

Status: **built** (migration 040). See §9 for where the build narrowed the plan.

## 1. Rules (agreed)
- **Remove** = the person is fired. Their account is kept (so their name still
  shows on past work) but they are **locked out immediately and permanently**.
  No reactivation.
- **All work data stays.** Only the person's access and their **attendance**
  are removed. Attendance rows are deleted.
- **Delete** (permanent row removal) is only allowed when the person has **no
  work history**. Otherwise the API refuses and the UI only offers Remove.
- No email/push notifications about the removal.

## 2. What happens on Remove

### All three roles
| Data | Action |
|---|---|
| Login / sessions | `is_active = false`, `token_version + 1`, `removed_at`, `removed_by` → every existing token is rejected on its next request; OTP and password login refuse |
| Attendance (`attendance_records`) | **Deleted** (including a check-in that is still open) |
| Pending OTP / reset requests (`password_resets`) | Marked `rejected` |
| Rosters, pickers, attendance marking, "login as technician" | Hidden (they already filter `is_active = true`) |

### Technician
| Data | Action |
|---|---|
| Tickets they own that are **not** completed/resolved/closed (unassigned, assigned, active, pending, reassigned, legacy) | `assigned_technician_id = NULL`, `status = 'unassigned'` |
| Their co-technician rows (`service_request_technicians`) on those open tickets | Deleted |
| Completed tickets, co-technician rows on completed tickets, service reports, drawn signatures | **Kept untouched** |
| Pending ticket with a report already filed | Unassigned like any open ticket; report kept |
| Project activities | Kept |
| Push subscriptions | Deleted |

### Sales
| Data | Action |
|---|---|
| Leads they own in **won / lost / dead** | **Archived**, `assigned_to` kept (credit stays), `archive_reason = 'owner_removed'`, history row logged |
| Leads they own in any other status (new, meeting, proposal, follow_up, hold) | Back to the unassigned pool for admin to reassign — existing `reassignLeadsForDeactivatedSales` (clears follow-up date and any pending Won request, logs history) |
| Daily sales reports, lead history | **Kept** |

### Back Office
No work records — access lockout + attendance deletion only.

## 3. Database — `backend-unified/migrations/040_staff_removal.sql`
- `technicians`, `back_office`: add `token_version integer NOT NULL DEFAULT 0`
  (sales already has it).
- `technicians`, `sales`, `back_office`: add `removed_at timestamptz`,
  `removed_by uuid` (admin id, no FK so removing an admin later can't break it).
- `leads`: add `archive_reason text` (NULL for normal archives).
- No FK changes. `attendance_records.technician_id` stays `RESTRICT` as a
  safety net — the service deletes attendance explicitly.
- Existing `is_active = false` sales/back-office (old Deactivate) are left as
  is; they are already locked out.
- Verify against `information_schema.columns` after migrating.

## 4. Backend

### 4.1 Strict lockout (the important part)
Today only admin and sales sessions are checked live. Technician and
back-office tokens are trusted until expiry (access 7 days, refresh 30 days).
- `middleware/auth.js`: extend `verifyLiveSession` to `technician` and
  `back_office` (`is_active` + `token_version`), and call it from
  `verifyToken`/`requireAuth` (staff roles only — customer tokens unchanged),
  `requireTechnician`, `requireBackOffice`, `requireEmployee`.
- `routes/auth.js`:
  - `POST /refresh`: add technician + back-office branches (same as sales).
  - Session restore (`/session` table switch): select `is_active` for
    technicians and back_office too.
  - `POST /technician/login` (password login, still used by ADMIN DASH):
    reject `is_active = false`; include `tokenVersion` claim.
  - Duplicate `POST /refresh` at ~line 712 is dead (Express uses the first) —
    remove it so it can't be "fixed" by mistake later.
- `routes/passwordReset.js` `verifyOtp`: re-check `is_active` and add the
  `tokenVersion` claim for technician + back-office (it already does for
  admin/sales).
- One-time effect: existing technician/back-office sessions have no
  `tokenVersion` claim, so they must log in once after deploy (same as sales
  had).

### 4.2 Permission gap found (fix in this change)
`routes/technicians.js` is only behind `requireAuth`, so **any logged-in user
(customer, technician) can create, edit or delete technicians**. Put
create/update/remove/delete behind `requireAdmin`; keep the read routes as they
are.

### 4.3 Removal service — new `services/staffRemovalService.js`
`removeStaff(role, id, actor)` — one transaction:
1. `SELECT … FOR UPDATE`; 404 if missing, 409 if already removed.
2. Set `is_active = false`, `token_version + 1`, `removed_at`, `removed_by`.
3. Delete attendance rows; reject pending `password_resets`.
4. Role step from §2 (tickets / leads / nothing).
5. After commit: publish the existing realtime events (lead reassignment) so
   open admin screens refresh.

`removalPreview(role, id)` — counts for the confirm dialog: open tickets to
unassign, completed tickets kept, leads to archive / reopen, attendance rows to
delete, `canDelete`.

### 4.4 Routes (admin only)
- `GET  /api/{technicians|sales|back-office}/:id/removal-preview`
- `POST /api/{technicians|sales|back-office}/:id/remove`
- `PATCH /:id/deactivate` (sales, back-office): call `removeStaff` so old
  clients get the same behaviour.
- `DELETE /:id`: **409** if any work history, else delete attendance + row in
  one transaction. Work history =
  - technician: any `service_requests.assigned_technician_id`,
    `service_request_technicians`, or `project_activities` row
  - sales: any lead (`assigned_to` or `won_requested_by`), `lead_history.actor_id`,
    or `sales_daily_reports` row
  - back-office: none (always deletable)

### 4.5 Keep removed work visible
- Lead analytics `closedInPeriodSql` (and any won/lost totals) currently skip
  archived leads → archiving won leads would drop them from company won
  count/value. Count `archive_reason = 'owner_removed'` leads as live there.
  The per-person leaderboard keeps ranking active employees only (as today).
- Duplicate-lead checks skip archived leads → a removed person's won customer
  could be re-added as a new lead with no warning. Include
  `owner_removed` won leads in duplicate matching.
- Ticket/lead joins already return the name (row still exists). Add
  `is_active` to the technician/sales join so the UI can tag "(removed)".

### 4.6 Signature edge case (from the signature feature)
First signature wins on resubmit. If a removed technician's Pending ticket is
reassigned and the new technician resubmits, the stored drawing would still be
the removed person's while the report name is the new person's. Fix: in
`saveReportSignatures`, replace the technician drawing when the signer name
differs from the stored one; keep first-wins otherwise.

### 4.7 Tests
- Lockout: removed tech/back-office/sales → 401 on API call, refresh, session
  restore, OTP request, OTP verify, password login.
- Technician removal: open tickets unassigned, completed + reports + signatures
  untouched, attendance gone, co-tech rows only removed on open tickets.
- Sales removal: won/lost/dead archived with owner kept, open leads unassigned,
  daily reports kept, analytics totals unchanged before/after.
- Delete refused (409) with history; allowed without.
- Non-admin → 403 on technician create/update/remove/delete.

## 5. Admin frontend (`ADMIN DASH`)
- `TechniciansPage.jsx`, `SalesPage.jsx` / `UserManagementPage.jsx`,
  `BackOfficePage.jsx`:
  - **Remove** button → confirm dialog filled from `removal-preview`, e.g.
    "Logged out now and can't log in again · 3 open tickets become unassigned ·
    41 completed tickets kept · 120 attendance records deleted".
  - **Delete** shown only when `canDelete`; otherwise hidden, with the dialog
    explaining Remove keeps their work.
  - Back-office/sales **Deactivate** replaced by Remove.
- Services: `removeTechnicianInApi`, `removeSalesInApi`, `removeBackOfficeInApi`,
  `fetchRemovalPreviewInApi`.
- Ticket and lead views: "(removed)" tag next to a removed person's name.
- Check that a 401 "inactive / revoked" logs the user out cleanly on the
  technician, sales and back-office screens (no refresh loop).

## 6. Customer frontend
No change. Customers just see their open ticket go back to unassigned.

## 7. Verify
- `npm run db:migrate`, `npm test`; `npm run build` + `npm run lint` (ADMIN DASH).
- Manual, per role: log in on a phone, remove from admin → next action logs
  them out; OTP login refused; past tickets/leads/reports still show their name.

## 8. Rehire (later)
- Emails are unique, so a removed person can't get a new account with the
  same email; create returns "This email belongs to a removed employee".
  A rehire option is planned separately.

## 9. As built — differences from the plan above
- Technician/Back-Office tokens without a `tokenVersion` claim count as
  version 0, so nobody is forced to log in again after deploy. Removal sets
  `is_active = false` and bumps the version, so a removed person is still
  rejected on the next request.
- Duplicate checks: only the create/edit duplicate *warning* includes
  `owner_removed` Won leads. Import de-duplication and the Won-conflict
  checks are unchanged (changing them would alter existing sales rules).
- Analytics: only `closedInPeriodSql` (company Won/Lost totals) counts
  `owner_removed` leads. The Admin summary cards are unchanged so they keep
  matching the lead lists.
- No "(removed)" tag in the UI: names are compared as strings in several
  places, so changing displayed names was not isolated enough.
- The dead duplicate `POST /refresh` route was left as is (no runtime effect).
- Old `PATCH /:id/deactivate` (sales, back-office) now performs Remove.
- Admin UI: one Remove button per row (Technicians, Sales Team, Back Office)
  opens `components/common/RemoveStaffDialog.jsx`; Delete appears there only
  when there is no work history. When the server rejects a refresh token,
  the app returns to the login screen (`tasktel:session-ended` event).
- Tests: `integration-tests/staff-removal.test.js` (7 tests). The 16
  failing tests in the leads/RBAC integration suites fail identically on
  the commit before this change.
