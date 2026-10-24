'use strict';

const Game = require('../models/game.model');
const GameComment = require('../models/gameComment.model');
const ApiError = require('../utils/ApiError');

const { MAX_COMMENTS_PER_USER_PER_GAME } = GameComment;

const DEFAULT_LIMIT = 10;
const DELETED_AUTHOR_NAME = 'Deleted user';

/** Throw 404 unless the game exists. */
async function requireGame(gameId) {
  const exists = await Game.exists({ _id: gameId });
  if (!exists) {
    throw ApiError.notFound('Game not found');
  }
}

function limitReachedError() {
  return new ApiError(
    409,
    `You can have at most ${MAX_COMMENTS_PER_USER_PER_GAME} comments on this game. ` +
      'Delete one of your comments to post a new one.',
    { code: 'COMMENT_LIMIT_REACHED' }
  );
}

/**
 * Public-safe shape of a comment. `doc.user` must be populated with
 * `username` only (null when the author account was deleted). Never exposes
 * email, role, password or the internal slot number.
 */
function toPublicComment(doc, viewerId) {
  const author = doc.user
    ? { id: String(doc.user._id), username: doc.user.username, isDeleted: false }
    : { id: null, username: DELETED_AUTHOR_NAME, isDeleted: true };

  return {
    id: String(doc._id),
    gameId: String(doc.game),
    content: doc.content,
    author,
    isOwner: Boolean(viewerId && author.id === String(viewerId)),
    isEdited: Boolean(doc.editedAt),
    editedAt: doc.editedAt || null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

const populateAuthor = (q) => q.populate({ path: 'user', select: 'username' });

/** How many comments a user has on a game and how many they may still post. */
async function buildAllowance(gameId, userId) {
  const count = await GameComment.countDocuments({ game: gameId, user: userId });
  return {
    count,
    limit: MAX_COMMENTS_PER_USER_PER_GAME,
    remaining: Math.max(0, MAX_COMMENTS_PER_USER_PER_GAME - count),
    canComment: count < MAX_COMMENTS_PER_USER_PER_GAME,
  };
}

/**
 * Public, paginated comments of a game. Newest first by default; ties on
 * createdAt are broken by _id in the same direction so pages never overlap.
 *
 * @throws {ApiError} 404 if the game does not exist
 */
async function listComments(gameId, { limit, offset, sort } = {}, viewerId = null) {
  await requireGame(gameId);

  const safeLimit = limit || DEFAULT_LIMIT;
  const safeOffset = offset || 0;
  const dir = sort === 'oldest' ? 1 : -1;
  const filter = { game: gameId };

  const [docs, total] = await Promise.all([
    populateAuthor(
      GameComment.find(filter)
        .sort({ createdAt: dir, _id: dir })
        .skip(safeOffset)
        .limit(safeLimit)
    ).lean(),
    GameComment.countDocuments(filter),
  ]);

  const hasMore = safeOffset + docs.length < total;
  return {
    comments: docs.map((d) => toPublicComment(d, viewerId)),
    pagination: {
      limit: safeLimit,
      offset: safeOffset,
      total,
      returned: docs.length,
      hasMore,
      nextOffset: hasMore ? safeOffset + docs.length : null,
    },
  };
}

/**
 * The caller's comment allowance on a game.
 * @throws {ApiError} 404 if the game does not exist
 */
async function getMyAllowance(gameId, userId) {
  await requireGame(gameId);
  return buildAllowance(gameId, userId);
}

/**
 * Post a comment. Each comment takes the lowest free slot (0..4); the unique
 * {game, user, slot} index rejects a second writer racing for the same slot,
 * which then retries with the next free one. With only five slots, every
 * collision means another request took a slot, so the loop always ends in
 * either a stored comment or COMMENT_LIMIT_REACHED - never a sixth comment.
 *
 * @throws {ApiError} 404 game missing, 409 COMMENT_LIMIT_REACHED
 */
async function createComment(userId, gameId, content) {
  await requireGame(gameId);

  let created = null;
  for (let attempt = 0; attempt <= MAX_COMMENTS_PER_USER_PER_GAME && !created; attempt += 1) {
    const taken = await GameComment.find({ game: gameId, user: userId }).select('slot').lean();
    const used = new Set(taken.map((c) => c.slot));
    let slot = 0;
    while (used.has(slot)) slot += 1;
    if (slot >= MAX_COMMENTS_PER_USER_PER_GAME) {
      throw limitReachedError();
    }

    try {
      created = await GameComment.create({ game: gameId, user: userId, content, slot });
    } catch (err) {
      if (!(err.code === 11000 && err.keyPattern && err.keyPattern.slot)) throw err;
      // Lost the race for this slot - re-read the free slots and try again.
    }
  }

  if (!created) {
    // Only reachable under constant create/delete churn from the same user.
    throw new ApiError(409, 'Your comment could not be saved, please try again', {
      code: 'COMMENT_WRITE_CONFLICT',
    });
  }

  const comment = await populateAuthor(GameComment.findById(created._id)).lean();
  return {
    comment: toPublicComment(comment, userId),
    allowance: await buildAllowance(gameId, userId),
  };
}

/**
 * Load a comment of a game and check that `userId` owns it.
 * @throws {ApiError} 404 not found (or belongs to another game), 403 not the owner
 */
async function requireOwnComment(userId, gameId, commentId) {
  const comment = await GameComment.findOne({ _id: commentId, game: gameId })
    .select('user content')
    .lean();
  if (!comment) {
    throw ApiError.notFound('Comment not found');
  }
  if (String(comment.user) !== String(userId)) {
    throw new ApiError(403, 'You can only modify your own comments', {
      code: 'COMMENT_FORBIDDEN',
    });
  }
  return comment;
}

/**
 * Edit the caller's own comment. Does not touch createdAt or the slot, so it
 * never consumes an extra allowance. Saving identical content is a no-op and
 * does not mark the comment as edited.
 *
 * @throws {ApiError} 404, 403
 */
async function updateComment(userId, gameId, commentId, content) {
  const existing = await requireOwnComment(userId, gameId, commentId);

  let updated;
  if (existing.content === content) {
    updated = await populateAuthor(GameComment.findById(commentId)).lean();
  } else {
    updated = await populateAuthor(
      GameComment.findOneAndUpdate(
        { _id: commentId, game: gameId, user: userId },
        { $set: { content, editedAt: new Date() } },
        { new: true, runValidators: true }
      )
    ).lean();
  }
  if (!updated) {
    // Deleted between the ownership check and the update.
    throw ApiError.notFound('Comment not found');
  }

  return { comment: toPublicComment(updated, userId) };
}

/**
 * Permanently delete the caller's own comment, freeing its slot.
 * @throws {ApiError} 404, 403
 */
async function deleteComment(userId, gameId, commentId) {
  await requireOwnComment(userId, gameId, commentId);

  const { deletedCount } = await GameComment.deleteOne({
    _id: commentId,
    game: gameId,
    user: userId,
  });
  if (!deletedCount) {
    throw ApiError.notFound('Comment not found');
  }

  return {
    deletedCommentId: String(commentId),
    allowance: await buildAllowance(gameId, userId),
  };
}

/**
 * Delete every comment of a game. Called when the game is removed so no
 * orphaned comments are left behind.
 *
 * @returns {Promise<number>} how many comments were deleted
 */
async function deleteCommentsForGame(gameId) {
  const { deletedCount } = await GameComment.deleteMany({ game: gameId });
  return deletedCount || 0;
}

module.exports = {
  listComments,
  getMyAllowance,
  createComment,
  updateComment,
  deleteComment,
  deleteCommentsForGame,
};
