'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const gameCommentService = require('../services/gameComment.service');

/**
 * The comment author always comes from the JWT (req.user), never from the
 * request body or query - a client cannot post or modify on someone else's
 * behalf. `content` has already been normalised by the validator.
 */

/**
 * GET /api/games/:gameId/comments  (public, optional auth for `isOwner`)
 */
const listComments = asyncHandler(async (req, res) => {
  const { comments, pagination } = await gameCommentService.listComments(
    req.params.gameId,
    { limit: req.query.limit, offset: req.query.offset, sort: req.query.sort },
    req.user ? req.user.id : null
  );

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Comments retrieved successfully',
    data: comments,
    pagination,
  });
});

/**
 * GET /api/games/:gameId/comments/me/count  (protected)
 */
const getMyCommentCount = asyncHandler(async (req, res) => {
  const allowance = await gameCommentService.getMyAllowance(req.params.gameId, req.user.id);

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Comment allowance retrieved successfully',
    data: allowance,
  });
});

/**
 * POST /api/games/:gameId/comments  (protected)
 */
const createComment = asyncHandler(async (req, res) => {
  const result = await gameCommentService.createComment(
    req.user.id,
    req.params.gameId,
    req.body.content
  );

  return sendSuccess(res, {
    statusCode: 201,
    message: 'Comment created successfully',
    data: result,
  });
});

/**
 * PATCH /api/games/:gameId/comments/:commentId  (protected, owner only)
 */
const updateComment = asyncHandler(async (req, res) => {
  const result = await gameCommentService.updateComment(
    req.user.id,
    req.params.gameId,
    req.params.commentId,
    req.body.content
  );

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Comment updated successfully',
    data: result,
  });
});

/**
 * DELETE /api/games/:gameId/comments/:commentId  (protected, owner only)
 */
const deleteComment = asyncHandler(async (req, res) => {
  const result = await gameCommentService.deleteComment(
    req.user.id,
    req.params.gameId,
    req.params.commentId
  );

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Comment deleted successfully',
    data: result,
  });
});

module.exports = {
  listComments,
  getMyCommentCount,
  createComment,
  updateComment,
  deleteComment,
};
