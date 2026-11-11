# Tasktel Projects Module (as built)

Commit `f87c7ad`. Migrations 046–048.

## Roles
| Role | Who | Can do |
|---|---|---|
| Admin (Projects module) | e.g. Lijo | Create/edit/delete projects, set Managers + Team, assign work, upload files, submit for approval. Sees only modules a Super Admin granted. |
| Super Admin | e.g. Sundar | Everything above + approve/reject completion. |
| Manager (technician, many per project) | Picked per project | Assign daily work to the team (incl. self), reassign/cancel, upload files, submit for approval. |
| Team (technician, view-only) | Picked per project | See the whole project (timeline, log, files). Accept/complete only their own work. |

"Responsible admin" is replaced by Managers (old column kept, hidden).

## Features
- **Assign work** — only to the project's team; one entry per person per day.
- **Daily comment** — mandatory to complete a day (UI + API). Shown in the **Daily log** tab (grouped by day, filters, export).
- **Timeline** — people × days grid: done / on it / assigned / cancelled, comment markers, "Crew on site" row (gap days highlighted), project events. Tap a day for details.
- **Files** — named, by type: Design, BOQ, Image, Document, Completion. Images compressed in browser, others gzipped on server. Stored in Postgres. Limits: 15 MB/file, 250 MB & 200 files/project, 3 uploads at once.
- **Completion** — upload signed doc → Manager/Admin submits → **Pending Approval** (assignments paused) → Super Admin approves (**Completed**) or rejects with reason (back to **Active**). No direct "mark complete".
- **Last updated** column + **Quiet 3+ days** card (open projects with no activity for 3+ days).
- **36-hour expiry** — work not accepted within 36 h of assignment is cancelled (kept in history, logged). Applies only to work assigned after deploy.
- Technicians get a **Projects** page in their app.

## Status flow
```
Planning -> Active -> Pending Approval -> Completed
              ^              |
              +-- rejected --+
```

## Data (migrations)
- **046** — `projects`: `last_activity_at`, completion/submit/review fields, status `Pending Approval`. New tables `project_members`, `project_files`, `project_events`.
- **047** — 36 h expiry support (expiry doesn't count as activity).
- **048** — expiry applies only to new assignments.

## API
- `/api/projects` — admin list/create/edit (+ `manager_ids`, `viewer_ids`), `GET /technicians` for pickers.
- `/api/project-workspace` — tech's projects; `/:id` workspace; `/:id/activities` assign/reassign/cancel; `/:id/files` upload/view/delete; `/:id/submit`; `/:id/review` (Super Admin).

## Deploy
1. Backup Railway DB (`pg_dump`).
2. `npm run db:migrate` in `backend-unified` (applies 046–048).
3. Add Managers + Team to existing projects before assigning new work.
