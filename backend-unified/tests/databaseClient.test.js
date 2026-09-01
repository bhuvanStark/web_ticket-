import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ||= 'postgresql://unused:unused@localhost:5432/unused';
const { PostgresQueryBuilder } = await import('../config/databaseClient.js');

test('selects are parameterized and exact count ignores pagination', async () => {
  const calls = [];
  const executor = {
    async query(text, values) {
      calls.push({ text, values });
      if (text.startsWith('SELECT COUNT')) return { rows: [{ count: 3 }] };
      return { rows: [{ id: 'request-1', status: 'assigned' }] };
    }
  };
  const result = await new PostgresQueryBuilder('service_requests', executor)
    .select('id, status', { count: 'exact' })
    .eq('customer_id', 'customer-1')
    .neq('status', 'closed')
    .order('created_at', { ascending: false })
    .range(10, 19);

  assert.equal(result.error, null);
  assert.equal(result.count, 3);
  assert.match(calls[1].text, /WHERE "customer_id" = \$1 AND "status" <> \$2/);
  assert.match(calls[1].text, /ORDER BY "created_at" DESC LIMIT \$3 OFFSET \$4/);
  assert.deepEqual(calls[1].values, ['customer-1', 'closed', 10, 10]);
});

test('insert values cannot alter SQL structure', async () => {
  const calls = [];
  const executor = {
    async query(text, values) {
      calls.push({ text, values });
      return { rows: [{ id: 'customer-1', name: values[0] }] };
    }
  };
  const hostileName = "Robert'); DROP TABLE customers;--";
  const result = await new PostgresQueryBuilder('customers', executor)
    .insert({ name: hostileName, company_name: 'Safe Co', email: 'safe@example.com' })
    .select()
    .single();

  assert.equal(result.error, null);
  assert.equal(calls[0].text.includes(hostileName), false);
  assert.equal(calls[0].values[0], hostileName);
});

test('nested API selections hydrate related PostgreSQL rows', async () => {
  const executor = {
    async query(text) {
      if (text.includes('FROM "service_requests"')) {
        return { rows: [{ id: 'request-1', customer_id: 'customer-1' }] };
      }
      if (text.includes('FROM "customers"')) {
        return { rows: [{ id: 'customer-1', name: 'Asha' }] };
      }
      throw new Error(`Unexpected query: ${text}`);
    }
  };
  const result = await new PostgresQueryBuilder('service_requests', executor)
    .select('id, customers(name)')
    .single();

  assert.equal(result.error, null);
  assert.equal(result.data.customers.name, 'Asha');
});
