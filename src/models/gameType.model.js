'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

const NAME_MAX = 60;
const SLUG_MAX = 60;

const gameTypeSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters long'],
      maxlength: [NAME_MAX, `Name must be at most ${NAME_MAX} characters long`],
      unique: true,
    },
    slug: {
      type: String,
      required: [true, 'Slug is required'],
      trim: true,
      lowercase: true,
      minlength: [2, 'Slug must be at least 2 characters long'],
      maxlength: [SLUG_MAX, `Slug must be at most ${SLUG_MAX} characters long`],
      match: [/^[a-z0-9_]+$/, 'Slug may only contain lowercase letters, numbers and underscores'],
      unique: true,
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

// `unique: true` on name/slug already creates the indexes; they are the hard
// race-condition guard. Service-layer checks add friendly, case-insensitive
// messages before we ever hit them.

/**
 * Public-safe representation of a game type.
 */
gameTypeSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    id: this._id.toString(),
    name: this.name,
    slug: this.slug,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.model('GameType', gameTypeSchema);
