'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

const RATING_MIN = 1;
const RATING_MAX = 5;

/**
 * A single "user rated game" record (1-5 stars).
 *
 * Ratings are final: they are only ever inserted through the public API, never
 * updated or deleted (except when the game itself is deleted). Like GameLike
 * they live in their own collection, and averages are aggregated at read time
 * so there is no cached total that could drift out of sync.
 */
const gameRatingSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'user is required'],
    },
    game: {
      type: Schema.Types.ObjectId,
      ref: 'Game',
      required: [true, 'game is required'],
    },
    rating: {
      type: Number,
      required: [true, 'rating is required'],
      min: [RATING_MIN, `rating must be at least ${RATING_MIN}`],
      max: [RATING_MAX, `rating must be at most ${RATING_MAX}`],
      validate: {
        validator: Number.isInteger,
        message: 'rating must be a whole number',
      },
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

// One rating per user per game. This unique compound index is the hard guard
// against duplicates, including concurrent submissions. Its `game` prefix also
// serves the per-game aggregations.
gameRatingSchema.index({ game: 1, user: 1 }, { unique: true });

const GameRating = mongoose.model('GameRating', gameRatingSchema);

module.exports = GameRating;
module.exports.RATING_MIN = RATING_MIN;
module.exports.RATING_MAX = RATING_MAX;
