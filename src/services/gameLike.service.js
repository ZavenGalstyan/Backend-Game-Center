'use strict';

const Game = require('../models/game.model');
const GameLike = require('../models/gameLike.model');
const ApiError = require('../utils/ApiError');
const gameRatingService = require('./gameRating.service');

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

const CATEGORY_POPULATE = [
  { path: 'mainCategory', select: 'name slug' },
  { path: 'secondaryCategories', select: 'name slug' },
];

/**
 * Resolve a game id to its document, or throw 404.
 */
async function requireGame(gameId) {
  const game = await Game.findById(gameId);
  if (!game) {
    throw ApiError.notFound('Game not found');
  }
  return game;
}

/**
 * Like a game for the given user.
 *
 * Idempotent: liking a game that is already liked is a no-op and still
 * resolves successfully. The upsert + unique compound index guarantee at
 * most one GameLike per (user, game) pair even under concurrent requests.
 *
 * @throws {ApiError} 404 if the game does not exist
 * @returns {Promise<{ liked: true }>}
 */
async function likeGame(userId, gameId) {
  await requireGame(gameId);

  try {
    await GameLike.findOneAndUpdate(
      { user: userId, game: gameId },
      { $setOnInsert: { user: userId, game: gameId } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (err) {
    // Two concurrent first-time likes can race past the upsert check; the
    // unique index then rejects the loser. That is the desired end state
    // (the like exists), so treat it as success rather than an error.
    if (err.code !== 11000) throw err;
  }

  return { liked: true };
}

/**
 * Remove the given user's like for a game.
 *
 * Idempotent: unliking a game that was not liked is a no-op and still
 * resolves successfully.
 *
 * @returns {Promise<{ liked: false }>}
 */
async function unlikeGame(userId, gameId) {
  await GameLike.deleteOne({ user: userId, game: gameId });
  return { liked: false };
}

/**
 * Whether the given user has liked a game.
 *
 * @throws {ApiError} 404 if the game does not exist
 * @returns {Promise<{ liked: boolean }>}
 */
async function getLikeStatus(userId, gameId) {
  await requireGame(gameId);
  const existing = await GameLike.exists({ user: userId, game: gameId });
  return { liked: Boolean(existing) };
}

/**
 * Total number of likes a game has received.
 *
 * @throws {ApiError} 404 if the game does not exist
 * @returns {Promise<{ count: number }>}
 */
async function getLikeCount(gameId) {
  await requireGame(gameId);
  const count = await GameLike.countDocuments({ game: gameId });
  return { count };
}

/**
 * The games a user has liked, most recently liked first, with limit/offset
 * pagination. Returns full game info (not just ids) with the game's
 * categories populated and rating stats attached - one query each for the
 * page, the count and the ratings (no N+1).
 *
 * @returns {Promise<{ items: object[], pagination: object }>}
 */
async function getLikedGames(userId, { limit, offset } = {}) {
  const safeLimit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(limit, 10) || DEFAULT_LIMIT)
  );
  const parsedOffset = parseInt(offset, 10);
  const safeOffset = Number.isFinite(parsedOffset) && parsedOffset > 0 ? parsedOffset : 0;

  const filter = { user: userId };

  const [likes, total] = await Promise.all([
    GameLike.find(filter)
      .sort({ createdAt: -1 })
      .skip(safeOffset)
      .limit(safeLimit)
      .populate({ path: 'game', populate: CATEGORY_POPULATE }),
    GameLike.countDocuments(filter),
  ]);

  // A game deleted without its likes being cleaned up would leave a dangling
  // reference; skip those defensively so the endpoint never returns nulls.
  const items = likes
    .filter((like) => like.game)
    .map((like) => like.game.toPublicJSON());
  await gameRatingService.attachRatingStats(items);

  const returned = items.length;
  const consumed = safeOffset + likes.length;
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
 * Delete every like pointing at a game. Called when a game is removed so no
 * orphaned likes are left behind.
 *
 * @returns {Promise<number>} how many likes were deleted
 */
async function deleteLikesForGame(gameId) {
  const { deletedCount } = await GameLike.deleteMany({ game: gameId });
  return deletedCount || 0;
}

module.exports = {
  likeGame,
  unlikeGame,
  getLikeStatus,
  getLikeCount,
  getLikedGames,
  deleteLikesForGame,
};
