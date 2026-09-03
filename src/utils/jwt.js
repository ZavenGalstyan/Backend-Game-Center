'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');

/**
 * Sign a short-lived access token for a user.
 * The payload deliberately contains only non-sensitive identifiers.
 */
function signAccessToken(user) {
  const payload = {
    sub: user.id || user._id.toString(),
    role: user.role,
  };

  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
}

/**
 * Verify a token and return its decoded payload.
 * Throws on invalid/expired tokens.
 */
function verifyAccessToken(token) {
  return jwt.verify(token, env.jwtSecret);
}

module.exports = { signAccessToken, verifyAccessToken };
