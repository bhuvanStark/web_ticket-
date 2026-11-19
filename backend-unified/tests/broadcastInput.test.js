import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBroadcastInput } from '../services/broadcastService.js';

const valid = (overrides = {}) => ({
  tone: 'nudge',
  emoji: '📍',
  headline: 'Turn on location when you check in',
  highlight: 'location',
  message: 'Tap Allow when your phone asks.',
  steps: ['Tap Check In', 'Tap Allow'],
  audience: 'everyone',
  ...overrides
});

const rejects = (body, pattern) => assert.throws(() => normalizeBroadcastInput(body), (err) => {
  assert.equal(err.status, 400);
  assert.match(err.message, pattern);
  return true;
});

test('accepts a complete broadcast and trims text', () => {
  const out = normalizeBroadcastInput(valid({ headline: '  Turn on location  ', steps: [' Tap Check In ', '', '  '] }));
  assert.equal(out.headline, 'Turn on location');
  assert.deepEqual(out.steps, ['Tap Check In']);
  assert.deepEqual(out.recipients, []);
});

test('highlight must come from the headline, ignoring case', () => {
  assert.equal(normalizeBroadcastInput(valid({ highlight: 'LOCATION' })).highlight, 'LOCATION');
  rejects(valid({ highlight: 'projects' }), /from the headline/);
});

test('empty highlight is stored as null', () => {
  assert.equal(normalizeBroadcastInput(valid({ highlight: '   ' })).highlight, null);
});

test('rejects unknown tone, missing text and too many steps', () => {
  rejects(valid({ tone: 'party' }), /tone/);
  rejects(valid({ headline: '   ' }), /Headline/);
  rejects(valid({ message: '' }), /Message/);
  rejects(valid({ steps: ['a', 'b', 'c', 'd'] }), /at most 3/);
  rejects(valid({ steps: 'Tap Check In' }), /list/);
});

test('custom audience needs people and drops duplicates', () => {
  rejects(valid({ audience: 'custom', recipients: [] }), /at least one/);
  rejects(valid({ audience: 'custom', recipients: [{ employee_type: 'admin', employee_id: 'x' }] }), /Invalid recipient/);
  const out = normalizeBroadcastInput(valid({
    audience: 'custom',
    recipients: [
      { employee_type: 'sales', employee_id: 'a' },
      { employee_type: 'sales', employee_id: 'a' },
      { employee_type: 'technician', employee_id: 'a' }
    ]
  }));
  assert.equal(out.recipients.length, 2);
});

test('everyone ignores any recipients sent along', () => {
  const out = normalizeBroadcastInput(valid({ recipients: [{ employee_type: 'sales', employee_id: 'a' }] }));
  assert.deepEqual(out.recipients, []);
});
