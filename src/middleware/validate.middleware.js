'use strict';

const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

/**
 * Runs after a list of express-validator checks. If any failed, throws a
 * 400 ApiError with a consistent `details` array.
 */
function validate(req, _res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) {
    return next();
  }

  const details = result.array().map((e) => ({
    field: e.path || e.param,
    message: e.msg,
  }));

  return next(ApiError.badRequest('Validation failed', details));
}

module.exports = validate;
