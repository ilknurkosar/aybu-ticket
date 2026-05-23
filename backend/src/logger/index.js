const pino = require('pino');
const { env } = require('../config/env');

const logger = pino({
  name: 'aybu-cinema-booking',
  level: env.nodeEnv === 'test' ? 'silent' : 'info',
  base: {
    app: 'aybu-cinema-booking',
    env: env.nodeEnv
  }
});

module.exports = { logger };
