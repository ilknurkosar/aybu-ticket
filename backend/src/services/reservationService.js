const { query, withTransaction } = require('../db/pool');
const { del } = require('../cache/redis');
const { lockKey, requireOwnedLock } = require('./lockService');
const { HttpError } = require('../utils/httpError');
const metrics = require('../metrics');

async function createReservation({ eventId, seatId, lockId, userId }) {
  await requireOwnedLock({ eventId, seatId, lockId, userId });

  try {
    const reservation = await withTransaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`reservation:${eventId}:${userId}`]);

      const reservationCount = await client.query(
        `SELECT COUNT(*)::int AS total
         FROM reservations
         WHERE event_id = $1 AND user_id = $2 AND status = 'confirmed'`,
        [eventId, userId]
      );
      if ((reservationCount.rows[0]?.total || 0) >= 2) {
        throw new HttpError(409, 'You can reserve up to 2 seats for one event');
      }

      const seat = await client.query(
        'SELECT id FROM seats WHERE id = $1 AND event_id = $2 FOR UPDATE',
        [seatId, eventId]
      );
      if (!seat.rowCount) throw new HttpError(404, 'Seat not found');

      const result = await client.query(
        `INSERT INTO reservations (event_id, seat_id, user_id, status)
         VALUES ($1, $2, $3, 'confirmed')
         RETURNING id, event_id, seat_id, user_id, status, created_at`,
        [eventId, seatId, userId]
      );

      return result.rows[0];
    });

    await del(lockKey(eventId, seatId));
    metrics.reservationSuccess.inc();
    return reservation;
  } catch (error) {
    const reason = error.code === '23505' ? 'duplicate' : error.status ? 'validation' : 'unknown';
    metrics.reservationFailed.inc({ reason });
    if (error.code === '23505') throw new HttpError(409, 'Seat is already reserved');
    throw error;
  }
}

async function listUserReservations(userId) {
  const result = await query(
    `SELECT r.id, r.status, r.created_at,
            e.id AS event_id, e.title, e.venue, e.starts_at, e.poster_url,
            s.row_label, s.seat_number
     FROM reservations r
     JOIN events e ON e.id = r.event_id
     JOIN seats s ON s.id = r.seat_id
     WHERE r.user_id = $1
     ORDER BY r.created_at DESC`,
    [userId]
  );
  return result.rows;
}

module.exports = { createReservation, listUserReservations };
