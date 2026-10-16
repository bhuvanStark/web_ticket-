import test from 'node:test';
import assert from 'node:assert/strict';
import { validateServiceRequest, SERVICE_TYPES } from '../middleware/validation.js';

const body = (service_type) => ({
  customer_org: 'ABC Pvt Ltd',
  facility_location: 'Chennai',
  support_category: 'epabx',
  issue_title: 'No dial tone',
  issue_description: 'Line dead since morning',
  issue_category: 'Hardware',
  service_type
});

const run = (requestBody) => {
  const out = { status: null, json: null, nextCalled: false };
  const res = { status(code) { out.status = code; return this; }, json(payload) { out.json = payload; return this; } };
  validateServiceRequest({ body: requestBody }, res, () => { out.nextCalled = true; });
  return out;
};

test('supported service types pass validation', () => {
  assert.deepEqual(SERVICE_TYPES, ['onsite_service', 'remote_support']);
  for (const type of SERVICE_TYPES) assert.equal(run(body(type)).nextCalled, true, type);
});

test('unsupported or missing service types are rejected with 400', () => {
  for (const type of ['On-site', 'remote', 'ONSITE_SERVICE', 'onsite_service ', 'x']) {
    const out = run(body(type));
    assert.equal(out.nextCalled, false, type);
    assert.equal(out.status, 400, type);
    assert.ok(out.json.details.some((d) => d.startsWith('service_type must be one of')), type);
  }
  const missing = run(body(undefined));
  assert.equal(missing.status, 400);
  assert.ok(missing.json.details.includes('service_type is required'));
});
