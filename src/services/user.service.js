'use strict';

const User = require('../models/user.model');
const { ROLE_VALUES } = require('../config/roles');

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

/**
 * List users with pagination.
 *
 * @param {object} params
 * @param {number|string} [params.page=1]   1-based page number
 * @param {number|string} [params.limit=10] page size (capped at 100)
 * @param {string}        [params.role]     optional role filter
 * @returns {Promise<{ users: object[], pagination: object }>}
 */
async function listUsers({ page = 1, limit = DEFAULT_LIMIT, role } = {}) {
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(MAX_LIMIT, Math.max(1, parseInt(limit, 10) || DEFAULT_LIMIT));
  const skip = (safePage - 1) * safeLimit;

  const filter = {};
  if (role && ROLE_VALUES.includes(role)) {
    filter.role = role;
  }

  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(safeLimit),
    User.countDocuments(filter),
  ]);

  const totalPages = total === 0 ? 0 : Math.ceil(total / safeLimit);

  return {
    users: users.map((u) => u.toPublicJSON()), // password is select:false + stripped here
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages,
      hasNextPage: safePage < totalPages,
      hasPrevPage: safePage > 1 && total > 0,
    },
  };
}

module.exports = { listUsers };
