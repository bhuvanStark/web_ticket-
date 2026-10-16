// Regression tests for customer ticket ownership on the sign-off and report
// endpoints: PATCH /:id/complete and GET /:id/report (plus the signatures
// read). Customer B must never modify or read customer A's ticket/report;
// Sales/Back-Office are blocked outright; technician/admin access is unchanged. Same pattern as api.test.js: real
// HTTP server, real PostgreSQL, no mocks.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET ||= 'integration-access-secret-change-me';
process.env.JWT_REFRESH_SECRET ||= 'integration-refresh-secret-change-me';

const { default: app } = await import('../server.js');
// See integration-tests/api.test.js's import comment: the shared pool is
// never closed by an individual file.
const { pool } = await import('../config/database.js');
const { generateToken } = await import('../middleware/auth.js');

let server;
let baseUrl;
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const ids = {};
const tokens = {};

const SIGNATURE = { path: 'M10 50L60 20L110 80L160 30', width: 500, height: 110 };

async function call(method, path, token, body) {
  const response = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await response.json().catch(() => null);
  return { status: response.status, json };
}

async function createTicket(title) {
  const res = await call('POST', '/service-requests', tokens.customerA, {
    customer_id: ids.customerA,
    location_id: ids.locationA,
    support_category: 'epabx',
    issue_category: 'Hardware',
    issue_title: title,
    issue_description: 'Ownership regression test',
    service_type: 'onsite_service',
    priority: 'low'
  });
  assert.equal(res.status, 201, `ticket create failed: ${JSON.stringify(res.json)}`);
  return res.json.data.id;
}

// Technician files the report on A's ticket, with customer present + both drawings.
async function fileReport(ticketId) {
  const res = await call('POST', `/service-requests/${ticketId}/report`, tokens.technician, {
    system: 'PBX',
    work_done: 'Replaced line card',
    tech_signer_name: 'Ownership Tech',
    customer_signer_details: 'Customer A Person - 9000000000',
    customer_present: true,
    tech_signature: SIGNATURE,
    customer_signature: SIGNATURE
  });
  assert.equal(res.status, 201, `report submit failed: ${JSON.stringify(res.json)}`);
}

const ticketState = async (ticketId) => (await pool.query(
  `SELECT sr.status, sr.rating, sr.feedback_notes, sr.actual_completion_date,
          rep.customer_signed, rep.customer_signer_name, rep.customer_signed_at,
          (SELECT count(*)::int FROM service_updates su WHERE su.service_request_id = sr.id) AS updates,
          (SELECT count(*)::int FROM service_report_signatures s WHERE s.service_report_id = rep.id) AS signatures
     FROM service_requests sr
     LEFT JOIN service_reports rep ON rep.service_request_id = sr.id
    WHERE sr.id = $1`, [ticketId])).rows[0];

test.before(async () => {
  const customer = (name) => pool.query(
    'INSERT INTO customers(name, company_name, email) VALUES ($1, $2, $3) RETURNING id',
    [`Ownership ${name}`, `Ownership ${name} Co`, `ownership-${name}-${suffix}@example.com`]
  ).then((r) => r.rows[0].id);
  ids.customerA = await customer('a');
  ids.customerB = await customer('b');
  ids.locationA = (await pool.query(
    'INSERT INTO locations(customer_id, name, city) VALUES ($1, $2, $3) RETURNING id',
    [ids.customerA, `Ownership Office ${suffix}`, 'Chennai']
  )).rows[0].id;
  ids.technician = (await pool.query(
    'INSERT INTO technicians(full_name, email) VALUES ($1, $2) RETURNING id',
    ['Ownership Tech', `ownership-tech-${suffix}@example.com`]
  )).rows[0].id;
  ids.admin = (await pool.query(
    `INSERT INTO admins(email, password_hash, full_name) VALUES ($1, 'x', 'Ownership Admin') RETURNING id, token_version`,
    [`ownership-admin-${suffix}@example.com`]
  )).rows[0];

  tokens.customerA = generateToken(ids.customerA, 'customer');
  tokens.customerB = generateToken(ids.customerB, 'customer');
  tokens.technician = generateToken(ids.technician, 'technician');
  tokens.admin = generateToken(ids.admin.id, 'admin', { tokenVersion: ids.admin.token_version });

  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.query('DELETE FROM service_requests WHERE customer_id = ANY($1)', [[ids.customerA, ids.customerB]]);
  await pool.query('DELETE FROM customers WHERE id = ANY($1)', [[ids.customerA, ids.customerB]]);
  await pool.query('DELETE FROM technicians WHERE id = $1', [ids.technician]);
  await pool.query('DELETE FROM admins WHERE id = $1', [ids.admin.id]);
});

test('customer B cannot complete/sign customer A\'s ticket — nothing changes', async () => {
  const ticketId = await createTicket(`Ownership complete ${suffix}`);
  await fileReport(ticketId);
  const before = await ticketState(ticketId);

  const res = await call('PATCH', `/service-requests/${ticketId}/complete`, tokens.customerB, {
    customer_signer_name: 'Intruder',
    rating: 1,
    feedback_notes: 'not mine',
    customer_signature: { path: 'M1 1L2 2', width: 500, height: 110 }
  });
  assert.equal(res.status, 404);
  assert.equal(res.json?.data, undefined, 'no ticket data is returned');

  const after = await ticketState(ticketId);
  assert.deepEqual(after, before, 'status, rating, feedback, signer, timeline and signatures are untouched');
  assert.notEqual(after.customer_signer_name, 'Intruder');
  assert.notEqual(after.status, 'resolved');
});

