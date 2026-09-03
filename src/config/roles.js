'use strict';

/**
 * Central definition of user roles.
 *
 * Add new roles here as the platform grows (e.g. support, editor...).
 * Registration always assigns DEFAULT_ROLE and clients cannot override it.
 */
const ROLES = Object.freeze({
  PLAYER: 'player',
  MODERATOR: 'moderator',
  ADMIN: 'admin',
});

const ROLE_VALUES = Object.freeze(Object.values(ROLES));

const DEFAULT_ROLE = ROLES.PLAYER;

module.exports = { ROLES, ROLE_VALUES, DEFAULT_ROLE };
