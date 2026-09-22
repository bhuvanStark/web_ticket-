import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

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

// Middleware to verify admin role
export const requireAdmin = (req, res, next) => {
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

// Sales & Back-Office Roles V1 — same shape as requireAdmin/requireTechnician
// above (kept unchanged themselves, per the plan's "keep unchanged in
// behavior" requirement), just gated on a different JWT role string.
export const requireSales = (req, res, next) => {
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
