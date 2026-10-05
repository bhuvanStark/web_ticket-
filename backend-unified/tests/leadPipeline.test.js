import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STAGE_DAYS, STAGE_TRANSITIONS, PROPOSAL_STAGES, REF_ID_TEMPLATE, MAX_REF_ID_LENGTH, MAX_DEMAND_LENGTH,
  stageTimer, stageDeadlineSql, checkStatusTransition, parseRefId, isRefIdTemplate, parseDemand,
  missingProposalFields, parseLeadEdits, clearsProposalField, rankLeaderboard
} from '../services/leadService.js';

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.parse('2026-10-01T00:00:00Z');
const at = (status, daysAgo) => ({ status, status_changed_at: new Date(T0 - daysAgo * DAY).toISOString() });

// ---- Stage windows ----

test('stage windows match the agreed pipeline', () => {
  assert.deepEqual(STAGE_DAYS, { new: 10, meeting: 7, proposal: 10, follow_up: 10, hold: 20 });
});

test('timer counts down from when the lead entered its status', () => {
  const t = stageTimer(at('meeting', 2), T0);
  assert.equal(t.days, 7);
  assert.equal(t.msRemaining, 5 * DAY);
  assert.equal(t.overdue, false);
  assert.equal(t.deadline, new Date(T0 + 5 * DAY).toISOString());
});

test('each active stage uses its own window', () => {
  for (const [status, days] of Object.entries(STAGE_DAYS)) {
    assert.equal(stageTimer(at(status, 0), T0).msRemaining, days * DAY, status);
  }
});

test('a lead past its window is overdue (and stays where it is — no auto-release)', () => {
  const t = stageTimer(at('new', 12), T0);
  assert.equal(t.overdue, true);
  assert.equal(t.msRemaining, -2 * DAY);
  assert.equal(stageTimer(at('hold', 20), T0).overdue, true, 'exactly at the deadline counts as overdue');
  assert.equal(stageTimer(at('hold', 19.9), T0).overdue, false);
});

test('closed leads have no timer', () => {
  for (const status of ['won', 'lost', 'dead']) assert.equal(stageTimer(at(status, 1), T0), null);
  assert.equal(stageTimer(null), null);
});

