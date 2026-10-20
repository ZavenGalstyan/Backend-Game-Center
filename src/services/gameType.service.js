'use strict';

const GameType = require('../models/gameType.model');
const Game = require('../models/game.model');
const ApiError = require('../utils/ApiError');

const CI_COLLATION = { locale: 'en', strength: 2 }; // case-insensitive matching

/**
 * List all game types, sorted alphabetically by name.
 * The list is expected to stay small, so no pagination.
 */
async function listGameTypes() {
  const types = await GameType.find().collation(CI_COLLATION).sort({ name: 1 });
  return types.map((t) => t.toPublicJSON());
}

/**
 * Get a single game type by id.
 * @throws {ApiError} 404 if not found
 */
async function getGameTypeById(id) {
  const type = await GameType.findById(id);
  if (!type) {
    throw ApiError.notFound('Game type not found');
  }
  return type.toPublicJSON();
}

/**
 * Assert that no other game type already uses `name` or `slug`
 * (case-insensitive). `exceptId` skips the document being updated.
 */
async function assertNoDuplicate({ name, slug }, exceptId) {
  const or = [];
  if (name !== undefined) or.push({ name });
  if (slug !== undefined) or.push({ slug });
  if (or.length === 0) return;

  const filter = { $or: or };
  if (exceptId) filter._id = { $ne: exceptId };

  const clash = await GameType.findOne(filter).collation(CI_COLLATION).lean();
  if (!clash) return;

  if (name !== undefined && clash.name.toLowerCase() === name.toLowerCase()) {
    throw ApiError.conflict('A game type with that name already exists');
  }
  throw ApiError.conflict('A game type with that slug already exists');
}

/**
 * Create a new game type.
 */
async function createGameType({ name, slug }) {
  const cleanName = String(name).trim();
  const cleanSlug = String(slug).trim().toLowerCase();

  await assertNoDuplicate({ name: cleanName, slug: cleanSlug });

  try {
    const type = await GameType.create({ name: cleanName, slug: cleanSlug });
    return type.toPublicJSON();
  } catch (err) {
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue || {})[0] || 'value';
      throw ApiError.conflict(`A game type with that ${field} already exists`);
    }
    throw err;
  }
}

/**
 * Partially update a game type. Only `name` and `slug` can change.
 * @throws {ApiError} 404 if not found, 409 on duplicate name/slug
 */
async function updateGameType(id, { name, slug }) {
  const type = await GameType.findById(id);
  if (!type) {
    throw ApiError.notFound('Game type not found');
  }

  const next = {};
  if (name !== undefined) next.name = String(name).trim();
  if (slug !== undefined) next.slug = String(slug).trim().toLowerCase();

  await assertNoDuplicate(next, type._id);

  Object.assign(type, next);

  try {
    await type.save();
    return type.toPublicJSON();
  } catch (err) {
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue || {})[0] || 'value';
      throw ApiError.conflict(`A game type with that ${field} already exists`);
    }
    throw err;
  }
}

/**
 * Delete a game type - but only if no game references it as its main or
 * secondary category.
 * @throws {ApiError} 404 if not found, 409 if still in use
 */
async function deleteGameType(id) {
  const type = await GameType.findById(id);
  if (!type) {
    throw ApiError.notFound('Game type not found');
  }

  const inUse = await Game.countDocuments({
    $or: [{ mainCategory: type._id }, { secondaryCategories: type._id }, { typeId: type._id }],
  });
  if (inUse > 0) {
    throw ApiError.conflict(
      'Game type cannot be deleted because it is used by existing games'
    );
  }

  await type.deleteOne();
}

module.exports = {
  listGameTypes,
  getGameTypeById,
  createGameType,
  updateGameType,
  deleteGameType,
};
