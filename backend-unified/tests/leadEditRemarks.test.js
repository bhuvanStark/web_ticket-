import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLeadEdits, MAX_REMARKS_LENGTH } from '../services/leadService.js';

test('remarks are trimmed and included in the edit payload', () => {
  assert.deepEqual(parseLeadEdits({ remarks: '  call back Monday  ' }), { remarks: 'call back Monday' });
});

test('blank remarks are valid and clear the field', () => {
  assert.deepEqual(parseLeadEdits({ remarks: '' }), { remarks: null });
  assert.deepEqual(parseLeadEdits({ remarks: '   ' }), { remarks: null });
  assert.deepEqual(parseLeadEdits({ remarks: null }), { remarks: null });
});

test('omitted remarks leave the field unchanged', () => {
  assert.equal('remarks' in parseLeadEdits({ company: 'Acme' }), false);
});

test('remarks sit alongside the other editable fields', () => {
  assert.deepEqual(
    parseLeadEdits({ company: ' Acme ', phone: '9876543210', person_to_contact: '', email: '', value_estimate: 100, remarks: 'warm lead' }),
    { company: 'Acme', phone: '9876543210', person_to_contact: null, email: null, value_estimate: 100, remarks: 'warm lead' }
  );
});

test('invalid remarks are rejected with a 400', () => {
  assert.throws(() => parseLeadEdits({ remarks: 42 }), (err) => err.status === 400);
  assert.throws(() => parseLeadEdits({ remarks: 'x'.repeat(MAX_REMARKS_LENGTH + 1) }), (err) => err.status === 400);
});
