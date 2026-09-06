'use strict';

const express = require('express');
const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const gameTypeRoutes = require('./gameType.routes');
const gameRoutes = require('./game.routes');

const router = express.Router();

/**
 * @openapi
 * /api/health:
 *   get:
 *     tags: [System]
 *     summary: Health check
 *     responses:
 *       200:
 *         description: Service is up
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: OK }
 *                 data:
 *                   type: object
 *                   properties:
 *                     status: { type: string, example: healthy }
 *                     uptime: { type: number, example: 123.45 }
 */
router.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'OK',
    data: { status: 'healthy', uptime: process.uptime() },
  });
});

// Feature modules. Add more here later (scores, ...).
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/game-types', gameTypeRoutes);
router.use('/games', gameRoutes);

module.exports = router;