test('customer B cannot read customer A\'s report or its signatures', async () => {
  const ticketId = await createTicket(`Ownership read ${suffix}`);
  await fileReport(ticketId);

  const report = await call('GET', `/service-requests/${ticketId}/report`, tokens.customerB);
  assert.equal(report.status, 404);
  assert.equal(report.json?.data, undefined);
  assert.doesNotMatch(JSON.stringify(report.json), /Replaced line card|Customer A Person/);

  const signatures = await call('GET', `/service-requests/${ticketId}/report/signatures`, tokens.customerB);
  assert.equal(signatures.status, 404);
  assert.doesNotMatch(JSON.stringify(signatures.json), /path_data/);
});

test('a customer gets the same 404 for a ticket id that does not exist', async () => {
  const missing = '00000000-0000-4000-8000-000000000000';
  assert.equal((await call('GET', `/service-requests/${missing}/report`, tokens.customerB)).status, 404);
  assert.equal((await call('PATCH', `/service-requests/${missing}/complete`, tokens.customerB, {})).status, 404);
});

test('customer A can still read and sign off its own ticket', async () => {
  const ticketId = await createTicket(`Ownership own ${suffix}`);
  await fileReport(ticketId);

  const report = await call('GET', `/service-requests/${ticketId}/report`, tokens.customerA);
  assert.equal(report.status, 200);
  assert.equal(report.json.data.work_done, 'Replaced line card');

  const signatures = await call('GET', `/service-requests/${ticketId}/report/signatures`, tokens.customerA);
  assert.equal(signatures.status, 200);
  assert.equal(signatures.json.data.length, 2);

  const complete = await call('PATCH', `/service-requests/${ticketId}/complete`, tokens.customerA, {
    customer_signer_name: 'Customer A Person',
    rating: 5
  });
  assert.equal(complete.status, 200);
  const after = await ticketState(ticketId);
  assert.equal(after.status, 'resolved');
  assert.equal(after.rating, 5);
  assert.equal(after.customer_signer_name, 'Customer A Person');
});

test('technician and admin keep access to any customer\'s report and sign-off', async () => {
  const ticketId = await createTicket(`Ownership staff ${suffix}`);
  await fileReport(ticketId);

  for (const role of ['technician', 'admin']) {
    const report = await call('GET', `/service-requests/${ticketId}/report`, tokens[role]);
    assert.equal(report.status, 200, `${role} reads the report`);
    assert.equal(report.json.data.work_done, 'Replaced line card');
    const signatures = await call('GET', `/service-requests/${ticketId}/report/signatures`, tokens[role]);
    assert.equal(signatures.status, 200, `${role} reads the signatures`);
  }

  const complete = await call('PATCH', `/service-requests/${ticketId}/complete`, tokens.admin, { customer_signer_name: 'Signed via admin' });
  assert.equal(complete.status, 200);
  assert.equal((await ticketState(ticketId)).status, 'resolved');
});

test('Sales and Back-Office are blocked from every service-report operation', async () => {
  const ticketId = await createTicket(`Ownership staff-roles ${suffix}`);
  await fileReport(ticketId);
  const before = await ticketState(ticketId);

  // rejectRoles only decodes the JWT, so no Sales/Back-Office row is needed.
  for (const role of ['sales', 'back_office']) {
    const token = generateToken(ids.customerA, role);
    const attempts = [
      ['GET', `/service-requests/${ticketId}/report`],
      ['GET', `/service-requests/${ticketId}/report/signatures`],
      ['POST', `/service-requests/${ticketId}/report`, { work_done: 'x', customer_signer_details: 'x - 1', tech_signature: SIGNATURE }],
      ['PATCH', `/service-requests/${ticketId}/complete`, { customer_signer_name: role, rating: 1, customer_signature: SIGNATURE }]
    ];
    for (const [method, path, body] of attempts) {
      const res = await call(method, path, token, body);
      assert.equal(res.status, 403, `${role} ${method} ${path}`);
      assert.doesNotMatch(JSON.stringify(res.json), /Replaced line card|path_data/);
    }
  }

  assert.deepEqual(await ticketState(ticketId), before, 'nothing was changed');
});

test('creating a ticket with an unsupported service_type is rejected', async () => {
  const before = (await pool.query('SELECT count(*)::int AS n FROM service_requests WHERE customer_id = $1', [ids.customerA])).rows[0].n;
  const res = await call('POST', '/service-requests', tokens.customerA, {
    customer_id: ids.customerA,
    location_id: ids.locationA,
    support_category: 'epabx',
    issue_category: 'Hardware',
    issue_title: `Bad service type ${suffix}`,
    issue_description: 'Should be rejected',
    service_type: 'On-site',
    priority: 'low'
  });
  assert.equal(res.status, 400);
  assert.ok(res.json.details.some((d) => d.includes('service_type must be one of')));
  const after = (await pool.query('SELECT count(*)::int AS n FROM service_requests WHERE customer_id = $1', [ids.customerA])).rows[0].n;
  assert.equal(after, before, 'no ticket was created');
});
