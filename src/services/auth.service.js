'use strict';

const User = require('../models/user.model');
const ApiError = require('../utils/ApiError');
const { signAccessToken } = require('../utils/jwt');
const { DEFAULT_ROLE } = require('../config/roles');

/**
 * Register a new user. Role is forced to DEFAULT_ROLE regardless of input.
 * @returns {Promise<User>} the created user document
 */
async function registerUser({ username, email, password }) {
  const normalisedEmail = String(email).toLowerCase().trim();
  const normalisedUsername = String(username).trim();

  const existing = await User.findOne({
    $or: [{ email: normalisedEmail }, { username: normalisedUsername }],
  })
    .collation({ locale: 'en', strength: 2 }) // case-insensitive match
    .lean();

  if (existing) {
    if (existing.email === normalisedEmail) {
      throw ApiError.conflict('An account with that email already exists');
    }
    throw ApiError.conflict('That username is already taken');
  }

  try {
    const user = await User.create({
      username: normalisedUsername,
      email: normalisedEmail,
      password,
      role: DEFAULT_ROLE, // never taken from client input
    });
    return user;
  } catch (err) {
    // Race condition safety net: unique index rejects the duplicate.
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue || {})[0] || 'account';
      throw ApiError.conflict(`An account with that ${field} already exists`);
    }
    throw err;
  }
}

/**
 * Authenticate with email + password.
 * @returns {Promise<{ user: User, accessToken: string }>}
 */
async function loginUser({ email, password }) {
  const normalisedEmail = String(email).toLowerCase().trim();

  const user = await User.findOne({ email: normalisedEmail }).select('+password');

  // Same error whether the email is unknown or the password is wrong.
  if (!user || !(await user.comparePassword(password))) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  const accessToken = signAccessToken(user);
  return { user, accessToken };
}

/**
 * Change the password for an already-authenticated user.
 */
async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await User.findById(userId).select('+password');
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  const matches = await user.comparePassword(currentPassword);
  if (!matches) {
    throw ApiError.unauthorized('Current password is incorrect');
  }

  user.password = newPassword; // hashed by the pre-save hook
  await user.save();

  return user;
}

module.exports = { registerUser, loginUser, changePassword };
