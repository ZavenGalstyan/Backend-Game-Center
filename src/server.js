'use strict';

const app = require('./app');
const env = require('./config/env');
const logger = require('./utils/logger');
const { connectDatabase, disconnectDatabase } = require('./config/database');

let server;

async function start() {
  try {
    await connectDatabase();

    server = app.listen(env.port, () => {
      logger.info(`Server listening on http://localhost:${env.port} (${env.nodeEnv})`);
      logger.info(`Swagger UI:  http://localhost:${env.port}/api-docs`);
    });
  } catch (err) {
    logger.error('Failed to start server:', err.message);
    process.exit(1);
  }
}

async function shutdown(signal) {
  logger.warn(`${signal} received - shutting down gracefully`);
  try {
    if (server) await new Promise((resolve) => server.close(resolve));
    await disconnectDatabase();
    process.exit(0);
  } catch (err) {
    logger.error('Error during shutdown:', err.message);
    process.exit(1);
  }
}

['SIGINT', 'SIGTERM'].forEach((sig) => process.on(sig, () => shutdown(sig)));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception:', err);
  process.exit(1);
});

start();
