// Unit tests for the Sales audit fixes (pure functions only — the DB-backed
// rules are covered by integration-tests/leads-audit-fixes.test.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  companyKey, duplicateKey, keepsStageClock, stageTimer, parseCloseReason, LOST_REASONS,
  diffLeadEdit, cellText, parseLeadEdits, checkStatusTransition
} from '../services/leadService.js';

test('company matching ignores case, punctuation and common suffixes', () => {
  for (const name of ['Acme Pvt. Ltd.', 'ACME  pvt ltd', 'Acme Private Limited', 'acme', 'Acme (P) Ltd', 'Acme LLP', 'Acme Inc.']) {
    assert.equal(companyKey(name), 'acme', name);
  }
  assert.equal(duplicateKey('Acme Pvt. Ltd.', '+91 98765 43210'), duplicateKey('ACME', '09876543210'));
  assert.notEqual(companyKey('Acme Traders'), companyKey('Acme'));
});

test('a name made only of suffixes still has a key, and non-Latin names are kept', () => {
  assert.equal(companyKey('Ltd'), 'ltd');
  assert.equal(companyKey('  '), '');
  assert.equal(companyKey(null), '');
  assert.equal(companyKey('टाटा कंपनी'), 'टाटा कंपनी');
});

test('Follow-up and Hold share one stage clock; every other move restarts it', () => {
  assert.equal(keepsStageClock('follow_up', 'hold'), true);
  assert.equal(keepsStageClock('hold', 'follow_up'), true);
  for (const [from, to] of [['proposal', 'follow_up'], ['proposal', 'hold'], ['meeting', 'proposal'], ['hold', 'lost']]) {
    assert.equal(keepsStageClock(from, to), false, `${from} -> ${to}`);
  }
});

test('flipping Follow-up ↔ Hold can no longer create a fresh window', () => {
  // A Follow-up entered 12 days ago is overdue; keeping the clock, Hold
  // (20-day window) has 8 days left and Follow-up again is still overdue.
  const DAY = 24 * 60 * 60 * 1000;
  const now = Date.parse('2026-10-01T00:00:00Z');
  const clock = new Date(now - 12 * DAY).toISOString();
  assert.equal(stageTimer({ status: 'follow_up', status_changed_at: clock }, now).overdue, true);
  assert.equal(Math.round(stageTimer({ status: 'hold', status_changed_at: clock }, now).msRemaining / DAY), 8);
  assert.equal(stageTimer({ status: 'follow_up', status_changed_at: clock }, now).overdue, true);
});

test('a lead waiting on a Won request has no running timer', () => {
  assert.equal(stageTimer({ status: 'proposal', status_changed_at: '2020-01-01T00:00:00Z', won_requested_at: '2020-01-05T00:00:00Z' }), null);
});

test('Lost/Dead need a reason from the list; Other needs a note', () => {
  assert.throws(() => parseCloseReason(undefined), (err) => err.status === 400);
  assert.throws(() => parseCloseReason('bored'), (err) => err.status === 400);
  assert.throws(() => parseCloseReason('other', '   '), (err) => err.status === 400);
  assert.throws(() => parseCloseReason('price', 'x'.repeat(1001)), (err) => err.status === 400);
  assert.deepEqual(parseCloseReason('price', '  too costly '), { reason: 'price', note: 'too costly' });
  assert.deepEqual(parseCloseReason('no_response'), { reason: 'no_response', note: null });
  assert.ok(Object.hasOwn(LOST_REASONS, 'duplicate'));
});

test('Sales still cannot mark Dead or reopen closed leads', () => {
  assert.throws(() => checkStatusTransition('proposal', 'dead', 'sales'), (err) => err.status === 403);
  assert.throws(() => checkStatusTransition('lost', 'proposal', 'sales'), (err) => err.status === 403);
});

test('edit history records only the fields that changed, with old and new values', () => {
  const before = { company: 'Acme', email: null, value_estimate: '1000.00', remarks: 'a' };
  assert.deepEqual(diffLeadEdit(before, { company: 'Acme', email: 'x@y.com', value_estimate: 1000, remarks: 'b' }), {
    email: { from: null, to: 'x@y.com' }
  });
  assert.deepEqual(diffLeadEdit(before, { value_estimate: 2500 }), { value_estimate: { from: 1000, to: 2500 } });
  assert.deepEqual(diffLeadEdit(before, { value_estimate: null }), { value_estimate: { from: 1000, to: null } });
});

test('Excel cells are read as the text the sheet shows, never "[object Object]"', () => {
  assert.equal(cellText({ text: 'a@b.com', hyperlink: 'mailto:a@b.com' }), 'a@b.com');
  assert.equal(cellText({ richText: [{ text: 'Acme ' }, { font: { bold: true }, text: 'Corp' }] }), 'Acme Corp');
  assert.equal(cellText({ formula: 'A1&B1', result: 'Acme' }), 'Acme');
  assert.equal(cellText({ text: { richText: [{ text: 'nested' }] } }), 'nested');
  assert.equal(cellText(9876543210), '9876543210');
  assert.equal(cellText({ unknown: true }), '');
  assert.equal(cellText(null), '');
});

test('lead edits reject non-text contact/email/company instead of storing "[object Object]"', () => {
  assert.throws(() => parseLeadEdits({ email: { text: 'a@b.com' } }), (err) => err.status === 400);
  assert.throws(() => parseLeadEdits({ person_to_contact: 42 }), (err) => err.status === 400);
  assert.throws(() => parseLeadEdits({ company: { richText: [] } }), (err) => err.status === 400);
  assert.deepEqual(parseLeadEdits({ email: '  ', person_to_contact: ' Asha ' }), { email: null, person_to_contact: 'Asha' });
});
