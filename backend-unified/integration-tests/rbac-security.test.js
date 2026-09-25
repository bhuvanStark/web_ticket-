// Regression tests for the RBAC audit fixes (P0-1, P0-2, P2-2, P2-3, P2-4).
// Same pattern as api.test.js: real HTTP server, real PostgreSQL, no mocks —
// these bugs were concurrency/session-state bugs that a mocked DB can't
// reproduce.
import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';

process.env.JWT_SECRET ||= 'integration-access-secret-change-me';
process.env.JWT_REFRESH_SECRET ||= 'integration-refresh-secret-change-me';

const { default: app } = await import('../server.js');
// See integration-tests/api.test.js's import comment: the DB pool is a
// process-wide singleton shared by every integration test file under
// `--test-isolation=none` — no individual file closes it; `npm run
// test:integration` passes `--test-force-exit` to terminate cleanly once
// all tests report, regardless of the pool's still-open connections.
const { pool } = await import('../config/database.js');
const { generateToken, generateRefreshToken } = await import('../middleware/auth.js');

let server;
let baseUrl;

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

function suffix() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function createAdmin({ isSuperAdmin = false, isActive = true } = {}) {
  const passwordHash = await bcrypt.hash('TestPassword123!', 10);
  const { rows } = await pool.query(
    `INSERT INTO admins (email, password_hash, full_name, is_active, is_super_admin)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, token_version`,
    [`rbac-test-${suffix()}@example.com`, passwordHash, 'RBAC Test Admin', isActive, isSuperAdmin]
  );
  return rows[0];
}

function accessTokenFor(admin, isSuperAdmin) {
  return generateToken(admin.id, 'admin', { isSuperAdmin, tokenVersion: admin.token_version });
}

function refreshTokenFor(admin, isSuperAdmin) {
  return generateRefreshToken(admin.id, 'admin', { isSuperAdmin, tokenVersion: admin.token_version });
}

async function adminHeaders(token) {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
}

test('P0-1: a deactivated admin\'s existing access token is rejected immediately', async (t) => {
  const superAdmin = await createAdmin({ isSuperAdmin: true });
  const victim = await createAdmin({ isSuperAdmin: true });
  t.after(() => pool.query('DELETE FROM admins WHERE id = ANY($1)', [[superAdmin.id, victim.id]]));

  const superToken = accessTokenFor(superAdmin, true);
  const victimToken = accessTokenFor(victim, true);

  const before = await fetch(`${baseUrl}/api/admin/admins`, { headers: await adminHeaders(victimToken) });
  assert.equal(before.status, 200, 'token works before deactivation');

  const deactivate = await fetch(`${baseUrl}/api/admin/admins/${victim.id}/deactivate`, {
    method: 'PATCH', headers: await adminHeaders(superToken)
  });
  assert.equal(deactivate.status, 200);

  const after = await fetch(`${baseUrl}/api/admin/admins`, { headers: await adminHeaders(victimToken) });
  assert.equal(after.status, 401, 'the SAME pre-deactivation token must now be rejected');
});

