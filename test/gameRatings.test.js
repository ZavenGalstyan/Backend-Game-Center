'use strict';

/**
 * Game ratings (1-5 stars, one final rating per user per game) end to end
 * through Express against an in-memory MongoDB (never the configured database).
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
let GameLike;
let GameRating;
let User;
let signAccessToken;
let adminToken;
const cat = {}; // slug -> id string

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

let userSeq = 0;
/** Create a fresh player and return its access token. */
async function newPlayerToken() {
  userSeq += 1;
  const user = await User.create({
    username: `player_${userSeq}`,
    email: `player${userSeq}@test.local`,
    password: 'Password123',
    role: 'player',
  });
  return signAccessToken(user);
}

async function createGame(body) {
  const res = await request(app).post('/api/games').set(bearer(adminToken)).send(body);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data;
}

function rate(gameId, token, body) {
  const req = request(app).post(`/api/games/${gameId}/ratings`);
  if (token) req.set(bearer(token));
  return req.send(body);
}

/** Rate a game with `values`, one new user per value. */
async function rateMany(gameId, values) {
  for (const rating of values) {
    const res = await rate(gameId, await newPlayerToken(), { rating });
    assert.equal(res.status, 201, JSON.stringify(res.body));
  }
}

function summary(gameId, token) {
  const req = request(app).get(`/api/games/${gameId}/ratings/summary`);
  if (token) req.set(bearer(token));
  return req;
}

