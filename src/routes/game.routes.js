'use strict';

const express = require('express');

const gameController = require('../controllers/game.controller');
const gameLikeController = require('../controllers/gameLike.controller');
const gameRatingController = require('../controllers/gameRating.controller');
const validate = require('../middleware/validate.middleware');
const { requireAuth, optionalAuth, requireRole } = require('../middleware/auth.middleware');
const {
  idParamRules,
  createGameRules,
  updateGameRules,
  listGamesRules,
} = require('../validators/game.validator');
const { gameIdParamRules } = require('../validators/gameLike.validator');
const { submitRatingRules } = require('../validators/gameRating.validator');
const { ROLES } = require('../config/roles');

const router = express.Router();

/**
 * @openapi
 * tags:
 *   - name: Games
 *     description: Game catalogue (public reads, admin writes)
 */

/**
 * @openapi
 * /api/games:
 *   get:
 *     tags: [Games]
 *     summary: List games (limit/offset pagination)
 *     description: >
 *       Public. Use `limit` + `offset` to page, `categoryId` (or the legacy
 *       `typeId`) to filter by category and `search` to match name/description.
 *       Without a category filter games are newest first. With one, a game
 *       matches when the category is its `mainCategory` OR one of its
 *       `secondaryCategories`; all main-category matches come first, then all
 *       secondary-category matches, each group newest first (ties broken by
 *       id). The ordering is applied before pagination, so it holds across
 *       pages, `total` counts each game once, and every item carries
 *       `categoryMatch` (`main` | `secondary`). `mainCategory` and
 *       `secondaryCategories` are populated on each item, and every item
 *       carries `averageRating` (1 decimal, 0 when unrated) and `ratingsCount`.
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 10 }
 *         description: Max number of games to return (default 10, max 100)
 *       - in: query
 *         name: offset
 *         schema: { type: integer, minimum: 0, default: 0 }
 *         description: Number of games to skip (default 0)
 *       - in: query
 *         name: categoryId
 *         schema: { type: string }
 *         description: Optional GameType ObjectId to filter by (from GET /api/game-types)
 *         example: 665f1b2c9d1e4a0012a3b4c5
 *       - in: query
 *         name: typeId
 *         deprecated: true
 *         schema: { type: string }
 *         description: Legacy alias of `categoryId` (same main-then-secondary behaviour)
 *       - in: query
 *         name: search
 *         schema: { type: string, maxLength: 100 }
 *         description: Optional case-insensitive match on name or description
 *         example: mansion
 *     responses:
 *       200:
 *         description: Paginated list of games
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GameListResponse'
 *             example:
 *               success: true
 *               message: Games retrieved successfully
 *               data:
 *                 - id: 665f2a1b9d1e4a0012a3b4d9
 *                   name: Haunted Mansion Escape
 *                   description: Escape a haunted mansion before midnight.
 *                   mainCategory: { id: 665f1b2c9d1e4a0012a3b4c5, name: Escape Room, slug: escape_room }
 *                   secondaryCategories:
 *                     - { id: 665f1b2c9d1e4a0012a3b4c6, name: Horror, slug: horror }
 *                   type: { id: 665f1b2c9d1e4a0012a3b4c5, name: Escape Room, slug: escape_room }
 *                   categoryMatch: main
 *                   averageRating: 4.3
 *                   ratingsCount: 24
 *                   createdAt: '2026-10-20T10:00:00.000Z'
 *                   updatedAt: '2026-10-20T10:00:00.000Z'
 *               pagination: { limit: 10, offset: 0, total: 1, returned: 1, hasMore: false, nextOffset: null }
 *       400:
 *         description: Invalid limit, offset, categoryId, typeId or search
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *   post:
 *     tags: [Games]
 *     summary: Create a game
 *     description: >
 *       Admin only. `mainCategory` (required) and `secondaryCategories`
 *       (optional, default []) are GameType ObjectIds - get valid ids from
 *       GET /api/game-types. Every id must exist, secondary categories must be
 *       unique and must not include the main category. The legacy `typeId`
 *       field is still accepted as an alias of `mainCategory`. The created game
 *       is returned with its categories populated.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateGameRequest'
 *     responses:
 *       201:
 *         description: Game created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GameResponse'
 *       400:
 *         description: >
 *           Validation failed - missing mainCategory, malformed ids, duplicate
 *           secondary categories, main category repeated as secondary, or a
 *           category that does not exist.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example:
 *               success: false
 *               message: Validation failed
 *               errors:
 *                 - field: secondaryCategories
 *                   message: Main category cannot also be a secondary category
 *       401:
 *         description: Missing, invalid or expired token
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: Authenticated but not an admin
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router
  .route('/')
  .get(listGamesRules, validate, gameController.listGames)
  .post(
    requireAuth,
    requireRole(ROLES.ADMIN),
    createGameRules,
    validate,
    gameController.createGame
  );

/**
 * @openapi
 * /api/games/{id}:
 *   get:
 *     tags: [Games]
 *     summary: Get a game by id
 *     description: >
 *       Public. Returns the game with `mainCategory` and `secondaryCategories`
 *       populated, plus `averageRating` and `ratingsCount`.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: MongoDB ObjectId of the game
 *         example: 665f2a1b9d1e4a0012a3b4d9
 *     responses:
 *       200:
 *         description: The game
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GameResponse'
 *       400:
 *         description: Invalid id
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: Game not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *   patch:
 *     tags: [Games]
 *     summary: Update a game
 *     description: >
 *       Admin only. Partial update - send any of `name`, `description`,
 *       `mainCategory`, `secondaryCategories` (legacy `typeId` = `mainCategory`).
 *       `secondaryCategories` replaces the whole list. Omitted category fields
 *       keep their stored value and the resulting combination is validated
 *       with the same rules as create. `_id`, `createdAt` and `updatedAt`
 *       cannot be changed.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         example: 665f2a1b9d1e4a0012a3b4d9
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateGameRequest'
 *     responses:
 *       200:
 *         description: Updated game
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GameResponse'
 *       400:
 *         description: Validation failed (including invalid or non-existent categories) / invalid id
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: Missing, invalid or expired token
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: Authenticated but not an admin
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: Game not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *   delete:
 *     tags: [Games]
 *     summary: Delete a game
 *     description: Admin only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         example: 665f2a1b9d1e4a0012a3b4d9
 *     responses:
 *       200:
 *         description: Game deleted
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 *       400:
 *         description: Invalid id
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: Missing, invalid or expired token
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: Authenticated but not an admin
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: Game not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router
  .route('/:id')
  .get(idParamRules, validate, gameController.getGame)
  .patch(
    requireAuth,
    requireRole(ROLES.ADMIN),
    updateGameRules,
    validate,
    gameController.updateGame
  )
  .delete(
    requireAuth,
    requireRole(ROLES.ADMIN),
    idParamRules,
    validate,
    gameController.deleteGame
  );

/**
 * @openapi
 * /api/games/{gameId}/like:
 *   post:
 *     tags: [Likes]
 *     summary: Like a game
 *     description: >
 *       Adds the authenticated user's like for a game. Idempotent - liking a
 *       game that is already liked returns 200 without creating a duplicate.
 *       The user is taken from the JWT; there is no request body.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: gameId
 *         required: true
 *         schema: { type: string }
 *         description: MongoDB ObjectId of the game
 *         example: 665f2a1b9d1e4a0012a3b4d9
 *     responses:
 *       200:
 *         description: Game liked (or already liked)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/LikeToggleResponse' }
 *             example:
 *               success: true
 *               message: Game liked successfully
 *               data: { liked: true }
 *       400:
 *         description: Malformed gameId
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: Missing, invalid or expired token
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: Game not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *   delete:
 *     tags: [Likes]
 *     summary: Unlike a game
 *     description: >
 *       Removes the authenticated user's like for a game. Idempotent - unliking
 *       a game that was not liked still returns 200.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: gameId
 *         required: true
 *         schema: { type: string }
 *         example: 665f2a1b9d1e4a0012a3b4d9
 *     responses:
 *       200:
 *         description: Game unliked (or was not liked)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/LikeToggleResponse' }
 *             example:
 *               success: true
 *               message: Game unliked successfully
 *               data: { liked: false }
 *       400:
 *         description: Malformed gameId
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: Missing, invalid or expired token
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *   get:
 *     tags: [Likes]
 *     summary: Check whether the current user has liked a game
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: gameId
 *         required: true
 *         schema: { type: string }
 *         example: 665f2a1b9d1e4a0012a3b4d9
 *     responses:
 *       200:
 *         description: Like status for the current user
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/LikeToggleResponse' }
 *             example:
 *               success: true
 *               message: Like status retrieved successfully
 *               data: { liked: true }
 *       400:
 *         description: Malformed gameId
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: Missing, invalid or expired token
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: Game not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router
  .route('/:gameId/like')
  .post(requireAuth, gameIdParamRules, validate, gameLikeController.likeGame)
  .delete(requireAuth, gameIdParamRules, validate, gameLikeController.unlikeGame)
  .get(requireAuth, gameIdParamRules, validate, gameLikeController.getLikeStatus);

/**
 * @openapi
 * /api/games/{gameId}/likes/count:
 *   get:
 *     tags: [Likes]
 *     summary: Get the total number of likes for a game
 *     description: Public. Returns how many users have liked the game.
 *     parameters:
 *       - in: path
 *         name: gameId
 *         required: true
 *         schema: { type: string }
 *         example: 665f2a1b9d1e4a0012a3b4d9
 *     responses:
 *       200:
 *         description: Like count
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/LikeCountResponse' }
 *             example:
 *               success: true
 *               message: Like count retrieved successfully
 *               data: { count: 125 }
 *       400:
 *         description: Malformed gameId
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: Game not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router
  .route('/:gameId/likes/count')
  .get(gameIdParamRules, validate, gameLikeController.getLikeCount);

/**
 * @openapi
 * /api/games/{gameId}/ratings:
 *   post:
 *     tags: [Ratings]
 *     summary: Rate a game (1-5 stars, once per user, final)
 *     description: >
 *       Records the authenticated user's rating for a game. Each user can rate
 *       each game exactly once and a submitted rating is final - there is no
 *       update or delete. A second submission (including concurrent duplicates)
 *       returns 409. The user is taken from the JWT, never from the body.
 *       `rating` must be a JSON number that is a whole number from 1 to 5;
 *       strings such as "5", decimals and out-of-range values return 400.
 *       The response includes the game's updated rating summary.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: gameId
 *         required: true
 *         schema: { type: string }
 *         description: MongoDB ObjectId of the game
 *         example: 665f2a1b9d1e4a0012a3b4d9
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/SubmitRatingRequest' }
 *           example: { rating: 5 }
 *     responses:
 *       201:
 *         description: Rating recorded
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SubmitRatingResponse' }
 *             example:
 *               success: true
 *               message: Rating submitted successfully
 *               data:
 *                 rating: { gameId: 665f2a1b9d1e4a0012a3b4d9, rating: 5, createdAt: '2026-10-21T10:00:00.000Z' }
 *                 summary:
 *                   averageRating: 4.3
 *                   ratingsCount: 25
 *                   ratingDistribution: { '1': 1, '2': 0, '3': 2, '4': 9, '5': 13 }
 *                   myRating: 5
 *       400:
 *         description: Malformed gameId, or rating missing / not a whole number from 1 to 5
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example:
 *               success: false
 *               message: Validation failed
 *               errors:
 *                 - field: rating
 *                   message: rating must be a whole number from 1 to 5
 *       401:
 *         description: Missing, invalid or expired token
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: Game not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       409:
 *         description: The user has already rated this game
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example:
 *               success: false
 *               message: You have already rated this game
 */
