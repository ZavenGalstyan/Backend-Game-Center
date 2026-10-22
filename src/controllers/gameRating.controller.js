'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const gameRatingService = require('../services/gameRating.service');

/**
 * The rating user always comes from the JWT (req.user), never from the request
 * body or query - a client cannot rate on someone else's behalf.
 */

/**
 * POST /api/games/:gameId/ratings  (protected)
 */
const submitRating = asyncHandler(async (req, res) => {
  const result = await gameRatingService.submitRating(
    req.user.id,
    req.params.gameId,
    req.body.rating
  );

  return sendSuccess(res, {
    statusCode: 201,
    message: 'Rating submitted successfully',
    data: result,
  });
});

/**
 * GET /api/games/:gameId/ratings/summary  (public, optional auth for `myRating`)
 */
const getRatingSummary = asyncHandler(async (req, res) => {
  const summary = await gameRatingService.getRatingSummary(
    req.params.gameId,
    req.user ? req.user.id : null
  );

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Rating summary retrieved successfully',
    data: summary,
  });
});

module.exports = {
  submitRating,
  getRatingSummary,
};
