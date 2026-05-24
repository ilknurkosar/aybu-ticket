const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { env } = require('./config/env');
const { logger } = require('./logger');
const { metricsMiddleware } = require('./middleware/metrics');
const { notFound, errorHandler } = require('./middleware/error');
const { registry } = require('./metrics');
const { query } = require('./db/pool');
const redis = require('./cache/redis');

const authRoutes = require('./routes/auth');
const eventRoutes = require('./routes/events');
const lockRoutes = require('./routes/locks');
const reservationRoutes = require('./routes/reservations');
const dashboardRoutes = require('./routes/dashboard');

function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.clientUrl, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(metricsMiddleware);

  app.use((req, res, next) => {
    res.on('finish', () => {
      logger.info({ method: req.method, path: req.path, status: res.statusCode }, 'http_request');
    });
    next();
  });

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'aybu-cinema-booking' });
  });

  app.get('/health/dependencies', async (req, res) => {
    const checks = {
      database: { ok: false },
      redis: { ok: false }
    };

    try {
      await query('SELECT 1');
      checks.database.ok = true;
    } catch (error) {
      checks.database.error = error.message;
    }

    try {
      await redis.ping();
      checks.redis.ok = true;
    } catch (error) {
      checks.redis.error = error.message;
    }

    const ok = checks.database.ok && checks.redis.ok;
    res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'degraded', checks });
  });

  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', registry.contentType);
    res.end(await registry.metrics());
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/events', eventRoutes);
  app.use('/api/locks', lockRoutes);
  app.use('/api/reservations', reservationRoutes);
  app.use('/api/dashboard', dashboardRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
