const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const permissionUtils = require('./permissions');

const JWT_SECRET = String(process.env.JWT_SECRET || '').trim();
const JWT_EXPIRY = process.env.JWT_EXPIRY || '24h';

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is required');
}

function generateToken(payload, options = {}) {
  const expiresIn = options.expiresIn || JWT_EXPIRY;
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn,
    issuer: 'auto-deploy-system'
  });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

async function hashPassword(password) {
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
}

async function comparePassword(password, hashedPassword) {
  return bcrypt.compare(password, hashedPassword);
}

function extractToken(req) {
  const authHeader = req.headers.authorization;
  return authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
}

function authenticateToken(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({
      success: false,
      message: '\u7f3a\u5c11\u8bbf\u95ee\u4ee4\u724c'
    });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(403).json({
      success: false,
      message: '\u8bbf\u95ee\u4ee4\u724c\u65e0\u6548\u6216\u5df2\u8fc7\u671f'
    });
  }

  req.user = {
    ...decoded,
    permissions: Array.isArray(decoded.permissions) && decoded.permissions.length > 0
      ? decoded.permissions
      : permissionUtils.resolvePermissions(decoded.role)
  };
  return next();
}

function requireAdmin(req, res, next) {
  if (!req.user || !permissionUtils.hasPermission(req.user, permissionUtils.PERMISSIONS.USERS_MANAGE)) {
    return res.status(403).json({
      success: false,
      message: '\u9700\u8981\u7ba1\u7406\u5458\u6743\u9650'
    });
  }
  return next();
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user || !permissionUtils.hasPermission(req.user, permission)) {
      return res.status(403).json({
        success: false,
        message: `\u7f3a\u5c11\u6743\u9650: ${permission}`
      });
    }
    return next();
  };
}

function generateSecureRandomToken(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

module.exports = {
  generateToken,
  verifyToken,
  hashPassword,
  comparePassword,
  extractToken,
  authenticateToken,
  requireAdmin,
  requirePermission,
  PERMISSIONS: permissionUtils.PERMISSIONS,
  ROLE_PERMISSIONS: permissionUtils.ROLE_PERMISSIONS,
  resolvePermissions: permissionUtils.resolvePermissions,
  hasPermission: permissionUtils.hasPermission,
  generateSecureRandomToken
};
