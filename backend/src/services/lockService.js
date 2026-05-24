const { randomUUID } = require('crypto');
const { env } = require('../config/env');
const redis = require('../cache/redis');
const { query } = require('../db/pool');
const { HttpError } = require('../utils/httpError');
const metrics = require('../metrics');
const { logger } = require('../logger');

function lockKey(eventId, seatId) {
  return `lock:event:${eventId}:seat:${seatId}`;
}

function sameId(left, right) {
  return String(left || '').toLowerCase() === String(right || '').toLowerCase();
}

async function assertSeatCanBeLocked(eventId, seatId) {
  const seat = await query(
    `SELECT s.id
     FROM seats s
     JOIN events e ON e.id = s.event_id
     WHERE s.id = $1 AND s.event_id = $2`,
    [seatId, eventId]
  );

  if (!seat.rowCount) throw new HttpError(404, 'Seat not found for this event');

  const reserved = await query(
    `SELECT 1 FROM reservations
     WHERE event_id = $1 AND seat_id = $2 AND status = 'confirmed'`,
    [eventId, seatId]
  );

  if (reserved.rowCount) throw new HttpError(409, 'Seat is already reserved');
}

async function createLock({ eventId, seatId, userId }) {
  metrics.seatLockAttempts.inc();
  await assertSeatCanBeLocked(eventId, seatId);

  const lockId = randomUUID();
  const expiresAt = new Date(Date.now() + env.lockTtlSeconds * 1000).toISOString();
  const value = { lockId, eventId, seatId, userId, expiresAt };
  let acquired;
  try {
    const ownedLocks = await getUserLocksForEvent({ eventId, userId });
    if (ownedLocks.length >= 2 && !ownedLocks.some((lock) => sameId(lock.seatId, seatId))) {
      throw new HttpError(409, 'You can select up to 2 seats for one event');
    }
    acquired = await redis.setNxEx(lockKey(eventId, seatId), value, env.lockTtlSeconds);
  } catch (error) {
    if (error.status) throw error;
    logger.error({ error, eventId, seatId }, 'seat_lock_create_failed');
    throw new HttpError(503, 'Seat locking service is temporarily unavailable');
  }

  if (!acquired) {
    metrics.seatLockConflict.inc();
    throw new HttpError(409, 'Seat is temporarily locked by another user');
  }

  metrics.seatLockSuccess.inc();
  return { ...value, ttlSeconds: env.lockTtlSeconds };
}

async function getUserLocksForEvent({ eventId, userId }) {
  const keys = await redis.scanKeys(`lock:event:${eventId}:seat:*`);
  const locks = await Promise.all(keys.map(async (key) => {
    const lock = await redis.getJson(key);
    return lock && sameId(lock.userId, userId) ? lock : null;
  }));
  return locks.filter(Boolean);
}

async function getLock(eventId, seatId) {
  return redis.getJson(lockKey(eventId, seatId));
}

async function releaseLock({ eventId, seatId, lockId, userId }) {
  const key = lockKey(eventId, seatId);
  let lock;
  try {
    lock = await redis.getJson(key);
  } catch (error) {
    logger.error({ error, eventId, seatId }, 'seat_lock_release_failed');
    throw new HttpError(503, 'Seat locking service is temporarily unavailable');
  }
  if (!lock) return false;
  if (lock.lockId !== lockId || lock.userId !== userId) {
    throw new HttpError(403, 'Lock does not belong to this user');
  }
  await redis.del(key);
  return true;
}

async function requireOwnedLock({ eventId, seatId, lockId, userId }) {
  const lock = await getLock(eventId, seatId);
  if (!lock) throw new HttpError(409, 'Seat lock has expired');
  if (lock.lockId !== lockId || lock.userId !== userId) {
    throw new HttpError(403, 'Lock does not belong to this user');
  }
  return lock;
}

async function countActiveLocks() {
  try {
    const keys = await redis.scanKeys('lock:event:*:seat:*');
    return keys.length;
  } catch (error) {
    logger.error({ error }, 'active_lock_count_failed');
    return 0;
  }
}

module.exports = { createLock, releaseLock, requireOwnedLock, getLock, countActiveLocks, lockKey };
