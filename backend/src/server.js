const { createApp } = require('./app');
const { env } = require('./config/env');
const { logger } = require('./logger');

const app = createApp();

app.listen(env.port, () => {
  logger.info({ port: env.port }, 'server_started');
});
