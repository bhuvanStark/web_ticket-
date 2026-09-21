# PLAN.md — Attendance Category V1

## 1. Scope & Isolation — CRITICAL

Build a **new, independent Attendance Category** for TaskTel.

**DO NOT modify, refactor, delete, or change the behavior of the existing Service Ticket system or Project system.**

Attendance must be failure-isolated:
- Attendance API/database/UI failure must NOT break Tickets or Projects.
- Do not make Tickets or Projects depend on Attendance.
- Do not add Attendance logic to ticket/project workflows.
- Reuse shared UI/auth patterns only where safe and without changing their existing behavior.

---

## 2. Attendance Workflow

### Technician Side

`Login → Check In → Capture Time + Location → Active Session → Check Out`

1. Technician clicks **Check In**.
2. Capture exact check-in timestamp.
3. Request browser GPS only after the explicit Check In click.
4. If GPS succeeds, store latitude, longitude, accuracy, and capture timestamp.
5. If GPS fails/permission is denied, attendance is still created.
6. Show **In at [time]** and **Check Out**.
7. Check Out stores the exact checkout timestamp and calculates working duration.

**Location label on Admin page: `Location captured`**

Do NOT call it “Verified Presence”. GPS coordinates are recorded; physical presence is not independently verified.

---

## 3. Location Status

The Location field must distinguish:

- **GPS Captured**
- **Permission Denied**
- **Device Unsupported**
- **Unavailable/Error**

For GPS Captured, store:
- Latitude
- Longitude
- Accuracy in meters
- GPS capture timestamp

Provide **View on Map** using the stored coordinates.

For non-GPS states, attendance still succeeds and no fake coordinates are stored.

**No reverse geocoding in V1.**

---

## 4. One Check-In / One Check-Out Per Day

V1 allows **one attendance session per technician per India calendar day**.

A normal index is not sufficient for duplicate prevention. Use a **database UNIQUE constraint** on:

`(technician_id, attendance_date)`

This must prevent race-condition duplicates.

If already checked in:
- Do not create another session.
- Show the existing session.
- Allow Check Out.

No second check-in after checkout in V1.

### Absent

The system does **not automatically mark technicians Absent**.

For a selected day:
- **Total Absent starts at 0** until the Admin explicitly confirms absences.
- Clicking the **Absent** card shows technicians who have **not checked in** for that day, including any already Admin-confirmed absences.
- Admin may open an individual technician's Eye action → **Mark Absent**.
- Provide a **Mark All Absent** button at the top of this filtered view.
- **Mark All Absent** marks every technician who has **not checked in** for the selected day as Admin-confirmed absent in one action.
- Technicians who already have an attendance session are never affected by **Mark All Absent**.
- Once confirmed by Admin, the technician appears as **Absent**.
- The system does not auto-mark absence; absence always requires an explicit Admin action.

Do NOT create absence records automatically at the start of the day.
Do NOT allow Admin to Check In a technician from the Attendance page.

---

## 5. Forgotten Checkout

Forgotten checkout is expected.

If:
- `check_in_time` exists
- `check_out_time` is NULL

the record is an **Open Session / Missing Checkout**.

Do not leave it as an ambiguous permanent “Present” state.

Admin must clearly see these records.

---

## 6. Admin Impersonation / Authorization

The existing app supports **Admin → Technician view switching**.

Attendance must distinguish:

### Real Technician
A real technician can create/check out **only their own attendance**.

### Admin Acting as Technician
Admin impersonation must NOT accidentally allow an Admin to call a technician endpoint and create attendance as any arbitrary technician.

Rules:
- Technician self-service endpoints derive technician identity from the authenticated technician session.
- Do NOT trust a client-supplied `technician_id` for technician self-service.
- If Admin impersonation needs Attendance UI functionality, explicitly identify the acting Admin and target technician through an authorized admin path.
- Never silently treat an Admin JWT as a real technician.

Test both real technician login and Admin → Technician switching.

---

## 7. Admin Attendance Page

Attendance is a **separate Admin page/category**.

It contains **Attendance details only**.

Do NOT mix in:
- Service Tickets
- Project Activities
- Ticket KPIs
- Project KPIs
- Ticket history
- Project history
- Service Reports

### Top KPI Cards — Per Selected Day

Show exactly three cards:

1. **Total Present**
2. **Total Absent**
3. **Not Yet Checked Out**

Default date filter = **current India date**.

All three cards must update dynamically when the selected date changes.

#### Card behavior

**Not Yet Checked Out**
- Shows technicians who have checked in but have not checked out.
- Clicking the card activates a list filter showing **only Not Yet Checked Out technicians** for the selected day.
- This gives the Admin a quick view of who is currently present/open.
- The card count decreases when an open session is checked out.
- The Admin can use the row Eye action to **Check Out** an individual technician or **Mark Absent** where applicable.
- Provide an Admin action to **Check Out All** currently listed/open sessions, with confirmation before performing the bulk action.
- Admin must NEVER be able to Check In a technician from this page.

