'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');

const env = require('./config/env');
const routes = require('./routes');
const swaggerSpec = require('./docs/swagger');
const { notFoundHandler, errorHandler } = require('./middleware/error.middleware');

const app = express();

/* ----------------------------- Core middleware ---------------------------- */
app.use(helmet());
app.use(
  cors({
    origin: env.corsOrigin === '*' ? true : env.corsOrigin.split(',').map((s) => s.trim()),
  })
);
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

if (!env.isTest) {
  app.use(morgan(env.isProduction ? 'combined' : 'dev'));
}

/* -------------------------------- API docs ------------------------------- */
app.use(
  '/api-docs',
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    explorer: true,
    swaggerOptions: { persistAuthorization: true },
    customSiteTitle: 'Web Game Center API Docs',
  })
);
// Raw spec (handy for codegen / Postman import).
app.get('/api-docs.json', (_req, res) => res.json(swaggerSpec));

/* -------------------------------- Routes --------------------------------- */
app.get('/', (_req, res) => {
  res.json({
    success: true,
    message: 'Web Game Center API',
    data: { docs: '/api-docs', health: '/api/health' },
  });
});

app.use('/api', routes);

/* --------------------------- Error handling ------------------------------ */
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
