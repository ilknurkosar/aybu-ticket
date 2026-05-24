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

function lokiPushUrl() {
  if (!env.lokiUrl) return '';
  const trimmed = env.lokiUrl.replace(/\/$/, '');
  return trimmed.endsWith('/loki/api/v1/push') ? trimmed : `${trimmed}/loki/api/v1/push`;
}

function normalizeLogArg(arg) {
  if (arg instanceof Error) {
    return { message: arg.message, stack: arg.stack, name: arg.name };
  }

  if (arg && typeof arg === 'object') {
    const normalized = {};
    for (const [key, value] of Object.entries(arg)) {
      normalized[key] = value instanceof Error
        ? { message: value.message, stack: value.stack, name: value.name }
        : value;
    }
    return normalized;
  }

  return arg;
}

function sendToLoki(level, args) {
  const url = lokiPushUrl();
  if (!url || !env.lokiUsername || !env.lokiPassword || typeof fetch !== 'function') return;

  const normalizedArgs = args.map(normalizeLogArg);
  const objectArg = normalizedArgs.find((arg) => arg && typeof arg === 'object' && !Array.isArray(arg)) || {};
  const messageArg = normalizedArgs.find((arg) => typeof arg === 'string');
  const line = JSON.stringify({
    app: 'aybu-cinema-booking',
    env: env.nodeEnv,
    level,
    msg: messageArg || '',
    data: objectArg,
    time: new Date().toISOString()
  });

  const body = JSON.stringify({
    streams: [
      {
        stream: {
          app: 'aybu-cinema-booking',
          env: env.nodeEnv,
          level
        },
        values: [[`${Date.now()}000000`, line]]
      }
    ]
  });

  fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${env.lokiUsername}:${env.lokiPassword}`).toString('base64')}`,
      'Content-Type': 'application/json'
    },
    body
  }).catch(() => {});
}

for (const level of ['info', 'warn', 'error']) {
  const original = logger[level].bind(logger);
  logger[level] = (...args) => {
    original(...args);
    sendToLoki(level, args);
  };
}

module.exports = { logger };
