'use strict';

/**
 * Game comments (public reads, owner-only writes, max 5 per user per game)
 * end to end through Express against an in-memory MongoDB (never the
 * configured database).
 *
 * Note: comment creation is rate limited to 10 requests per user per minute,
 * so every test uses fresh users and stays under that, except the test that
 * exercises the limiter itself.
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
let GameComment;
let User;
let signAccessToken;
let adminToken;
let categoryId;

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

let userSeq = 0;
/** Create a fresh player; returns { user, token }. */
async function newPlayer() {
  userSeq += 1;
  const user = await User.create({
    username: `commenter_${userSeq}`,
    email: `commenter${userSeq}@test.local`,
    password: 'Password123',
    role: 'player',
  });
  return { user, token: signAccessToken(user) };
}

async function newGame(name = 'Commented Game') {
  const res = await request(app)
    .post('/api/games')
    .set(bearer(adminToken))
    .send({ name, description: 'A game to comment on.', mainCategory: categoryId });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data;
}

function post(gameId, token, body) {
  const req = request(app).post(`/api/games/${gameId}/comments`);
  if (token) req.set(bearer(token));
  return req.send(body);
}

function list(gameId, query = {}, token) {
  const req = request(app).get(`/api/games/${gameId}/comments`).query(query);
  if (token) req.set(bearer(token));
  return req;
}

function patch(gameId, commentId, token, body) {
  const req = request(app).patch(`/api/games/${gameId}/comments/${commentId}`);
  if (token) req.set(bearer(token));
  return req.send(body);
}

function del(gameId, commentId, token) {
  const req = request(app).delete(`/api/games/${gameId}/comments/${commentId}`);
  if (token) req.set(bearer(token));
  return req;
}

const myCount = (gameId, token) =>
  request(app).get(`/api/games/${gameId}/comments/me/count`).set(bearer(token));

/** Post `n` comments as `token`, asserting each succeeds; returns the comments. */
async function postMany(gameId, token, n) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const res = await post(gameId, token, { content: `comment ${i + 1}` });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    out.push(res.body.data.comment);
  }
  return out;
}

const newId = () => new mongoose.Types.ObjectId().toString();

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
  GameComment = require('../src/models/gameComment.model');
  User = require('../src/models/user.model');
  const GameType = require('../src/models/gameType.model');
  ({ signAccessToken } = require('../src/utils/jwt'));

  await mongoose.connect(process.env.MONGO_URI);
  // The unique {game, user, slot} index must exist before the limit tests.
  await Promise.all([Game.init(), GameComment.init(), User.init()]);

  const admin = await User.create({
    username: 'admin_test',
    email: 'admin@test.local',
    password: 'Password123',
    role: 'admin',
  });
  adminToken = signAccessToken(admin);
  categoryId = (await GameType.create({ name: 'Action', slug: 'action' }))._id.toString();
});

after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await Promise.all([Game.deleteMany({}), GameComment.deleteMany({})]);
});

describe('list comments (public)', () => {
  it('lets guests read comments without a token', async () => {
    const g = await newGame();
    const { token } = await newPlayer();
    await postMany(g.id, token, 2);

    const res = await list(g.id);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.length, 2);
    assert.equal(res.body.pagination.total, 2);
    for (const c of res.body.data) assert.equal(c.isOwner, false);
  });

  it('returns an empty page for a game without comments', async () => {
    const g = await newGame();
    const res = await list(g.id);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, []);
    assert.deepEqual(res.body.pagination, {
      limit: 10,
      offset: 0,
      total: 0,
      returned: 0,
      hasMore: false,
      nextOffset: null,
    });
  });

  it('marks the caller\'s own comments with isOwner when a token is sent', async () => {
    const g = await newGame();
    const a = await newPlayer();
    const b = await newPlayer();
    await postMany(g.id, a.token, 1);
    await postMany(g.id, b.token, 1);

    const res = await list(g.id, {}, a.token);
    assert.equal(res.status, 200);
    const mine = res.body.data.filter((c) => c.isOwner);
    assert.equal(mine.length, 1);
    assert.equal(mine[0].author.id, a.user.id);
  });

  it('exposes only safe author fields (no email, role, password or slot)', async () => {
    const g = await newGame();
    const { user, token } = await newPlayer();
    await postMany(g.id, token, 1);

    const res = await list(g.id);
    const [c] = res.body.data;
    assert.deepEqual(Object.keys(c).sort(), [
      'author',
      'content',
      'createdAt',
      'editedAt',
      'gameId',
      'id',
      'isEdited',
      'isOwner',
      'updatedAt',
    ]);
    assert.deepEqual(c.author, { id: user.id, username: user.username, isDeleted: false });
    const raw = JSON.stringify(res.body);
    assert.ok(!raw.includes('@test.local'));
    assert.ok(!raw.includes('password'));
    assert.ok(!raw.includes('slot'));
  });

  it('returns 404 for a non-existent game and 400 for a malformed id', async () => {
    assert.equal((await list(newId())).status, 404);
    assert.equal((await list('not-an-id')).status, 400);
  });

  it('rejects an invalid token sent to the public list with 401', async () => {
    const g = await newGame();
    const res = await list(g.id, {}, 'garbage.token.value');
    assert.equal(res.status, 401);
  });

  it('shows comments by deleted users as "Deleted user" without leaking data', async () => {
    const g = await newGame();
    const { user, token } = await newPlayer();
    await postMany(g.id, token, 1);
    await User.deleteOne({ _id: user._id });

    const res = await list(g.id);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data[0].author, {
      id: null,
      username: 'Deleted user',
      isDeleted: true,
    });
    assert.ok(!JSON.stringify(res.body).includes(user.username));
  });
});

