'use strict';

/**
 * Tiny logger wrapper so we have a single place to swap in a real logging
 * library (pino/winston) later without touching call sites.
 */
/* eslint-disable no-console */
const logger = {
  info: (...args) => console.log('[info]', ...args),
  warn: (...args) => console.warn('[warn]', ...args),
  error: (...args) => console.error('[error]', ...args),
  debug: (...args) => {
    if (process.env.NODE_ENV !== 'production') console.debug('[debug]', ...args);
  },
};

module.exports = logger;
