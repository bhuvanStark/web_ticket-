// One-off backfill: assign readable TT-YYMMDD-NNN ticket numbers to any
// service_requests row that has none. Numbering is per creation date, in
// creation order, and skips numbers already taken for that date.
//
// Usage:  node scripts/backfill-ticket-numbers.js [--dry-run]

import dotenv from 'dotenv';
import { supabase } from '../config/supabaseClient.js';
import { formatTicketNumber } from '../services/serviceRequestService.js';

dotenv.config();

const dryRun = process.argv.includes('--dry-run');

const dateKey = (iso) => {
  const d = new Date(iso);
  return `${String(d.getFullYear()).slice(-2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
};

const run = async () => {
  const { data: rows, error } = await supabase
    .from('service_requests')
    .select('id, ticket_number, created_at')
    .order('created_at', { ascending: true });

  if (error) throw error;

  // Seed per-day counters from numbers that already exist, so a re-run does not
  // hand out a number that is already in use.
  const counters = new Map();
  for (const row of rows) {
    if (!row.ticket_number) continue;
    const match = /^TT-(\d{6})-(\d+)$/.exec(row.ticket_number);
    if (!match) continue;
    const [, key, seq] = match;
    counters.set(key, Math.max(counters.get(key) || 0, parseInt(seq, 10)));
  }

  const missing = rows.filter((row) => !row.ticket_number);
  console.log(`${rows.length} total requests, ${missing.length} missing a ticket number.`);

  if (missing.length === 0) {
    console.log('Nothing to backfill.');
    return;
  }

  let updated = 0;
  for (const row of missing) {
    const key = dateKey(row.created_at);
    const next = (counters.get(key) || 0) + 1;
    counters.set(key, next);

    const ticketNumber = formatTicketNumber(new Date(row.created_at), next);
    console.log(`  ${row.id}  ->  ${ticketNumber}`);

    if (!dryRun) {
      const { error: updateError } = await supabase
        .from('service_requests')
        .update({ ticket_number: ticketNumber })
        .eq('id', row.id);

      if (updateError) {
        console.error(`  failed for ${row.id}: ${updateError.message}`);
        continue;
      }
      updated++;
    }
  }

  console.log(dryRun ? '\nDry run — nothing written.' : `\nUpdated ${updated} row(s).`);
};

run().catch((err) => {
  console.error('Backfill failed:', err.message);
  process.exit(1);
});
