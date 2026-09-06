'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

const NAME_MAX = 120;
const DESCRIPTION_MAX = 2000;

const gameSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters long'],
      maxlength: [NAME_MAX, `Name must be at most ${NAME_MAX} characters long`],
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
      minlength: [2, 'Description must be at least 2 characters long'],
      maxlength: [DESCRIPTION_MAX, `Description must be at most ${DESCRIPTION_MAX} characters long`],
    },
    typeId: {
      type: Schema.Types.ObjectId,
      ref: 'GameType',
      required: [true, 'typeId is required'],
      index: true, // filtering games by type
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

// Newest-first listing is the default sort for GET /api/games.
gameSchema.index({ createdAt: -1 });

/**
 * Public-safe representation of a game.
 * Expects `typeId` to be populated; falls back to just the id string otherwise.
 */
gameSchema.methods.toPublicJSON = function toPublicJSON() {
  const t = this.typeId;
  let type = null;
  if (t && typeof t === 'object' && t.name) {
    type = { id: t._id.toString(), name: t.name, slug: t.slug };
  } else if (t) {
    type = { id: t.toString() };
  }

  return {
    id: this._id.toString(),
    name: this.name,
    description: this.description,
    type,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.model('Game', gameSchema);
