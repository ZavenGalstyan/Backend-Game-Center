'use strict';

const { verifyAccessToken } = require('../utils/jwt');
const User = require('../models/user.model');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Extract a Bearer token from the Authorization header.
 * @returns {string|null}
 */
function extractBearerToken(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme && scheme.toLowerCase() === 'bearer' && token) {
    return token.trim();
  }
  return null;
}

/**
 * Resolve the user for a given token, or throw an ApiError(401).
 */
async function resolveUserFromToken(token) {
  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw ApiError.unauthorized('Access token has expired');
    }
    throw ApiError.unauthorized('Invalid access token');
  }

  const user = await User.findById(payload.sub);
  if (!user) {
    throw ApiError.unauthorized('The user for this token no longer exists');
  }
  return user;
}

/**
 * REQUIRED authentication.
 * Use on protected routes. Rejects the request if no valid token is present.
 * On success attaches `req.user` (Mongoose document) and `req.auth` (payload info).
 */
const requireAuth = asyncHandler(async (req, _res, next) => {
  const token = extractBearerToken(req);
  if (!token) {
    throw ApiError.unauthorized('Authentication required. Provide a Bearer token.');
  }

  const user = await resolveUserFromToken(token);
  req.user = user;
  req.auth = { userId: user.id, role: user.role };
  next();
});

/**
 * OPTIONAL authentication.
 * Use on public routes that behave differently for guests vs logged-in users.
 * - No token         -> continues as guest (req.user is undefined)
 * - Valid token      -> attaches req.user
 * - Invalid/expired  -> rejected (so clients notice their token is stale)
 */
const optionalAuth = asyncHandler(async (req, _res, next) => {
  const token = extractBearerToken(req);
  if (!token) {
    return next();
  }
  const user = await resolveUserFromToken(token);
  req.user = user;
  req.auth = { userId: user.id, role: user.role };
  next();
});

/**
 * Role guard. Must run after requireAuth.
 * Usage: router.get('/admin', requireAuth, requireRole('admin'), handler)
 */
function requireRole(...allowedRoles) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'));
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(ApiError.forbidden('You do not have permission to perform this action'));
    }
    return next();
  };
}

module.exports = { requireAuth, optionalAuth, requireRole, extractBearerToken };
