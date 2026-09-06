'use strict';

/**
 * Seed the initial set of game types.
 *
 * Idempotent and safe to run multiple times:
 *   - matches on `slug` and only inserts when missing ($setOnInsert)
 *   - never updates or deletes existing types (custom types are left alone)
 *
 * Run with:  npm run seed:game-types
 */

const { connectDatabase, disconnectDatabase } = require('../config/database');
const GameType = require('../models/gameType.model');
const logger = require('../utils/logger');

// [name, slug]
const INITIAL_TYPES = [
  ['Action', 'action'],
  ['Adventure', 'adventure'],
  ['Arcade', 'arcade'],
  ['Puzzle', 'puzzle'],
  ['Strategy', 'strategy'],
  ['Sports', 'sports'],
  ['Racing', 'racing'],
  ['Casual', 'casual'],
  ['Horror', 'horror'],
  ['Shooter', 'shooter'],
  ['Simulation', 'simulation'],
  ['Survival', 'survival'],
  ['RPG', 'rpg'],
  ['Card', 'card'],
  ['Logic', 'logic'],
  ['Multiplayer', 'multiplayer'],
  ['Football', 'football'],
  ['Fighting', 'fighting'],
  ['Platformer', 'platformer'],
  ['Escape Room', 'escape_room'],
];

async function seedGameTypes() {
  await connectDatabase();

  let created = 0;
  let skipped = 0;

  for (const [name, slug] of INITIAL_TYPES) {
    const res = await GameType.updateOne(
      { slug },
      { $setOnInsert: { name, slug } },
      { upsert: true }
    );

    if (res.upsertedCount && res.upsertedCount > 0) {
      created += 1;
      logger.info(`Created game type: ${name} (${slug})`);
    } else {
      skipped += 1;
    }
  }

  logger.info(
    `Game type seed complete: ${created} created, ${skipped} already existed ` +
      `(${INITIAL_TYPES.length} total in the seed list).`
  );

  await disconnectDatabase();
  process.exit(0);
}

seedGameTypes().catch((err) => {
  logger.error('Game type seed failed:', err.message);
  process.exit(1);
});
