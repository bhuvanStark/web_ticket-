# TaskTel — Deployment Plan

Target: **backend + PostgreSQL on Railway**, **both frontends on cPanel** (paid
hosting, one domain per app or subdomains), source on **GitHub**.

_Last verified: 2026-09-01 against the local repo and the live `tasktel` database._

---

## 1. Architecture

```
                 ┌────────────────────────────┐
   Customers ───▶│  customer app  (static)     │─┐
                 │  cPanel: app.<domain>       │ │
                 └────────────────────────────┘ │
                 ┌────────────────────────────┐ │   HTTPS
   Admin +   ───▶│  admin+tech app (static)    │─┼──────────▶  Railway backend
   Technicians   │  cPanel: admin.<domain>     │ │             Node/Express :$PORT
                 └────────────────────────────┘ │             (backend-unified)
                                                │                    │
                                                └────────────────────┘
                                                                     │
                                                       Railway Postgres plugin
                                                       (DATABASE_URL reference)
```

- **One backend** (`backend-unified/`) serves all three portals' APIs under `/api`.
- Frontends are **pure static builds** (Vite → `dist/`). No Node runtime on cPanel.
- The frontends talk to the backend only over HTTPS; the API URL is baked in at
  build time via `VITE_API_BASE_URL`.
- No Supabase anywhere. The backend uses a direct `pg` pool
  (`config/database.js`); `config/supabaseClient.js` is just a rename bridge.

---

## 2. Repository layout (what goes where)

```
Tasktel_App/                          <- repo root, push this whole folder to GitHub
├── CLAUDE.md
├── plan.md                           <- this file
├── docker-compose.yml                <- local Postgres 17 only; NOT used in prod
├── .gitignore
├── scripts/                          <- local PowerShell dev helpers; not deployed
│
├── backend-unified/                  ══▶ deploys to RAILWAY
│   ├── server.js                     entry point (npm start)
│   ├── package.json / package-lock.json
│   ├── config/                       database.js (pg pool, auto-SSL), databaseClient.js
│   ├── routes/                       all /api/* endpoints
│   ├── services/                     email, notifications, service-request logic
│   ├── middleware/                   auth (JWT), validation, error handler
│   ├── migrations/                   001–010 *.sql  (run with npm run db:migrate)
│   ├── scripts/                      migrate.js, seed.js, seed-staff.mjs, backfill-ticket-numbers.js
│   ├── tests/  integration-tests/    not deployed, not run in prod
│   ├── .env                          LOCAL dev only — git-ignored, never uploaded
│   ├── .env.example                  template
│   └── DEPLOY_ENV.md                 the Railway variable list — git-ignored (has secrets)
│
├── ADMIN_TECHNICIAN/ADMIN DASH/      ══▶ build, deploy dist/ to CPANEL (admin.<domain>)
│   ├── package.json / package-lock.json
│   ├── index.html  vite.config.js
│   ├── public/                       static assets copied as-is
│   ├── src/                          React 19 app
│   ├── .env                          dev value (localhost:5000) — git-ignored
│   └── .env.production               PROD API URL — committed, used by `npm run build`
│
└── frontend_customer/APP/            ══▶ build, deploy dist/ to CPANEL (app.<domain>)
    ├── package.json / package-lock.json
    ├── index.html  vite.config.js
    ├── public/
    ├── src/                          React 18 app
    ├── .env                          dev value — git-ignored
    └── .env.production               PROD API URL — committed
```

### Runtime / tool versions
| Component | Version |
|---|---|
| Node (backend + build) | 22.x (local: 22.21.1) |
| PostgreSQL | 17 (local native; Railway plugin is 16+ — schema is compatible) |
| Backend framework | Express 4 |
| Admin app | React 19, Vite 8, Tailwind 4 |
| Customer app | React 18, Vite 5 |

---

## 3. Pre-deploy checklist (do these first)

- [ ] **Fill in `REPLACE_ME_*` values** — see §4 and §5.
- [ ] **Rotate the Gmail app password.** It has been shared in plain text.
      Generate a new one at <https://myaccount.google.com/apppasswords>, update
      `backend-unified/.env` locally and the Railway `SMTP_PASS` variable.
- [ ] JWT secrets are already generated (in `.env` and `DEPLOY_ENV.md`). Keep the
      local and Railway values **identical**. Changing them logs everyone out.
- [ ] `npm ci` succeeds cleanly in all three folders.
- [ ] `npm run build` succeeds for both frontends (verified 2026-09-01).
- [ ] Local backend boots and `GET /health` returns `{"status":"OK", "database":{"status":"up"}}`.