**Total Present**
- Shows technicians who have checked in and are currently considered present for the selected day.
- Clicking the card filters the list to **Present** technicians for the selected day.
- When a technician checks out, they move out of **Not Yet Checked Out** and into the **Present/checked-out attendance population** according to the existing status presentation.
- Therefore, at the beginning of a day, Present may be `0` while Not Yet Checked Out shows technicians who have already checked in.
- After those technicians check out, Not Yet Checked Out decreases and Present increases.
- Keep the UI terminology consistent and do not create contradictory states.

**Total Absent**
- Shows technicians who are **confirmed absent by an Admin**.
- Clicking the card filters the list to technicians who are absent for the selected day.
- A technician who simply has not checked in is NOT automatically written as an absent attendance record.
- Such a technician appears as an **unmarked / no check-in** candidate until an Admin explicitly chooses **Mark Absent**.
- Once Admin marks them absent, they appear in the Absent count/filter.
- Admin cannot Check In a technician from the Attendance page.

> Important: The system does not automatically mark technicians Absent. Absence is confirmed only by an Admin action.

Do not hard-code counts.

### Filters

Below the cards:

- **Date filter**
  - Default: current India date.
  - Changes the three KPI cards and the list.
- **Technician Name filter**
  - Reuse the existing technician list/search pattern from the Technicians page.
- **Card filter**
  - Clicking a KPI card filters the list to that card's population.
  - Clicking the selected card again or a clear/reset control returns to the normal daily list.

Filters must work together. For example:
- Date = today + Not Yet Checked Out → only today's open sessions.
- Date = today + Present → only today's present/checked-out attendance population according to the status definition.
- Date = today + Absent → only Admin-confirmed absences.

### Technician Attendance List

Use the existing Technician page visual/list pattern where practical.

Show only attendance-related information:

- Technician Name
- Date
- Check-In
- Check-Out
- Working Duration
- Location
- Attendance Status
- Actions

Location:
- GPS Captured → **Location captured** + View on Map
- Permission Denied
- Device Unsupported
- Unavailable/Error
- No location

#### Eye / Row Action

The Eye action opens an **Attendance Action / Details modal** for that technician and selected day.

Admin actions depend on the technician's state:

1. **Checked In + No Checkout**
   - Check Out
   - Mark Absent should not normally be offered because the technician has already checked in; Admin should resolve the open session through Check Out.

2. **No Attendance / Not Checked In**
   - Mark Absent
   - Do NOT offer Check In.

3. **Already Checked Out**
   - View attendance details/history only.
   - Do not offer another Check In or Check Out.

4. **Already Marked Absent**
   - Show Absent/confirmed state.
   - Do not offer Check In.
   - Do not create another attendance session.

The Admin Attendance page must never allow an Admin to create a technician check-in.

#### Bulk Open-Session Action

When the **Not Yet Checked Out** card/filter is active:
- Show **Check Out All**.
- Ask for confirmation.
- Check out all currently open attendance sessions in the selected day/filter scope.
- Do not affect already checked-out or absent records.
- Handle partial failures safely and report which records could not be updated.

Actions:
- View on Map when coordinates exist.
- Eye icon → Attendance Action / Details modal.

---

## 8. Attendance History

Eye icon opens:

**Attendance History: [Technician Name]**

Attendance-only fields:
- Date
- Check In
- Check Out
- Duration
- Location status
- Map action when coordinates exist
- Attendance status

Do not include tickets, projects, or service reports.

---

## 9. Export

Add an **Export** option at the top of the Attendance page.

Reuse the same export behavior/pattern already used by the existing **Service History** page.

Export only Attendance data and respect the currently selected:
- Date
- Technician name filter

Do not export ticket/project data.

---

## 10. Database Schema

Create a dedicated `attendance_records` table.

Suggested fields:

| Field | Type | Rules |
|---|---|---|
| `id` | UUID | PK |
| `technician_id` | UUID | FK to technicians |
| `attendance_date` | DATE | NOT NULL |
| `check_in_time` | TIMESTAMPTZ | NOT NULL |
| `check_out_time` | TIMESTAMPTZ | NULL |
| `location_lat` | DECIMAL/DOUBLE | NULL |
| `location_lng` | DECIMAL/DOUBLE | NULL |
| `location_accuracy_m` | DECIMAL/DOUBLE | NULL |
| `location_status` | TEXT/ENUM | NOT NULL |
| `location_captured_at` | TIMESTAMPTZ | NULL |
| `status` | TEXT/ENUM | NOT NULL |
| `duration_minutes` | INTEGER | NULL |
| `created_at` | TIMESTAMPTZ | NOT NULL |
| `updated_at` | TIMESTAMPTZ | NOT NULL |

