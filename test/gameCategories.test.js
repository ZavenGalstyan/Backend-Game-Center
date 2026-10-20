'use strict';

/**
 * Main + secondary category behaviour of the games API, end to end through
 * Express against an in-memory MongoDB (never the configured database).
 *
 * Run with:  npm test
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;
let mongoose;
let request;
let app;
let Game;
let GameType;
let migrateGameCategories;
let adminToken;
const cat = {}; // slug -> id string

const auth = () => ({ Authorization: `Bearer ${adminToken}` });

async function createGame(body) {
  const res = await request(app).post('/api/games').set(auth()).send(body);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data;
}

/** Pin createdAt so ordering assertions are deterministic. */
async function setCreatedAt(id, iso) {
  await Game.collection.updateOne(
    { _id: new mongoose.Types.ObjectId(id) },
    { $set: { createdAt: new Date(iso) } }
  );
}

function fieldsOf(res) {
  return (res.body.errors || []).map((e) => e.field);
}

before(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri('game_center_test');
  process.env.JWT_SECRET = 'test-secret';
  process.env.NODE_ENV = 'test';
  process.env.BCRYPT_SALT_ROUNDS = '4';

  mongoose = require('mongoose');
  request = require('supertest');
  app = require('../src/app');
  Game = require('../src/models/game.model');
  GameType = require('../src/models/gameType.model');
  ({ migrateGameCategories } = require('../src/migrations/gameCategories.migration'));
  const User = require('../src/models/user.model');
  const { signAccessToken } = require('../src/utils/jwt');

  await mongoose.connect(process.env.MONGO_URI);
  await Game.init();

  const admin = await User.create({
    username: 'admin_test',
    email: 'admin@test.local',
    password: 'Password123',
    role: 'admin',
  });
  adminToken = signAccessToken(admin);

  for (const [name, slug] of [
    ['Action', 'action'],
    ['Adventure', 'adventure'],
    ['Escape Room', 'escape_room'],
    ['Horror', 'horror'],
    ['Puzzle', 'puzzle'],
    ['Survival', 'survival'],
  ]) {
    const t = await GameType.create({ name, slug });
    cat[slug] = t._id.toString();
  }
});

after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await Game.deleteMany({});
});

describe('create game', () => {
  it('creates a game with only a main category', async () => {
    const g = await createGame({
      name: 'Solo Main',
      description: 'Only a main category.',
      mainCategory: cat.action,
    });
    assert.deepEqual(g.mainCategory, { id: cat.action, name: 'Action', slug: 'action' });
    assert.deepEqual(g.secondaryCategories, []);
    assert.deepEqual(g.type, g.mainCategory, 'legacy `type` mirrors mainCategory');
  });

  it('creates a game with multiple secondary categories, in order', async () => {
    const g = await createGame({
      name: 'Haunted Mansion Escape',
      description: 'Escape the mansion.',
      mainCategory: cat.escape_room,
      secondaryCategories: [cat.horror, cat.adventure, cat.puzzle],
    });
    assert.equal(g.mainCategory.name, 'Escape Room');
    assert.deepEqual(
      g.secondaryCategories.map((c) => c.name),
      ['Horror', 'Adventure', 'Puzzle']
    );
    assert.ok(g.secondaryCategories.every((c) => c.id && c.slug));
  });

  it('still accepts the legacy typeId as the main category', async () => {
    const g = await createGame({ name: 'Legacy', description: 'Old client.', typeId: cat.puzzle });
    assert.equal(g.mainCategory.id, cat.puzzle);
  });

  it('rejects a missing main category', async () => {
    const res = await request(app)
      .post('/api/games')
      .set(auth())
      .send({ name: 'No Main', description: 'Missing.', secondaryCategories: [cat.horror] });
    assert.equal(res.status, 400);
    assert.ok(fieldsOf(res).includes('mainCategory'));
  });

  it('rejects duplicate secondary categories', async () => {
    const res = await request(app).post('/api/games').set(auth()).send({
      name: 'Dupes',
      description: 'Duplicate secondaries.',
      mainCategory: cat.action,
      secondaryCategories: [cat.horror, cat.horror],
    });
    assert.equal(res.status, 400);
    assert.ok(fieldsOf(res).includes('secondaryCategories'));
    assert.match(res.body.errors[0].message, /unique/i);
  });

  it('rejects the main category repeated as a secondary category', async () => {
    const res = await request(app).post('/api/games').set(auth()).send({
      name: 'Conflict',
      description: 'Main is also secondary.',
      mainCategory: cat.action,
      secondaryCategories: [cat.horror, cat.action],
    });
    assert.equal(res.status, 400);
    assert.match(res.body.errors[0].message, /Main category cannot also be a secondary/);
  });

  it('rejects category ids that do not exist', async () => {
    const missing = new mongoose.Types.ObjectId().toString();
    const res = await request(app).post('/api/games').set(auth()).send({
      name: 'Ghost',
      description: 'Unknown categories.',
      mainCategory: missing,
      secondaryCategories: [cat.horror, new mongoose.Types.ObjectId().toString()],
    });
    assert.equal(res.status, 400);
    assert.deepEqual(fieldsOf(res), ['mainCategory', 'secondaryCategories[1]']);
    assert.equal(await Game.countDocuments(), 0);
  });

  it('rejects malformed secondary category values', async () => {
    const notArray = await request(app).post('/api/games').set(auth()).send({
      name: 'Bad',
      description: 'Not an array.',
      mainCategory: cat.action,
      secondaryCategories: cat.horror,
    });
    assert.equal(notArray.status, 400);

    const badId = await request(app).post('/api/games').set(auth()).send({
      name: 'Bad',
      description: 'Bad id.',
      mainCategory: cat.action,
      secondaryCategories: ['nope'],
    });
    assert.equal(badId.status, 400);
    assert.ok(fieldsOf(badId).includes('secondaryCategories[0]'));
  });
});

