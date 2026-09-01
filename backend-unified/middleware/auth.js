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

// Hash password
export const hashPassword = async (password) => {
  return bcrypt.hash(password, 10);
};

// Compare password
export const comparePassword = async (password, hash) => {
  return bcrypt.compare(password, hash);
};
