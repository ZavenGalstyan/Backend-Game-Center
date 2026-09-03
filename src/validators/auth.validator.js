'use strict';

const { body } = require('express-validator');

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;

const registerRules = [
  body('username')
    .exists({ checkFalsy: true })
    .withMessage('Username is required')
    .bail()
    .isString()
    .trim()
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be between 3 and 30 characters')
    .matches(/^[a-zA-Z0-9_.-]+$/)
    .withMessage('Username may only contain letters, numbers, and _ . -'),

  body('email')
    .exists({ checkFalsy: true })
    .withMessage('Email is required')
    .bail()
    .isEmail()
    .withMessage('A valid email address is required')
    .normalizeEmail(),

  body('password')
    .exists({ checkFalsy: true })
    .withMessage('Password is required')
    .bail()
    .isLength({ min: PASSWORD_MIN, max: PASSWORD_MAX })
    .withMessage(`Password must be between ${PASSWORD_MIN} and ${PASSWORD_MAX} characters`),

  // Reject any attempt to self-assign a role.
  body('role')
    .not()
    .exists()
    .withMessage('Role cannot be set during registration'),
];

const loginRules = [
  body('email')
    .exists({ checkFalsy: true })
    .withMessage('Email is required')
    .bail()
    .isEmail()
    .withMessage('A valid email address is required')
    .normalizeEmail(),

  body('password').exists({ checkFalsy: true }).withMessage('Password is required'),
];

const changePasswordRules = [
  body('currentPassword')
    .exists({ checkFalsy: true })
    .withMessage('Current password is required'),

  body('newPassword')
    .exists({ checkFalsy: true })
    .withMessage('New password is required')
    .bail()
    .isLength({ min: PASSWORD_MIN, max: PASSWORD_MAX })
    .withMessage(`New password must be between ${PASSWORD_MIN} and ${PASSWORD_MAX} characters`)
    .custom((value, { req }) => {
      if (value === req.body.currentPassword) {
        throw new Error('New password must be different from the current password');
      }
      return true;
    }),
];

module.exports = { registerRules, loginRules, changePasswordRules };
