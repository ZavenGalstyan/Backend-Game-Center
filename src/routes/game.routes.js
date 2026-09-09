'use strict';

const express = require('express');

const gameController = require('../controllers/game.controller');
const gameLikeController = require('../controllers/gameLike.controller');
const validate = require('../middleware/validate.middleware');
const { requireAuth, requireRole } = require('../middleware/auth.middleware');
const {
  idParamRules,
  createGameRules,
  updateGameRules,
  listGamesRules,
} = require('../validators/game.validator');
const { gameIdParamRules } = require('../validators/gameLike.validator');
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
 *       Public. Newest first. Use `limit` + `offset` to page and `typeId` to
 *       filter by game type. The game type is populated on each item.
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
 *         name: typeId
 *         schema: { type: string }
 *         description: Optional GameType ObjectId to filter by (from GET /api/game-types)
 *         example: 665f1b2c9d1e4a0012a3b4c5
 *     responses:
 *       200:
 *         description: Paginated list of games
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GameListResponse'
 *       400:
 *         description: Invalid limit, offset or typeId
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *   post:
 *     tags: [Games]
 *     summary: Create a game
 *     description: >
 *       Admin only. `typeId` must be the ObjectId of an existing GameType -
 *       get valid ids from GET /api/game-types. The created game is returned
 *       with its type populated.
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
 *         description: Validation failed
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
 *         description: Referenced game type does not exist
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
 *     description: Public. Returns the game with its type populated.
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
 *       Admin only. Partial update - send any of `name`, `description`, `typeId`.
 *       If `typeId` is given it must reference an existing GameType.
 *       `_id`, `createdAt` and `updatedAt` cannot be changed.
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
 *         description: Validation failed / invalid id
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
 *         description: Game or referenced game type not found
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

module.exports = router;
