import test from 'node:test';
import assert from 'node:assert/strict';
import {
  companyKey, duplicateKey, isAssignable, assignBlockReason, parseFollowUpDate, MAX_FOLLOW_UP_DAYS,
  EXPIRY_ACTIONS, resolveExpiredLead
} from '../services/leadService.js';

// ---- Duplicates: Company + Phone ----

test('company is compared trimmed, single-spaced and case-insensitive', () => {
  assert.equal(companyKey('  Acme   Corp '), 'acme corp');
  assert.equal(companyKey('ACME corp'), companyKey('acme Corp'));
  assert.equal(companyKey(null), '');
});

test('duplicate key = company + normalized phone', () => {
  assert.equal(duplicateKey('Acme Corp', '9876543210'), duplicateKey(' acme  corp', '+91 98765 43210'));
  assert.equal(duplicateKey('Acme Corp', '9876543210'), duplicateKey('Acme Corp', '09876543210'));
});

test('same phone with a different company is not a duplicate', () => {
  assert.notEqual(duplicateKey('Acme Corp', '9876543210'), duplicateKey('Acme Ltd', '9876543210'));
});

test('same company with a different phone is not a duplicate', () => {
  assert.notEqual(duplicateKey('Acme', '9876543210'), duplicateKey('Acme', '9876543211'));
});

// ---- Assignment: New or Unassigned only ----

const lead = (status, assigned_to = null, extra = {}) => ({ status, assigned_to, ...extra });

test('unassigned active leads and New leads can be assigned', () => {
  assert.equal(isAssignable(lead('new')), true);
  assert.equal(isAssignable(lead('new', 'S1')), true, 'reassigning a New lead');
  assert.equal(isAssignable(lead('meeting')), true, 'unassigned after a deactivation');
  assert.equal(assignBlockReason(lead('new', 'S1')), null);
});

test('a lead further along the pipeline stays with its salesperson', () => {
  for (const status of ['meeting', 'proposal', 'follow_up', 'hold']) {
    assert.equal(isAssignable(lead(status, 'S1')), false, status);
    assert.match(assignBlockReason(lead(status, 'S1')), /release it first/);
  }
});

test('Won, Lost, Dead and archived leads are never assignable', () => {
  assert.match(assignBlockReason(lead('won', 'S1')), /Won/);
  assert.match(assignBlockReason(lead('lost', 'S1')), /Lost — change its status/);
  assert.match(assignBlockReason(lead('dead')), /Dead — change its status/);
  assert.match(assignBlockReason(lead('new', null, { archived_at: '2026-01-01' })), /archived/);
  for (const status of ['won', 'lost', 'dead']) assert.equal(isAssignable(lead(status)), false);
});

// ---- Next follow-up date ----

const TODAY = '2026-10-03';

test('follow-up date: today or later, within 12 months', () => {
  assert.equal(parseFollowUpDate('2026-10-03', TODAY), '2026-10-03');
  assert.equal(parseFollowUpDate('2026-12-31', TODAY), '2026-12-31');
  assert.equal(MAX_FOLLOW_UP_DAYS, 365);
  assert.equal(parseFollowUpDate('2027-10-03', TODAY), '2027-10-03');
  assert.throws(() => parseFollowUpDate('2027-10-04', TODAY), (e) => e.status === 400);
});

test('follow-up date cannot be in the past or malformed', () => {
  assert.throws(() => parseFollowUpDate('2026-10-02', TODAY), /past/);
  assert.throws(() => parseFollowUpDate('2026-02-30', TODAY), (e) => e.status === 400);
  assert.throws(() => parseFollowUpDate('03-10-2026', TODAY), (e) => e.status === 400);
});

test('follow-up date: undefined leaves it unchanged, blank clears it', () => {
  assert.equal(parseFollowUpDate(undefined, TODAY), undefined);
  assert.equal(parseFollowUpDate(null, TODAY), null);
  assert.equal(parseFollowUpDate('', TODAY), null);
});

// ---- Expired-stage decisions ----

test('expiry actions are ignore / restart / reassign', async () => {
  assert.deepEqual(EXPIRY_ACTIONS, ['ignore', 'restart', 'reassign']);
  await assert.rejects(resolveExpiredLead('00000000-0000-4000-8000-000000000000', { action: 'delete' }, { type: 'admin' }), (e) => e.status === 400);
});
