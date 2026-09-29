import test from 'node:test';
import assert from 'node:assert/strict';
import { parseValueEstimate, MAX_VALUE_ESTIMATE } from '../services/leadService.js';

test('blank value estimates mean "no estimate"', () => {
  for (const raw of [undefined, null, '', '   ']) {
    assert.deepEqual(parseValueEstimate(raw), { value: null }, JSON.stringify(raw));
  }
});

test('valid numbers and forgiving numeric strings are accepted', () => {
  assert.deepEqual(parseValueEstimate(0), { value: 0 });
  assert.deepEqual(parseValueEstimate(1234.5), { value: 1234.5 });
  assert.deepEqual(parseValueEstimate('500000'), { value: 500000 });
  assert.deepEqual(parseValueEstimate('₹5,00,000'), { value: 500000 });
  assert.deepEqual(parseValueEstimate(' 12,345.67 '), { value: 12345.67 });
  assert.deepEqual(parseValueEstimate(MAX_VALUE_ESTIMATE), { value: MAX_VALUE_ESTIMATE });
});

test('NaN, non-numeric, negative, and oversized values are rejected', () => {
  const rejected = [
    NaN, Infinity, -Infinity, -1, -0.01, MAX_VALUE_ESTIMATE + 1, 1e15,
    'abc', 'approx 5L', 'NaN', 'Infinity', '-500', '1e5', '5L', '12.3.4',
    true, {}, [], { result: 5 }
  ];
  for (const raw of rejected) {
    const result = parseValueEstimate(raw);
    assert.ok(result.error, `expected ${String(raw)} to be rejected`);
    assert.equal(result.value, undefined);
  }
});
