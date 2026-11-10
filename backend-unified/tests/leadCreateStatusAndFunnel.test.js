import test from 'node:test';
import assert from 'node:assert/strict';
import { CREATE_STATUSES, checkCreateStatus, parseFunnelEdits, parseLeadEdits, MAX_FUNNEL_REMARK_LENGTH } from '../services/leadService.js';

const status400 = (fn, re) => assert.throws(fn, (err) => err.status === 400 && (!re || re.test(err.message)));
const status403 = (fn) => assert.throws(fn, (err) => err.status === 403);

const base = { company: 'Acme', phone: '9876543210' };
const full = { ...base, person_to_contact: 'Asha', email: 'a@acme.in', value_estimate: 50000, ref_id: 'TTTPL/BLR/1' };

// ---- Create at a chosen stage ----

test('a new lead defaults to New with nothing else required', () => {
  for (const raw of [undefined, null, '']) {
    assert.deepEqual(checkCreateStatus(raw, 'sales', base), {
      status: 'new', ref_id: null, lost_reason: null, lost_note: null, next_follow_up_date: null
    });
  }
});

test('Won and Dead are Admin-only at creation', () => {
  assert.ok(!CREATE_STATUSES.sales.includes('won'));
  assert.ok(!CREATE_STATUSES.sales.includes('dead'));
  status403(() => checkCreateStatus('won', 'sales', full));
  status403(() => checkCreateStatus('dead', 'sales', { ...base, lost_reason: 'price' }));
  assert.equal(checkCreateStatus('won', 'admin', full).status, 'won');
  assert.equal(checkCreateStatus('dead', 'admin', { ...base, lost_reason: 'price' }).status, 'dead');
});

test('an unknown status is rejected', () => {
  status400(() => checkCreateStatus('closed', 'admin', base));
});

test('Proposal onwards needs Value Estimate and Ref ID', () => {
  for (const status of ['proposal', 'follow_up', 'hold']) {
    status400(() => checkCreateStatus(status, 'sales', base), /Value Estimate, Ref ID/);
    status400(() => checkCreateStatus(status, 'sales', { ...base, value_estimate: 100 }), /Ref ID/);
    assert.equal(checkCreateStatus(status, 'sales', { ...base, value_estimate: 100, ref_id: ' R-1 ' }).ref_id, 'R-1');
  }
});

test('Meeting needs nothing extra and keeps no Ref ID', () => {
  assert.equal(checkCreateStatus('meeting', 'sales', { ...base, ref_id: 'R-1' }).ref_id, null);
});

test('Won needs every Won field', () => {
  status400(() => checkCreateStatus('won', 'admin', { ...full, email: null }), /Email/);
  status400(() => checkCreateStatus('won', 'admin', { ...full, value_estimate: 0 }), /more than ₹0/);
});

test('Lost and Dead need a close reason ("other" needs a note)', () => {
  status400(() => checkCreateStatus('lost', 'sales', base), /reason/);
  status400(() => checkCreateStatus('lost', 'sales', { ...base, lost_reason: 'other' }), /note/);
  const lost = checkCreateStatus('lost', 'sales', { ...base, lost_reason: 'other', lost_note: ' gone ' });
  assert.deepEqual([lost.lost_reason, lost.lost_note], ['other', 'gone']);
});

test('a follow-up date is kept only for active stages', () => {
  const future = '2099-01-01';
  status400(() => checkCreateStatus('follow_up', 'sales', { ...base, value_estimate: 1, ref_id: 'R', next_follow_up_date: future }));
  const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
  assert.equal(checkCreateStatus('meeting', 'sales', { ...base, next_follow_up_date: today }).next_follow_up_date, today);
  assert.equal(checkCreateStatus('lost', 'sales', { ...base, lost_reason: 'price', next_follow_up_date: today }).next_follow_up_date, null);
});

// ---- Product ----

test('product is an optional, trimmed lead field', () => {
  assert.deepEqual(parseLeadEdits({ product: '  AV ' }), { product: 'AV' });
  assert.deepEqual(parseLeadEdits({ product: '' }), { product: null });
  assert.deepEqual(parseLeadEdits({}), {});
  status400(() => parseLeadEdits({ product: { x: 1 } }));
});

// ---- Funnel costing ----

test('funnel edits map to their columns and blank clears', () => {
  assert.deepEqual(parseFunnelEdits({ backup_value: '2100000', order_closed_value: '', remark: ' This month ', product: 'VC' }), {
    funnel_backup_value: 2100000, funnel_order_closed_value: null, funnel_remark: 'This month', product: 'VC'
  });
  assert.deepEqual(parseFunnelEdits({}), {});
});

test('funnel amounts use the value-estimate range, labelled per field', () => {
  status400(() => parseFunnelEdits({ backup_value: -1 }), /^Backup/);
  status400(() => parseFunnelEdits({ order_closed_value: 'approx 5L' }), /^Order Closed/);
});

test('funnel remark is text with a length limit', () => {
  status400(() => parseFunnelEdits({ remark: 5 }));
  status400(() => parseFunnelEdits({ remark: 'x'.repeat(MAX_FUNNEL_REMARK_LENGTH + 1) }));
});
