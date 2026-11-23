// Tally Desk access: only a Back-Office employee holding the Tally Maker tag,
// checked live against the DB on every request (never trusted from the JWT).
// Every other session — admins included — is refused. Same shape as
// quoteAuth.js.
import { query } from '../config/database.js';
import { verifyTokenFn, checkStaffSession } from './auth.js';

const fail = (status, message) => Object.assign(new Error(message), { status });

export async function isTallyMaker(decoded) {
  if (decoded?.role !== 'back_office') return false;
  const revoked = await checkStaffSession(decoded);
  if (revoked) throw fail(401, revoked);
  const { rowCount } = await query('SELECT 1 FROM tally_makers WHERE back_office_id = $1', [decoded.userId]);
  return rowCount > 0;
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

export const requireTallyMaker = async (req, res, next) => {
  try {
    const decoded = decode(req);
    if (!(await isTallyMaker(decoded))) throw fail(403, 'You do not have access to Tally Desk');
    req.user = decoded;
    next();
  } catch (error) {
    sendError(res, error);
  }
};

// GET /access never 403s — it tells the UI whether to show the module.
export const readTallyAccess = async (req, res) => {
  try {
    res.json({ success: true, data: { canAccess: await isTallyMaker(decode(req)) } });
  } catch (error) {
    sendError(res, error);
  }
};
