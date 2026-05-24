const { createApp } = require('./app');
const { env } = require('./config/env');
const { getPool } = require('./db/pool');
const { countActiveLocks } = require('./services/lockService');
const { activeLocks, dbPoolTotal } = require('./metrics');
const { logger } = require('./logger');

const app = createApp();

let collectorInterval;

function startMetricsCollector() {
  collectorInterval = setInterval(async () => {
    try {
      const count = await countActiveLocks();
      activeLocks.set(count);
    } catch (error) {
      logger.error({ error }, 'metrics_collector_active_locks_failed');
    }

    try {
      const pool = getPool();
      dbPoolTotal.set({ state: 'total' }, pool.totalCount);
      dbPoolTotal.set({ state: 'idle' }, pool.idleCount);
      dbPoolTotal.set({ state: 'waiting' }, pool.waitingCount);
    } catch (error) {
      logger.error({ error }, 'metrics_collector_db_pool_failed');
    }
  }, 15000);
}

function stopMetricsCollector() {
  if (collectorInterval) clearInterval(collectorInterval);
}

app.listen(env.port, () => {
  startMetricsCollector();
  logger.info({ port: env.port }, 'server_started');
});

process.on('SIGTERM', stopMetricsCollector);
process.on('SIGINT', stopMetricsCollector);
