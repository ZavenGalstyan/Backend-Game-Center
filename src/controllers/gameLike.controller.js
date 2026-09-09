'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const gameLikeService = require('../services/gameLike.service');

/**
 * The authenticated user always comes from the JWT (req.user), never from the
 * request body or query - a client cannot like/unlike on someone else's behalf.
 */

/**
 * POST /api/games/:gameId/like  (protected)
 */
const likeGame = asyncHandler(async (req, res) => {
  const result = await gameLikeService.likeGame(req.user.id, req.params.gameId);

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Game liked successfully',
    data: result,
  });
});

/**
 * DELETE /api/games/:gameId/like  (protected)
 */
const unlikeGame = asyncHandler(async (req, res) => {
  const result = await gameLikeService.unlikeGame(req.user.id, req.params.gameId);

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Game unliked successfully',
    data: result,
  });
});

/**
 * GET /api/games/:gameId/like  (protected)
 */
const getLikeStatus = asyncHandler(async (req, res) => {
  const result = await gameLikeService.getLikeStatus(req.user.id, req.params.gameId);

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Like status retrieved successfully',
    data: result,
  });
});

/**
 * GET /api/games/:gameId/likes/count  (public)
 */
const getLikeCount = asyncHandler(async (req, res) => {
  const result = await gameLikeService.getLikeCount(req.params.gameId);

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Like count retrieved successfully',
    data: result,
  });
});

/**
 * GET /api/users/me/liked-games  (protected)
 */
const getMyLikedGames = asyncHandler(async (req, res) => {
  const { limit, offset } = req.query;
  const { items, pagination } = await gameLikeService.getLikedGames(req.user.id, {
    limit,
    offset,
  });

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Liked games retrieved successfully',
    data: items,
    pagination,
  });
});

module.exports = {
  likeGame,
  unlikeGame,
  getLikeStatus,
  getLikeCount,
  getMyLikedGames,
};