describe('pagination and sorting', () => {
  /** Insert 7 comments directly; c2..c4 share one timestamp to test tie-breaking. */
  async function seed(gameId) {
    const users = [];
    for (let i = 0; i < 2; i += 1) users.push((await newPlayer()).user);
    const stamps = [
      '2026-10-01T10:00:00Z',
      '2026-10-02T10:00:00Z',
      '2026-10-03T10:00:00Z',
      '2026-10-03T10:00:00Z',
      '2026-10-03T10:00:00Z',
      '2026-10-04T10:00:00Z',
      '2026-10-05T10:00:00Z',
    ];
    const docs = stamps.map((ts, i) => ({
      game: new mongoose.Types.ObjectId(gameId),
      user: users[i % 2]._id,
      slot: Math.floor(i / 2),
      content: `c${i}`,
      createdAt: new Date(ts),
      updatedAt: new Date(ts),
    }));
    await GameComment.collection.insertMany(docs);
  }

  it('returns newest first by default with a stable id tie-break across pages', async () => {
    const g = await newGame();
    await seed(g.id);

    const seen = [];
    let offset = 0;
    for (;;) {
      const res = await list(g.id, { limit: 3, offset });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body.pagination.total, 7);
      seen.push(...res.body.data);
      if (!res.body.pagination.hasMore) {
        assert.equal(res.body.pagination.nextOffset, null);
        break;
      }
      offset = res.body.pagination.nextOffset;
    }

    assert.equal(seen.length, 7);
    assert.equal(new Set(seen.map((c) => c.id)).size, 7, 'pages must not overlap');
    for (let i = 1; i < seen.length; i += 1) {
      const prev = seen[i - 1];
      const cur = seen[i];
      const order = Date.parse(prev.createdAt) - Date.parse(cur.createdAt);
      assert.ok(order > 0 || (order === 0 && prev.id > cur.id), `bad order at ${i}`);
    }
    assert.equal(seen[0].content, 'c6');
    assert.equal(seen[6].content, 'c0');
  });

  it('supports sort=oldest', async () => {
    const g = await newGame();
    await seed(g.id);
    const res = await list(g.id, { sort: 'oldest', limit: 100 });
    assert.equal(res.status, 200);
    assert.equal(res.body.data[0].content, 'c0');
    assert.equal(res.body.data[6].content, 'c6');
  });

  it('reports hasMore / nextOffset correctly', async () => {
    const g = await newGame();
    await seed(g.id);
    const res = await list(g.id, { limit: 5, offset: 0 });
    assert.deepEqual(res.body.pagination, {
      limit: 5,
      offset: 0,
      total: 7,
      returned: 5,
      hasMore: true,
      nextOffset: 5,
    });
  });

  it('rejects invalid pagination and sort values', async () => {
    const g = await newGame();
    assert.equal((await list(g.id, { limit: 0 })).status, 400);
    assert.equal((await list(g.id, { limit: 101 })).status, 400);
    assert.equal((await list(g.id, { offset: -1 })).status, 400);
    assert.equal((await list(g.id, { sort: 'random' })).status, 400);
  });
});

