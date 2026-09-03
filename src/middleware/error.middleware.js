'use strict';

const env = require('../config/env');
const logger = require('../utils/logger');
const ApiError = require('../utils/ApiError');

/**
 * 404 handler for unmatched routes.
 */
function notFoundHandler(req, _res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

/**
 * Normalise known error shapes (Mongoose, JWT, express-validator) into ApiError.
 */
function normaliseError(err) {
  if (err instanceof ApiError) return err;

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const details = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    return ApiError.badRequest('Validation failed', details);
  }

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    return ApiError.badRequest(`Invalid value for field "${err.path}"`);
  }

  // Mongo duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return ApiError.conflict(`An account with that ${field} already exists`);
  }

  // JWT errors that slipped through
  if (err.name === 'JsonWebTokenError') {
    return ApiError.unauthorized('Invalid access token');
  }
  if (err.name === 'TokenExpiredError') {
    return ApiError.unauthorized('Access token has expired');
  }

  // Malformed JSON body (body-parser)
  if (err.type === 'entity.parse.failed') {
    return ApiError.badRequest('Malformed JSON in request body');
  }

  return null;
}

/* eslint-disable no-unused-vars */
function errorHandler(err, req, res, _next) {
  let apiError = normaliseError(err);

  if (!apiError) {
    // Unknown / programmer error - log full detail, expose nothing sensitive.
    logger.error('Unhandled error:', err.stack || err);
    apiError = ApiError.internal();
  } else if (!apiError.isOperational) {
    logger.error('Non-operational error:', err.stack || err);
  }

  const body = {
    success: false,
    message: apiError.message,
  };

  if (apiError.details && apiError.details.length > 0) {
    body.errors = apiError.details;
  }

  // Only leak stack traces outside production, and only for server-side (5xx)
  // errors - client errors (4xx) are self-explanatory via `message`/`errors`.
  if (!env.isProduction && apiError.statusCode >= 500 && (err.stack || apiError.stack)) {
    body.stack = (err.stack || apiError.stack).split('\n');
  }

  res.status(apiError.statusCode).json(body);
}

module.exports = { notFoundHandler, errorHandler };
