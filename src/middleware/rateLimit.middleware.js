'use strict';

const ApiError = require('../utils/ApiError');

/**
 * Minimal fixed-window rate limiter (in-memory, per process).
 *
 * Good enough to stop a single client from spamming write endpoints on a
 * single-instance deployment. Counters are not shared between processes, so a
 * horizontally scaled deployment would need a shared store (e.g. Redis).
 *
 * @param {object}   options
 * @param {number}   options.windowMs     Window length in milliseconds
 * @param {number}   options.max          Requests allowed per key per window
 * @param {Function} [options.keyGenerator] (req) => key; defaults to the
 *   authenticated user id, falling back to the client IP
 * @param {string}   [options.message]
 */
function createRateLimiter({
  windowMs,
  max,
  keyGenerator = (req) => (req.user ? `user:${req.user.id}` : `ip:${req.ip}`),
  message = 'Too many requests, please slow down',
}) {
  const hits = new Map(); // key -> { count, resetAt }

  // Drop expired windows so the map does not grow without bound.
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  }, windowMs);
  sweeper.unref();

  return function rateLimit(req, res, next) {
    const key = keyGenerator(req);
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;

    if (entry.count > max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.set('Retry-After', String(retryAfterSeconds));
      return next(
        new ApiError(429, `${message}. Try again in ${retryAfterSeconds} seconds.`, {
          code: 'RATE_LIMITED',
        })
      );
    }
    return next();
  };
}

module.exports = { createRateLimiter };
