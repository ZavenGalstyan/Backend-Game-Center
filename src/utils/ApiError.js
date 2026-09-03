'use strict';

/**
 * Application-level error carrying an HTTP status code.
 * Throw these from controllers/services; the centralised error handler
 * turns them into consistent JSON responses.
 */
class ApiError extends Error {
  /**
   * @param {number} statusCode HTTP status code
   * @param {string} message    Human-readable message safe to expose
   * @param {object} [options]
   * @param {Array}  [options.details] Optional array of field-level errors
   * @param {boolean}[options.isOperational=true]
   */
  constructor(statusCode, message, { details = undefined, isOperational = true } = {}) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = 'Bad request', details) {
    return new ApiError(400, message, { details });
  }

  static unauthorized(message = 'Unauthorized') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'Forbidden') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Resource not found') {
    return new ApiError(404, message);
  }

  static conflict(message = 'Resource already exists') {
    return new ApiError(409, message);
  }

  static internal(message = 'Internal server error') {
    return new ApiError(500, message, { isOperational: false });
  }
}

module.exports = ApiError;
