import test from 'node:test';
import assert from 'node:assert/strict';
import { missingWonFields, WON_REQUIRED_FIELDS, clearsWonField } from '../services/leadService.js';

const complete = {
  company: 'Acme', phone: '9876543210', person_to_contact: 'Asha', email: 'asha@example.com', value_estimate: 1000,
  ref_id: 'TTTPL/BLR/26-27/ACME/1'
};

test('a fully filled lead is ready to be Won', () => {
  assert.deepEqual(missingWonFields(complete), []);
  assert.deepEqual(missingWonFields({ ...complete, value_estimate: '0.50' }), []);
});

test('a value of ₹0 (numeric or string from pg) is not enough to be Won', () => {
  assert.deepEqual(missingWonFields({ ...complete, value_estimate: 0 }), ['Value Estimate (must be more than ₹0)']);
  assert.deepEqual(missingWonFields({ ...complete, value_estimate: '0.00' }), ['Value Estimate (must be more than ₹0)']);
});

test('a Won needs a Ref ID', () => {
  assert.deepEqual(missingWonFields({ ...complete, ref_id: '  ' }), ['Ref ID']);
});

test('missing, null, empty, and whitespace-only fields are reported in form order', () => {
  assert.deepEqual(
    missingWonFields({ ...complete, person_to_contact: '  ', email: null, value_estimate: undefined }),
    ['Person to Contact', 'Email', 'Value Estimate']
  );
  assert.deepEqual(missingWonFields({}), Object.values(WON_REQUIRED_FIELDS));
  assert.deepEqual(missingWonFields(null), Object.values(WON_REQUIRED_FIELDS));
});

test('an edit that blanks a Won field or zeroes the value is caught', () => {
  assert.equal(clearsWonField({ value_estimate: 0 }), true);
  assert.equal(clearsWonField({ ref_id: null }), true);
  assert.equal(clearsWonField({ email: '' }), true);
  assert.equal(clearsWonField({ value_estimate: 5, remarks: null, demand: null }), false);
});
