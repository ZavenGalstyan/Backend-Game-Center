'use strict';

const mongoose = require('mongoose');
const env = require('./env');
const logger = require('../utils/logger');

/**
 * Connect to MongoDB using Mongoose.
 * The connection string comes exclusively from the MONGO_URI environment
 * variable - nothing is hardcoded here.
 */
async function connectDatabase() {
  mongoose.set('strictQuery', true);

  mongoose.connection.on('connected', () => {
    logger.info('MongoDB connected');
  });

  mongoose.connection.on('error', (err) => {
    logger.error(`MongoDB connection error: ${err.message}`);
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
  });

  await mongoose.connect(env.mongoUri);

  return mongoose.connection;
}

async function disconnectDatabase() {
  await mongoose.connection.close();
}

module.exports = { connectDatabase, disconnectDatabase };
