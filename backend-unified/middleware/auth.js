import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { supabase } from '../config/supabaseClient.js';

const JWT_SECRET = process.env.JWT_SECRET || 'tasktel-admin-jwt-secret-change-in-production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'tasktel-admin-refresh-secret-change-in-production';
const ACCESS_TOKEN_EXPIRY = parseInt(process.env.ACCESS_TOKEN_EXPIRY || '7', 10);
const REFRESH_TOKEN_EXPIRY = parseInt(process.env.REFRESH_TOKEN_EXPIRY || '30', 10);

if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET)) {
  throw new Error('JWT_SECRET and JWT_REFRESH_SECRET are required in production');
}

// Generate access token. extraClaims lets a caller tag the token with extra
// identity (e.g. teamMemberId) without changing the userId used for data scoping.
export const generateToken = (userId, role, extraClaims = {}) => {
  return jwt.sign(
    { userId, role, ...extraClaims },
    JWT_SECRET,
    { expiresIn: `${ACCESS_TOKEN_EXPIRY}d` }
  );
};

// Generate refresh token
export const generateRefreshToken = (userId, role, extraClaims = {}) => {
  return jwt.sign(
    { userId, role, ...extraClaims },
    JWT_REFRESH_SECRET,
    { expiresIn: `${REFRESH_TOKEN_EXPIRY}d` }
  );
};

// Verify token (function)
export const verifyTokenFn = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
};

// Verify token (middleware)
export const verifyToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Missing or invalid authorization header'
      });
    }

    const token = authHeader.substring(7);
    const decoded = verifyTokenFn(token);

    req.user = decoded;
    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: error.message
    });
  }
};

// Verify refresh token
export const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET);
  } catch (error) {
    throw new Error('Invalid or expired refresh token');
  }
};

// Middleware to verify JWT (alias for verifyToken)
export const requireAuth = verifyToken;

// Audit fix P0-1 — session revocation. Every admin/sales request re-reads
// is_active + token_version live from the DB instead of trusting the JWT's
// own claims, so deactivating, deleting, or promoting/demoting an account
// takes effect on the very next request rather than "whenever the token
// naturally expires" (previously up to 7 days for an access token, 30 for a
// refresh token — see routes/auth.js). token_version is bumped by any
// access-relevant change (deactivate, promote/demote — see
// routes/adminRoutes.js and routes/sales.js); a token whose embedded
// tokenVersion claim no longer matches the current DB value is rejected as
// revoked even though its signature and expiry are still valid. A token
// issued before this feature shipped carries no tokenVersion claim at all
// (undefined), which never matches the column's default of 0 — every admin
// and Sales session is therefore forced to re-login exactly once when this
// ships, which is the intended, one-time effect of closing this gap.
async function loadAdminSession(userId) {
  const { data, error } = await supabase
    .from('admins')
    .select('is_active, is_super_admin, token_version')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function loadSalesSession(userId) {
  const { data, error } = await supabase
    .from('sales')
    .select('is_active, token_version')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

// Middleware to verify admin role
export const requireAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Missing authorization header'
      });
    }

    const token = authHeader.substring(7);
    const decoded = verifyTokenFn(token);

    if (decoded.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Admin access required'
      });
    }

    const session = await loadAdminSession(decoded.userId);
    if (!session || !session.is_active) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'This account is inactive or no longer exists'
      });
    }
    if (session.token_version !== decoded.tokenVersion) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Your session has been revoked — please log in again'
      });
    }

    // Live value, not the (possibly stale) JWT claim — a Super Admin
    // demoted a moment ago must lose elevated access immediately.
    req.user = { ...decoded, isSuperAdmin: session.is_super_admin === true };
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: error.message
    });
  }
};

// Middleware to verify technician role
export const requireTechnician = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Missing authorization header'
      });
    }

    const token = authHeader.substring(7);
    const decoded = verifyTokenFn(token);

    if (decoded.role !== 'technician') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Technician access required'
      });
    }

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: error.message
    });
  }
};

// Admin RBAC V1 (TaskPro_Sales_RBAC_plan.md) — Super Admin gate. Same shape
// as requireAdmin above, plus the JWT's isSuperAdmin claim (set at login from
// admins.is_super_admin — see routes/auth.js). Reserved for admin-management
// endpoints (create/edit/deactivate/delete admins, promote/demote, toggle
// per-module permissions) — never for ordinary page/module access, which
// goes through requirePermission below so a Super Admin's implicit bypass
// there doesn't have to be special-cased per route.
export const requireSuperAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Missing authorization header'
      });
    }

    const token = authHeader.substring(7);
    const decoded = verifyTokenFn(token);

    if (decoded.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Super Admin access required'
      });
    }

    // Audit fix P0-1 — same live session check as requireAdmin, plus the
    // Super Admin check itself now reads the live DB value (session.
    // is_super_admin) instead of trusting decoded.isSuperAdmin, so a demote
    // takes effect immediately rather than only once token_version's
    // rejection kicks in on this admin's *next* token.
    const session = await loadAdminSession(decoded.userId);
    if (!session || !session.is_active) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'This account is inactive or no longer exists'
      });
    }
    if (session.token_version !== decoded.tokenVersion) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Your session has been revoked — please log in again'
      });
    }
    if (!session.is_super_admin) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Super Admin access required'
      });
    }

    req.user = { ...decoded, isSuperAdmin: true };
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: error.message
    });
  }
};

