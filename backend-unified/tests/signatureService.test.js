import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ||= 'postgresql://unused:unused@localhost:5432/unused';
const {
  normalizeSignature,
  saveReportSignatures,
  getReportSignatures,
  purgeExpiredSignatures,
  MAX_SIGNATURE_PATH_LENGTH,
  SIGNATURE_RETENTION_YEARS
} = await import('../services/signatureService.js');

const fakeDb = (result = { rows: [], rowCount: 0 }) => {
  const calls = [];
  return { calls, async query(text, values) { calls.push({ text, values }); return result; } };
};

test('normalizeSignature accepts a well-formed path', () => {
  const sig = { path: 'M10 20L11 22L15 30M40 5L41 6', width: 500, height: 110 };
  assert.deepEqual(normalizeSignature(sig), sig);
});

test('normalizeSignature rejects markup, bad commands, size and dimensions', () => {
  const ok = { path: 'M1 2L3 4', width: 500, height: 110 };
  assert.equal(normalizeSignature(null), null);
  assert.equal(normalizeSignature({ ...ok, path: '' }), null);
  assert.equal(normalizeSignature({ ...ok, path: 'L1 2' }), null);
  assert.equal(normalizeSignature({ ...ok, path: 'M1 2"/><script>' }), null);
  assert.equal(normalizeSignature({ ...ok, path: 'M1 2C3 4 5 6 7 8' }), null);
  assert.equal(normalizeSignature({ ...ok, path: 'M-1 2' }), null);
  assert.equal(normalizeSignature({ ...ok, path: 'M' + '1'.repeat(MAX_SIGNATURE_PATH_LENGTH) }), null);
  assert.equal(normalizeSignature({ ...ok, width: 0 }), null);
  assert.equal(normalizeSignature({ ...ok, height: 1.5 }), null);
  assert.equal(normalizeSignature({ ...ok, width: '500' }), null);
});

test('saveReportSignatures keeps the first signature and skips invalid ones', async () => {
  const db = fakeDb();
  await saveReportSignatures('report-1', [
    { party: 'technician', signature: { path: 'M1 2L3 4', width: 500, height: 110 }, signerName: 'Tech', signedAt: 't' },
    { party: 'customer', signature: { path: '<svg>', width: 500, height: 110 }, signerName: 'Cust', signedAt: 't' },
    { party: 'customer', signature: null }
  ], db);
  assert.equal(db.calls.length, 1);
  assert.match(db.calls[0].text, /ON CONFLICT \(service_report_id, party\) DO NOTHING/);
  assert.deepEqual(db.calls[0].values, ['report-1', 'technician', 'M1 2L3 4', 500, 110, 'Tech', 't']);
});

test('getReportSignatures returns [] when the table does not exist yet', async () => {
  const db = { async query() { throw Object.assign(new Error('missing'), { code: '42P01' }); } };
  assert.deepEqual(await getReportSignatures('req-1', db), []);
});

test('purgeExpiredSignatures deletes by signed_at older than the retention window', async () => {
  const db = fakeDb({ rows: [], rowCount: 3 });
  assert.equal(await purgeExpiredSignatures(db), 3);
  assert.match(db.calls[0].text, /DELETE FROM service_report_signatures\s+WHERE signed_at < now\(\) - make_interval\(years => \$1\)/);
  assert.deepEqual(db.calls[0].values, [SIGNATURE_RETENTION_YEARS]);
  assert.equal(SIGNATURE_RETENTION_YEARS, 5);
});
