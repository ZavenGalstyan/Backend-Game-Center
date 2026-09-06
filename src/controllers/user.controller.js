'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const userService = require('../services/user.service');

/**
 * GET /api/users  (protected: admin)
 * List users with pagination.
 */
const listUsers = asyncHandler(async (req, res) => {
  const { page, limit, role } = req.query;
  const result = await userService.listUsers({ page, limit, role });

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Users retrieved successfully',
    data: result,
  });
});

/**
 * DELETE /api/users/:id  (protected: admin)
 * Delete a user by id.
 */
const deleteUser = asyncHandler(async (req, res) => {
  await userService.deleteUser(req.params.id);

  return sendSuccess(res, {
    statusCode: 200,
    message: 'User deleted successfully',
  });
});

module.exports = { listUsers, deleteUser };