async function setCreatedAt(id, iso) {
  await Game.collection.updateOne(
    { _id: new mongoose.Types.ObjectId(id) },
    { $set: { createdAt: new Date(iso) } }
  );
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
  GameLike = require('../src/models/gameLike.model');
  GameRating = require('../src/models/gameRating.model');
  User = require('../src/models/user.model');
  const GameType = require('../src/models/gameType.model');
  ({ signAccessToken } = require('../src/utils/jwt'));

  await mongoose.connect(process.env.MONGO_URI);
  // The unique {game, user} index must exist before the concurrency test.
  await Promise.all([Game.init(), GameLike.init(), GameRating.init(), User.init()]);

  const admin = await User.create({
    username: 'admin_test',
    email: 'admin@test.local',
    password: 'Password123',
    role: 'admin',
  });
  adminToken = signAccessToken(admin);

  for (const [name, slug] of [
    ['Action', 'action'],
    ['Horror', 'horror'],
    ['Puzzle', 'puzzle'],
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
  await Promise.all([Game.deleteMany({}), GameRating.deleteMany({}), GameLike.deleteMany({})]);
});

const newGame = (name = 'Rated Game', extra = {}) =>
  createGame({ name, description: 'A game to rate.', mainCategory: cat.action, ...extra });

describe('submit rating', () => {
  it('accepts a 1-star rating from an authenticated user', async () => {
    const g = await newGame();
    const res = await rate(g.id, await newPlayerToken(), { rating: 1 });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.rating.rating, 1);
    assert.equal(res.body.data.rating.gameId, g.id);
    assert.deepEqual(res.body.data.summary, {
      averageRating: 1,
      ratingsCount: 1,
      ratingDistribution: { 1: 1, 2: 0, 3: 0, 4: 0, 5: 0 },
      myRating: 1,
    });
  });

  it('accepts a 5-star rating and persists it', async () => {
    const g = await newGame();
    const res = await rate(g.id, await newPlayerToken(), { rating: 5 });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.summary.myRating, 5);
    assert.equal(await GameRating.countDocuments({ game: g.id, rating: 5 }), 1);
  });

  it('returns 401 without a token and stores nothing', async () => {
    const g = await newGame();
    const res = await rate(g.id, null, { rating: 4 });
    assert.equal(res.status, 401);
    assert.equal(await GameRating.countDocuments(), 0);
  });

  it('returns 401 with an invalid token', async () => {
    const g = await newGame();
    const res = await rate(g.id, 'not-a-jwt', { rating: 4 });
    assert.equal(res.status, 401);
  });

  it('rejects a second rating from the same user with 409 and keeps the first', async () => {
    const g = await newGame();
    const token = await newPlayerToken();
    assert.equal((await rate(g.id, token, { rating: 2 })).status, 201);

    const again = await rate(g.id, token, { rating: 5 });
    assert.equal(again.status, 409);
    assert.equal(again.body.success, false);
    assert.match(again.body.message, /already rated/i);

    const docs = await GameRating.find({ game: g.id });
    assert.equal(docs.length, 1);
    assert.equal(docs[0].rating, 2, 'the original rating is final');
  });

  it('lets the same user rate two different games', async () => {
    const a = await newGame('Game A');
    const b = await newGame('Game B');
    const token = await newPlayerToken();
    assert.equal((await rate(a.id, token, { rating: 3 })).status, 201);
    assert.equal((await rate(b.id, token, { rating: 4 })).status, 201);
    assert.equal(await GameRating.countDocuments(), 2);
  });

  it('lets two different users rate the same game', async () => {
    const g = await newGame();
    assert.equal((await rate(g.id, await newPlayerToken(), { rating: 3 })).status, 201);
    const res = await rate(g.id, await newPlayerToken(), { rating: 5 });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.summary.ratingsCount, 2);
    assert.equal(res.body.data.summary.averageRating, 4);
  });

  for (const [label, body] of [
    ['0', { rating: 0 }],
    ['6', { rating: 6 }],
    ['a negative number', { rating: -1 }],
    ['a decimal', { rating: 4.5 }],
    ['a numeric string', { rating: '5' }],
    ['a non-numeric string', { rating: 'five' }],
    ['a boolean', { rating: true }],
    ['null', { rating: null }],
    ['an array', { rating: [5] }],
    ['a missing value', {}],
  ]) {
    it(`rejects ${label} with 400`, async () => {
      const g = await newGame();
      const res = await rate(g.id, await newPlayerToken(), body);
      assert.equal(res.status, 400, JSON.stringify(res.body));
      assert.ok(res.body.errors.some((e) => e.field === 'rating'));
      assert.equal(await GameRating.countDocuments(), 0);
    });
  }

  it('rejects a malformed game id with 400', async () => {
    const res = await rate('not-an-id', await newPlayerToken(), { rating: 4 });
    assert.equal(res.status, 400);
    assert.ok(res.body.errors.some((e) => e.field === 'gameId'));
  });

  it('rejects a game that does not exist with 404', async () => {
    const missing = new mongoose.Types.ObjectId().toString();
    const res = await rate(missing, await newPlayerToken(), { rating: 4 });
    assert.equal(res.status, 404);
    assert.equal(await GameRating.countDocuments(), 0);
  });

  it('ignores a userId in the body - the rating belongs to the token owner', async () => {
    const g = await newGame();
    const victim = await User.create({
      username: 'victim_user',
      email: 'victim@test.local',
      password: 'Password123',
    });
    const token = await newPlayerToken();
    const res = await rate(g.id, token, { rating: 1, userId: victim.id, user: victim.id });
    assert.equal(res.status, 201);
    assert.equal(await GameRating.countDocuments({ user: victim._id }), 0);

    // The victim can still rate it themselves.
    const own = await rate(g.id, signAccessToken(victim), { rating: 5 });
    assert.equal(own.status, 201);
  });

  it('allows only one of many concurrent duplicate submissions', async () => {
    const g = await newGame();
    const token = await newPlayerToken();
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => rate(g.id, token, { rating: (i % 5) + 1 }))
    );
    const statuses = results.map((r) => r.status).sort();
    assert.equal(statuses.filter((s) => s === 201).length, 1, statuses.join(','));
    assert.equal(statuses.filter((s) => s === 409).length, 9, statuses.join(','));
    assert.equal(await GameRating.countDocuments({ game: g.id }), 1);
  });

  it('exposes no route to update or delete a rating', async () => {
    const g = await newGame();
    const token = await newPlayerToken();
    await rate(g.id, token, { rating: 3 });
    for (const method of ['put', 'patch', 'delete']) {
      const res = await request(app)[method](`/api/games/${g.id}/ratings`)
        .set(bearer(token))
        .send({ rating: 5 });
      assert.equal(res.status, 404, `${method} should not exist`);
    }
    const doc = await GameRating.findOne({ game: g.id });
    assert.equal(doc.rating, 3);
  });
});