describe('create comment', () => {
  it('rejects guests with 401', async () => {
    const g = await newGame();
    const res = await post(g.id, null, { content: 'hello' });
    assert.equal(res.status, 401);
    assert.equal(await GameComment.countDocuments(), 0);
  });

  it('rejects an invalid token with 401', async () => {
    const g = await newGame();
    const res = await post(g.id, 'garbage.token.value', { content: 'hello' });
    assert.equal(res.status, 401);
  });

  it('creates a comment for an authenticated user and returns the allowance', async () => {
    const g = await newGame();
    const { user, token } = await newPlayer();
    const res = await post(g.id, token, { content: '  Great game!  ' });

    assert.equal(res.status, 201, JSON.stringify(res.body));
    const { comment, allowance } = res.body.data;
    assert.equal(comment.content, 'Great game!');
    assert.equal(comment.gameId, g.id);
    assert.deepEqual(comment.author, { id: user.id, username: user.username, isDeleted: false });
    assert.equal(comment.isOwner, true);
    assert.equal(comment.isEdited, false);
    assert.equal(comment.editedAt, null);
    assert.ok(comment.createdAt);
    assert.deepEqual(allowance, { count: 1, limit: 5, remaining: 4, canComment: true });
  });

  it('ignores a user id in the body - the author always comes from the token', async () => {
    const g = await newGame();
    const a = await newPlayer();
    const b = await newPlayer();
    const res = await post(g.id, a.token, { content: 'mine', user: b.user.id, userId: b.user.id });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.comment.author.id, a.user.id);
  });

  it('rejects missing, non-string, empty, whitespace-only and oversized content', async () => {
    const g = await newGame();
    const { token } = await newPlayer();
    for (const body of [
      {},
      { content: null },
      { content: 123 },
      { content: ['a'] },
      { content: '' },
      { content: '   \n\t  ' },
      { content: 'x'.repeat(1001) },
    ]) {
      const res = await post(g.id, token, body);
      assert.equal(res.status, 400, `${JSON.stringify(body).slice(0, 40)} -> ${res.status}`);
      assert.equal(res.body.errors[0].field, 'content');
    }
    assert.equal(await GameComment.countDocuments(), 0);
  });

  it('accepts exactly 1000 characters', async () => {
    const g = await newGame();
    const { token } = await newPlayer();
    const res = await post(g.id, token, { content: 'y'.repeat(1000) });
    assert.equal(res.status, 201);
  });

  it('stores HTML verbatim as plain text and strips control characters', async () => {
    const g = await newGame();
    const { token } = await newPlayer();
    const html = '<script>alert(1)</script><b>bold</b>';
    const res = await post(g.id, token, { content: `${html}\u0007\r\n\r\n\r\n\r\nend‮` });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.comment.content, `${html}\n\nend`);
  });

  it('returns 404 for a non-existent game and 400 for a malformed id', async () => {
    const { token } = await newPlayer();
    assert.equal((await post(newId(), token, { content: 'hi' })).status, 404);
    assert.equal((await post('bad-id', token, { content: 'hi' })).status, 400);
  });

  it('rejects malformed JSON with 400', async () => {
    const g = await newGame();
    const { token } = await newPlayer();
    const res = await request(app)
      .post(`/api/games/${g.id}/comments`)
      .set(bearer(token))
      .set('Content-Type', 'application/json')
      .send('{"content": ');
    assert.equal(res.status, 400);
    assert.equal(res.body.stack, undefined);
  });
});

