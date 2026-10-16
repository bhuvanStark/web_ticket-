// Deletes drawn report signatures older than 5 years (signed_at):
// `npm run signatures:purge`. Not scheduled — signatures are currently kept
// indefinitely. Run manually, or add a cron job, only once retention is decided.
import { closeDatabase } from '../config/database.js';
import { purgeExpiredSignatures, SIGNATURE_RETENTION_YEARS } from '../services/signatureService.js';

purgeExpiredSignatures()
  .then((count) => console.log(`Purged ${count} signature(s) older than ${SIGNATURE_RETENTION_YEARS} years`))
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => closeDatabase());
