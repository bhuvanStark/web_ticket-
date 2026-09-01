// Compatibility bridge while route modules are incrementally renamed.
// This is a direct PostgreSQL client; no Supabase service or SDK is used.
export { db as supabase, db as supabaseAdmin, db as default } from './databaseClient.js';
