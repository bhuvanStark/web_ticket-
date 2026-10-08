import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRange, MAX_RANGE_DAYS } from '../services/techReportService.js';
import { indiaDateKey } from '../utils/indiaTime.js';

test('resolveRange defaults to the current India month up to today', () => {
  const today = indiaDateKey();
  assert.deepEqual(resolveRange(), { from: `${today.slice(0, 8)}01`, to: today, today });
});

test('resolveRange keeps an explicit range', () => {
  const r = resolveRange('2026-10-01', '2026-10-07');
  assert.equal(r.from, '2026-10-01');
  assert.equal(r.to, '2026-10-07');
});

test('resolveRange rejects bad, reversed and oversized ranges', () => {
  assert.throws(() => resolveRange('2026-02-30', '2026-03-01'), { code: 'INVALID_RANGE' });
  assert.throws(() => resolveRange('2026-10-08', '2026-10-01'), { code: 'INVALID_RANGE' });
  assert.throws(() => resolveRange('2025-01-01', '2026-12-31'), { code: 'INVALID_RANGE' });
  assert.ok(MAX_RANGE_DAYS >= 366);
});