---

## 4. Backend + Database → Railway

### 4.1 Create the project

1. New Railway project → **Deploy from GitHub repo** → pick this repo.
2. Set the service **Root Directory** to `backend-unified` (the repo root is the
   monorepo; the deployable service is one level down).
3. Add the **PostgreSQL** plugin to the same project.

### 4.2 Service settings

| Setting | Value |
|---|---|
| Root directory | `backend-unified` |
| Install command | `npm ci` |
| Build command | *(none — no build step)* |
| Start command | `npm run db:migrate && npm start` |

> `db:migrate` is idempotent (tracked in `schema_migrations`); running it on every
> deploy is safe. Alternatively run it once from the Railway shell and set the
> start command to just `npm start`.

### 4.3 Environment variables

Set these in **backend service → Variables**. Full table with the generated
secret values is in `backend-unified/DEPLOY_ENV.md` (git-ignored). Summary:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `FRONTEND_URLS` | `https://admin.<domain>,https://app.<domain>` (exact origins, no trailing slash) |
| `FRONTEND_URL` | `https://app.<domain>` (customer app — used in reset-email links) |
| `ADMIN_APP_URL` | `https://admin.<domain>` (admin app — used in admin reset-email links) |
| `JWT_SECRET` | *(from DEPLOY_ENV.md)* |
| `JWT_REFRESH_SECRET` | *(from DEPLOY_ENV.md)* |
| `ACCESS_TOKEN_EXPIRY` | `7` |
| `REFRESH_TOKEN_EXPIRY` | `30` |
| `ADMIN_EMAIL` | the address that should receive OTP-approval + team-request emails |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | the Gmail account |
| `SMTP_PASS` | the **rotated** Gmail app password |

**Do not set** `PORT` (Railway injects it) or `DATABASE_SSL` (auto-enabled for
the non-local host by `config/database.js`).
**Do not add** `SUPABASE_*` — dead, the backend has no Supabase SDK.

### 4.4 Get the data into Railway Postgres

The schema is built by migrations, but the **seed/reference data** (admins,
technicians, locations, rooms, app_settings) must be copied. Current live row
counts: admins 8, technicians 5, locations 5, rooms 20, customers 1,
service_requests 1, service_reports 1.

**Option A — migrate builds schema, then load a data-only dump (recommended):**

```bash
# 1. Railway runs `npm run db:migrate` on first deploy -> empty schema exists.

# 2. Dump local DATA ONLY (no schema, no owner) from the native PG 17:
pg_dump --data-only --no-owner --no-privileges \
  --exclude-table=schema_migrations \
  "postgresql://postgres:1234@localhost:5432/tasktel" > tasktel_data.sql

# 3. Load it into Railway (grab the connection string from the Postgres plugin):
psql "<RAILWAY_DATABASE_URL>" < tasktel_data.sql
```

**Option B — full dump/restore (schema + data):**

```bash
pg_dump --no-owner --no-privileges \
  "postgresql://postgres:1234@localhost:5432/tasktel" > tasktel_full.sql
# Then set Railway start command to `npm start` only (skip migrate) and:
psql "<RAILWAY_DATABASE_URL>" < tasktel_full.sql
```

**Option C — fresh start:** let `db:migrate` build the schema, then
`npm run db:seed` (creates one admin from `SEED_ADMIN_*`) and re-enter
technicians/locations/rooms through the admin UI or `scripts/seed-staff.mjs`.

`pg_dump` / `psql` are at `C:\Program Files\PostgreSQL\17\bin`.

### 4.5 Verify

```bash
curl https://<backend>.up.railway.app/health
# expect: {"status":"OK", ... "database":{"status":"up", ...}}
```

---

## 5. Frontends → cPanel

Both apps are static. Repeat these steps for each.

### 5.1 Set the production API URL

Edit **before building**:

- `ADMIN_TECHNICIAN/ADMIN DASH/.env.production`
- `frontend_customer/APP/.env.production`

```
VITE_API_BASE_URL=https://<backend>.up.railway.app/api
```

(Include `/api`, no trailing slash. `npm run build` loads `.env.production`
automatically and `.env` cannot override it.)

### 5.2 Build

```bash
cd "ADMIN_TECHNICIAN/ADMIN DASH" && npm ci && npm run build     # -> dist/
cd "frontend_customer/APP"       && npm ci && npm run build     # -> dist/
```

### 5.3 Upload

