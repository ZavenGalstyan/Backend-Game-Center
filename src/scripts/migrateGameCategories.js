'use strict';

/**
 * Migrate existing games to mainCategory + secondaryCategories.
 * Idempotent - safe to run any number of times (see the migration module).
 *
 * Run with:  npm run migrate:game-categories            (apply)
 *            npm run migrate:game-categories -- --dry-run   (report only)
 */

const { connectDatabase, disconnectDatabase } = require('../config/database');
const { migrateGameCategories } = require('../migrations/gameCategories.migration');
const logger = require('../utils/logger');

async function run() {
  const dryRun = process.argv.includes('--dry-run');
  await connectDatabase();

  const result = await migrateGameCategories({ dryRun });
  logger.info(
    `Game category migration ${dryRun ? '(dry run) ' : ''}complete: ` +
      `${result.total} games, ` +
      `mainCategory ${dryRun ? 'to set' : 'set'} on ${result.mainCategorySet}, ` +
      `secondaryCategories ${dryRun ? 'to initialise' : 'initialised'} on ` +
      `${result.secondaryCategoriesInitialised}.`
  );
  if (result.withoutCategory > 0) {
    logger.warn(`${result.withoutCategory} game(s) have no category at all - set one manually.`);
  }
  if (result.danglingMainCategory > 0) {
    logger.warn(
      `${result.danglingMainCategory} category id(s) referenced by games no longer exist.`
    );
  }

  await disconnectDatabase();
  process.exit(0);
}

run().catch((err) => {
  logger.error('Game category migration failed:', err.message);
  process.exit(1);
});