Use the existing project's technician FK conventions.

### Constraints

- UNIQUE `(technician_id, attendance_date)`
- `check_out_time > check_in_time` when checkout exists
- `duration_minutes >= 0`
- Valid location-status values only
- Valid attendance-status values only
- Determine `attendance_date` using the **Asia/Kolkata / India calendar day**

Do not create rows merely to represent absence.

---

## 11. API / Security

Keep Attendance APIs isolated under an Attendance namespace.

Example routes:

- `GET /api/attendance/today`
- `POST /api/attendance/check-in`
- `POST /api/attendance/:id/check-out`
- `GET /api/admin/attendance`
- `GET /api/admin/attendance/:technicianId/history`
- `POST /api/admin/attendance/:technicianId/mark-absent`
- `POST /api/admin/attendance/:id/check-out`
- `POST /api/admin/attendance/bulk-check-out`

Follow existing project route conventions where appropriate.

Security:
- Authentication required.
- Technician self-service operates only on the authenticated technician.
- Admin endpoints require Admin authorization.
- Validate UUIDs and dates.
- Never trust client-supplied technician identity for technician self-service.
- DB enforces duplicate prevention.
- Normal technicians cannot access another technician's attendance.

---

## 12. GPS

Use the browser Geolocation API **only after Check In is clicked**.

Do NOT:
- continuously track
- request GPS on page load
- repeatedly request GPS
- implement background tracking

Capture one location at check-in.

Store latitude, longitude, accuracy, capture timestamp, and location status.

If GPS is denied/unavailable, allow check-in without GPS.

---

## 13. UI/UX

- Mobile-first technician Attendance UI.
- Reuse existing TaskTel styling/components.
- Loading state while GPS is requested.
- Existing toast/error patterns.
- Clear active-session state.
- Clear Open Session / Missing Checkout state.
- Proper empty/error/loading states.
- Attendance must remain optional to the rest of the application.

---

## 14. Failure Isolation — MANDATORY

Attendance must be completely independent.

Examples:
- Attendance API down → Ticket dashboard still works.
- Attendance DB query fails → Project page still works.
- GPS fails → Technician can still check in without GPS.
- Attendance component fails → Tickets/Projects remain usable.
- Attendance fetch/polling failure must not block existing AppContext initialization.

If shared `AppContext` is touched, Attendance state/fetches must fail independently and must never reject/block Ticket or Project state.

Do not introduce a second global polling loop if an existing shared mechanism can be safely reused.

---

## 15. Explicitly OUT OF SCOPE — V1

Do NOT build:

- Continuous/background GPS tracking
- Geofencing
- Route tracking
- Reverse geocoding
- Productivity scoring
- Payroll/salary calculation
- Photos/selfies
- Face recognition
- Attendance attachments
- Advanced attendance analytics
- Project progress/milestones
- Ticket changes
- Project workflow changes
- Ticket/project dependency on Attendance

---

## 16. Testing & Regression

### Attendance Tests

Verify:
- Migration succeeds.
- Check-in works.
- Check-out works.
- Duplicate check-in is rejected.
- DB uniqueness prevents concurrent duplicates.
- Missing checkout appears as Open Session / Missing Checkout.
- No-record technician is shown as No Check-In / Unmarked.
- Absent card starts at 0 before Admin confirmation.
- Clicking Absent shows no-check-in candidates.
- Admin can explicitly Mark Absent and the record then appears in Absent.
- Mark All Absent marks only technicians with no attendance session for the selected day.
- GPS Captured works.
- Permission Denied works.
- Device Unsupported works.
- Unavailable/Error works.
- Technician cannot access another technician's attendance.
- Customer/team-member cannot modify attendance.
- Admin endpoints require Admin authorization.
- Admin impersonation cannot create attendance as an arbitrary technician.
- Date filter dynamically updates the three cards.
- Technician name filter works.
- Export respects filters.
- History modal works.
- Map works only when coordinates exist.

### Regression — MANDATORY

Verify existing:
- Service Tickets
- Project Management
- Technician Dashboard
- Admin Dashboard
- Technician History

work exactly as before.

Run:
- Backend tests
- Frontend lint
- Production build
- `git diff --check`

**Do NOT commit or push until implementation is reviewed.**

---

## 17. Implementation Principle

Treat Attendance as a **new isolated module**, not an extension of Tickets or Projects.

Only intentional integration points:
- Existing authentication/technician identity
- Technician dashboard placement
- Admin navigation/layout
- Existing technician roster/search pattern
- Existing Service History export pattern

Everything else remains independent.

> **Most important rule: if Attendance is broken, Tickets and Projects must still work.**
