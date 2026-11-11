// Read-only pre-deploy check for migration 049_quote_sharing_rules.sql:
// lists quote data that would stop it (leads without a project, duplicate
// customer + project leads, leads with more than one quotation).
//   DATABASE_URL=<production url> node scripts/check-quote-rules.js
import { query, closeDatabase } from '../config/database.js';

const key = (col) => `lower(regexp_replace(btrim(coalesce(${col}, '')), '\\s+', ' ', 'g'))`;

async function check() {
  const blank = await query(`SELECT id, customer FROM quote_leads WHERE ${key('project')} = '' ORDER BY customer`);
  const dupLeads = await query(`
    SELECT min(customer) AS customer, min(project) AS project, count(*)::int AS n, array_agg(id) AS ids
      FROM quote_leads WHERE ${key('project')} <> ''
     GROUP BY ${key('customer')}, ${key('project')} HAVING count(*) > 1`);
  const dupQuotes = await query(`
    SELECT l.customer, l.project, count(*)::int AS n
      FROM quotes q JOIN quote_leads l ON l.id = q.lead_id
     GROUP BY l.id HAVING count(*) > 1`);

  const sections = [
    ['Leads with no project — edit the lead and add one', blank.rows.map((r) => `"${r.customer}" (${r.id})`)],
    ['Duplicate leads (same customer + project) — keep one', dupLeads.rows.map((r) => `"${r.customer}" / "${r.project}" — ${r.n} leads`)],
    ['Leads with more than one quotation — keep one', dupQuotes.rows.map((r) => `"${r.customer}" / "${r.project}" — ${r.n} quotations`)]
  ].filter(([, rows]) => rows.length);

  if (!sections.length) {
    console.log('OK — quote data already fits the new rules. Migration 049 will apply cleanly.');
    return;
  }
  for (const [title, rows] of sections) {
    console.log(`\n${title}:`);
    rows.forEach((row) => console.log(`  - ${row}`));
  }
  console.log('\nFix these, then run this check again before migrating.');
  process.exitCode = 1;
}

check()
  .catch((error) => { console.error(error.message); process.exitCode = 1; })
  .finally(() => closeDatabase());
