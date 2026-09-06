'use strict';

const express = require('express');

const gameTypeController = require('../controllers/gameType.controller');
const validate = require('../middleware/validate.middleware');
const { requireAuth, requireRole } = require('../middleware/auth.middleware');
const {
  idParamRules,
  createGameTypeRules,
  updateGameTypeRules,
} = require('../validators/gameType.validator');
const { ROLES } = require('../config/roles');

const router = express.Router();

/**
 * @openapi
 * tags:
 *   - name: GameTypes
 *     description: Game categories/types (public reads, admin writes)
 */

/**
 * @openapi
 * /api/game-types:
 *   get:
 *     tags: [GameTypes]
 *     summary: List all game types
 *     description: Public. Returns every game type, sorted alphabetically by name. No pagination.
 *     responses:
 *       200:
 *         description: List of game types
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GameTypeListResponse'
 *   post:
 *     tags: [GameTypes]
 *     summary: Create a game type
 *     description: Admin only. `slug` is normalised to lowercase and must be unique (name too).
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateGameTypeRequest'
 *     responses:
 *       201:
 *         description: Game type created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GameTypeResponse'
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
 *       409:
 *         description: Duplicate name or slug
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router
  .route('/')
  .get(gameTypeController.listGameTypes)
  .post(
    requireAuth,
    requireRole(ROLES.ADMIN),
    createGameTypeRules,
    validate,
    gameTypeController.createGameType
  );

/**
 * @openapi
 * /api/game-types/{id}:
 *   get:
 *     tags: [GameTypes]
 *     summary: Get a game type by id
 *     description: Public.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: MongoDB ObjectId of the game type
 *         example: 665f1b2c9d1e4a0012a3b4c5
 *     responses:
 *       200:
 *         description: The game type
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GameTypeResponse'
 *       400:
 *         description: Invalid id
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: Game type not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *   patch:
 *     tags: [GameTypes]
 *     summary: Update a game type
 *     description: >
 *       Admin only. Partial update - send `name`, `slug`, or both.
 *       `_id`, `createdAt` and `updatedAt` cannot be changed.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         example: 665f1b2c9d1e4a0012a3b4c5
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateGameTypeRequest'
 *     responses:
 *       200:
 *         description: Updated game type
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GameTypeResponse'
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
 *         description: Game type not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       409:
 *         description: Duplicate name or slug
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *   delete:
 *     tags: [GameTypes]
 *     summary: Delete a game type
 *     description: >
 *       Admin only. Fails with 409 if any game still references this type,
 *       to keep game references valid.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         example: 665f1b2c9d1e4a0012a3b4c5
 *     responses:
 *       200:
 *         description: Game type deleted
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
 *         description: Game type not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       409:
 *         description: Game type is in use by existing games
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router
  .route('/:id')
  .get(idParamRules, validate, gameTypeController.getGameType)
  .patch(
    requireAuth,
    requireRole(ROLES.ADMIN),
    updateGameTypeRules,
    validate,
    gameTypeController.updateGameType
  )
  .delete(
    requireAuth,
    requireRole(ROLES.ADMIN),
    idParamRules,
    validate,
    gameTypeController.deleteGameType
  );

module.exports = router;