describe('update game', () => {
  it('updates main and secondary categories', async () => {
    const g = await createGame({
      name: 'Outpost 47: Frozen Secrets',
      description: 'Survive the outpost.',
      mainCategory: cat.action,
    });

    const res = await request(app)
      .patch(`/api/games/${g.id}`)
      .set(auth())
      .send({
        mainCategory: cat.escape_room,
        secondaryCategories: [cat.survival, cat.horror, cat.adventure],
      });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.mainCategory.name, 'Escape Room');
    assert.deepEqual(
      res.body.data.secondaryCategories.map((c) => c.name),
      ['Survival', 'Horror', 'Adventure']
    );

    // Persisted, and the legacy mirror follows mainCategory.
    const raw = await Game.collection.findOne({ _id: new mongoose.Types.ObjectId(g.id) });
    assert.equal(raw.typeId.toString(), cat.escape_room);

    const cleared = await request(app)
      .patch(`/api/games/${g.id}`)
      .set(auth())
      .send({ secondaryCategories: [] });
    assert.equal(cleared.status, 200);
    assert.deepEqual(cleared.body.data.secondaryCategories, []);
    assert.equal(cleared.body.data.mainCategory.id, cat.escape_room, 'main kept when omitted');
  });

  it('validates the combination with stored values', async () => {
    const g = await createGame({
      name: 'Stored',
      description: 'Has secondaries.',
      mainCategory: cat.action,
      secondaryCategories: [cat.horror],
    });

    // New main collides with a stored secondary.
    const r1 = await request(app)
      .patch(`/api/games/${g.id}`)
      .set(auth())
      .send({ mainCategory: cat.horror });
    assert.equal(r1.status, 400);

    // New secondaries collide with the stored main.
    const r2 = await request(app)
      .patch(`/api/games/${g.id}`)
      .set(auth())
      .send({ secondaryCategories: [cat.action] });
    assert.equal(r2.status, 400);

    const r3 = await request(app)
      .patch(`/api/games/${g.id}`)
      .set(auth())
      .send({ secondaryCategories: [cat.puzzle, cat.puzzle] });
    assert.equal(r3.status, 400);

    const fresh = await request(app).get(`/api/games/${g.id}`);
    assert.equal(fresh.body.data.mainCategory.id, cat.action);
    assert.deepEqual(fresh.body.data.secondaryCategories.map((c) => c.id), [cat.horror]);
  });

  it('updating only the name leaves categories untouched', async () => {
    const g = await createGame({
      name: 'Rename Me',
      description: 'Keep categories.',
      mainCategory: cat.action,
      secondaryCategories: [cat.horror],
    });
    const res = await request(app).patch(`/api/games/${g.id}`).set(auth()).send({ name: 'Renamed' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.name, 'Renamed');
    assert.deepEqual(res.body.data.secondaryCategories.map((c) => c.id), [cat.horror]);
  });
});