describe('rating summary', () => {
  it('returns valid defaults for an unrated game', async () => {
    const g = await newGame();
    const res = await summary(g.id);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, {
      averageRating: 0,
      ratingsCount: 0,
      ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      myRating: null,
    });
  });

  it('computes the exact average, count and distribution', async () => {
    const g = await newGame();
    await rateMany(g.id, [5, 4, 5, 3]); // 17 / 4 = 4.25
    const res = await summary(g.id);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.averageRating, 4.3, '4.25 is shown with one decimal');
    assert.equal(res.body.data.ratingsCount, 4);
    assert.deepEqual(res.body.data.ratingDistribution, { 1: 0, 2: 0, 3: 1, 4: 1, 5: 2 });
    assert.equal(res.body.data.myRating, null, 'guest has no own rating');
  });

  it('rounds from exact totals, not from rounded intermediates', async () => {
    const g = await newGame();
    await rateMany(g.id, [5, 4, 4]); // 13 / 3 = 4.333...
    assert.equal((await summary(g.id)).body.data.averageRating, 4.3);
    await rateMany(g.id, [5]); // 18 / 4 = 4.5
    assert.equal((await summary(g.id)).body.data.averageRating, 4.5);
    await rateMany(g.id, [1, 1]); // 20 / 6 = 3.333...
    assert.equal((await summary(g.id)).body.data.averageRating, 3.3);
  });

  it('keeps exact halves exact (87 / 20 = 4.35 -> 4.4)', async () => {
    const { roundedAverage } = require('../src/services/gameRating.service');
    assert.equal(roundedAverage(87, 20), 4.4);
    assert.equal(roundedAverage(17, 4), 4.3);
    assert.equal(roundedAverage(0, 0), 0);
  });

  it('includes myRating for an authenticated caller who rated', async () => {
    const g = await newGame();
    const token = await newPlayerToken();
    await rate(g.id, token, { rating: 4 });
    await rateMany(g.id, [2]);

    const mine = await summary(g.id, token);
    assert.equal(mine.body.data.myRating, 4);

    const other = await summary(g.id, await newPlayerToken());
    assert.equal(other.body.data.myRating, null);
  });

  it('never exposes individual raters', async () => {
    const g = await newGame();
    await rateMany(g.id, [3]);
    const res = await summary(g.id);
    assert.deepEqual(Object.keys(res.body.data).sort(), [
      'averageRating',
      'myRating',
      'ratingDistribution',
      'ratingsCount',
    ]);
  });

  it('returns 404 for a missing game and 400 for a malformed id', async () => {
    assert.equal((await summary(new mongoose.Types.ObjectId().toString())).status, 404);
    assert.equal((await summary('nope')).status, 400);
  });
});

