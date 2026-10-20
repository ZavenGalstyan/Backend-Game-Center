'use strict';

const { body, param, query } = require('express-validator');

const NAME_MIN = 2;
const NAME_MAX = 120;
const DESC_MIN = 2;
const DESC_MAX = 2000;
const MAX_LIMIT = 100;
const SEARCH_MAX = 100;

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

/**
 * Accept the legacy `typeId` body field as an alias of `mainCategory` so
 * older clients keep working. Sending both with different values is rejected.
 */
function normalizeLegacyTypeId(req, _res, next) {
  const b = req.body;
  if (b && typeof b === 'object' && b.typeId !== undefined) {
    if (b.mainCategory === undefined) b.mainCategory = b.typeId;
    else if (String(b.mainCategory) !== String(b.typeId)) b.typeIdConflict = true;
    delete b.typeId;
  }
  next();
}

const mainCategoryRule = (chain) =>
  chain.isMongoId().withMessage('mainCategory must be a valid MongoDB ObjectId');

const secondaryCategoriesRules = [
  body('secondaryCategories')
    .optional()
    .isArray()
    .withMessage('secondaryCategories must be an array of category ids')
    .bail()
    .custom((ids) => {
      const strings = ids.map(String);
      if (new Set(strings).size !== strings.length) {
        throw new Error('Secondary categories must be unique');
      }
      return true;
    })
    .bail()
    .custom((ids, { req }) => {
      const main = req.body.mainCategory;
      if (main !== undefined && ids.map(String).includes(String(main))) {
        throw new Error('Main category cannot also be a secondary category');
      }
      return true;
    }),
  body('secondaryCategories.*')
    .isMongoId()
    .withMessage('Each secondary category must be a valid MongoDB ObjectId'),
];

const typeIdConflictRule = body('typeIdConflict').custom((value) => {
  if (value) throw new Error('typeId (deprecated) and mainCategory must match when both are sent');
  return true;
});

const createGameRules = [
  normalizeLegacyTypeId,
  nameRule(body('name').exists({ checkFalsy: true }).withMessage('name is required').bail()),
  descriptionRule(
    body('description').exists({ checkFalsy: true }).withMessage('description is required').bail()
  ),
  typeIdConflictRule,
  mainCategoryRule(
    body('mainCategory').exists({ checkFalsy: true }).withMessage('mainCategory is required').bail()
  ),
  ...secondaryCategoriesRules,
];

const updateGameRules = [
  normalizeLegacyTypeId,
  ...idParamRules,
  nameRule(body('name').optional()),
  descriptionRule(body('description').optional()),
  typeIdConflictRule,
  mainCategoryRule(body('mainCategory').optional()),
  ...secondaryCategoriesRules,
  body().custom((value) => {
    if (
      !value ||
      (value.name === undefined &&
        value.description === undefined &&
        value.mainCategory === undefined &&
        value.secondaryCategories === undefined)
    ) {
      throw new Error(
        'Provide at least one field to update: name, description, mainCategory or secondaryCategories'
      );
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
  query('categoryId')
    .optional()
    .isMongoId()
    .withMessage('categoryId must be a valid MongoDB ObjectId'),
  query('typeId')
    .optional()
    .isMongoId()
    .withMessage('typeId must be a valid MongoDB ObjectId'),
  query('search')
    .optional()
    .isString()
    .withMessage('search must be a string')
    .bail()
    .trim()
    .isLength({ max: SEARCH_MAX })
    .withMessage(`search must be at most ${SEARCH_MAX} characters`),
];

module.exports = {
  idParamRules,
  createGameRules,
  updateGameRules,
  listGamesRules,
};