router
  .route('/:gameId/ratings')
  .post(
    requireAuth,
    gameIdParamRules,
    submitRatingRules,
    validate,
    gameRatingController.submitRating
  );

/**
 * @openapi
 * /api/games/{gameId}/ratings/summary:
 *   get:
 *     tags: [Ratings]
 *     summary: Get a game's rating summary
 *     description: >
 *       Public. `averageRating` is the mean of every submitted rating, rounded
 *       to one decimal (0 when the game has no ratings), `ratingsCount` the
 *       number of ratings and `ratingDistribution` the count per star value.
 *       Optionally send a Bearer token to receive your own rating in
 *       `myRating` (null for guests or if you have not rated). Individual
 *       raters are never exposed. A token that is sent but invalid or expired
 *       returns 401.
 *     security:
 *       - {}
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: gameId
 *         required: true
 *         schema: { type: string }
 *         example: 665f2a1b9d1e4a0012a3b4d9
 *     responses:
 *       200:
 *         description: Rating summary
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/RatingSummaryResponse' }
 *             example:
 *               success: true
 *               message: Rating summary retrieved successfully
 *               data:
 *                 averageRating: 4.3
 *                 ratingsCount: 24
 *                 ratingDistribution: { '1': 1, '2': 0, '3': 2, '4': 9, '5': 12 }
 *                 myRating: null
 *       400:
 *         description: Malformed gameId
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: A token was sent but it is invalid or expired
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: Game not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router
  .route('/:gameId/ratings/summary')
  .get(optionalAuth, gameIdParamRules, validate, gameRatingController.getRatingSummary);

module.exports = router;
