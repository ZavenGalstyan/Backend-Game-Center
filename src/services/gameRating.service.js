'use strict';

const mongoose = require('mongoose');

const Game = require('../models/game.model');
const GameRating = require('../models/gameRating.model');
const ApiError = require('../utils/ApiError');

const { RATING_MIN, RATING_MAX } = GameRating;

/**
 * Average from exact integer totals, rounded to one decimal for the response.
 * Rounding `sum * 10 / count` (rather than a float average) keeps exact halves
 * exact, e.g. 87 / 20 = 4.35 -> 4.4. Unrated games report 0.
 */
function roundedAverage(sum, count) {
  if (!count) return 0;
  return Math.round((sum * 10) / count) / 10;
}

function emptyDistribution() {
  const dist = {};
  for (let r = RATING_MIN; r <= RATING_MAX; r += 1) dist[r] = 0;
  return dist;
}

const toObjectId = (id) => new mongoose.Types.ObjectId(String(id));

/**
 * Per-game rating counts for many games in ONE aggregation (no N+1).
 * @returns {Promise<Map<string, { sum: number, count: number, distribution: object }>>}
 */
async function aggregateRatings(gameIds) {
  const stats = new Map();
  if (gameIds.length === 0) return stats;

  const rows = await GameRating.aggregate([
    { $match: { game: { $in: gameIds.map(toObjectId) } } },
    { $group: { _id: { game: '$game', rating: '$rating' }, count: { $sum: 1 } } },
  ]);

  for (const { _id, count } of rows) {
    const key = String(_id.game);
    let s = stats.get(key);
    if (!s) {
      s = { sum: 0, count: 0, distribution: emptyDistribution() };
      stats.set(key, s);
    }
    s.sum += _id.rating * count;
    s.count += count;
    s.distribution[_id.rating] = count;
  }
  return stats;
}

/**
 * Add `averageRating` and `ratingsCount` to public game objects (mutates and
 * returns the same array). One database round trip for the whole list.
 */
async function attachRatingStats(games) {
  const stats = await aggregateRatings(games.map((g) => g.id));
  for (const game of games) {
    const s = stats.get(String(game.id));
    game.averageRating = s ? roundedAverage(s.sum, s.count) : 0;
    game.ratingsCount = s ? s.count : 0;
  }
  return games;
}

/** Throw 404 unless the game exists. */
async function requireGame(gameId) {
  const exists = await Game.exists({ _id: gameId });
  if (!exists) {
    throw ApiError.notFound('Game not found');
  }
}

async function buildSummary(gameId, userId) {
  const [stats, mine] = await Promise.all([
    aggregateRatings([gameId]),
    userId ? GameRating.findOne({ game: gameId, user: userId }).select('rating').lean() : null,
  ]);
  const s = stats.get(String(gameId));
  return {
    averageRating: s ? roundedAverage(s.sum, s.count) : 0,
    ratingsCount: s ? s.count : 0,
    ratingDistribution: s ? s.distribution : emptyDistribution(),
    myRating: mine ? mine.rating : null,
  };
}

/**
 * Public rating summary of a game. `myRating` is the caller's own rating when
 * a user id is supplied (authenticated request), otherwise null. Never exposes
 * who submitted which rating.
 *
 * @throws {ApiError} 404 if the game does not exist
 */
async function getRatingSummary(gameId, userId) {
  await requireGame(gameId);
  return buildSummary(gameId, userId);
}

/**
 * Record a user's rating for a game. Ratings are final - a second submission
 * for the same (user, game) pair is rejected with 409, whether it arrives
 * sequentially or concurrently (the unique index decides the race).
 *
 * @throws {ApiError} 404 if the game does not exist, 409 if already rated
 * @returns {Promise<{ rating: object, summary: object }>}
 */
async function submitRating(userId, gameId, rating) {
  await requireGame(gameId);

  let created;
  try {
    created = await GameRating.create({ user: userId, game: gameId, rating });
  } catch (err) {
    if (err.code === 11000) {
      throw ApiError.conflict('You have already rated this game');
    }
    throw err;
  }

  return {
    rating: {
      gameId: String(created.game),
      rating: created.rating,
      createdAt: created.createdAt,
    },
    summary: await buildSummary(gameId, userId),
  };
}

/**
 * Delete every rating of a game. Called when the game is removed so no
 * orphaned ratings are left behind.
 *
 * @returns {Promise<number>} how many ratings were deleted
 */
async function deleteRatingsForGame(gameId) {
  const { deletedCount } = await GameRating.deleteMany({ game: gameId });
  return deletedCount || 0;
}

module.exports = {
  attachRatingStats,
  getRatingSummary,
  submitRating,
  deleteRatingsForGame,
  roundedAverage,
};
