'use strict';

/**
 * Seed / ensure the platform admin account.
 *
 * Reads credentials from the environment (never hardcoded):
 *   ADMIN_USERNAME        (default: "Admin")
 *   ADMIN_EMAIL           (default: "admin@gmail.com")
 *   ADMIN_PASSWORD        (required)
 *   ADMIN_RESET_PASSWORD  (optional: "true" to overwrite an existing admin's password)
 *
 * Idempotent:
 *   - no matching user  -> creates it with role "admin"
 *   - user exists        -> promotes to "admin" / fixes username as needed
 *
 * Run with:  npm run seed:admin
 */

const { connectDatabase, disconnectDatabase } = require('../config/database');
const User = require('../models/user.model');
const { ROLES } = require('../config/roles');
const logger = require('../utils/logger');

async function seedAdmin() {
  const username = (process.env.ADMIN_USERNAME || 'Admin').trim();
  const email = (process.env.ADMIN_EMAIL || 'admin@gmail.com').toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD;
  const resetPassword = process.env.ADMIN_RESET_PASSWORD === 'true';

  if (!password) {
    logger.error('ADMIN_PASSWORD is not set. Add it to your .env before running the seed.');
    process.exit(1);
  }

  await connectDatabase();

  let user = await User.findOne({ email }).select('+password');

  if (!user) {
    user = await User.create({ username, email, password, role: ROLES.ADMIN });
    logger.info(`Admin created: username="${user.username}", email="${user.email}", role="${user.role}"`);
  } else {
    const changed = [];
    if (user.role !== ROLES.ADMIN) {
      user.role = ROLES.ADMIN;
      changed.push('role');
    }
    if (user.username !== username) {
      user.username = username;
      changed.push('username');
    }
    if (resetPassword) {
      user.password = password; // re-hashed by the model's pre-save hook
      changed.push('password');
    }

    if (changed.length > 0) {
      await user.save();
      logger.info(`Admin updated (${changed.join(', ')}): email="${user.email}", role="${user.role}"`);
    } else {
      logger.info(`Admin already present and correct: email="${user.email}", role="${user.role}"`);
    }
  }

  await disconnectDatabase();
  process.exit(0);
}

seedAdmin().catch((err) => {
  logger.error('Admin seed failed:', err.message);
  process.exit(1);
});
