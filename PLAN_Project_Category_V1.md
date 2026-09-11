# PLAN.md — TaskTel Project Category (V1)

## 1. Purpose / Core Idea

The Project Category is a **separate module from Service Tickets**, designed for long-running or multi-day AV/infrastructure projects.

The core purpose of V1 is simple:

> **For every technician assigned to a project for a particular working day, create one independent Daily Project Activity (a project activity ticket).**

This gives TaskTel a reliable work-history record showing **which technician worked on which project on which day**.

Projects are **not permanently assigned to technicians**. Admin assigns technicians day by day.

### Core relationship

`Project → Daily Project Activities → Technician → Date → Status`

Each technician/day gets an independent activity. **Never create one shared activity for multiple technicians.**

---

## 2. Project — V1 Fields

A Project contains only:

1. **Project Name**
2. **Customer**
3. **Location**
4. **Start Date**
5. **Expected End Date**
6. **Description / Scope**
7. **Project Manager / Responsible Admin**

The Project Manager / Responsible Admin is an **Admin** responsible for the project. It is separate from technicians assigned to daily activities.

Project status:
- `Planning`
- `Active`
- `Completed`

Admin explicitly closes the overall Project. Completing a daily activity does **not** automatically close the Project.

---

## 3. Daily Project Activity — Core Mechanism

A Daily Project Activity is the **project equivalent of a service-ticket work item**.

For each:

`Project + Date + Technician`

create **one unique activity record**.

### Example

Project: `Infosys AV Installation`

Sep 10:
- Vishva → Activity A → Assigned
- Arun → Activity B → Assigned
- Kiran → Activity C → Assigned

These are three separate records.

If Vishva completes while Arun is still Accepted and Kiran is still Assigned, each record retains its own status.

On Sep 11, if only Vishva and Rahul are assigned, create two new activities for Sep 11.

This independent-record model is the foundation of the Project Category.

---

## 4. Technician Workflow — Reuse Existing Service Ticket Logic

Project Daily Activities should use the **same technician-facing workflow and behavior as the existing Service Ticket system wherever applicable**, so technicians do not learn a second workflow.

### Status flow

`Assigned → Accepted → Completed`

Reuse existing logic/behavior for:

- Technician assignment
- Technician acceptance
- Technician completion
- Reassignment
- Technician dashboard/job visibility
- Completed work moving into history

### Reassignment

If Admin needs a different technician for a daily activity:

- Remove/reassign the current technician.
- The activity must disappear from the original technician's active jobs/page, matching existing Service Ticket behavior.
- Assign the replacement technician.
- The replacement receives their own project activity.

Do **not** create a complicated continuation-ticket workflow in V1.

The Project itself remains unchanged.

**History safety:** If an assignment has already progressed into meaningful work, do not silently delete the historical record. Use an internal `Cancelled` state where needed so Admin can replace an assignment without corrupting history.

---

## 5. Daily Assignment UX — V1

Use the simple **A-style** model:

### Assign Technicians

Admin selects:

- **Date**
- **Time**
- **Multiple Technicians**

Example:

`Date: Sep 11`
`Time: 09:30 AM`
`Technicians: ☑ Vishva ☑ Arun ☑ Kiran`

Click:

`[ Assign ]`

The system creates **three independent Daily Project Activities**.

Do **not** build a separate complex day planner in V1.

### Scheduling vs completion time

The selected time is the **scheduled time**.

The system must separately store the **actual completion timestamp** when the technician completes the activity.

Do not use scheduled time as completion time.

---

## 6. Handling Changes

If a technician is no longer needed for a day:

- Admin removes/reassigns that daily assignment.
- The Project remains active.
- Another technician can be assigned.

V1 does **not** need a complex scheduling/reassignment engine.

Do **not** hard-block assignments because a technician worked at another site on the previous/following day. No Rotation Rule is required in V1.

A future version may introduce scheduling conflict warnings.

---

## 7. Technician History

This is one of the main reasons the module exists.

Example:

### Vishva — Work History

**Service Tickets**
- Ticket #1021 — Completed
- Ticket #1045 — Completed

**Project Activities**
- Infosys AV Installation — Sep 8 — Completed
- Infosys AV Installation — Sep 9 — Completed
- Infosys AV Installation — Sep 10 — Completed
- Wipro EPABX Deployment — Sep 11 — Completed

The system can later calculate project days from activity records rather than storing a separate manual day count.

---

## 8. Project Dashboard

Integrate Projects into the **existing Admin/Technician application and existing UI design**.

The Project option must appear under the existing **Service Requests** option in the existing `/ticket` application.

It must feel like a native TaskTel extension, not a separate application or redesigned interface.

### Main Project Screen

Header:
- `Projects`
- `[+ New Project]`

Tabs:
- `Active / Planning Projects`
- `Completed Projects`

