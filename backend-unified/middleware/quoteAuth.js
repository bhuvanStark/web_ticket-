// Quotation module access. Prices and margins are confidential, so only two
// kinds of session ever get in, both checked live against the DB on every
// request (never trusted from the JWT):
//   * a Back-Office employee holding the Quote Manager tag → 'manager' (read/write)
//   * the Super Admin                                      → 'viewer'  (read-only)
// Every other admin, Sales, Technician and Customer token is refused.
import { query } from '../config/database.js';
import { verifyTokenFn, checkStaffSession, verifyLiveSession } from './auth.js';

const fail = (status, message) => Object.assign(new Error(message), { status });

// Returns 'manager' | 'viewer' | null. Throws { status } for a bad session.
export async function resolveQuoteAccess(decoded) {
  if (decoded?.role === 'back_office') {
    const revoked = await checkStaffSession(decoded);
    if (revoked) throw fail(401, revoked);
    const { rowCount } = await query('SELECT 1 FROM quote_managers WHERE back_office_id = $1', [decoded.userId]);
    return rowCount ? 'manager' : null;
  }
  if (decoded?.role === 'admin') {
    const user = await verifyLiveSession(decoded);
    return user.isSuperAdmin ? 'viewer' : null;
  }
  return null;
}

function decode(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) throw fail(401, 'Missing authorization header');
  return verifyTokenFn(header.substring(7));
}

const sendError = (res, error) => {
  const status = error.status || 401;
  res.status(status).json({ success: false, error: status === 403 ? 'Forbidden' : 'Unauthorized', message: error.message });
};

export const requireQuoteAccess = async (req, res, next) => {
  try {
    const decoded = decode(req);
    const mode = await resolveQuoteAccess(decoded);
    if (!mode) throw fail(403, 'You do not have access to Quotations');
    req.user = decoded;
    req.quoteMode = mode;
    next();
  } catch (error) {
    sendError(res, error);
  }
};

// Write routes: after requireQuoteAccess.
export const requireQuoteManager = (req, res, next) => {
  if (req.quoteMode === 'manager') return next();
  res.status(403).json({ success: false, error: 'Forbidden', message: 'Quotations are read-only for this account' });
};

// Super Admin decisions (approving / rejecting delete requests). The Super
// Admin is the only session that resolves to 'viewer'.
export const requireQuoteApprover = (req, res, next) => {
  if (req.quoteMode === 'viewer') return next();
  res.status(403).json({ success: false, error: 'Forbidden', message: 'Only the Super Admin can decide delete requests' });
};

// GET /access never 403s — it tells the UI whether to show the module.
export const readQuoteAccess = async (req, res) => {
  try {
    const mode = await resolveQuoteAccess(decode(req));
    res.json({ success: true, data: { canAccess: Boolean(mode), mode } });
  } catch (error) {
    sendError(res, error);
  }
};