test('P0-1: a deactivated admin cannot log in again', async (t) => {
  const superAdmin = await createAdmin({ isSuperAdmin: true });
  const victim = await createAdmin({ isSuperAdmin: false });
  t.after(() => pool.query('DELETE FROM admins WHERE id = ANY($1)', [[superAdmin.id, victim.id]]));

  const { rows } = await pool.query('SELECT email FROM admins WHERE id = $1', [victim.id]);
  const email = rows[0].email;

  await fetch(`${baseUrl}/api/admin/admins/${victim.id}/deactivate`, {
    method: 'PATCH', headers: await adminHeaders(accessTokenFor(superAdmin, true))
  });

  const login = await fetch(`${baseUrl}/api/auth/admin/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'TestPassword123!' })
  });
  assert.equal(login.status, 401);
});

test('P0-1: a deleted admin\'s existing token is rejected immediately (not just its /session check)', async (t) => {
  const superAdmin = await createAdmin({ isSuperAdmin: true });
  const victim = await createAdmin({ isSuperAdmin: true });
  t.after(() => pool.query('DELETE FROM admins WHERE id = $1', [superAdmin.id]));

  const superToken = accessTokenFor(superAdmin, true);
  const victimToken = accessTokenFor(victim, true);

  const del = await fetch(`${baseUrl}/api/admin/admins/${victim.id}`, { method: 'DELETE', headers: await adminHeaders(superToken) });
  assert.equal(del.status, 200);

  const afterDeleteAction = await fetch(`${baseUrl}/api/admin/admins`, { headers: await adminHeaders(victimToken) });
  assert.equal(afterDeleteAction.status, 401, 'a real admin-management API call, not just /session, must reject the deleted admin\'s token');
});

test('P0-1: demoting a Super Admin invalidates their existing token\'s elevated access immediately', async (t) => {
  const superAdmin = await createAdmin({ isSuperAdmin: true });
  const other = await createAdmin({ isSuperAdmin: true });
  t.after(() => pool.query('DELETE FROM admins WHERE id = ANY($1)', [[superAdmin.id, other.id]]));

  const otherToken = accessTokenFor(other, true);
  const before = await fetch(`${baseUrl}/api/admin/admins`, { headers: await adminHeaders(otherToken) });
  assert.equal(before.status, 200);

  await fetch(`${baseUrl}/api/admin/admins/${other.id}/super-admin`, {
    method: 'PATCH', headers: await adminHeaders(accessTokenFor(superAdmin, true)),
    body: JSON.stringify({ is_super_admin: false })
  });

  const after = await fetch(`${baseUrl}/api/admin/admins`, { headers: await adminHeaders(otherToken) });
  assert.equal(after.status, 401, 'the demoted admin\'s pre-demotion token must stop working entirely (token_version bump), not just lose Super Admin power');
});

test('P0-1: Sales deactivation revokes an already-issued token immediately', async (t) => {
  const superAdmin = await createAdmin({ isSuperAdmin: true });
  const { rows } = await pool.query(
    `INSERT INTO sales (email, full_name, is_active) VALUES ($1, $2, true) RETURNING id, token_version`,
    [`rbac-sales-${suffix()}@example.com`, 'RBAC Test Sales']
  );
  const sales = rows[0];
  t.after(() => pool.query('DELETE FROM admins WHERE id = $1', [superAdmin.id]).then(() => pool.query('DELETE FROM sales WHERE id = $1', [sales.id])));

  const salesToken = generateToken(sales.id, 'sales', { tokenVersion: sales.token_version });

  const before = await fetch(`${baseUrl}/api/sales-leads/pool`, { headers: { authorization: `Bearer ${salesToken}` } });
  assert.equal(before.status, 200);

  await fetch(`${baseUrl}/api/sales/${sales.id}/deactivate`, {
    method: 'PATCH', headers: await adminHeaders(accessTokenFor(superAdmin, true))
  });

  const after = await fetch(`${baseUrl}/api/sales-leads/pool`, { headers: { authorization: `Bearer ${salesToken}` } });
  assert.equal(after.status, 401, 'a deactivated Sales employee\'s existing token must be rejected, not keep accepting/working leads');
});

test('P2-3: refreshing a token re-reads is_super_admin and is_active from the DB, not the old token\'s claims', async (t) => {
  const superAdmin = await createAdmin({ isSuperAdmin: true });
  const normalAdmin = await createAdmin({ isSuperAdmin: false });
  t.after(() => pool.query('DELETE FROM admins WHERE id = ANY($1)', [[superAdmin.id, normalAdmin.id]]));

  // Refresh token minted while still a normal admin.
  const oldRefreshToken = refreshTokenFor(normalAdmin, false);

  // Promoted after that refresh token was issued.
  await fetch(`${baseUrl}/api/admin/admins/${normalAdmin.id}/super-admin`, {
    method: 'PATCH', headers: await adminHeaders(accessTokenFor(superAdmin, true)),
    body: JSON.stringify({ is_super_admin: true })
  });

  // Old refresh token is itself now stale (its embedded tokenVersion predates
  // the promotion's bump) — refresh must reject it and force a real re-login,
  // not silently mint a token with outdated claims.
  const refreshed = await fetch(`${baseUrl}/api/auth/refresh`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken: oldRefreshToken })
  });
  assert.equal(refreshed.status, 401, 'a refresh token whose token_version predates a promotion must be rejected, not silently honored with stale claims');
});

test('P2-3: refresh rejects an inactive account instead of minting it a new access token', async (t) => {
  const superAdmin = await createAdmin({ isSuperAdmin: true });
  const victim = await createAdmin({ isSuperAdmin: false });
  t.after(() => pool.query('DELETE FROM admins WHERE id = ANY($1)', [[superAdmin.id, victim.id]]));

  const victimRefreshToken = refreshTokenFor(victim, false);
  await fetch(`${baseUrl}/api/admin/admins/${victim.id}/deactivate`, {
    method: 'PATCH', headers: await adminHeaders(accessTokenFor(superAdmin, true))
  });

  const refreshed = await fetch(`${baseUrl}/api/auth/refresh`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken: victimRefreshToken })
  });
  assert.equal(refreshed.status, 401);
});

test('P2-2: creating an admin with a case-variant duplicate email is a clean 400, not a raw 500', async (t) => {
  const superAdmin = await createAdmin({ isSuperAdmin: true });
  const { rows } = await pool.query('SELECT email FROM admins WHERE id = $1', [superAdmin.id]);
  const email = rows[0].email;
  t.after(() => pool.query('DELETE FROM admins WHERE id = $1', [superAdmin.id]));

  const res = await fetch(`${baseUrl}/api/admin/admins`, {
    method: 'POST', headers: await adminHeaders(accessTokenFor(superAdmin, true)),
    body: JSON.stringify({ full_name: 'Case Dup', email: email.toUpperCase() })
  });
  assert.equal(res.status, 400, 'must not surface as a raw 500 with the internal constraint name');
  const body = await res.json();
  assert.equal(body.success, false);
  assert.doesNotMatch(body.error, /constraint|duplicate key/i, 'must not leak the raw Postgres error text');
});

test('P2-4: a permissions update commits every module in one shot', async (t) => {
  const superAdmin = await createAdmin({ isSuperAdmin: true });
  const target = await createAdmin({ isSuperAdmin: false });
  t.after(() => pool.query('DELETE FROM admins WHERE id = ANY($1)', [[superAdmin.id, target.id]]));

  const res = await fetch(`${baseUrl}/api/admin/admins/${target.id}/permissions`, {
    method: 'PUT', headers: await adminHeaders(accessTokenFor(superAdmin, true)),
    body: JSON.stringify({ permissions: { sales: true, customers: true, reports: false } })
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.data.sales, true);
  assert.equal(body.data.customers, true);
  assert.equal(body.data.reports, false);

  const { rows } = await pool.query('SELECT module, can_access FROM admin_permissions WHERE admin_id = $1 ORDER BY module', [target.id]);
  assert.deepEqual(
    rows.map((r) => [r.module, r.can_access]).sort(),
    [['customers', true], ['reports', false], ['sales', true]].sort()
  );
});

// P0-2 — the concurrency regression test. Fires two genuinely concurrent
// requests (Promise.all, not sequential awaits) targeting two DIFFERENT
// Super Admins, each demoting/deleting the other. Before the fix, both
// could independently read "one other active Super Admin remains" before
// either write committed, and both would succeed — zeroing out every
// Super Admin (or, via DELETE, destroying every admin account entirely).
test('P0-2: concurrent cross-demote of the last two Super Admins never leaves zero', async (t) => {
  const a = await createAdmin({ isSuperAdmin: true });
  const b = await createAdmin({ isSuperAdmin: true });
  t.after(() => pool.query('DELETE FROM admins WHERE id = ANY($1)', [[a.id, b.id]]));

  const aToken = accessTokenFor(a, true);
  const bToken = accessTokenFor(b, true);

  const demote = (token, targetId) => fetch(`${baseUrl}/api/admin/admins/${targetId}/super-admin`, {
    method: 'PATCH', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ is_super_admin: false })
  }).then((r) => r.json());

  const [resultA, resultB] = await Promise.all([
    demote(aToken, b.id), // A demotes B
    demote(bToken, a.id)  // B demotes A, truly concurrent
  ]);

  const successes = [resultA, resultB].filter((r) => r.success === true).length;
  assert.equal(successes, 1, 'exactly one of the two concurrent demotes must succeed');

  const { rows } = await pool.query(
    'SELECT count(*)::int AS count FROM admins WHERE is_super_admin = true AND is_active = true AND id = ANY($1)',
    [[a.id, b.id]]
  );
  assert.equal(rows[0].count, 1, 'exactly one Super Admin must remain — never zero');
});

test('P0-2: concurrent cross-delete of the last two Super Admins never destroys both', async (t) => {
  const a = await createAdmin({ isSuperAdmin: true });
  const b = await createAdmin({ isSuperAdmin: true });
  t.after(() => pool.query('DELETE FROM admins WHERE id = ANY($1)', [[a.id, b.id]]));

  const aToken = accessTokenFor(a, true);
  const bToken = accessTokenFor(b, true);

  const del = (token, targetId) => fetch(`${baseUrl}/api/admin/admins/${targetId}`, {
    method: 'DELETE', headers: { authorization: `Bearer ${token}` }
  }).then((r) => r.json());

  const [resultA, resultB] = await Promise.all([
    del(aToken, b.id), // A deletes B
    del(bToken, a.id)  // B deletes A, truly concurrent
  ]);

  const successes = [resultA, resultB].filter((r) => r.success === true).length;
  assert.equal(successes, 1, 'exactly one of the two concurrent deletes must succeed');

  const { rows } = await pool.query('SELECT count(*)::int AS count FROM admins WHERE id = ANY($1)', [[a.id, b.id]]);
  assert.equal(rows[0].count, 1, 'exactly one admin account must remain — never zero, never both destroyed');
});
