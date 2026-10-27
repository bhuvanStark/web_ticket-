import { query } from '../config/database.js';

// Drawn signatures on the field service report (migration 039). Each one is an
// SVG path string of only "M x y" / "L x y" commands in canvas coordinates.
// Every function takes an optional executor ({ query }) so tests can run
// without a database.

export const SIGNATURE_PATH_RE = /^M[ML0-9 ]*$/;
export const MAX_SIGNATURE_PATH_LENGTH = 40000;
export const MAX_SIGNATURE_DIMENSION = 2000;
export const SIGNATURE_RETENTION_YEARS = 5;

const db = { query };

// Returns { path, width, height } for a well-formed signature, else null.
// Anything malformed is dropped rather than rejected, so a bad drawing can
// never block a technician's report from being saved.
export function normalizeSignature(sig) {
  if (!sig || typeof sig !== 'object') return null;
  const { path, width, height } = sig;
  if (typeof path !== 'string' || path.length === 0 || path.length > MAX_SIGNATURE_PATH_LENGTH) return null;
  if (!SIGNATURE_PATH_RE.test(path)) return null;
  const okDim = (n) => Number.isInteger(n) && n > 0 && n <= MAX_SIGNATURE_DIMENSION;
  if (!okDim(width) || !okDim(height)) return null;
  return { path, width, height };
}

// Inserts the given signatures for a report. An existing row for the same
// party is kept (first signature wins) — resubmitting a report never
// overwrites a signature already on file. One exception: when a different
// technician resubmits (e.g. the ticket was reassigned after the first
// technician was removed), the technician drawing is replaced, so it always
// matches the technician named on the report.
// entries: [{ party: 'technician' | 'customer', signature, signerName, signedAt }]
const KEEP_FIRST = 'DO NOTHING';
const REPLACE_IF_OTHER_TECHNICIAN = `DO UPDATE SET
         path_data = EXCLUDED.path_data, width = EXCLUDED.width, height = EXCLUDED.height,
         signer_name = EXCLUDED.signer_name, signed_at = EXCLUDED.signed_at
       WHERE service_report_signatures.signer_name IS DISTINCT FROM EXCLUDED.signer_name`;

export async function saveReportSignatures(serviceReportId, entries, executor = db) {
  for (const { party, signature, signerName, signedAt } of entries) {
    const sig = normalizeSignature(signature);
    if (!sig) continue;
    await executor.query(
      `INSERT INTO service_report_signatures
         (service_report_id, party, path_data, width, height, signer_name, signed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (service_report_id, party) ${party === 'technician' ? REPLACE_IF_OTHER_TECHNICIAN : KEEP_FIRST}`,
      [serviceReportId, party, sig.path, sig.width, sig.height, signerName || null, signedAt]
    );
  }
}

export async function getReportSignatures(serviceRequestId, executor = db) {
  try {
    const { rows } = await executor.query(
      `SELECT s.party, s.path_data, s.width, s.height, s.signer_name, s.signed_at
         FROM service_report_signatures s
         JOIN service_reports r ON r.id = s.service_report_id
        WHERE r.service_request_id = $1
        ORDER BY s.party`,
      [serviceRequestId]
    );
    return rows;
  } catch (error) {
    // 42P01 = table missing (migration 039 not applied yet): behave as
    // "no drawings on file" so the PDF still renders.
    if (error.code === '42P01') return [];
    throw error;
  }
}

// Deletes drawings older than the retention window. Only the drawings go —
// the signed booleans and names on service_reports stay. Not scheduled
// anywhere: signatures are kept indefinitely until retention is decided.
export async function purgeExpiredSignatures(executor = db) {
  const { rowCount } = await executor.query(
    `DELETE FROM service_report_signatures
      WHERE signed_at < now() - make_interval(years => $1)`,
    [SIGNATURE_RETENTION_YEARS]
  );
  return rowCount;
}
