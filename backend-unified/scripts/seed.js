import bcrypt from 'bcryptjs';
import { pool, closeDatabase } from '../config/database.js';

async function seed() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) throw new Error('SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are required');
  if (password.length < 12) throw new Error('SEED_ADMIN_PASSWORD must contain at least 12 characters');
  const hash = await bcrypt.hash(password, 12);
  await pool.query(
    `INSERT INTO admins(email, password_hash, full_name, department)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT ((lower(email))) DO UPDATE SET password_hash = EXCLUDED.password_hash, full_name = EXCLUDED.full_name, department = EXCLUDED.department`,
    [email.trim().toLowerCase(), hash, process.env.SEED_ADMIN_NAME || 'TaskTel Administrator', process.env.SEED_ADMIN_DEPARTMENT || 'Operations']
  );
  console.log(`Admin account ready: ${email}`);
}

seed().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => closeDatabase());