describe('get game', () => {
  it('returns populated category information', async () => {
    const g = await createGame({
      name: 'Detail',
      description: 'Detail page.',
      mainCategory: cat.escape_room,
      secondaryCategories: [cat.horror],
    });
    const res = await request(app).get(`/api/games/${g.id}`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.mainCategory, {
      id: cat.escape_room,
      name: 'Escape Room',
      slug: 'escape_room',
    });
    assert.deepEqual(res.body.data.secondaryCategories, [
      { id: cat.horror, name: 'Horror', slug: 'horror' },
    ]);
  });
});

describe('migration of existing games', () => {
  it('copies typeId to mainCategory, initialises [] and is idempotent', async () => {
    const legacyId = new mongoose.Types.ObjectId();
    await Game.collection.insertMany([
      {
        _id: legacyId,
        name: 'Legacy Game',
        description: 'Created before categories.',
        typeId: new mongoose.Types.ObjectId(cat.puzzle),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        name: 'Broken Game',
        description: 'Never had a category.',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const first = await migrateGameCategories();
    assert.equal(first.mainCategorySet, 1);
    assert.equal(first.secondaryCategoriesInitialised, 2);
    assert.equal(first.withoutCategory, 1, 'uncategorised game is reported, not guessed');

    const raw = await Game.collection.findOne({ _id: legacyId });
    assert.equal(raw.mainCategory.toString(), cat.puzzle);
    assert.deepEqual(raw.secondaryCategories, []);
    assert.equal(raw.typeId.toString(), cat.puzzle, 'legacy field kept for old deployments');

    const broken = await Game.collection.findOne({ name: 'Broken Game' });
    assert.equal(broken.mainCategory, undefined, 'no unrelated category assigned');

    const second = await migrateGameCategories();
    assert.equal(second.mainCategorySet, 0);
    assert.equal(second.secondaryCategoriesInitialised, 0);

    // Migrated game is reachable through every read path and still editable.
    const detail = await request(app).get(`/api/games/${legacyId}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.data.mainCategory.name, 'Puzzle');
    const listed = await request(app).get(`/api/games?categoryId=${cat.puzzle}`);
    assert.deepEqual(listed.body.data.map((g) => g.id), [legacyId.toString()]);
    const edit = await request(app)
      .patch(`/api/games/${legacyId}`)
      .set(auth())
      .send({ secondaryCategories: [cat.adventure] });
    assert.equal(edit.status, 200);
  });

  it('dry run reports without writing', async () => {
    await Game.collection.insertOne({
      name: 'Dry',
      description: 'Dry run.',
      typeId: new mongoose.Types.ObjectId(cat.action),
    });
    const res = await migrateGameCategories({ dryRun: true });
    assert.equal(res.mainCategorySet, 1);
    const raw = await Game.collection.findOne({ name: 'Dry' });
    assert.equal(raw.mainCategory, undefined);
  });
});

describe('category listing priority', () => {
  // Interleave main and secondary matches for Action across creation time.
  // [name, main, secondaries, createdAt]
  const fixtures = [
    ['S-oldest', 'horror', ['action'], '2026-01-01T00:00:00Z'],
    ['M-old', 'action', [], '2026-02-01T00:00:00Z'],
    ['S-mid', 'puzzle', ['horror', 'action'], '2026-03-01T00:00:00Z'],
    ['Unrelated', 'puzzle', ['horror'], '2026-03-15T00:00:00Z'],
    ['M-mid', 'action', ['horror'], '2026-04-01T00:00:00Z'],
    ['S-new', 'adventure', ['action'], '2026-05-01T00:00:00Z'],
    ['M-new', 'action', ['adventure'], '2026-06-01T00:00:00Z'],
    ['M-tie-a', 'action', [], '2026-07-01T00:00:00Z'],
    ['M-tie-b', 'action', [], '2026-07-01T00:00:00Z'],
  ];

  beforeEach(async () => {
    for (const [name, main, secondaries, createdAt] of fixtures) {
      const g = await createGame({
        name,
        description: `${name} description`,
        mainCategory: cat[main],
        secondaryCategories: secondaries.map((s) => cat[s]),
      });
      await setCreatedAt(g.id, createdAt);
    }
  });

  it('lists main matches first, then secondary matches, newest first', async () => {
    const res = await request(app).get(`/api/games?categoryId=${cat.action}&limit=100`);
    assert.equal(res.status, 200);
    const names = res.body.data.map((g) => g.name);

    // Same createdAt: _id descending is the tie-breaker (b was created after a).
    assert.deepEqual(names, [
      'M-tie-b',
      'M-tie-a',
      'M-new',
      'M-mid',
      'M-old',
      'S-new',
      'S-mid',
      'S-oldest',
    ]);
    assert.deepEqual(
      res.body.data.map((g) => g.categoryMatch),
      ['main', 'main', 'main', 'main', 'main', 'secondary', 'secondary', 'secondary']
    );
    assert.equal(new Set(res.body.data.map((g) => g.id)).size, names.length, 'no duplicates');
    assert.equal(res.body.pagination.total, 8);
  });

  it('keeps the priority order and counts consistent across pages', async () => {
    const full = await request(app).get(`/api/games?categoryId=${cat.action}&limit=100`);
    const expected = full.body.data.map((g) => g.id);

    const seen = [];
    let offset = 0;
    let pages = 0;
    for (;;) {
      const res = await request(app).get(
        `/api/games?categoryId=${cat.action}&limit=3&offset=${offset}`
      );
      assert.equal(res.body.pagination.total, 8);
      seen.push(...res.body.data.map((g) => g.id));
      pages += 1;
      if (!res.body.pagination.hasMore) {
        assert.equal(res.body.pagination.nextOffset, null);
        break;
      }
      offset = res.body.pagination.nextOffset;
    }
    assert.equal(pages, 3);
    assert.deepEqual(seen, expected, 'pages concatenate to the full ordering, no gaps or repeats');
  });

  it('legacy typeId query param behaves like categoryId', async () => {
    const a = await request(app).get(`/api/games?categoryId=${cat.action}&limit=100`);
    const b = await request(app).get(`/api/games?typeId=${cat.action}&limit=100`);
    assert.deepEqual(
      b.body.data.map((g) => g.id),
      a.body.data.map((g) => g.id)
    );
  });

  it('combines search with the category filter and total', async () => {
    const res = await request(app).get(`/api/games?categoryId=${cat.action}&search=mid&limit=100`);
    assert.deepEqual(
      res.body.data.map((g) => g.name),
      ['M-mid', 'S-mid']
    );
    assert.equal(res.body.pagination.total, 2);

    const special = await request(app).get('/api/games?search=.*');
    assert.equal(special.status, 200);
    assert.equal(special.body.pagination.total, 0, 'search input is not treated as a regex');
  });

  it('unfiltered list is newest first with every game exactly once', async () => {
    const res = await request(app).get('/api/games?limit=100');
    assert.equal(res.body.pagination.total, fixtures.length);
    assert.equal(res.body.data[res.body.data.length - 1].name, 'S-oldest');
    assert.ok(res.body.data.every((g) => g.categoryMatch === undefined));
    assert.ok(res.body.data.every((g) => g.mainCategory && Array.isArray(g.secondaryCategories)));
  });

  it('refuses to delete a category still used as a secondary category', async () => {
    const res = await request(app).delete(`/api/game-types/${cat.adventure}`).set(auth());
    assert.equal(res.status, 409);
  });
});
