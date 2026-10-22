'use strict';

const { body } = require('express-validator');

const { RATING_MIN, RATING_MAX } = require('../models/gameRating.model');

/**
 * `rating` must be a JSON number that is a whole number from 1 to 5. Strings
 * ("5"), decimals (4.5), booleans and null are all rejected - no coercion.
 */
const submitRatingRules = [
  body('rating')
    .exists()
    .withMessage('rating is required')
    .bail()
    .custom(
      (value) =>
        typeof value === 'number' &&
        Number.isInteger(value) &&
        value >= RATING_MIN &&
        value <= RATING_MAX
    )
    .withMessage(`rating must be a whole number from ${RATING_MIN} to ${RATING_MAX}`),
];

module.exports = {
  submitRatingRules,
};
