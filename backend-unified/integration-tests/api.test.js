import test from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET ||= 'integration-access-secret-change-me';
process.env.JWT_REFRESH_SECRET ||= 'integration-refresh-secret-change-me';

const { default: app } = await import('../server.js');
const { pool, closeDatabase } = await import('../config/database.js');
const { generateToken } = await import('../middleware/auth.js');

test('customer request lifecycle uses PostgreSQL through the HTTP API', async (t) => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const customer = (await pool.query(
    'INSERT INTO customers(name, company_name, email) VALUES ($1, $2, $3) RETURNING id',
    ['Integration User', 'Integration Co', `integration-${suffix}@example.com`]
  )).rows[0];
  const location = (await pool.query(
    'INSERT INTO locations(customer_id, name, city) VALUES ($1, $2, $3) RETURNING id',
    [customer.id, `Integration Office ${suffix}`, 'Bengaluru']
  )).rows[0];
  const room = (await pool.query(
    'INSERT INTO rooms(location_id, name, room_type) VALUES ($1, $2, $3) RETURNING id',
    [location.id, `Integration Room ${suffix}`, 'Meeting Room']
  )).rows[0];

  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const authorization = `Bearer ${generateToken(customer.id, 'customer')}`;

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await pool.query('DELETE FROM service_requests WHERE customer_id = $1', [customer.id]);
    await pool.query('DELETE FROM rooms WHERE id = $1', [room.id]);
    await pool.query('DELETE FROM locations WHERE id = $1', [location.id]);
    await pool.query('DELETE FROM customers WHERE id = $1', [customer.id]);
    await closeDatabase();
  });

  const health = await fetch(`${baseUrl}/health`).then((response) => response.json());
  assert.equal(health.status, 'OK');
  assert.equal(health.database.status, 'up');

  const unauthorized = await fetch(`${baseUrl}/api/service-requests`);
  assert.equal(unauthorized.status, 401);

  const createResponse = await fetch(`${baseUrl}/api/service-requests`, {
    method: 'POST',
    headers: { authorization, 'content-type': 'application/json' },
    body: JSON.stringify({
      customer_id: customer.id,
      location_id: location.id,
      room_id: room.id,
      issue_category: 'Display',
      issue_title: 'PostgreSQL integration test',
      issue_description: 'Created through the real API',
      service_type: 'onsite_service',
      priority: 'high'
    })
  });
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();
  assert.match(created.data.ticket_number, /^TT-\d{6}-\d{3}$/);

  const listResponse = await fetch(`${baseUrl}/api/service-requests?customerId=${customer.id}`, { headers: { authorization } });
  assert.equal(listResponse.status, 200);
  const list = await listResponse.json();
  assert.equal(list.data.length, 1);
  assert.equal(list.data[0].customers.company_name, 'Integration Co');
  assert.equal(list.data[0].rooms.name, `Integration Room ${suffix}`);

  const notifications = await pool.query('SELECT count(*)::integer AS count FROM notifications WHERE customer_id = $1', [customer.id]);
  assert.equal(notifications.rows[0].count, 1);
});
