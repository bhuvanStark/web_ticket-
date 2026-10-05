import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReportItems, MAX_REPORT_ITEMS, MAX_COMMENT_LENGTH, MAX_COMPANY_LENGTH } from '../services/salesDailyReportService.js';

const LEAD_A = '11111111-1111-4111-8111-111111111111';
const LEAD_B = '22222222-2222-4222-8222-222222222222';
const is400 = (err) => err.status === 400;

test('existing-lead and potential-lead lines are normalized', () => {
  assert.deepEqual(
    parseReportItems([
      { lead_id: LEAD_A, comment: '  Demo done ' },
      { is_potential: true, company: ' New Co ', comment: 'Cold call', lead_id: LEAD_B }
    ]),
    [
      { is_potential: false, lead_id: LEAD_A, company: null, comment: 'Demo done' },
      { is_potential: true, lead_id: null, company: 'New Co', comment: 'Cold call' }
    ]
  );
});

test('a report needs at least one line and has an upper limit', () => {
  assert.throws(() => parseReportItems([]), is400);
  assert.throws(() => parseReportItems(undefined), is400);
  const many = Array.from({ length: MAX_REPORT_ITEMS + 1 }, () => ({ is_potential: true, company: 'X', comment: 'y' }));
  assert.throws(() => parseReportItems(many), is400);
});

test('every line needs a comment', () => {
  assert.throws(() => parseReportItems([{ lead_id: LEAD_A, comment: '   ' }]), is400);
  assert.throws(() => parseReportItems([{ is_potential: true, company: 'X' }]), is400);
  assert.throws(() => parseReportItems([{ lead_id: LEAD_A, comment: 'x'.repeat(MAX_COMMENT_LENGTH + 1) }]), is400);
});

test('an existing-lead line needs a valid lead, at most once per report', () => {
  assert.throws(() => parseReportItems([{ comment: 'x' }]), is400);
  assert.throws(() => parseReportItems([{ lead_id: 'not-a-uuid', comment: 'x' }]), is400);
  assert.throws(() => parseReportItems([{ lead_id: LEAD_A, comment: 'x' }, { lead_id: LEAD_A, comment: 'y' }]), is400);
});

test('a potential lead needs a company name and never links to a lead', () => {
  assert.throws(() => parseReportItems([{ is_potential: true, company: '  ', comment: 'x' }]), is400);
  assert.throws(() => parseReportItems([{ is_potential: true, company: 'x'.repeat(MAX_COMPANY_LENGTH + 1), comment: 'x' }]), is400);
  assert.equal(parseReportItems([{ is_potential: true, company: 'Co', comment: 'x', lead_id: LEAD_A }])[0].lead_id, null);
});