test('the SQL deadline is generated from the same stage windows', () => {
  const sql = stageDeadlineSql('l');
  for (const [status, days] of Object.entries(STAGE_DAYS)) assert.match(sql, new RegExp(`WHEN '${status}' THEN ${days}\\b`));
  assert.match(sql, /l\.status_changed_at/);
  assert.match(stageDeadlineSql(), /^\(status_changed_at/);
});

// ---- Transitions ----

test('salespeople follow the pipeline forward, with Follow-up and Hold interchangeable', () => {
  const ok = [
    ['new', 'meeting'], ['meeting', 'proposal'], ['proposal', 'follow_up'], ['proposal', 'hold'],
    ['follow_up', 'hold'], ['hold', 'follow_up']
  ];
  for (const [from, to] of ok) assert.doesNotThrow(() => checkStatusTransition(from, to, 'sales'), `${from} -> ${to}`);
});

test('Lost is reachable from every active stage; Won only from Proposal onwards', () => {
  for (const from of Object.keys(STAGE_TRANSITIONS)) {
    assert.doesNotThrow(() => checkStatusTransition(from, 'lost', 'sales'));
  }
  for (const from of PROPOSAL_STAGES) assert.doesNotThrow(() => checkStatusTransition(from, 'won', 'sales'));
  for (const from of ['new', 'meeting']) {
    assert.throws(() => checkStatusTransition(from, 'won', 'sales'), (err) => err.status === 400, `${from} -> won`);
  }
});

test('salespeople cannot skip stages or go backwards', () => {
  const bad = [
    ['new', 'proposal'], ['new', 'follow_up'], ['new', 'hold'], ['meeting', 'new'], ['meeting', 'hold'],
    ['proposal', 'meeting'], ['follow_up', 'proposal'], ['hold', 'new']
  ];
  for (const [from, to] of bad) {
    assert.throws(() => checkStatusTransition(from, to, 'sales'), (err) => err.status === 400, `${from} -> ${to}`);
  }
});

test('Dead is Admin-only and closed leads are locked for Sales', () => {
  assert.throws(() => checkStatusTransition('meeting', 'dead', 'sales'), (err) => err.status === 403);
  assert.throws(() => checkStatusTransition('lost', 'new', 'sales'), (err) => err.status === 403);
  assert.throws(() => checkStatusTransition('dead', 'meeting', 'sales'), (err) => err.status === 403);
});

test('Admin may correct any status, but Won is final for everyone', () => {
  assert.doesNotThrow(() => checkStatusTransition('proposal', 'new', 'admin'));
  assert.doesNotThrow(() => checkStatusTransition('lost', 'hold', 'admin'));
  assert.doesNotThrow(() => checkStatusTransition('new', 'dead', 'admin'));
  assert.throws(() => checkStatusTransition('won', 'lost', 'admin'), (err) => err.status === 409);
  assert.throws(() => checkStatusTransition('won', 'new', 'sales'), (err) => err.status === 409);
});

// ---- Proposal requirements ----

test('Proposal onwards needs both a value estimate and a Ref ID', () => {
  assert.deepEqual(PROPOSAL_STAGES, ['proposal', 'follow_up', 'hold']);
  assert.deepEqual(missingProposalFields({}), ['Value Estimate', 'Ref ID']);
  assert.deepEqual(missingProposalFields({ value_estimate: 0, ref_id: '  ' }), ['Ref ID']);
  assert.deepEqual(missingProposalFields({ value_estimate: '0.00', ref_id: 'TTTPL/BLR/1' }), []);
  assert.deepEqual(missingProposalFields({ value_estimate: null, ref_id: 'X' }), ['Value Estimate']);
});

test('Ref ID is free text, trimmed, blank means none', () => {
  assert.equal(parseRefId('  TTTPL / BLR / 26-27 / ACME / CN / 2026-10-03 / A '), 'TTTPL / BLR / 26-27 / ACME / CN / 2026-10-03 / A');
  assert.equal(parseRefId('anything goes 123'), 'anything goes 123');
  assert.equal(parseRefId(''), null);
  assert.equal(parseRefId('   '), null);
  assert.equal(parseRefId(null), null);
});

test('the unchanged example Ref ID is rejected, ignoring case and spacing', () => {
  assert.equal(isRefIdTemplate(REF_ID_TEMPLATE), true);
  assert.equal(isRefIdTemplate('tttpl/blr/26-27/bal/cn/2026-02-10/a'), true);
  assert.equal(isRefIdTemplate('TTTPL / BLR / 26-27 / BAL / CN / 2026-02-10 / B'), false);
  assert.throws(() => parseRefId(REF_ID_TEMPLATE), (err) => err.status === 400);
  assert.throws(() => parseRefId(`  ${REF_ID_TEMPLATE.toLowerCase()}  `), (err) => err.status === 400);
});

test('invalid Ref ID input is rejected', () => {
  assert.throws(() => parseRefId(12345), (err) => err.status === 400);
  assert.throws(() => parseRefId('x'.repeat(MAX_REF_ID_LENGTH + 1)), (err) => err.status === 400);
  assert.doesNotThrow(() => parseRefId('x'.repeat(MAX_REF_ID_LENGTH)));
});

// ---- Demand + edits ----

test('Demand is optional free text', () => {
  assert.equal(parseDemand('  20 VC rooms  '), '20 VC rooms');
  assert.equal(parseDemand(''), null);
  assert.equal(parseDemand(undefined), null);
  assert.throws(() => parseDemand(['x']), (err) => err.status === 400);
  assert.throws(() => parseDemand('x'.repeat(MAX_DEMAND_LENGTH + 1)), (err) => err.status === 400);
});

test('edits carry Ref ID and Demand, and reject the example Ref ID', () => {
  assert.deepEqual(parseLeadEdits({ ref_id: ' REF-9 ', demand: ' 3 rooms ' }), { ref_id: 'REF-9', demand: '3 rooms' });
  assert.deepEqual(parseLeadEdits({ ref_id: '', demand: '' }), { ref_id: null, demand: null });
  assert.equal('ref_id' in parseLeadEdits({ company: 'Acme' }), false);
  assert.throws(() => parseLeadEdits({ ref_id: REF_ID_TEMPLATE }), (err) => err.status === 400);
});

test('an edit that blanks value or Ref ID is flagged for the Proposal-stage guard', () => {
  assert.equal(clearsProposalField(parseLeadEdits({ ref_id: '' })), true);
  assert.equal(clearsProposalField(parseLeadEdits({ value_estimate: '' })), true);
  assert.equal(clearsProposalField(parseLeadEdits({ value_estimate: 5, ref_id: 'R1' })), false);
  assert.equal(clearsProposalField(parseLeadEdits({ demand: '' })), false);
});

// ---- Leaderboard ----

test('leaderboard ranks by Won count only; ties share a rank and sort by name', () => {
  const ranked = rankLeaderboard([
    { name: 'Zed', wonCount: 2, lostCount: 0 },
    { name: 'Asha', wonCount: 5, lostCount: 9 },
    { name: 'Bala', wonCount: 2, lostCount: 0 },
    { name: 'Chen', wonCount: 0, lostCount: 0 }
  ]);
  assert.deepEqual(ranked.map((r) => [r.name, r.rank]), [['Asha', 1], ['Bala', 2], ['Zed', 2], ['Chen', 4]]);
});

test('value and conversion never affect the ranking', () => {
  const ranked = rankLeaderboard([
    { name: 'High value', wonCount: 1, wonValue: 1e9, conversionRate: 1 },
    { name: 'More wins', wonCount: 3, wonValue: 10, conversionRate: 0.1 }
  ]);
  assert.equal(ranked[0].name, 'More wins');
});
