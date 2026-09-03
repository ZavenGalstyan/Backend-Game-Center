'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const env = require('../config/env');
const { ROLE_VALUES, DEFAULT_ROLE } = require('../config/roles');

const { Schema } = mongoose;

const userSchema = new Schema(
  {
    username: {
      type: String,
      required: [true, 'Username is required'],
      trim: true,
      minlength: [3, 'Username must be at least 3 characters long'],
      maxlength: [30, 'Username must be at most 30 characters long'],
      unique: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
      unique: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters long'],
      // Never returned by default queries / toJSON.
      select: false,
    },
    role: {
      type: String,
      enum: {
        values: ROLE_VALUES,
        message: 'Invalid role: {VALUE}',
      },
      default: DEFAULT_ROLE,
    },
  },
  {
    timestamps: true, // adds createdAt / updatedAt
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        delete ret.password;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

// Unique indexes come from `unique: true` on the `email` and `username` paths
// above. App-layer checks (auth.service) give friendly messages; the indexes
// are the hard race-condition guard.

/**
 * Hash the password whenever it is set/changed.
 */
userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();

  try {
    this.password = await bcrypt.hash(this.password, env.bcryptSaltRounds);
    return next();
  } catch (err) {
    return next(err);
  }
});

/**
 * Compare a plaintext candidate against the stored hash.
 * Requires that the document was loaded with `.select('+password')`.
 */
userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

/**
 * Public-safe representation of the user.
 */
userSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    id: this._id.toString(),
    username: this.username,
    email: this.email,
    role: this.role,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.model('User', userSchema);
