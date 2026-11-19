import test from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter } from '../middleware/rateLimit.js';

const run = (limiter, req) => new Promise((resolve) => {
  const res = {
    headers: {},
    statusCode: 200,
    set(key, value) { this.headers[key] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { resolve({ status: this.statusCode, body, headers: this.headers }); }
  };
  limiter(req, res, () => resolve({ status: 'next' }));
});

test('allows up to max requests per key, then answers 429 with Retry-After', async () => {
  const limiter = createRateLimiter({ max: 3, windowMs: 60_000, keyFn: (req) => req.ip });
  const req = { ip: '10.0.0.1', body: {} };
  for (let i = 0; i < 3; i += 1) assert.equal((await run(limiter, req)).status, 'next');
  const blocked = await run(limiter, req);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.success, false);
  assert.ok(Number(blocked.headers['Retry-After']) >= 1);
});

test('keys are independent and a null key is never limited', async () => {
  const limiter = createRateLimiter({ max: 1, windowMs: 60_000, keyFn: (req) => req.body.email || null });
  assert.equal((await run(limiter, { body: { email: 'a@x.com' } })).status, 'next');
  assert.equal((await run(limiter, { body: { email: 'a@x.com' } })).status, 429);
  assert.equal((await run(limiter, { body: { email: 'b@x.com' } })).status, 'next');
  for (let i = 0; i < 5; i += 1) assert.equal((await run(limiter, { body: {} })).status, 'next');
});

test('the window expires and reset() clears state', async () => {
  const realNow = Date.now;
  let now = 1_000_000;
  Date.now = () => now;
  try {
    const limiter = createRateLimiter({ max: 1, windowMs: 1000, keyFn: (req) => req.ip });
    assert.equal((await run(limiter, { ip: 'x' })).status, 'next');
    assert.equal((await run(limiter, { ip: 'x' })).status, 429);
    now += 1001;
    assert.equal((await run(limiter, { ip: 'x' })).status, 'next');
    assert.equal((await run(limiter, { ip: 'x' })).status, 429);
    limiter.reset();
    assert.equal((await run(limiter, { ip: 'x' })).status, 'next');
  } finally {
    Date.now = realNow;
  }
});
