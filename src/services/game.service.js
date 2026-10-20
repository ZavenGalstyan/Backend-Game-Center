'use strict';

const mongoose = require('mongoose');

const Game = require('../models/game.model');
const GameType = require('../models/gameType.model');
const gameLikeService = require('./gameLike.service');
const ApiError = require('../utils/ApiError');

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

const CATEGORY_SELECT = 'name slug';
const CATEGORY_POPULATE = [
  { path: 'mainCategory', select: CATEGORY_SELECT },
  { path: 'secondaryCategories', select: CATEGORY_SELECT },
];

// Within a priority group: newest first, `_id` as a stable tie-breaker so
// pages never overlap or skip games that share a createdAt.
const DEFAULT_SORT = { createdAt: -1, _id: -1 };

const idString = (id) => String(id);

/**
 * Validate a game's category selection and assert every referenced GameType
 * exists. `secondaryCategories` must already be an array of id strings.
 * @throws {ApiError} 400 with field-level details
 */
async function assertValidCategories(mainCategory, secondaryCategories) {
  const details = [];

  const seen = new Set();
  secondaryCategories.forEach((id, i) => {
    if (id === mainCategory) {
      details.push({
        field: `secondaryCategories[${i}]`,
        message: 'Main category cannot also be a secondary category',
      });
    } else if (seen.has(id)) {
      details.push({
        field: `secondaryCategories[${i}]`,
        message: 'Secondary categories must be unique',
      });
    }
    seen.add(id);
  });
  if (details.length > 0) {
    throw ApiError.badRequest('Validation failed', details);
  }

  const wanted = [mainCategory, ...secondaryCategories];
  const found = await GameType.find({ _id: { $in: wanted } }).select('_id').lean();
  const existing = new Set(found.map((t) => idString(t._id)));

  if (!existing.has(mainCategory)) {
    details.push({ field: 'mainCategory', message: 'Category not found' });
  }
  secondaryCategories.forEach((id, i) => {
    if (!existing.has(id)) {
      details.push({ field: `secondaryCategories[${i}]`, message: 'Category not found' });
    }
  });
  if (details.length > 0) {
    throw ApiError.badRequest('Validation failed', details);
  }
}

/**
 * Create a game with one main category and zero or more secondary categories.
 */
async function createGame({ name, description, mainCategory, secondaryCategories = [] }) {
  const main = idString(mainCategory);
  const secondary = secondaryCategories.map(idString);
  await assertValidCategories(main, secondary);

  const game = await Game.create({
    name: String(name).trim(),
    description: String(description).trim(),
    mainCategory: main,
    secondaryCategories: secondary,
  });

  await game.populate(CATEGORY_POPULATE);
  return game.toPublicJSON();
}

/** Escape user input for use inside a RegExp. */
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * List games with limit/offset pagination, an optional category filter and an
 * optional text search (name or description, case-insensitive).
 *
 * With a category filter a game matches if the category is its main category
 * OR one of its secondary categories. Main-category matches always come
 * before secondary-category matches; the ordering is applied in the database
 * before skip/limit, so it holds across pages. Each game appears once.
 *
 * @returns {Promise<{ items: object[], pagination: object }>}
 */
async function listGames({ limit, offset, categoryId, search } = {}) {
  const safeLimit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(limit, 10) || DEFAULT_LIMIT)
  );
  const parsedOffset = parseInt(offset, 10);
  const safeOffset = Number.isFinite(parsedOffset) && parsedOffset > 0 ? parsedOffset : 0;

  const filter = {};
  const term = typeof search === 'string' ? search.trim() : '';
  if (term) {
    const rx = new RegExp(escapeRegex(term), 'i');
    filter.$or = [{ name: rx }, { description: rx }];
  }

  let items;
  if (categoryId) {
    const catId = new mongoose.Types.ObjectId(String(categoryId));
    filter.$and = [{ $or: [{ mainCategory: catId }, { secondaryCategories: catId }] }];

    const page = await Game.aggregate([
      { $match: filter },
      {
        $addFields: {
          categoryPriority: { $cond: [{ $eq: ['$mainCategory', catId] }, 0, 1] },
        },
      },
      { $sort: { categoryPriority: 1, ...DEFAULT_SORT } },
      { $skip: safeOffset },
      { $limit: safeLimit },
      { $project: { _id: 1, categoryPriority: 1 } },
    ]);

    const docs = await Game.find({ _id: { $in: page.map((p) => p._id) } }).populate(
      CATEGORY_POPULATE
    );
    const byId = new Map(docs.map((d) => [idString(d._id), d]));
    items = page
      .map((p) => {
        const doc = byId.get(idString(p._id));
        if (!doc) return null; // deleted between the two queries
        return {
          ...doc.toPublicJSON(),
          categoryMatch: p.categoryPriority === 0 ? 'main' : 'secondary',
        };
      })
      .filter(Boolean);
  } else {
    const docs = await Game.find(filter)
      .sort(DEFAULT_SORT)
      .skip(safeOffset)
      .limit(safeLimit)
      .populate(CATEGORY_POPULATE);
    items = docs.map((g) => g.toPublicJSON());
  }

  const total = await Game.countDocuments(filter);
  const returned = items.length;
  const consumed = safeOffset + returned;
  const hasMore = consumed < total;

  return {
    items,
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
 * Get a single game by id, with its categories populated.
 * @throws {ApiError} 404 if not found
 */
async function getGameById(id) {
  const game = await Game.findById(id).populate(CATEGORY_POPULATE);
  if (!game) {
    throw ApiError.notFound('Game not found');
  }
  return game.toPublicJSON();
}

/**
 * Partially update a game. Allowed fields: name, description, mainCategory,
 * secondaryCategories. Category fields that are omitted keep their stored
 * value; the resulting combination is validated as a whole.
 * @throws {ApiError} 404 if the game is not found, 400 on invalid categories
 */
async function updateGame(id, { name, description, mainCategory, secondaryCategories }) {
  const game = await Game.findById(id);
  if (!game) {
    throw ApiError.notFound('Game not found');
  }

  if (mainCategory !== undefined || secondaryCategories !== undefined) {
    const main = idString(
      mainCategory !== undefined ? mainCategory : game.mainCategory || game.typeId
    );
    const secondary = (
      secondaryCategories !== undefined ? secondaryCategories : game.secondaryCategories || []
    ).map(idString);

    await assertValidCategories(main, secondary);
    game.mainCategory = main;
    game.secondaryCategories = secondary;
  }
  if (name !== undefined) game.name = String(name).trim();
  if (description !== undefined) game.description = String(description).trim();

  await game.save();
  await game.populate(CATEGORY_POPULATE);
  return game.toPublicJSON();
}

/**
 * Delete a game by id, then remove every like that pointed at it so no
 * orphaned GameLike documents are left behind.
 * @throws {ApiError} 404 if not found
 */
async function deleteGame(id) {
  const deleted = await Game.findByIdAndDelete(id);
  if (!deleted) {
    throw ApiError.notFound('Game not found');
  }
  await gameLikeService.deleteLikesForGame(id);
}

module.exports = {
  createGame,
  listGames,
  getGameById,
  updateGame,
  deleteGame,
};
