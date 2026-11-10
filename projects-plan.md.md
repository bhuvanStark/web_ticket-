# Tasktel Projects Module: Implementation Plan

## 1. Goal
Improve the Projects module so that each project has clear ownership, a daily work trail, design documents, and a proper approval flow before it is marked Completed.

---

## 2. Roles

| Role | Person / Example | Responsibility |
|---|---|---|
| Main Admin | Lijo | Creates projects and appoints the Project In-Charge |
| Responsible (Office Admin) | Rashmi | Office-side owner (existing field) |
| Project In-Charge | A, B, C, D (4 total) | Leads own project(s), assigns engineers, posts daily updates, submits for approval |
| Engineer / Technician | Field team | Works on site, posts daily comments, views history |
| Design Architect | Sandeep (AV Design, design@taskteltechnologees.com) | Uploads design diagram, BOQ, diagram image |
| Super Admin | Sundar (sundar@taskteltechnologees.com) | Final approval of project completion |

> Assumption: Lijo is the overall admin who appoints the 4 In-Charges, not one of them. To be confirmed.

---

## 3. Features

### 3.1 Project In-Charge
- New field **Project In-Charge** (one technician per project).
- Separate from **Responsible**.
- Set by Lijo in the New/Edit Project form.
- Shown in the project list, project details, and forms.
- The In-Charge can assign engineers **only to their own projects**.

### 3.2 Daily Comments (mandatory)
- Rename **Notes** to **Comments** in the work history table.
- Engineers and the In-Charge must enter a comment at the end of each day covering:
  - Work done
  - Work still pending
- A day cannot be marked **Completed** with an empty comment (validated on both UI and API).

### 3.3 Work History (view-only)
- New **Work History** tab inside each project.
- Columns: Technician, Date, Scheduled, Completed, Status, Comments.
- Access:
  - Engineers assigned to the project (past or present): read-only.
  - Admins and the In-Charge: full access.
  - Entries cannot be edited or deleted by engineers.
- Scenario: Engineer A works 10-11 Nov, nobody goes 13-14 Nov, Engineer B arrives 15 Nov. B reads A's history before going to site.

### 3.4 Last Updated column
- New **Last Updated** column in the Projects list.
- Shows date and time of the latest update (comment, assignment change, or file upload).
- Helps spot projects that have gone quiet.

### 3.5 Design Architect uploads
- New **Design Architect** field on the project.
- After finishing the design, the architect uploads:
  - Design diagram (PDF or Excel)
  - BOQ (PDF or Excel)
  - Diagram image (JPG or PNG)
- Visible to the In-Charge and admins.
- Each upload is stored with uploader name and timestamp.

### 3.6 Completion document
- **Upload Completion Document** in project details.
- Exactly **one page**: the signed and sealed completion page.
- Formats: JPG, PNG, or single-page PDF. Max 5 MB.
- Multi-page PDFs are rejected.
- Only admins can replace it; replacement is logged.

### 3.7 Submit for Approval
- Replace the **Complete** button with **Submit for Approval**.
- Disabled until the completion document is uploaded.
- On click:
  1. Project status changes to **Pending Approval**.
  2. Sundar is notified (in-app and email).
  3. Sundar approves or rejects (with a reason).
- Approved: project moves to **Completed**.
- Rejected: project returns to **Active** with the rejection reason shown to the In-Charge.

---

## 4. Project Status Flow

```
Planning -> Active -> Pending Approval -> Completed
                ^              |
                |--- Rejected -|
```

---

## 5. Data Changes

**projects** (add columns)
- `incharge_id` (FK to technicians)
- `design_architect_id` (FK to users)
- `status` (add value: `pending_approval`)
- `last_updated_at` (timestamp)
- `completion_doc_url`
- `submitted_for_approval_at`, `submitted_by`
- `approved_by`, `approved_at`, `rejection_reason`

**project_daily_updates** (rename `notes` to `comments`)
- `comments` (required, not null when status = completed)

**project_design_files** (new)
- `id`, `project_id`, `file_type` (diagram / boq / image), `file_url`, `uploaded_by`, `uploaded_at`

**audit_log** (new or existing)
- Log completion-document replacement, approval, rejection.

---

## 6. Permissions

| Action | Lijo | Rashmi | In-Charge | Engineer | Architect | Sundar |
|---|---|---|---|---|---|---|
| Set In-Charge | Yes | No | No | No | No | Yes |
| Assign engineers | Yes | Yes | Own projects | No | No | Yes |
| Add daily comments | Yes | Yes | Yes | Yes | No | No |
| View Work History | Yes | Yes | Yes | Assigned only | Yes | Yes |
| Upload design files | No | No | No | No | Yes | No |
| Upload completion doc | Yes | Yes | Yes | No | No | Yes |
| Submit for Approval | No | No | Yes | No | No | No |
| Approve / Reject | No | No | No | No | No | Yes |

---

## 7. API Endpoints (suggested)

- `PATCH /projects/:id` : set In-Charge, Design Architect
- `GET /projects/:id/history` : work history (role-checked)
- `POST /projects/:id/daily-update` : comments required
- `POST /projects/:id/design-files` : architect uploads
- `POST /projects/:id/completion-doc` : single-page validation
- `POST /projects/:id/submit-approval`
- `POST /projects/:id/approve` and `POST /projects/:id/reject` : Sundar only

---

## 8. Build Phases

**Phase 1: Foundations**
- DB migrations, roles, Project In-Charge field, Comments rename and validation.

**Phase 2: Visibility**
- Work History tab (view-only), Last Updated column, In-Charge assignment limits.

**Phase 3: Documents**
- Design Architect uploads, completion document upload with single-page check.

**Phase 4: Approval**
- Submit for Approval, Pending Approval status, Sundar's approve/reject screen, notifications.

**Phase 5: Testing and rollout**
- Role-based access tests, file validation tests, UAT with Lijo, an In-Charge, an engineer, and Sundar.

---

## 9. Acceptance Checklist
- [ ] In-Charge shown in list, details, and forms
- [ ] Comments mandatory before a day is marked Completed
- [ ] Engineers see read-only history only for their projects
- [ ] Last Updated shown and updates correctly
- [ ] Architect can upload diagram, BOQ, and image
- [ ] Multi-page completion documents are rejected
- [ ] Submit for Approval disabled until completion doc exists
- [ ] Sundar receives the request and can approve or reject
- [ ] Project becomes Completed only after approval

---

## 10. Open Questions
1. Is Lijo the main admin who appoints In-Charges, or one of the 4 In-Charges?
2. Can the In-Charge replace the completion document, or admins only?
3. Should the Design Architect be able to see the Work History?
4. Should rejection by Sundar require a mandatory reason? (Recommended: yes)
