'use strict';

const express = require('express');

const userController = require('../controllers/user.controller');
const validate = require('../middleware/validate.middleware');
const { requireAuth, requireRole } = require('../middleware/auth.middleware');
const { listUsersRules, deleteUserRules } = require('../validators/user.validator');
const { ROLES } = require('../config/roles');

const router = express.Router();

/**
 * @openapi
 * tags:
 *   - name: Users
 *     description: User management (admin)
 */

/**
 * @openapi
 * /api/users:
 *   get:
 *     tags: [Users]
 *     summary: List users (paginated)
 *     description: >
 *       Returns a paginated list of users. Requires an admin access token.
 *       Passwords are never included.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *         description: 1-based page number
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 10 }
 *         description: Number of users per page
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [player, moderator, admin]
 *         description: Optional filter by role
 *     responses:
 *       200:
 *         description: Paginated list of users
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedUsersResponse'
 *       400:
 *         description: Invalid query parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Missing, invalid or expired token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Authenticated but not an admin
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  '/',
  requireAuth,
  requireRole(ROLES.ADMIN),
  listUsersRules,
  validate,
  userController.listUsers
);

/**
 * @openapi
 * /api/users/{id}:
 *   delete:
 *     tags: [Users]
 *     summary: Delete a user
 *     description: >
 *       Permanently deletes a user by id. Requires an admin access token -
 *       `player` and `moderator` receive 403.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: MongoDB ObjectId of the user to delete
 *         example: 665f1b2c9d1e4a0012a3b4c5
 *     responses:
 *       200:
 *         description: User deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: User deleted successfully }
 *                 data: { type: object, nullable: true, example: null }
 *       400:
 *         description: Invalid user id
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Missing, invalid or expired token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Authenticated but not an admin
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Unexpected server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.delete(
  '/:id',
  requireAuth,
  requireRole(ROLES.ADMIN),
  deleteUserRules,
  validate,
  userController.deleteUser
);

module.exports = router;
