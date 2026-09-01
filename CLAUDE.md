# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working agreement (read first)

- **Do not create documentation files (README, guides, summaries, etc.) unless explicitly asked.**
- **Do not assume anything about intent, requirements, or which app a change targets.** Ask rather than guess.
- **Ask before implementing anything you're not certain about** — schema details, business rules, which app consumes a change.
- **Verify against the live database before trusting code or SQL files.** Several bugs in this repo came from code written against a schema that did not match the running database. Check `information_schema.columns` rather than assuming.

## Repo layout

Three apps plus a Postgres container. Every legacy/duplicate backend has been removed — there is exactly one backend now.

```
Tasktel_App/
├── docker-compose.yml               # PostgreSQL 16 (the app database)
├── backend-unified/                 # THE backend — serves all three portals (port 5000)
├── ADMIN_TECHNICIAN/ADMIN DASH/     # Admin + Technician portal (React 19 + Vite, port 5173)
├── frontend_customer/APP/           # Customer portal (React 18 + Vite, port 3000)
└── scripts/                         # PowerShell dev helpers (restart servers, e2e test)
```

## Database

**PostgreSQL, running locally in Docker — not Supabase.** The project was migrated off Supabase; only the query layer changed.

- Connection: `postgresql://tasktel:1234@localhost:5432/tasktel` (override with `DATABASE_URL`)
- Start it: `docker compose up -d`
- `config/database.js` owns the `pg` pool; `config/databaseClient.js` exposes a `db.from(table)` query builder with a **fixed table allowlist** — adding a table means adding it there too.

**Important naming trap:** `config/supabaseClient.js` still exists as a one-line compatibility bridge (`export { db as supabase }`), so ~14 route/service files read `import { supabase }`. That identifier is the **Postgres client**, not Supabase. No Supabase SDK is imported anywhere. Don't be misled by the name.

`frontend_customer/APP/src/supabaseService.js` is likewise misnamed — it is a plain REST client pointing at port 5000.

Schema is defined entirely by `backend-unified/migrations/NNN_*.sql`, applied in
order by `npm run db:migrate` (tracked in the `schema_migrations` table).
`001_initial_schema.sql` is the base schema; `002`–`010` are incremental
changes. There are no loose `ADD_*.sql` patch files anymore.

## Commands

Each app is an independent npm project.

### backend-unified (port 5000)
```bash
cd backend-unified
npm install
npm run dev          # nodemon server.js
npm start
npm test             # node --test tests/**/*.test.js
```

### ADMIN DASH (port 5173)
```bash
cd "ADMIN_TECHNICIAN/ADMIN DASH"
npm install && npm run dev
npm run build
npm run lint         # oxlint
```

### Customer APP (port 3000)
```bash
cd frontend_customer/APP
npm install && npm run dev
npm run build
```

### Dev helpers (PowerShell, Windows)
```powershell
.\scripts\restart-all.ps1                  # kill by port + restart all three
.\scripts\restart-all.ps1 -TestOnly        # health-check only
.\scripts\test-team-invite-flow.ps1        # 28-assertion e2e for team invites
```

## Architecture

### Backend (`backend-unified`)
- Express in `server.js`. Route groups: `/api/auth` (shared), `/api/service-requests`, `/api/rooms`, `/api/customers`, `/api/locations`, `/api/technicians`, `/api/team-members`, `/api/password-reset`, `/api/admin/*`, `/api/technician/*`.
- Auth: JWT access + refresh (`middleware/auth.js`), role in the payload. `requireAdmin` / `requireTechnician` / `requireAuth` re-verify the token per middleware — follow that pattern for new protected routes.
- Three separate identity tables: `customers`, `technicians`, `admins`. `/api/auth/login` checks `customers` then falls back to `team_members` (an invited member's JWT carries the **parent customer's** `userId` plus a `teamMemberId` claim, so existing customer-scoped endpoints resolve to shared company data unchanged).
- Business logic in `services/*.js`; routes stay thin.
- Email is **nodemailer over Gmail SMTP** (`services/emailService.js`, `SMTP_*` in `.env`) — used for team invites and password resets. Not a third-party service.
- Ticket numbers: `TT-YYMMDD-NNN`, generated in `services/serviceRequestService.js` with retry-on-collision.

### Password reset (two flows)
- **Customers** → admin-approved: request creates a `pending` row + emails an approval link to `ADMIN_EMAIL`; the admin approves (via that link or the dashboard's Approvals page), which issues the customer's reset link.
- **Admins** → direct: reset link goes straight to the admin, no approval step.
- Technicians have **no** reset flow. The login screen's modal is shared between the Admin and Technician tabs and always calls the admin endpoint.
- All endpoints return an identical response whether or not the account exists (anti-enumeration), so a typo looks like success. The UIs say so explicitly.

### Admin/Technician frontend (`ADMIN DASH`)
- React 19 + Vite 8 + Tailwind v4. One SPA for both roles; `context/AppContext.jsx` holds shared state, and `AdminDashboard` vs `TechDashboard` render by role.
- An admin can switch into a technician's view (`loginAsTechnician` / `switchRole`, Sidebar picker) — this needs the technician roster loaded, which needs a real admin token.
- Env vars use **`import.meta.env.VITE_*`** (Vite), never `process.env` — referencing `process` in browser code throws and blanks the whole app.
- Pages under `src/components/`: `approvals` (reset queue + new tickets), `requests`, `customers`, `technicians`, `calendar`, `installations`, `inventory`, `reports`, `users`, `assets`.
- **`demos/DemosPage.jsx` and `inventory/InventoryPage.jsx` still contain hardcoded arrays** (`DEM-…`, `SPR-…`) with no backing tables or endpoints. `installations` reads state that nothing populates. Treat these as unimplemented, not as data sources.

### Customer frontend (`APP`)
- React 18 + Vite 5. Mid-migration from `src/screens/*` to `src/features/*` — check both locations for the live version of a screen before editing.
- Data access: `src/supabaseService.js` and `src/api/unifiedClient.js`, both plain REST to port 5000.
- `unifiedClient.fetch()` skips its 401 auto-refresh for login/register/reset endpoints — a 401 there is a real credential failure, and retrying would mask it as "Token refresh failed".

## Environment

`backend-unified/.env` holds `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `SMTP_*`, `ADMIN_EMAIL`, `FRONTEND_URL`. Both frontends only need `VITE_API_BASE_URL`.

Emailed links must be reachable from wherever the recipient opens them — `localhost` URLs only work on the machine running the server. Set `PUBLIC_API_URL` / `ADMIN_APP_URL` for anything else.
