'use strict';

/**
 * Helpers for consistent success responses.
 * Shape:
 *   { success: true, message: string, data: any }
 *
 * Errors are handled separately by the centralised error middleware and use:
 *   { success: false, message: string, errors?: [...] }
 */
function sendSuccess(res, { statusCode = 200, message = 'OK', data = null } = {}) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
}

module.exports = { sendSuccess };
