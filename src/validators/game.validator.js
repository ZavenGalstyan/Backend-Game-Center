'use strict';

const { body, param, query } = require('express-validator');

const NAME_MIN = 2;
const NAME_MAX = 120;
const DESC_MIN = 2;
const DESC_MAX = 2000;
const MAX_LIMIT = 100;

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

const descriptionRule = (chain) =>
  chain
    .isString()
    .withMessage('description must be a string')
    .bail()
    .trim()
    .isLength({ min: DESC_MIN, max: DESC_MAX })
    .withMessage(`description must be between ${DESC_MIN} and ${DESC_MAX} characters`);

const createGameRules = [
  nameRule(body('name').exists({ checkFalsy: true }).withMessage('name is required').bail()),
  descriptionRule(
    body('description').exists({ checkFalsy: true }).withMessage('description is required').bail()
  ),
  body('typeId')
    .exists({ checkFalsy: true })
    .withMessage('typeId is required')
    .bail()
    .isMongoId()
    .withMessage('typeId must be a valid MongoDB ObjectId'),
];

const updateGameRules = [
  ...idParamRules,
  nameRule(body('name').optional()),
  descriptionRule(body('description').optional()),
  body('typeId')
    .optional()
    .isMongoId()
    .withMessage('typeId must be a valid MongoDB ObjectId'),
  body().custom((value) => {
    if (
      !value ||
      (value.name === undefined &&
        value.description === undefined &&
        value.typeId === undefined)
    ) {
      throw new Error('Provide at least one field to update: name, description or typeId');
    }
    return true;
  }),
];

const listGamesRules = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: MAX_LIMIT })
    .withMessage(`limit must be an integer between 1 and ${MAX_LIMIT}`)
    .toInt(),
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('offset must be an integer of 0 or greater')
    .toInt(),
  query('typeId')
    .optional()
    .isMongoId()
    .withMessage('typeId must be a valid MongoDB ObjectId'),
];

module.exports = {
  idParamRules,
  createGameRules,
  updateGameRules,
  listGamesRules,
};
