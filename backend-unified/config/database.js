import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL
  || (process.env.NODE_ENV !== 'production' ? 'postgresql://tasktel:1234@localhost:5432/tasktel' : null);

if (!databaseUrl) throw new Error('DATABASE_URL is required');

// Managed Postgres (Railway, Render, Supabase, Heroku, …) requires SSL. Local
// dev does not. Default: SSL on for any non-local host, off for localhost —
// overridable with DATABASE_SSL=true|false.
const isLocalHost = /@(localhost|127\.0\.0\.1|::1)[:/]/.test(databaseUrl);
const sslEnabled = process.env.DATABASE_SSL != null
  ? process.env.DATABASE_SSL === 'true'
  : !isLocalHost;

const ssl = sslEnabled
  ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'true' }
  : false;

export const pool = new Pool({
  connectionString: databaseUrl,
  ssl,
  max: Number.parseInt(process.env.DATABASE_POOL_MAX || '20', 10),
  min: Number.parseInt(process.env.DATABASE_POOL_MIN || '2', 10),
  idleTimeoutMillis: Number.parseInt(process.env.DATABASE_IDLE_TIMEOUT_MS || '30000', 10),
  connectionTimeoutMillis: Number.parseInt(process.env.DATABASE_CONNECT_TIMEOUT_MS || '5000', 10),
  statement_timeout: Number.parseInt(process.env.DATABASE_STATEMENT_TIMEOUT_MS || '15000', 10),
  application_name: process.env.DATABASE_APPLICATION_NAME || 'tasktel-api'
});

pool.on('error', (error) => console.error('Unexpected PostgreSQL pool error:', error));

export const query = (text, values = []) => pool.query(text, values);

export async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function checkDatabase() {
  const startedAt = Date.now();
  await pool.query('SELECT 1');
  return { status: 'up', latency_ms: Date.now() - startedAt };
}

export const closeDatabase = () => pool.end();
