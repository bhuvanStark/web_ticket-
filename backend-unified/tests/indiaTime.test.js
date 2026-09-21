import test from 'node:test';
import assert from 'node:assert/strict';
import { indiaDateKey, isValidDateKey } from '../utils/indiaTime.js';

test('indiaDateKey rolls the calendar day forward across the IST offset, ahead of UTC midnight', () => {
  // 2026-01-01 19:00 UTC = 2026-01-02 00:30 IST — already the next India day.
  const utcEveningBeforeIstMidnight = new Date('2026-01-01T19:00:00.000Z');
  assert.equal(indiaDateKey(utcEveningBeforeIstMidnight), '2026-01-02');
});

test('indiaDateKey stays on the same India day just before the IST rollover', () => {
  // 2026-01-01 18:00 UTC = 2026-01-01 23:30 IST — still the same India day.
  const utcEveningBeforeIstEnd = new Date('2026-01-01T18:00:00.000Z');
  assert.equal(indiaDateKey(utcEveningBeforeIstEnd), '2026-01-01');
});

test('isValidDateKey accepts YYYY-MM-DD and rejects everything else', () => {
  assert.equal(isValidDateKey('2026-09-21'), true);
  assert.equal(isValidDateKey('2026-13-40'), false); // shape matches, not a real date
  assert.equal(isValidDateKey('21-09-2026'), false);
  assert.equal(isValidDateKey(''), false);
  assert.equal(isValidDateKey(undefined), false);
  assert.equal(isValidDateKey(null), false);
});
