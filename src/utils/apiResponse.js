'use strict';

/**
 * Helpers for consistent success responses.
 * Shape:
 *   { success: true, message: string, data: any }
 *
 * Errors are handled separately by the centralised error middleware and use:
 *   { success: false, message: string, errors?: [...] }
 */
function sendSuccess(res, { statusCode = 200, message = 'OK', data = null, pagination } = {}) {
  const body = { success: true, message, data };
  if (pagination !== undefined) {
    body.pagination = pagination;
  }
  return res.status(statusCode).json(body);
}

module.exports = { sendSuccess };
