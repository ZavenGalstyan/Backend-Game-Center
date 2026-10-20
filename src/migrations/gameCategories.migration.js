'use strict';

/**
 * Migrate games from the single `typeId` category to
 * `mainCategory` + `secondaryCategories`.
 *
 * Idempotent and additive:
 *   - `mainCategory` is copied from the game's existing `typeId`, only where
 *     `mainCategory` is not set yet. No other category is ever inferred.
 *   - `secondaryCategories` is initialised to [] only where it is missing.
 *   - `typeId` is left in place (the model keeps it mirrored to
 *     `mainCategory`), so an older deployment reading the same database
 *     keeps working.
 *
 * Runs on the raw collection so Mongoose defaults/hooks cannot mask what is
 * actually stored.
 */

const Game = require('../models/game.model');
const GameType = require('../models/gameType.model');

const NEEDS_MAIN = { mainCategory: null, typeId: { $ne: null } };
const NEEDS_SECONDARY = { secondaryCategories: { $not: { $type: 'array' } } };
const NO_CATEGORY = { mainCategory: null, typeId: null };

/**
 * @param {{ dryRun?: boolean }} [options]
 * @returns {Promise<{ total, mainCategorySet, secondaryCategoriesInitialised,
 *   withoutCategory, danglingMainCategory }>}
 */
async function migrateGameCategories({ dryRun = false } = {}) {
  const games = Game.collection;

  let mainCategorySet;
  let secondaryCategoriesInitialised;
  if (dryRun) {
    [mainCategorySet, secondaryCategoriesInitialised] = await Promise.all([
      games.countDocuments(NEEDS_MAIN),
      games.countDocuments(NEEDS_SECONDARY),
    ]);
  } else {
    const main = await games.updateMany(NEEDS_MAIN, [{ $set: { mainCategory: '$typeId' } }]);
    const secondary = await games.updateMany(NEEDS_SECONDARY, {
      $set: { secondaryCategories: [] },
    });
    mainCategorySet = main.modifiedCount;
    secondaryCategoriesInitialised = secondary.modifiedCount;
  }

  // Report (never fix silently) games that still cannot be categorised.
  const [total, withoutCategory, usedMainIds] = await Promise.all([
    games.countDocuments({}),
    games.countDocuments(NO_CATEGORY),
    games.distinct(dryRun ? 'typeId' : 'mainCategory'),
  ]);
  const existing = await GameType.countDocuments({ _id: { $in: usedMainIds } });
  const danglingMainCategory = usedMainIds.filter(Boolean).length - existing;

  return {
    total,
    mainCategorySet,
    secondaryCategoriesInitialised,
    withoutCategory,
    danglingMainCategory,
  };
}

module.exports = { migrateGameCategories };
