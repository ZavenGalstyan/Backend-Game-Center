'use strict';

const Game = require('../models/game.model');
const GameType = require('../models/gameType.model');
const ApiError = require('../utils/ApiError');

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

const TYPE_POPULATE = { path: 'typeId', select: 'name slug' };

/**
 * Resolve a game type id to its document, or throw 404.
 */
async function requireGameType(typeId) {
  const type = await GameType.findById(typeId);
  if (!type) {
    throw ApiError.notFound('Game type not found');
  }
  return type;
}

/**
 * Create a game. Verifies the referenced GameType exists first.
 */
async function createGame({ name, description, typeId }) {
  await requireGameType(typeId);

  const game = await Game.create({
    name: String(name).trim(),
    description: String(description).trim(),
    typeId,
  });

  await game.populate(TYPE_POPULATE);
  return game.toPublicJSON();
}

/**
 * List games with limit/offset pagination and an optional typeId filter.
 * @returns {Promise<{ items: object[], pagination: object }>}
 */
async function listGames({ limit, offset, typeId } = {}) {
  const safeLimit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(limit, 10) || DEFAULT_LIMIT)
  );
  const parsedOffset = parseInt(offset, 10);
  const safeOffset = Number.isFinite(parsedOffset) && parsedOffset > 0 ? parsedOffset : 0;

  const filter = {};
  if (typeId) filter.typeId = typeId;

  const [items, total] = await Promise.all([
    Game.find(filter)
      .sort({ createdAt: -1 })
      .skip(safeOffset)
      .limit(safeLimit)
      .populate(TYPE_POPULATE),
    Game.countDocuments(filter),
  ]);

  const returned = items.length;
  const consumed = safeOffset + returned;
  const hasMore = consumed < total;

  return {
    items: items.map((g) => g.toPublicJSON()),
    pagination: {
      limit: safeLimit,
      offset: safeOffset,
      total,
      returned,
      hasMore,
      nextOffset: hasMore ? consumed : null,
    },
  };
}

/**
 * Get a single game by id, with its type populated.
 * @throws {ApiError} 404 if not found
 */
async function getGameById(id) {
  const game = await Game.findById(id).populate(TYPE_POPULATE);
  if (!game) {
    throw ApiError.notFound('Game not found');
  }
  return game.toPublicJSON();
}

/**
 * Partially update a game. Allowed fields: name, description, typeId.
 * @throws {ApiError} 404 if the game (or a new typeId) is not found
 */
async function updateGame(id, { name, description, typeId }) {
  const game = await Game.findById(id);
  if (!game) {
    throw ApiError.notFound('Game not found');
  }

  if (typeId !== undefined) {
    await requireGameType(typeId);
    game.typeId = typeId;
  }
  if (name !== undefined) game.name = String(name).trim();
  if (description !== undefined) game.description = String(description).trim();

  await game.save();
  await game.populate(TYPE_POPULATE);
  return game.toPublicJSON();
}

/**
 * Delete a game by id.
 * @throws {ApiError} 404 if not found
 */
async function deleteGame(id) {
  const deleted = await Game.findByIdAndDelete(id);
  if (!deleted) {
    throw ApiError.notFound('Game not found');
  }
}

module.exports = {
  createGame,
  listGames,
  getGameById,
  updateGame,
  deleteGame,
};
