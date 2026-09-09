'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

/**
 * A single "user likes game" relationship.
 *
 * Likes are stored in their own collection (not as an array on the User
 * document) so the set can grow without bound and be queried/paginated
 * efficiently from either side of the relationship.
 */
const gameLikeSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'user is required'],
      index: true,
    },
    game: {
      type: Schema.Types.ObjectId,
      ref: 'Game',
      required: [true, 'game is required'],
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

// A user can like a given game at most once. This unique compound index is the
// hard guard against duplicate likes (the service also upserts idempotently).
gameLikeSchema.index({ user: 1, game: 1 }, { unique: true });

// Fast "most recently liked first" listing for a user's profile page.
gameLikeSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('GameLike', gameLikeSchema);