describe('five comments per user per game', () => {
  it('accepts five comments and rejects the sixth with COMMENT_LIMIT_REACHED', async () => {
    const g = await newGame();
    const { token } = await newPlayer();
    const created = await postMany(g.id, token, 5);
    assert.equal(created.length, 5);

    const sixth = await post(g.id, token, { content: 'one too many' });
    assert.equal(sixth.status, 409);
    assert.equal(sixth.body.code, 'COMMENT_LIMIT_REACHED');
    assert.equal(await GameComment.countDocuments({ game: g.id }), 5);

    const count = await myCount(g.id, token);
    assert.equal(count.status, 200);
    assert.deepEqual(count.body.data, { count: 5, limit: 5, remaining: 0, canComment: false });
  });

  it('keeps separate limits for different games', async () => {
    const x = await newGame('Game X');
    const y = await newGame('Game Y');
    const { user, token } = await newPlayer();
    // User is already full on X (seeded directly to stay under the rate limit).
    await GameComment.insertMany(
      [0, 1, 2, 3, 4].map((slot) => ({ game: x.id, user: user._id, slot, content: `x${slot}` }))
    );

    assert.equal((await post(x.id, token, { content: 'x6' })).body.code, 'COMMENT_LIMIT_REACHED');
    await postMany(y.id, token, 5);
    assert.equal((await post(y.id, token, { content: 'y6' })).status, 409);

    assert.equal((await myCount(x.id, token)).body.data.count, 5);
    assert.equal((await myCount(y.id, token)).body.data.count, 5);
  });

  it('is not affected by other users\' comments', async () => {
    const g = await newGame();
    const a = await newPlayer();
    const b = await newPlayer();
    await postMany(g.id, a.token, 5);

    const res = await post(g.id, b.token, { content: 'b is fine' });
    assert.equal(res.status, 201);
    assert.deepEqual(res.body.data.allowance, {
      count: 1,
      limit: 5,
      remaining: 4,
      canComment: true,
    });
    assert.equal((await myCount(g.id, a.token)).body.data.remaining, 0);
  });

  it('frees a slot when a comment is deleted', async () => {
    const g = await newGame();
    const { token } = await newPlayer();
    const created = await postMany(g.id, token, 5);
    assert.equal((await post(g.id, token, { content: 'blocked' })).status, 409);

    const removed = await del(g.id, created[2].id, token);
    assert.equal(removed.status, 200, JSON.stringify(removed.body));
    assert.equal(removed.body.data.deletedCommentId, created[2].id);
    assert.deepEqual(removed.body.data.allowance, {
      count: 4,
      limit: 5,
      remaining: 1,
      canComment: true,
    });

    const again = await post(g.id, token, { content: 'back in' });
    assert.equal(again.status, 201);
    assert.equal(again.body.data.allowance.remaining, 0);
    assert.equal((await post(g.id, token, { content: 'blocked again' })).status, 409);
  });

  it('never exceeds five under concurrent submissions', async () => {
    const g = await newGame();
    const { user, token } = await newPlayer();

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => post(g.id, token, { content: `race ${i}` }))
    );
    const statuses = results.map((r) => r.status).sort();
    assert.deepEqual(statuses, [201, 201, 201, 201, 201, 409, 409, 409, 409, 409]);
    for (const r of results.filter((x) => x.status === 409)) {
      assert.equal(r.body.code, 'COMMENT_LIMIT_REACHED');
    }

    const stored = await GameComment.find({ game: g.id, user: user._id }).lean();
    assert.equal(stored.length, 5);
    assert.deepEqual(stored.map((c) => c.slot).sort(), [0, 1, 2, 3, 4]);
  });

  it('fills only the remaining slots under concurrency', async () => {
    const g = await newGame();
    const { token } = await newPlayer();
    await postMany(g.id, token, 3);

    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) => post(g.id, token, { content: `late ${i}` }))
    );
    assert.equal(results.filter((r) => r.status === 201).length, 2);
    assert.equal(results.filter((r) => r.status === 409).length, 4);
    assert.equal((await myCount(g.id, token)).body.data.count, 5);
  });
});

