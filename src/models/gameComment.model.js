'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

const COMMENT_MAX_LENGTH = 1000;
const MAX_COMMENTS_PER_USER_PER_GAME = 5;

/**
 * A plain-text comment left by a user under a game.
 *
 * The five-comments-per-user-per-game limit is enforced by the database, not
 * by a counter: every comment occupies one numbered `slot` (0..4) and the
 * unique {game, user, slot} index makes a sixth comment impossible to store,
 * even under concurrent submissions. Deleting a comment frees its slot, so
 * there is no cached count that could drift out of sync.
 */
const gameCommentSchema = new Schema(
  {
    game: {
      type: Schema.Types.ObjectId,
      ref: 'Game',
      required: [true, 'game is required'],
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'user is required'],
    },
    content: {
      type: String,
      required: [true, 'content is required'],
      maxlength: [COMMENT_MAX_LENGTH, `content must be at most ${COMMENT_MAX_LENGTH} characters`],
    },
    slot: {
      type: Number,
      required: true,
      min: 0,
      max: MAX_COMMENTS_PER_USER_PER_GAME - 1,
    },
    // Set on the first real content change; null means never edited.
    editedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Hard guard for the per-user-per-game limit; its {game, user} prefix also
// serves the per-user count and slot lookup.
gameCommentSchema.index({ game: 1, user: 1, slot: 1 }, { unique: true });
// Per-game listing, newest/oldest first with _id as a stable tie-breaker.
gameCommentSchema.index({ game: 1, createdAt: -1, _id: -1 });

const GameComment = mongoose.model('GameComment', gameCommentSchema);

module.exports = GameComment;
module.exports.COMMENT_MAX_LENGTH = COMMENT_MAX_LENGTH;
module.exports.MAX_COMMENTS_PER_USER_PER_GAME = MAX_COMMENTS_PER_USER_PER_GAME;
