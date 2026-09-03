'use strict';

const path = require('path');
const swaggerJSDoc = require('swagger-jsdoc');
const env = require('../config/env');
const { ROLE_VALUES } = require('../config/roles');

/**
 * OpenAPI 3 definition. Route-level docs live as JSDoc @openapi blocks in the
 * files listed under `apis` and are merged in at startup.
 */
const definition = {
  openapi: '3.0.3',
  info: {
    title: 'Web Game Center API',
    version: '0.1.0',
    description:
      'Authentication and user system for the Web Game Center. ' +
      'Public game endpoints will be added later - most routes here are open to guests; ' +
      'only the ones marked with a lock require a Bearer token.',
  },
  servers: [
    { url: `http://localhost:${env.port}`, description: 'Local development' },
  ],
  tags: [
    { name: 'Auth', description: 'Registration, login and account endpoints' },
    { name: 'System', description: 'Service/health endpoints' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'Paste the `accessToken` returned by /api/auth/login. ' +
          'Format sent on the wire: `Authorization: Bearer <token>`.',
      },
    },
    schemas: {
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '665f1b2c9d1e4a0012a3b4c5' },
          username: { type: 'string', example: 'player_one' },
          email: { type: 'string', format: 'email', example: 'player@example.com' },
          role: { type: 'string', enum: ROLE_VALUES, example: 'player' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      RegisterRequest: {
        type: 'object',
        required: ['username', 'email', 'password'],
        properties: {
          username: {
            type: 'string',
            minLength: 3,
            maxLength: 30,
            example: 'player_one',
          },
          email: { type: 'string', format: 'email', example: 'player@example.com' },
          password: {
            type: 'string',
            format: 'password',
            minLength: 8,
            example: 'SuperSecret123',
          },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'player@example.com' },
          password: { type: 'string', format: 'password', example: 'SuperSecret123' },
        },
      },
      ChangePasswordRequest: {
        type: 'object',
        required: ['currentPassword', 'newPassword'],
        properties: {
          currentPassword: { type: 'string', format: 'password', example: 'SuperSecret123' },
          newPassword: { type: 'string', format: 'password', minLength: 8, example: 'EvenBetter456' },
        },
      },
      AuthUserResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'Current user' },
          data: {
            type: 'object',
            properties: { user: { $ref: '#/components/schemas/User' } },
          },
        },
      },
      LoginResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'Login successful' },
          data: {
            type: 'object',
            properties: {
              accessToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
              tokenType: { type: 'string', example: 'Bearer' },
              user: { $ref: '#/components/schemas/User' },
            },
          },
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string', example: 'Validation failed' },
          errors: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                field: { type: 'string', example: 'email' },
                message: { type: 'string', example: 'A valid email address is required' },
              },
            },
          },
        },
      },
    },
  },
};

const options = {
  definition,
  // Forward slashes required: swagger-jsdoc globs these and backslashes break
  // the pattern on Windows, so normalise the absolute path.
  apis: [path.join(__dirname, '../routes/*.js').replace(/\\/g, '/')],
};

const swaggerSpec = swaggerJSDoc(options);

module.exports = swaggerSpec;