- Put **the contents of `dist/`** (not the `dist` folder itself) into the
  target web root:
  - admin app → `admin.<domain>` document root (or `public_html/admin/`)
  - customer app → `app.<domain>` document root (or `public_html/`)
- Recommended: **one subdomain per app**, each pointing at its own folder, so
  the app is served from `/`. If you must use a **subfolder** (`/admin/`), first
  set `base: '/admin/'` in that app's `vite.config.js` and rebuild — otherwise
  the hashed asset URLs 404.

### 5.4 SPA fallback (`.htaccess`)

Both apps are client-routed (`/reset-password`, `/activate-account`,
`?page=...`). Add `.htaccess` in each app's web root:

```apache
RewriteEngine On
RewriteBase /
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^ index.html [L]
```

(Use `RewriteBase /admin/` etc. if deployed to a subfolder.)

### 5.5 HTTPS

Enable **cPanel AutoSSL** (free Let's Encrypt) for both (sub)domains. The OTP
login form posts credentials — it must not be served over plain HTTP. An HTTP
page calling the HTTPS Railway API is not blocked, but the page itself needs TLS.

### 5.6 Verify

- Load each site, open devtools → Network → confirm API calls go to the Railway
  URL and return 200.
- Log in with OTP on both apps (all existing tokens are invalid after the JWT
  secret change — everyone logs in fresh).
- Deep-link test: open `https://app.<domain>/activate-account` directly → should
  render, not 404.

---

## 6. GitHub

This is already a git repo (`master` branch, no remote).

```bash
cd d:/Tasktel_App/Tasktel_App
git add -A
git commit -m "Production cleanup + deployment config"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

### Confirmed safe / ignored (won't be pushed)
- `backend-unified/.env`, `ADMIN DASH/.env`, `frontend_customer/APP/.env` — all git-ignored.
- `backend-unified/DEPLOY_ENV.md` — git-ignored (contains the JWT secrets + SMTP pass).
- `node_modules/`, `dist/`, `*.log` — ignored.
- Git history was scanned: **no `.env` with real secrets was ever committed.**

### Will be pushed (intentional, no secrets)
- `backend-unified/.env.example`
- `ADMIN DASH/.env.production`, `frontend_customer/APP/.env.production`
  (contain only the public `VITE_API_BASE_URL`).

### Known nit
- `.claude/settings.local.json` is currently tracked but is machine-local editor
  state. Optional: `git rm --cached .claude/settings.local.json` and add
  `.claude/settings.local.json` to `.gitignore`.

---

## 7. Production cleanup already done (2026-09-01)

- Deleted 7 obsolete `backend-unified/ADD_*.sql` one-off patch files (superseded
  by `migrations/001–010`, referenced by no code).
- Deleted `backend-unified/scripts/migrate-from-supabase.js` (one-time migration,
  long complete, needed a dead `SUPABASE_SERVICE_KEY`).
- Removed all 6 dead `SUPABASE_*` / `VITE_SUPABASE_*` variables from the `.env`
  files.
- Replaced placeholder JWT secrets with generated 96-hex-char secrets.
- Added the missing `ADMIN_APP_URL` variable.
- Restructured frontend env files so the production API URL lives in
  `.env.production` (which `npm run build` loads and `.env` cannot shadow) —
  fixes the "localhost URL accidentally shipped" trap.
- Removed stray `dist/` build artifacts.
- Updated `CLAUDE.md` to describe the migrations-only schema workflow.

---

## 8. Deploy order

1. Push to GitHub (§6).
2. Railway: create service + Postgres, set env vars, first deploy runs migrations (§4).
3. Load the data into Railway Postgres (§4.4).
4. `curl /health` — confirm backend + DB are up (§4.5).
5. Put the real Railway URL into both `.env.production` files, build, upload,
   add `.htaccess`, enable AutoSSL (§5).
6. Set the backend's `FRONTEND_URLS` / `FRONTEND_URL` / `ADMIN_APP_URL` to the
   real cPanel origins, redeploy the backend.
7. End-to-end test: OTP login on both apps, create a service request, assign a
   technician, submit a report, customer sign-off — confirm notifications and
   the service history all persist.

---

## 9. Known issues (non-blocking)

- `backend-unified` `npm test` uses `--test-isolation=none`, not a valid flag on
  Node 22. Tests don't run as-is; does not affect the running app. Fix later:
  drop the flag or use `--experimental-test-isolation=none`.
- `service_updates` records richer status names (`service_in_progress`,
  `pending_customer_signoff`) than the `service_requests.status` column's
  simplified vocabulary (`assigned`, `resolved`). Cosmetic; the audit trail and
  current status are both correct.
