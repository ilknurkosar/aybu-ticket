const { Redis: UpstashRedis } = require('@upstash/redis');
const IORedis = require('ioredis');
const { env } = require('../config/env');

let client;
let mode;

function getClient() {
  if (client) return { client, mode };

  if (!env.redisUrl) {
    throw new Error('REDIS_URL is required');
  }

  if (env.redisUrl.startsWith('http')) {
    if (!env.redisToken) throw new Error('REDIS_TOKEN is required for Upstash Redis');
    mode = 'upstash';
    client = new UpstashRedis({ url: env.redisUrl, token: env.redisToken });
  } else {
    mode = 'ioredis';
    client = new IORedis(env.redisUrl, { maxRetriesPerRequest: 2 });
  }

  return { client, mode };
}

async function setEx(key, value, ttlSeconds) {
  const redis = getClient();
  const payload = JSON.stringify(value);

  if (redis.mode === 'upstash') {
    await redis.client.set(key, payload, { ex: ttlSeconds });
    return;
  }

  await redis.client.set(key, payload, 'EX', ttlSeconds);
}

async function setNxEx(key, value, ttlSeconds) {
  const redis = getClient();
  const payload = JSON.stringify(value);

  if (redis.mode === 'upstash') {
    const result = await redis.client.set(key, payload, { nx: true, ex: ttlSeconds });
    return result === 'OK';
  }

  const result = await redis.client.set(key, payload, 'EX', ttlSeconds, 'NX');
  return result === 'OK';
}

async function getJson(key) {
  const redis = getClient();
  const value = await redis.client.get(key);
  if (!value) return null;
  return typeof value === 'string' ? JSON.parse(value) : value;
}

async function del(key) {
  const redis = getClient();
  return redis.client.del(key);
}

async function ttl(key) {
  const redis = getClient();
  return redis.client.ttl(key);
}

async function ping() {
  const redis = getClient();
  return redis.client.ping();
}

async function scanKeys(pattern) {
  const redis = getClient();

  if (redis.mode === 'upstash') {
    let cursor = 0;
    const keys = [];
    do {
      const [nextCursor, batch] = await redis.client.scan(cursor, { match: pattern, count: 100 });
      cursor = Number(nextCursor);
      keys.push(...batch);
    } while (cursor !== 0);
    return keys;
  }

  const stream = redis.client.scanStream({ match: pattern, count: 100 });
  const keys = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (batch) => keys.push(...batch));
    stream.on('end', () => resolve(keys));
    stream.on('error', reject);
  });
}

module.exports = { setNxEx, setEx, getJson, del, ttl, ping, scanKeys };