// Admin RBAC V1 — per-module access gate for a normal admin. A Super Admin
// (isSuperAdmin on the JWT) always bypasses the admin_permissions lookup
// entirely, so every module route can apply this uniformly without a
// separate Super-Admin special case. `module` must match a key written by
// PUT /api/admin/admins/:id/permissions (see routes/adminRoutes.js) — a
// normal admin with no row for that module is denied by default (same as an
// explicit can_access = false), never silently allowed.
export const requirePermission = (module) => async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Missing authorization header'
      });
    }

    const token = authHeader.substring(7);
    const decoded = verifyTokenFn(token);

    if (decoded.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Admin access required'
      });
    }

    // Audit fix P0-1 — same live session check as requireAdmin.
    const session = await loadAdminSession(decoded.userId);
    if (!session || !session.is_active) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'This account is inactive or no longer exists'
      });
    }
    if (session.token_version !== decoded.tokenVersion) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Your session has been revoked — please log in again'
      });
    }

    req.user = { ...decoded, isSuperAdmin: session.is_super_admin === true };

    if (session.is_super_admin) return next();

    const { data, error } = await supabase
      .from('admin_permissions')
      .select('can_access')
      .eq('admin_id', decoded.userId)
      .eq('module', module)
      .maybeSingle();

    if (error) throw new Error(error.message);

    if (!data?.can_access) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: `You do not have access to the ${module} module`
      });
    }

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: error.message
    });
  }
};

// Sales & Back-Office Roles V1 — same shape as requireAdmin/requireTechnician
// above, just gated on a different JWT role string. Audit fix P0-1 adds the
// same live is_active/token_version check requireAdmin now has — a
// deactivated Sales employee's existing token was previously still able to
// accept/act on leads (and immediately re-claim ones just reassigned away
// from them) for up to 7 days. requireTechnician/requireBackOffice below
// are deliberately left unchanged — out of scope for this fix.
export const requireSales = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Missing authorization header'
      });
    }

    const token = authHeader.substring(7);
    const decoded = verifyTokenFn(token);

    if (decoded.role !== 'sales') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Sales access required'
      });
    }

    const session = await loadSalesSession(decoded.userId);
    if (!session || !session.is_active) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'This account is inactive or no longer exists'
      });
    }
    if (session.token_version !== decoded.tokenVersion) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Your session has been revoked — please log in again'
      });
    }

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: error.message
    });
  }
};

export const requireBackOffice = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Missing authorization header'
      });
    }

    const token = authHeader.substring(7);
    const decoded = verifyTokenFn(token);

    if (decoded.role !== 'back_office') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Back-Office access required'
      });
    }

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: error.message
    });
  }
};

// Unified self-service attendance (routes/attendance.js) is the one place
// Technician, Sales, and Back-Office genuinely share an endpoint set — the
// plan's "generalize the existing attendance service" instruction. Accepts
// any of the three employee roles; req.user.role tells the route/service
// which owner column identifies this employee. Admin is deliberately not
// included — Admin has its own separate, unrestricted attendance surface
// (routes/adminAttendance.js) and must never gain a generic
// check-in-as-employee action through this one.
export const requireEmployee = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Missing authorization header'
      });
    }

    const token = authHeader.substring(7);
    const decoded = verifyTokenFn(token);

    if (!['technician', 'sales', 'back_office'].includes(decoded.role)) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Technician, Sales, or Back-Office access required'
      });
    }

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: error.message
    });
  }
};

// Sales & Back-Office Roles V1 — Service Requests/Projects/Project
// Activities gate on requireAuth (any authenticated role at all — already
// true for Customer too, unrelated to this feature), not a specific role,
// so a Sales/Back-Office JWT would otherwise pass straight through
// unchanged. The plan requires them rejected there specifically (§3, §11,
// §15.1) without touching those routers' existing auth or any other role's
// access — see server.js, which mounts this ahead of those three routers
// only. A missing/invalid token is deliberately let through to the route's
// own auth middleware to reject as it always has; this only ever blocks a
// recognized role that is not allowed here.
export const rejectRoles = (roles) => (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const decoded = verifyTokenFn(authHeader.substring(7));
      if (roles.includes(decoded.role)) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'Not available for this role'
        });
      }
    } catch {
      // Invalid/expired token — not this middleware's concern; fall through
      // to the router's own auth, which will reject it the same as always.
    }
  }
  next();
};

// Hash password
export const hashPassword = async (password) => {
  return bcrypt.hash(password, 10);
};

// Compare password
export const comparePassword = async (password, hash) => {
  return bcrypt.compare(password, hash);
};
