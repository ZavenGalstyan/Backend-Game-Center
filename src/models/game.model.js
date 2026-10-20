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
    // The game's single primary category (a GameType).
    mainCategory: {
      type: Schema.Types.ObjectId,
      ref: 'GameType',
      required: [true, 'mainCategory is required'],
      index: true, // category pages: main-category matches
    },
    // Additional categories the game also appears under. Never contains
    // mainCategory and never contains duplicates (enforced below).
    secondaryCategories: {
      type: [{ type: Schema.Types.ObjectId, ref: 'GameType' }],
      default: [],
      index: true, // multikey: category pages, secondary matches
    },
    // Legacy single-category field, kept as a mirror of mainCategory so older
    // deployments reading the same database keep working. Do not read it in
    // new code - use mainCategory.
    typeId: {
      type: Schema.Types.ObjectId,
      ref: 'GameType',
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

/** ObjectId (or populated doc) -> id string. */
function refId(ref) {
  if (!ref) return null;
  return (ref._id || ref).toString();
}

gameSchema.pre('validate', function syncCategories(next) {
  // Documents written before the category migration only have typeId.
  if (!this.mainCategory && this.typeId) {
    this.mainCategory = this.typeId;
  }

  const main = refId(this.mainCategory);
  const seen = new Set();
  for (const ref of this.secondaryCategories || []) {
    const id = refId(ref);
    if (id === main) {
      this.invalidate('secondaryCategories', 'Main category cannot also be a secondary category');
      break;
    }
    if (seen.has(id)) {
      this.invalidate('secondaryCategories', 'Secondary categories must be unique');
      break;
    }
    seen.add(id);
  }

  if (main && refId(this.typeId) !== main) {
    this.typeId = this.mainCategory;
  }
  next();
});

/** Populated GameType (or bare ObjectId) -> { id, name, slug } | { id }. */
function categoryRef(c) {
  if (c && typeof c === 'object' && c.name) {
    return { id: c._id.toString(), name: c.name, slug: c.slug };
  }
  return c ? { id: c.toString() } : null;
}

/**
 * Public-safe representation of a game.
 * Expects `mainCategory` and `secondaryCategories` to be populated; falls back
 * to `{ id }` refs otherwise. `type` is a deprecated alias of `mainCategory`
 * kept for existing clients.
 */
gameSchema.methods.toPublicJSON = function toPublicJSON() {
  const mainCategory = categoryRef(this.mainCategory || this.typeId);
  const secondaryCategories = (this.secondaryCategories || [])
    // A populated ref whose GameType no longer exists comes back as null.
    .filter(Boolean)
    .map(categoryRef);

  return {
    id: this._id.toString(),
    name: this.name,
    description: this.description,
    mainCategory,
    secondaryCategories,
    type: mainCategory,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.model('Game', gameSchema);
