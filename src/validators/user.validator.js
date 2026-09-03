'use strict';

const { query } = require('express-validator');
const { ROLE_VALUES } = require('../config/roles');

const listUsersRules = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page must be a positive integer')
    .toInt(),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit must be an integer between 1 and 100')
    .toInt(),

  query('role')
    .optional()
    .isIn(ROLE_VALUES)
    .withMessage(`role must be one of: ${ROLE_VALUES.join(', ')}`),
];

module.exports = { listUsersRules };
