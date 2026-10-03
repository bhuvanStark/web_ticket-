import test from 'node:test';
import assert from 'node:assert/strict';
import { buildServiceRequestDetailsUpdate } from '../services/serviceRequestService.js';

const avTicket = {
  issue_title: '  Display flickering  ',
  issue_category: 'Display',
  customer_org: 'ABC Pvt Ltd',
  facility_location: 'Karnataka',
  support_category: 'av',
  room_name: 'Board Room',
  area: '3rd Floor',
  contact: 'Ramesh - 9876543210',
  preferred_date: '2026-10-05',
  preferred_time: '10:30'
};

test('a valid AV edit maps to trimmed editable columns only', () => {
  const { update, errors } = buildServiceRequestDetailsUpdate(avTicket);
  assert.deepEqual(errors, []);
  assert.deepEqual(update, {
    issue_title: 'Display flickering',
    issue_category: 'Display',
    customer_org: 'ABC Pvt Ltd',
    facility_location: 'Karnataka',
    support_category: 'av',
    room_name: 'Board Room',
    area: '3rd Floor',
    contact: 'Ramesh - 9876543210',
    preferred_date: '2026-10-05',
    preferred_time: '10:30'
  });
});

test('status, assignment and ticket number in the body are ignored', () => {
  const { update } = buildServiceRequestDetailsUpdate({
    ...avTicket,
    status: 'completed',
    assigned_technician_id: '00000000-0000-0000-0000-000000000000',
    ticket_number: 'TT-000000-999',
    priority: 'low'
  });
  for (const key of ['status', 'assigned_technician_id', 'ticket_number', 'priority']) {
    assert.equal(key in update, false, `${key} must not be updatable`);
  }
});

test('EPABX tickets never carry a room, and unknown categories fold onto AV', () => {
  const epabx = buildServiceRequestDetailsUpdate({ ...avTicket, support_category: 'EPABX', room_name: 'Board Room' });
  assert.equal(epabx.update.support_category, 'epabx');
  assert.equal(epabx.update.room_name, null);
  assert.deepEqual(epabx.errors, []);

  const odd = buildServiceRequestDetailsUpdate({ ...avTicket, support_category: 'something' });
  assert.equal(odd.update.support_category, 'av');
});

test('cleared optional fields are saved as null', () => {
  const { update } = buildServiceRequestDetailsUpdate({ ...avTicket, area: ' ', contact: '', preferred_date: null, preferred_time: undefined });
  assert.equal(update.area, null);
  assert.equal(update.contact, null);
  assert.equal(update.preferred_date, null);
  assert.equal(update.preferred_time, null);
});

test('missing required fields are reported', () => {
  const { errors } = buildServiceRequestDetailsUpdate({ support_category: 'av' });
  assert.deepEqual(errors, [
    'Ticket title is required',
    'Issue category is required',
    'Customer organisation is required',
    'Facility location is required',
    'A room is required for an AV ticket'
  ]);
});