describe('rating stats on game responses', () => {
  it('single game includes averageRating and ratingsCount', async () => {
    const g = await newGame();
    assert.equal(g.averageRating, 0, 'new games start unrated');
    assert.equal(g.ratingsCount, 0);
    await rateMany(g.id, [5, 4]);

    const res = await request(app).get(`/api/games/${g.id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.averageRating, 4.5);
    assert.equal(res.body.data.ratingsCount, 2);
    assert.equal(res.body.data.mainCategory.name, 'Action', 'existing fields preserved');
  });

  it('game list includes per-game stats (rated and unrated)', async () => {
    const a = await newGame('Alpha');
    const b = await newGame('Bravo');
    await rateMany(a.id, [1, 2, 3]);

    const res = await request(app).get('/api/games');
    assert.equal(res.status, 200);
    const byId = Object.fromEntries(res.body.data.map((g) => [g.id, g]));
    assert.equal(byId[a.id].averageRating, 2);
    assert.equal(byId[a.id].ratingsCount, 3);
    assert.equal(byId[b.id].averageRating, 0);
    assert.equal(byId[b.id].ratingsCount, 0);
  });

  it('search results include rating stats', async () => {
    const g = await newGame('Searchable Mansion');
    await newGame('Other');
    await rateMany(g.id, [4]);
    const res = await request(app).get('/api/games').query({ search: 'mansion' });
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].averageRating, 4);
    assert.equal(res.body.data[0].ratingsCount, 1);
  });

  it('category listings keep main-first ordering and carry stats', async () => {
    const secondaryNew = await newGame('Secondary New', {
      mainCategory: cat.puzzle,
      secondaryCategories: [cat.horror],
    });
    const mainOld = await newGame('Main Old', { mainCategory: cat.horror });
    const mainNew = await newGame('Main New', { mainCategory: cat.horror });
    await setCreatedAt(secondaryNew.id, '2026-03-01T00:00:00Z');
    await setCreatedAt(mainOld.id, '2026-01-01T00:00:00Z');
    await setCreatedAt(mainNew.id, '2026-02-01T00:00:00Z');
    // A highly rated secondary match must not jump ahead of main matches.
    await rateMany(secondaryNew.id, [5, 5]);
    await rateMany(mainOld.id, [1]);

    const res = await request(app).get('/api/games').query({ categoryId: cat.horror });
    assert.equal(res.status, 200);
    assert.deepEqual(
      res.body.data.map((g) => [g.name, g.categoryMatch, g.averageRating, g.ratingsCount]),
      [
        ['Main New', 'main', 0, 0],
        ['Main Old', 'main', 1, 1],
        ['Secondary New', 'secondary', 5, 2],
      ]
    );
  });

  it('pagination is unchanged and every page carries stats', async () => {
    const ids = [];
    for (let i = 0; i < 5; i += 1) {
      const g = await newGame(`Paged ${i}`);
      await setCreatedAt(g.id, `2026-01-0${i + 1}T00:00:00Z`);
      ids.push(g.id);
    }
    await rateMany(ids[4], [5]);

    const p1 = await request(app).get('/api/games').query({ limit: 2, offset: 0 });
    const p2 = await request(app).get('/api/games').query({ limit: 2, offset: 2 });
    const p3 = await request(app).get('/api/games').query({ limit: 2, offset: 4 });
    assert.deepEqual(p1.body.pagination, {
      limit: 2,
      offset: 0,
      total: 5,
      returned: 2,
      hasMore: true,
      nextOffset: 2,
    });
    assert.deepEqual(p3.body.pagination, {
      limit: 2,
      offset: 4,
      total: 5,
      returned: 1,
      hasMore: false,
      nextOffset: null,
    });
    const all = [...p1.body.data, ...p2.body.data, ...p3.body.data];
    assert.deepEqual(
      all.map((g) => g.name),
      ['Paged 4', 'Paged 3', 'Paged 2', 'Paged 1', 'Paged 0']
    );
    assert.equal(all[0].ratingsCount, 1);
    assert.ok(all.every((g) => typeof g.averageRating === 'number' && Number.isInteger(g.ratingsCount)));
  });

  it('liked games include rating stats', async () => {
    const g = await newGame();
    await rateMany(g.id, [3, 4]);
    const token = await newPlayerToken();
    assert.equal(
      (await request(app).post(`/api/games/${g.id}/like`).set(bearer(token))).status,
      200
    );
    const res = await request(app).get('/api/users/me/liked-games').set(bearer(token));
    assert.equal(res.status, 200);
    assert.equal(res.body.data[0].averageRating, 3.5);
    assert.equal(res.body.data[0].ratingsCount, 2);
  });

  it('rating does not touch likes, and deleting a game removes its ratings', async () => {
    const g = await newGame();
    const token = await newPlayerToken();
    await request(app).post(`/api/games/${g.id}/like`).set(bearer(token));
    await rate(g.id, token, { rating: 5 });
    assert.equal(await GameLike.countDocuments({ game: g.id }), 1);

    const del = await request(app).delete(`/api/games/${g.id}`).set(bearer(adminToken));
    assert.equal(del.status, 200);
    assert.equal(await GameRating.countDocuments({ game: g.id }), 0);
    assert.equal(await GameLike.countDocuments({ game: g.id }), 0);
  });

  it('admin update response keeps stats', async () => {
    const g = await newGame();
    await rateMany(g.id, [2]);
    const res = await request(app)
      .patch(`/api/games/${g.id}`)
      .set(bearer(adminToken))
      .send({ name: 'Renamed' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.averageRating, 2);
    assert.equal(res.body.data.ratingsCount, 1);
  });
});
