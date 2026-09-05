'use strict';

const dotenv = require('dotenv');

dotenv.config();

/**
 * Centralised, validated access to environment variables.
 * Import this instead of reading process.env directly.
 */

const required = ['MONGO_URI', 'JWT_SECRET'];
const missing = required.filter((key) => !process.env[key] || process.env[key].trim() === '');

if (missing.length > 0) {
  // Fail fast: the app cannot run safely without these.
  // eslint-disable-next-line no-console
  console.error(
    `\n[config] Missing required environment variables: ${missing.join(', ')}\n` +
      `Create a ".env" file (see ".env.example") and set them before starting.\n`
  );
  process.exit(1);
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 5000,

  mongoUri: process.env.MONGO_URI,

  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  bcryptSaltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 12,

  corsOrigin: process.env.CORS_ORIGIN || '*',

  // Public base URL of this API (e.g. https://backend-game-center.onrender.com).
  // Used by Swagger to build the "servers" entry. Falls back to localhost:PORT
  // for local development when unset.
  apiBaseUrl: process.env.API_BASE_URL || '',
};

env.isProduction = env.nodeEnv === 'production';
env.isDevelopment = env.nodeEnv === 'development';
env.isTest = env.nodeEnv === 'test';

module.exports = env;
