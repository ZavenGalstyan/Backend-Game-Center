'use strict';

const { body, param, query } = require('express-validator');

const { COMMENT_MAX_LENGTH } = require('../models/gameComment.model');

const MAX_LIMIT = 100;
const SORT_VALUES = ['newest', 'oldest'];

/**
 * Comments are plain text. Normalisation (applied before the empty/length
 * checks, and what gets stored):
 *  - Unicode NFC
 *  - CRLF / CR -> LF
 *  - control characters (except LF and TAB) and bidi override characters removed
 *  - runs of 3+ line breaks collapsed to one blank line
 *  - leading/trailing whitespace trimmed
 * HTML is NOT stripped or escaped - it is stored verbatim as text and must be
 * rendered as text (never as HTML) by clients.
 */
function normalizeCommentContent(value) {
  return value
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const contentRules = [
  body('content')
    .exists()
    .withMessage('content is required')
    .bail()
    .custom((value) => typeof value === 'string')
    .withMessage('content must be a string')
    .bail()
    .customSanitizer(normalizeCommentContent)
    .notEmpty()
    .withMessage('content cannot be empty')
    .bail()
    .isLength({ max: COMMENT_MAX_LENGTH })
    .withMessage(`content must be at most ${COMMENT_MAX_LENGTH} characters`),
];

const commentIdParamRules = [
  param('commentId').isMongoId().withMessage('commentId must be a valid MongoDB ObjectId'),
];

const listCommentsRules = [
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
  query('sort')
    .optional()
    .isIn(SORT_VALUES)
    .withMessage(`sort must be one of: ${SORT_VALUES.join(', ')}`),
];

module.exports = {
  contentRules,
  commentIdParamRules,
  listCommentsRules,
  normalizeCommentContent,
};
