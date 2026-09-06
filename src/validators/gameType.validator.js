'use strict';

const { body, param } = require('express-validator');

const NAME_MIN = 2;
const NAME_MAX = 60;
const SLUG_MIN = 2;
const SLUG_MAX = 60;
const SLUG_PATTERN = /^[a-z0-9_]+$/;

const idParamRules = [
  param('id').isMongoId().withMessage('id must be a valid MongoDB ObjectId'),
];

const nameRule = (chain) =>
  chain
    .isString()
    .withMessage('name must be a string')
    .bail()
    .trim()
    .isLength({ min: NAME_MIN, max: NAME_MAX })
    .withMessage(`name must be between ${NAME_MIN} and ${NAME_MAX} characters`);

const slugRule = (chain) =>
  chain
    .isString()
    .withMessage('slug must be a string')
    .bail()
    .trim()
    .toLowerCase()
    .isLength({ min: SLUG_MIN, max: SLUG_MAX })
    .withMessage(`slug must be between ${SLUG_MIN} and ${SLUG_MAX} characters`)
    .matches(SLUG_PATTERN)
    .withMessage('slug may only contain lowercase letters, numbers and underscores');

const createGameTypeRules = [
  nameRule(body('name').exists({ checkFalsy: true }).withMessage('name is required').bail()),
  slugRule(body('slug').exists({ checkFalsy: true }).withMessage('slug is required').bail()),
];

const updateGameTypeRules = [
  ...idParamRules,
  nameRule(body('name').optional()),
  slugRule(body('slug').optional()),
  body().custom((value) => {
    if (!value || (value.name === undefined && value.slug === undefined)) {
      throw new Error('Provide at least one field to update: name or slug');
    }
    return true;
  }),
];

module.exports = {
  idParamRules,
  createGameTypeRules,
  updateGameTypeRules,
};
