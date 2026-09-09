'use strict';

const { param, query } = require('express-validator');

const MAX_LIMIT = 100;

/**
 * `:gameId` route param must be a valid MongoDB ObjectId. Malformed ids are
 * rejected with 400 here, before any database call.
 */
const gameIdParamRules = [
  param('gameId').isMongoId().withMessage('gameId must be a valid MongoDB ObjectId'),
];

/**
 * limit/offset pagination for GET /api/users/me/liked-games.
 * Same shape/defaults as the games catalogue listing.
 */
const listLikedGamesRules = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: MAX_LIMIT })
    .withMessage(`limit must be an integer between 1 and ${MAX_LIMIT}`)
    .toInt(),
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('offset must be an integer of 0 or greater')
    .toInt(),
];

module.exports = {
  gameIdParamRules,
  listLikedGamesRules,
};
