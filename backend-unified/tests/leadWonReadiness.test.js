import test from 'node:test';
import assert from 'node:assert/strict';
import { missingWonFields, WON_REQUIRED_FIELDS } from '../services/leadService.js';

const complete = {
  company: 'Acme', phone: '9876543210', person_to_contact: 'Asha', email: 'asha@example.com', value_estimate: 1000
};

test('a fully filled lead is ready to be Won', () => {
  assert.deepEqual(missingWonFields(complete), []);
});

test('a value of 0 counts as filled (numeric or string from pg)', () => {
  assert.deepEqual(missingWonFields({ ...complete, value_estimate: 0 }), []);
  assert.deepEqual(missingWonFields({ ...complete, value_estimate: '0.00' }), []);
});

test('missing, null, empty, and whitespace-only fields are reported in form order', () => {
  assert.deepEqual(
    missingWonFields({ ...complete, person_to_contact: '  ', email: null, value_estimate: undefined }),
    ['Person to Contact', 'Email', 'Value Estimate']
  );
  assert.deepEqual(missingWonFields({}), Object.values(WON_REQUIRED_FIELDS));
  assert.deepEqual(missingWonFields(null), Object.values(WON_REQUIRED_FIELDS));
});