describe('edit comment', () => {
  it('lets the owner edit, preserving createdAt and marking it edited', async () => {
    const g = await newGame();
    const { token } = await newPlayer();
    const [c] = await postMany(g.id, token, 1);
    await new Promise((r) => setTimeout(r, 15));

    const res = await patch(g.id, c.id, token, { content: '  updated text ' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const updated = res.body.data.comment;
    assert.equal(updated.id, c.id);
    assert.equal(updated.content, 'updated text');
    assert.equal(updated.isEdited, true);
    assert.ok(updated.editedAt);
    assert.equal(updated.createdAt, c.createdAt);
    assert.ok(Date.parse(updated.updatedAt) > Date.parse(c.updatedAt));
    assert.equal(updated.isOwner, true);
  });

  it('does not mark a comment edited when the content is unchanged', async () => {
    const g = await newGame();
    const { token } = await newPlayer();
    const [c] = await postMany(g.id, token, 1);
    const res = await patch(g.id, c.id, token, { content: ` ${c.content} ` });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.comment.isEdited, false);
    assert.equal(res.body.data.comment.updatedAt, c.updatedAt);
  });

  it('does not consume a slot', async () => {
    const g = await newGame();
    const { token } = await newPlayer();
    const created = await postMany(g.id, token, 5);
    for (const c of created) {
      assert.equal((await patch(g.id, c.id, token, { content: `edited ${c.id}` })).status, 200);
    }
    assert.deepEqual((await myCount(g.id, token)).body.data, {
      count: 5,
      limit: 5,
      remaining: 0,
      canComment: false,
    });
    assert.equal(await GameComment.countDocuments({ game: g.id }), 5);
  });

  it('validates the new content', async () => {
    const g = await newGame();
    const { token } = await newPlayer();
    const [c] = await postMany(g.id, token, 1);
    assert.equal((await patch(g.id, c.id, token, { content: '   ' })).status, 400);
    assert.equal((await patch(g.id, c.id, token, { content: 'z'.repeat(1001) })).status, 400);
    assert.equal((await patch(g.id, c.id, token, {})).status, 400);
  });
});

describe('ownership and authorization', () => {
  it('forbids editing or deleting another user\'s comment (403)', async () => {
    const g = await newGame();
    const a = await newPlayer();
    const b = await newPlayer();
    const [c] = await postMany(g.id, a.token, 1);

    const edit = await patch(g.id, c.id, b.token, { content: 'hijacked' });
    assert.equal(edit.status, 403);
    assert.equal(edit.body.code, 'COMMENT_FORBIDDEN');

    const remove = await del(g.id, c.id, b.token);
    assert.equal(remove.status, 403);
    assert.equal(remove.body.code, 'COMMENT_FORBIDDEN');

    const stored = await GameComment.findById(c.id).lean();
    assert.equal(stored.content, c.content);
  });

  it('does not let admins modify other users\' comments either', async () => {
    const g = await newGame();
    const a = await newPlayer();
    const [c] = await postMany(g.id, a.token, 1);
    assert.equal((await del(g.id, c.id, adminToken)).status, 403);
  });

  it('rejects guests on PATCH, DELETE and me/count with 401', async () => {
    const g = await newGame();
    const a = await newPlayer();
    const [c] = await postMany(g.id, a.token, 1);
    assert.equal((await patch(g.id, c.id, null, { content: 'x' })).status, 401);
    assert.equal((await del(g.id, c.id, null)).status, 401);
    assert.equal((await request(app).get(`/api/games/${g.id}/comments/me/count`)).status, 401);
  });

  it('returns 404 for missing comments or comments of another game', async () => {
    const g1 = await newGame('One');
    const g2 = await newGame('Two');
    const { token } = await newPlayer();
    const [c] = await postMany(g1.id, token, 1);

    assert.equal((await patch(g1.id, newId(), token, { content: 'x' })).status, 404);
    assert.equal((await del(g1.id, newId(), token)).status, 404);
    assert.equal((await patch(g2.id, c.id, token, { content: 'x' })).status, 404);
    assert.equal((await del(g2.id, c.id, token)).status, 404);
  });

  it('returns 400 for malformed comment ids', async () => {
    const g = await newGame();
    const { token } = await newPlayer();
    assert.equal((await patch(g.id, 'nope', token, { content: 'x' })).status, 400);
    assert.equal((await del(g.id, 'nope', token)).status, 400);
  });

  it('returns 404 when deleting the same comment twice', async () => {
    const g = await newGame();
    const { token } = await newPlayer();
    const [c] = await postMany(g.id, token, 1);
    assert.equal((await del(g.id, c.id, token)).status, 200);
    assert.equal((await del(g.id, c.id, token)).status, 404);
  });
});

describe('allowance endpoint', () => {
  it('reports count and remaining for the caller only', async () => {
    const g = await newGame();
    const a = await newPlayer();
    const b = await newPlayer();
    await postMany(g.id, a.token, 3);

    assert.deepEqual((await myCount(g.id, a.token)).body.data, {
      count: 3,
      limit: 5,
      remaining: 2,
      canComment: true,
    });
    assert.equal((await myCount(g.id, b.token)).body.data.count, 0);
    assert.equal((await myCount(newId(), a.token)).status, 404);
  });
});

describe('game lifecycle', () => {
  it('deletes a game\'s comments when the game is deleted', async () => {
    const g = await newGame('Doomed');
    const other = await newGame('Survivor');
    const { token } = await newPlayer();
    await postMany(g.id, token, 2);
    await postMany(other.id, token, 1);

    const res = await request(app).delete(`/api/games/${g.id}`).set(bearer(adminToken));
    assert.equal(res.status, 200);
    assert.equal(await GameComment.countDocuments({ game: g.id }), 0);
    assert.equal(await GameComment.countDocuments({ game: other.id }), 1);
  });
});

describe('rate limiting', () => {
  it('returns 429 RATE_LIMITED after 10 create requests per minute', async () => {
    const g = await newGame();
    const { token } = await newPlayer();
    // Invalid requests count too, so spam cannot probe for free.
    for (let i = 0; i < 10; i += 1) {
      assert.equal((await post(g.id, token, { content: '' })).status, 400);
    }
    const res = await post(g.id, token, { content: 'finally' });
    assert.equal(res.status, 429);
    assert.equal(res.body.code, 'RATE_LIMITED');
    assert.ok(Number(res.headers['retry-after']) >= 1);

    // Other users are unaffected.
    const other = await newPlayer();
    assert.equal((await post(g.id, other.token, { content: 'hello' })).status, 201);
  });
});
