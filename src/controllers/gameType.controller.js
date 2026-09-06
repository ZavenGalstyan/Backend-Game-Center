'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const gameTypeService = require('../services/gameType.service');

/**
 * POST /api/game-types  (protected: admin)
 */
const createGameType = asyncHandler(async (req, res) => {
  const { name, slug } = req.body;
  const type = await gameTypeService.createGameType({ name, slug });

  return sendSuccess(res, {
    statusCode: 201,
    message: 'Game type created successfully',
    data: type,
  });
});

/**
 * GET /api/game-types  (public)
 */
const listGameTypes = asyncHandler(async (_req, res) => {
  const types = await gameTypeService.listGameTypes();

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Game types retrieved successfully',
    data: types,
  });
});

/**
 * GET /api/game-types/:id  (public)
 */
const getGameType = asyncHandler(async (req, res) => {
  const type = await gameTypeService.getGameTypeById(req.params.id);

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Game type retrieved successfully',
    data: type,
  });
});

/**
 * PATCH /api/game-types/:id  (protected: admin)
 */
const updateGameType = asyncHandler(async (req, res) => {
  const { name, slug } = req.body;
  const type = await gameTypeService.updateGameType(req.params.id, { name, slug });

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Game type updated successfully',
    data: type,
  });
});

/**
 * DELETE /api/game-types/:id  (protected: admin)
 */
const deleteGameType = asyncHandler(async (req, res) => {
  await gameTypeService.deleteGameType(req.params.id);

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Game type deleted successfully',
  });
});

module.exports = {
  createGameType,
  listGameTypes,
  getGameType,
  updateGameType,
  deleteGameType,
};
