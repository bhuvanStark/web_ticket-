# PLAN — Store & display drawn signatures (vector strokes, 5-yr retention)

Status: **approved approach, not built.** Confirm the open decisions (§7) before coding.

## 1. Current state
- Tech + customer draw on 500×110 canvases in `ADMIN DASH/src/components/requests/TechServiceFormModal.jsx`; the drawing is discarded.
- `service_reports` stores only `tech_signed` / `customer_signed` booleans + time + typed name (migration 008, by design).
- PDFs (`ADMIN DASH/src/utils/pdfReportGenerator.js`, `APP/src/utils/pdfGenerator.js`) print "Signed / Not signed".
- Known gaps found:
  - `POST /api/service-requests/:id/report` only has `requireAuth` → any logged-in user (incl. customer) can overwrite any report.
  - Resubmitting a report (ticket Pending → Active again) upserts and overwrites the previous one.
  - Canvas uses CSS-pixel coords on a 500px-internal canvas → stroke offset on non-500px-wide screens.

## 2. Format
- Vector strokes encoded as an SVG path string: only `M x y` / `L x y`, integer coords in canvas space (500×110), points <~1.5px from previous dropped. ~1–3 KB per signature.
- Store **path data only**; build `<svg>` at render time (no stored markup → no XSS).

## 3. Database — `backend-unified/migrations/039_service_report_signatures.sql`
```sql
CREATE TABLE service_report_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_report_id uuid NOT NULL REFERENCES service_reports(id) ON DELETE CASCADE,
  party text NOT NULL CHECK (party IN ('technician','customer')),
  path_data text NOT NULL CHECK (path_data ~ '^M[ML0-9 ]*$' AND length(path_data) <= 40000),
  width smallint NOT NULL CHECK (width > 0),
  height smallint NOT NULL CHECK (height > 0),
  signer_name text,
  signed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service_report_id, party)
);
CREATE INDEX service_report_signatures_signed_at_idx ON service_report_signatures (signed_at);
```
- Separate table on purpose: list endpoints embed `service_reports (*)` (`routes/serviceRequests.js` GET `/`), signatures must never ride along.
- Add `'service_report_signatures'` to `TABLES` in `config/databaseClient.js`.
- Local DB is at 036 — verify 037/038 apply cleanly first; check `information_schema` after.

## 4. Backend
- `services/serviceRequestService.js` → `submitServiceReport`: accept `tech_signature` / `customer_signature` (`{ path, width, height }`, optional for old clients). After the report upsert: delete that report's signature rows, insert the provided ones (no customer row when `customer_present === false`).
- `routes/serviceRequests.js`:
  - `POST /:id/report`: validate signature shape (regex + length + width/height ints); restrict to technician/admin (if §7.4 = yes).
  - New `GET /:id/report/signatures` → `[{ party, path_data, width, height, signer_name, signed_at }]`; customer role only for own ticket (same check as `GET /:id`).
- New `services/signatureRetentionService.js`:
  `DELETE FROM service_report_signatures WHERE signed_at < now() - interval '5 years'` — deletes drawings only; booleans/names on `service_reports` stay.
- Scheduling (default): run once on `startServer()` + `setInterval` 24h (`.unref()`), guarded by `pg_try_advisory_lock` so multiple instances don't double-run.
- Tests (`tests/*.test.js`): signature validation, retention cutoff.

## 5. Admin/Technician frontend
- New `src/utils/signaturePath.js`: `strokesToPath(strokes)`, `signatureSvg({ path_data, width, height })`.
- `TechServiceFormModal.jsx`: record strokes per canvas (scale to canvas coords — fixes offset), clear resets strokes, send paths on submit; update the two "signature image is not stored" texts.
- `context/AppContext.jsx` + `services/adminApiService.js`: pass `techSignature` / `customerSignature` through; add `fetchReportSignaturesInApi(dbId)`.
- `pdfReportGenerator.js`: open window synchronously (popup blocker), fetch signatures, then render. Per card:
  - drawing present → inline SVG
  - signed, no drawing (old / purged) → "Signed (signature not on file)"
  - customer not present → "Not present"
- Update stale comments in `TechJobsPage.jsx:350`, `TechJobDetailsModal.jsx:264`.

## 6. Customer frontend (if §7.3 = yes)
- `APP/src/api/unifiedClient.js`: `getReportSignatures(id)`.
- `APP/src/utils/pdfGenerator.js`: same render logic as admin PDF.
- `CustomerSignatureModal` flow unchanged (sign-off now happens on tech device).

## 7. Open decisions (defaults in bold)
1. Resubmitted report: **replace old signatures** / keep first & block overwrite.
2. 5-yr clock starts at: **`signed_at`** / ticket completion date.
3. Show signatures in customer PDF: **yes** / admin-only.
4. Lock `POST /:id/report` to technician/admin in this change: **yes** / separate fix.
5. Purge runner: **in-process daily timer** / npm script on server cron (depends on prod deploy).

## 8. Out of scope
- Tamper-evidence hash (revisit if signatures are needed for legal disputes).
- Backfilling old reports (drawings were never saved).
- Cleanup of legacy `service_requests.customer_signature` column, the stale validator in `middleware/validation.js:353`, unused `PMReportModal.jsx`.

## 9. Verify
- `npm run db:migrate`, `npm test` (backend); `npm run build` + `npm run lint` (ADMIN DASH); `npm run build` (APP).
- Manual: submit a report with both signatures → PDF shows both; "customer not present" → no customer drawing; row size check `pg_column_size(path_data)`; set a row's `signed_at` to 6 years ago → purge removes it, report still shows "Signed".
