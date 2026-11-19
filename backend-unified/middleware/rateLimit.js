// Fixed-window request limiter for the unauthenticated sign-in endpoints.
//
// The sign-in code is 4 digits (10,000 possibilities) and each code allows
// 5 wrong guesses, but nothing stopped a caller from requesting a fresh code
// over and over — every request emails the account owner and hands the
// attacker 5 more guesses. These limits make that loop impractical and stop
// the endpoints being used to flood someone's inbox.
//
// In-memory on purpose: the API runs as a single process and the state only
// has to survive for one window. Entries are swept as they expire so the map
// cannot grow without bound.

const DEFAULT_WINDOW_MS = 15 * 60 * 1000;

const tooMany = (res, retryAfterSeconds) => {
  res.set('Retry-After', String(retryAfterSeconds));
  return res.status(429).json({
    success: false,
    error: 'Too many attempts. Please wait a few minutes and try again.'
  });
};

// Normalise whatever the client sent as an email so "A@x.com" and "a@x.com"
// share one bucket. Capped so a huge body cannot bloat the key.
const emailKey = (req) => String(req.body?.email || '').trim().toLowerCase().slice(0, 254);

export function createRateLimiter({ windowMs = DEFAULT_WINDOW_MS, max, keyFn, name = 'limiter' }) {
  const hits = new Map(); // key -> { count, resetAt }
  let sweepAt = Date.now() + windowMs;

  const sweep = (now) => {
    if (now < sweepAt) return;
    for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
    sweepAt = now + windowMs;
  };

  const limiter = (req, res, next) => {
    const now = Date.now();
    sweep(now);

    const key = keyFn(req);
    if (!key) return next();

    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;

    if (entry.count > max) {
      return tooMany(res, Math.max(1, Math.ceil((entry.resetAt - now) / 1000)));
    }
    next();
  };

  // Exposed for tests so one file's limiter state never leaks into another.
  limiter.reset = () => hits.clear();
  limiter.limiterName = name;
  return limiter;
}

// Per client address: generous enough for an office behind one NAT, far
// too low to brute-force a 4-digit code.
export const otpRequestByIp = createRateLimiter({ max: 30, keyFn: (req) => `ip:${req.ip}`, name: 'otp-request-ip' });
// Per email address: a real person needs a handful of codes, not dozens.
export const otpRequestByEmail = createRateLimiter({
  max: 6,
  keyFn: (req) => { const email = emailKey(req); return email ? `email:${email}` : null; },
  name: 'otp-request-email'
});
// Guesses, per address and per email. Each code already locks after 5
// wrong attempts; this stops "request a new code and try 5 more" cycles.
export const otpVerifyByIp = createRateLimiter({ max: 40, keyFn: (req) => `ip:${req.ip}`, name: 'otp-verify-ip' });
export const otpVerifyByEmail = createRateLimiter({
  max: 15,
  keyFn: (req) => { const email = emailKey(req); return email ? `email:${email}` : null; },
  name: 'otp-verify-email'
});
// Password / token endpoints that remain (customer login, refresh, resets).
export const authByIp = createRateLimiter({ max: 60, keyFn: (req) => `ip:${req.ip}`, name: 'auth-ip' });

export const otpRequestLimiter = [otpRequestByIp, otpRequestByEmail];
export const otpVerifyLimiter = [otpVerifyByIp, otpVerifyByEmail];

export const resetAllRateLimiters = () => {
  for (const limiter of [otpRequestByIp, otpRequestByEmail, otpVerifyByIp, otpVerifyByEmail, authByIp]) limiter.reset();
};
