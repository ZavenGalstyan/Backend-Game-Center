'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const gameService = require('../services/game.service');

/**
 * POST /api/games  (protected: admin)
 */
const createGame = asyncHandler(async (req, res) => {
  const { name, description, typeId } = req.body;
  const game = await gameService.createGame({ name, description, typeId });

  return sendSuccess(res, {
    statusCode: 201,
    message: 'Game created successfully',
    data: game,
  });
});

/**
 * GET /api/games  (public) - limit/offset pagination, optional typeId filter.
 */
const listGames = asyncHandler(async (req, res) => {
  const { limit, offset, typeId } = req.query;
  const { items, pagination } = await gameService.listGames({ limit, offset, typeId });

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Games retrieved successfully',
    data: items,
    pagination,
  });
});

/**
 * GET /api/games/:id  (public)
 */
const getGame = asyncHandler(async (req, res) => {
  const game = await gameService.getGameById(req.params.id);

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Game retrieved successfully',
    data: game,
  });
});

/**
 * PATCH /api/games/:id  (protected: admin)
 */
const updateGame = asyncHandler(async (req, res) => {
  const { name, description, typeId } = req.body;
  const game = await gameService.updateGame(req.params.id, { name, description, typeId });

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Game updated successfully',
    data: game,
  });
});

/**
 * DELETE /api/games/:id  (protected: admin)
 */
const deleteGame = asyncHandler(async (req, res) => {
  await gameService.deleteGame(req.params.id);

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Game deleted successfully',
  });
});

module.exports = {
  createGame,
  listGames,
  getGame,
  updateGame,
  deleteGame,
};