Search:
- Project Name
- Customer
- Location
- Project ID

Optional date filter:
- Filter projects by relevant scheduled activity dates.

### Projects Table

Keep the table simple:

- Project Name
- Customer
- Location
- Expected End Date
- Responsible Admin
- Current Daily Assignments
- Actions

The current daily assignment area can show active assignments grouped by date, including:
- Technician
- Date
- Scheduled Time
- Status: Assigned / Accepted

Completed daily activities should move to Project Activity History rather than remaining in the active assignment display.

If there are no active assignments, show `Unassigned`.

---

## 9. Project Actions

Project actions should include:

- Create
- Edit
- Assign Technicians
- View Activity History
- Mark Complete

Delete may be available with confirmation, following existing application conventions.

### Mark Complete

Only Admin can close the Project.

Before completion, verify that there are no unresolved active daily activities.

A completed project moves to the Completed Projects area.

Daily activity completion does not automatically complete the Project.

---

## 10. Activity History

Clicking a Project opens its Activity History.

Show completed daily activities with:

- Technician
- Date
- Scheduled Time
- Actual Completion Time
- Completion Notes

The history should make it easy to answer:

> Who worked on this project, and on which days?

A date range filter may be included.

Exports can be added where useful, but they should use the same filtered history data shown in the UI.

---

## 11. What V1 Does NOT Include

Intentionally defer:

- Attendance / Check In
- Live technician location
- GPS/location tracking
- Project progress percentage
- Milestones
- Project costing
- Advanced resource planning
- Complex scheduling engine
- Rotation-rule blocking
- Advanced project analytics
- Project attachments/file management

The database and UI should be designed so these can be added later without replacing the core Project/Activity model.

---

## 12. Database Schema — V1

### Table: `projects`

Stores top-level project information.

- `id` — unique Project ID, e.g. `PRJ-001`
- `name` — required
- `customer` — required
- `site` / `location` — required
- `start_date` — nullable
- `end_date` — nullable
- `description` — nullable
- `responsible_admin_id` — Admin responsible for the project
- `status` — `Planning | Active | Completed`
- `created_at`

### Table: `project_activities`

Stores each technician's daily project activity.

- `id` — unique Activity ID
- `project_id` — FK → `projects.id`
- `technician_id` — FK/reference to existing technician system
- `scheduled_date` — required
- `scheduled_time` — required
- `status` — `Assigned | Accepted | Completed | Cancelled`
- `completion_notes` — nullable
- `completed_at` — nullable; actual timestamp when technician completes the activity
- `created_at`

### Important database rule

Enforce uniqueness for:

`project_id + technician_id + scheduled_date`

This prevents accidental duplicate daily activities for the same technician on the same project/date.

### Project ID generation

Do **not** generate Project IDs using `MAX(existing ID) + 1`.

Use a database-safe sequence/identity mechanism or another concurrency-safe server-side method while presenting IDs in a readable format such as:

`PRJ-001`, `PRJ-002`, `PRJ-003`

### Useful indexes

- `project_activities(project_id)`
- `project_activities(technician_id, scheduled_date)`
- unique index/constraint on `(project_id, technician_id, scheduled_date)`

---

## 13. Future Extension Path

The Daily Project Activity is deliberately the foundation for future features.

Later, additional information can attach to the activity, for example:

- Attendance / Check In
- Check-in location
- Photos
- Materials used
- Detailed work notes
- Sign-off
- Time spent
- Project-specific reports

These should extend the existing activity record rather than replacing the V1 model.

---

## 14. Implementation Principles

1. **Keep V1 simple.**
2. **Do not redesign the existing TaskTel UI.**
3. **Integrate Projects seamlessly into the existing `/ticket` Admin/Technician application, directly below Service Requests.**
4. **Reuse existing Service Ticket assignment/accept/complete/reassign behavior wherever applicable.**
5. **A technician must have an independent activity record for each project day.**
6. **Do not create one shared ticket/activity for multiple technicians.**
7. **Do not introduce attendance or location tracking now.**
8. **Do not introduce unnecessary migrations or fields.**
9. **Do not silently delete meaningful work history.**
10. **Keep the data model extensible for later features.**

---

## 15. Final V1 Workflow

```text
ADMIN
  ↓
Create Project
  ↓
Project exists as long-running work
  ↓
Select Date + Time + Multiple Technicians
  ↓
System creates ONE Daily Project Activity per Technician
  ↓
TECHNICIAN
  Assigned
      ↓
  Accepted
      ↓
  Completed
      ↓
Activity leaves active technician view
      ↓
Activity remains in Project History
  ↓
ADMIN
Reviews project
  ↓
Mark Project Complete
```

### Core rule

> **One Project + One Working Date + One Technician = One independent Daily Project Activity.**

That is the fundamental V1 design. Build around this first; add advanced project features later.
