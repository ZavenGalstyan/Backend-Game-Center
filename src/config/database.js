'use strict';

const mongoose = require('mongoose');
const env = require('./env');
const logger = require('../utils/logger');

const DEFAULT_DB_NAME = 'game_center';

/**
 * True when the connection string already specifies a database name
 * (a non-empty path segment after the host, before any query string).
 */
function uriHasDatabaseName(uri) {
  return /mongodb(?:\+srv)?:\/\/[^/]+\/[^/?]+/.test(uri);
}

/**
 * Remove credentials from a connection string / error text before logging.
 *   mongodb+srv://user:pass@host/db  ->  mongodb+srv://****:****@host/db
 */
function redactCredentials(text) {
  return String(text).replace(/\/\/[^/@\s]+@/g, '//****:****@');
}

/**
 * Connect to MongoDB (Atlas or local) using Mongoose.
 *
 * The connection string comes exclusively from process.env.MONGO_URI
 * (exposed as env.mongoUri) - nothing is hardcoded here. If the URI does
 * not name a database, "game_center" is used.
 */
async function connectDatabase() {
  mongoose.set('strictQuery', true);

  // Runtime connection events (after the initial connect).
  mongoose.connection.on('error', (err) => {
    logger.error(`MongoDB connection error: ${redactCredentials(err.message)}`);
  });
  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
  });
  mongoose.connection.on('reconnected', () => {
    logger.info('MongoDB reconnected');
  });

  const options = {
    serverSelectionTimeoutMS: 10000,
  };
  if (!uriHasDatabaseName(env.mongoUri)) {
    options.dbName = DEFAULT_DB_NAME;
  }

  await mongoose.connect(env.mongoUri, options);

  logger.info(`MongoDB connected successfully (db: ${mongoose.connection.name})`);
  return mongoose.connection;
}

async function disconnectDatabase() {
  await mongoose.connection.close();
}

module.exports = { connectDatabase, disconnectDatabase, redactCredentials };
