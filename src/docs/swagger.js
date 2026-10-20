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
    env.apiBaseUrl
      ? { url: env.apiBaseUrl, description: 'Current environment' }
      : { url: `http://localhost:${env.port}`, description: 'Local development' },
  ],
  tags: [
    { name: 'Auth', description: 'Registration, login and account endpoints' },
    { name: 'Users', description: 'User management (admin)' },
    { name: 'GameTypes', description: 'Game categories/types (public reads, admin writes)' },
    { name: 'Games', description: 'Game catalogue (public reads, admin writes)' },
    {
      name: 'Likes',
      description: 'Game likes / favourites for the authenticated user (per-user, cross-device)',
    },
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
      Pagination: {
        type: 'object',
        properties: {
          page: { type: 'integer', example: 1 },
          limit: { type: 'integer', example: 10 },
          total: { type: 'integer', example: 42 },
          totalPages: { type: 'integer', example: 5 },
          hasNextPage: { type: 'boolean', example: true },
          hasPrevPage: { type: 'boolean', example: false },
        },
      },
      PaginatedUsersResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'Users retrieved successfully' },
          data: {
            type: 'object',
            properties: {
              users: {
                type: 'array',
                items: { $ref: '#/components/schemas/User' },
              },
              pagination: { $ref: '#/components/schemas/Pagination' },
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

      /* ------------------------------ Game types ----------------------------- */
      GameType: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '665f1b2c9d1e4a0012a3b4c5' },
          name: { type: 'string', example: 'Puzzle' },
          slug: { type: 'string', example: 'puzzle' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      CreateGameTypeRequest: {
        type: 'object',
        required: ['name', 'slug'],
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 60, example: 'Educational' },
          slug: {
            type: 'string',
            minLength: 2,
            maxLength: 60,
            pattern: '^[a-z0-9_]+$',
            description: 'Lowercase; letters, numbers and underscores only. Stored normalised.',
            example: 'educational',
          },
        },
      },
      UpdateGameTypeRequest: {
        type: 'object',
        minProperties: 1,
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 60, example: 'Educational Games' },
          slug: {
            type: 'string',
            minLength: 2,
            maxLength: 60,
            pattern: '^[a-z0-9_]+$',
            example: 'educational_games',
          },
        },
      },
      GameTypeResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'Game type retrieved successfully' },
          data: { $ref: '#/components/schemas/GameType' },
        },
      },
      GameTypeListResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'Game types retrieved successfully' },
          data: {
            type: 'array',
            items: { $ref: '#/components/schemas/GameType' },
          },
        },
      },

      /* -------------------------------- Games -------------------------------- */
      GameTypeRef: {
        type: 'object',
        description: 'A category (GameType) as referenced from a game.',
        properties: {
          id: { type: 'string', example: '665f1b2c9d1e4a0012a3b4c5' },
          name: { type: 'string', example: 'Escape Room' },
          slug: { type: 'string', example: 'escape_room' },
        },
      },
      Game: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '665f2a1b9d1e4a0012a3b4d9' },
          name: { type: 'string', example: 'Haunted Mansion Escape' },
          description: { type: 'string', example: 'Escape a haunted mansion before midnight.' },
          mainCategory: {
            allOf: [{ $ref: '#/components/schemas/GameTypeRef' }],
            description: 'The single main category of the game.',
          },
          secondaryCategories: {
            type: 'array',
            description: 'Additional categories (unique, never includes mainCategory). May be empty.',
            items: { $ref: '#/components/schemas/GameTypeRef' },
            example: [
              { id: '665f1b2c9d1e4a0012a3b4c6', name: 'Horror', slug: 'horror' },
              { id: '665f1b2c9d1e4a0012a3b4c7', name: 'Adventure', slug: 'adventure' },
              { id: '665f1b2c9d1e4a0012a3b4c8', name: 'Puzzle', slug: 'puzzle' },
            ],
          },
          type: {
            allOf: [{ $ref: '#/components/schemas/GameTypeRef' }],
            deprecated: true,
            description: 'Deprecated alias of mainCategory, kept for older clients.',
          },
          categoryMatch: {
            type: 'string',
            enum: ['main', 'secondary'],
            description:
              'Only present on GET /api/games when filtered by a category: whether the ' +
              'game matched through its main or a secondary category.',
            example: 'main',
          },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      CreateGameRequest: {
        type: 'object',
        required: ['name', 'description', 'mainCategory'],
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 120, example: 'Haunted Mansion Escape' },
          description: {
            type: 'string',
            minLength: 2,
            maxLength: 2000,
            example: 'Escape a haunted mansion before midnight.',
          },
          mainCategory: {
            type: 'string',
            description: 'GameType ObjectId (from GET /api/game-types). Required.',
            example: '665f1b2c9d1e4a0012a3b4c5',
          },
          secondaryCategories: {
            type: 'array',
            description:
              'Optional GameType ObjectIds. Must be unique, must exist and must not ' +
              'include mainCategory. Defaults to [].',
            items: { type: 'string' },
            example: ['665f1b2c9d1e4a0012a3b4c6', '665f1b2c9d1e4a0012a3b4c7', '665f1b2c9d1e4a0012a3b4c8'],
          },
          typeId: {
            type: 'string',
            deprecated: true,
            description: 'Deprecated alias of mainCategory. If both are sent they must match.',
          },
        },
      },
      UpdateGameRequest: {
        type: 'object',
        minProperties: 1,
        description:
          'Partial update. Omitted category fields keep their stored value; the ' +
          'resulting main + secondary combination is validated as a whole. Send ' +
          '`secondaryCategories: []` to clear them.',
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 120, example: 'Haunted Mansion Escape 2' },
          description: { type: 'string', minLength: 2, maxLength: 2000, example: 'Updated description.' },
          mainCategory: {
            type: 'string',
            description: 'GameType ObjectId (from GET /api/game-types).',
            example: '665f1b2c9d1e4a0012a3b4c5',
          },
          secondaryCategories: {
            type: 'array',
            items: { type: 'string' },
            description: 'Replaces the full list of secondary categories.',
            example: ['665f1b2c9d1e4a0012a3b4c6'],
          },
          typeId: {
            type: 'string',
            deprecated: true,
            description: 'Deprecated alias of mainCategory.',
          },
        },
      },
      GameResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'Game retrieved successfully' },
          data: { $ref: '#/components/schemas/Game' },
        },
      },
      GamePagination: {
        type: 'object',
        properties: {
          limit: { type: 'integer', example: 10 },
          offset: { type: 'integer', example: 0 },
          total: { type: 'integer', example: 35 },
          returned: { type: 'integer', example: 10 },
          hasMore: { type: 'boolean', example: true },
          nextOffset: { type: 'integer', nullable: true, example: 10 },
        },
      },
      GameListResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'Games retrieved successfully' },
          data: {
            type: 'array',
            items: { $ref: '#/components/schemas/Game' },
          },
          pagination: { $ref: '#/components/schemas/GamePagination' },
        },
      },

      MessageResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'Deleted successfully' },
          data: { type: 'object', nullable: true, example: null },
        },
      },

      /* -------------------------------- Likes -------------------------------- */
      LikeToggleResponse: {
        type: 'object',
        description:
          'Shared shape for like, unlike and like-status. `data.liked` is the ' +
          'resulting state for the current user.',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'Game liked successfully' },
          data: {
            type: 'object',
            properties: {
              liked: { type: 'boolean', example: true },
            },
          },
        },
      },
      LikeCountResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'Like count retrieved successfully' },
          data: {
            type: 'object',
            properties: {
              count: { type: 'integer', example: 125 },
            },
          },
        },
      },
      LikedGamesResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'Liked games retrieved successfully' },
          data: {
            type: 'array',
            description: 'Liked games, most recently liked first.',
            items: { $ref: '#/components/schemas/Game' },
          },
          pagination: { $ref: '#/components/schemas/GamePagination' },
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
