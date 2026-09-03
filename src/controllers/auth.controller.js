'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const authService = require('../services/auth.service');
const { signAccessToken } = require('../utils/jwt');

/**
 * POST /api/auth/register
 */
const register = asyncHandler(async (req, res) => {
  const { username, email, password } = req.body;
  const user = await authService.registerUser({ username, email, password });

  return sendSuccess(res, {
    statusCode: 201,
    message: 'Registration successful',
    data: { user: user.toPublicJSON() },
  });
});

/**
 * POST /api/auth/login
 */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const { user, accessToken } = await authService.loginUser({ email, password });

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Login successful',
    data: {
      accessToken,
      tokenType: 'Bearer',
      user: user.toPublicJSON(),
    },
  });
});

/**
 * GET /api/auth/me  (protected)
 */
const getMe = asyncHandler(async (req, res) => {
  return sendSuccess(res, {
    statusCode: 200,
    message: 'Current user',
    data: { user: req.user.toPublicJSON() },
  });
});

/**
 * PATCH /api/auth/change-password  (protected)
 */
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await authService.changePassword(req.user.id, {
    currentPassword,
    newPassword,
  });

  // Issue a fresh token so the client can keep working seamlessly.
  const accessToken = signAccessToken(user);

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Password changed successfully',
    data: {
      accessToken,
      tokenType: 'Bearer',
      user: user.toPublicJSON(),
    },
  });
});

module.exports = { register, login, getMe, changePassword };
