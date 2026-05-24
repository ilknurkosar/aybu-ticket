const express = require('express');
const { z } = require('zod');
const { query, withTransaction } = require('../db/pool');
const { getLock } = require('../services/lockService');
const { asyncHandler } = require('../utils/asyncHandler');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { HttpError } = require('../utils/httpError');
const { logger } = require('../logger');

const router = express.Router();

function sameId(left, right) {
  return String(left || '').toLowerCase() === String(right || '').toLowerCase();
}

const dateTimeSchema = z.string().min(1, 'Start date is required').refine(
  (value) => !Number.isNaN(Date.parse(value)),
  'Start date must be a valid date and time'
).transform((value) => new Date(value).toISOString());

const optionalUrlSchema = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().url('Poster URL must be a valid URL').optional()
);

const eventSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters').max(160),
  description: z.string().min(5, 'Description must be at least 5 characters').max(2000),
  venue: z.string().min(2, 'Venue must be at least 2 characters').max(160),
  startsAt: dateTimeSchema,
  posterUrl: optionalUrlSchema,
  rows: z.number().int().min(1).max(20).default(6),
  seatsPerRow: z.number().int().min(1).max(30).default(10)
});

router.get('/', asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT e.id, e.title, e.description, e.venue, e.starts_at, e.poster_url, e.created_at,
            COUNT(s.id)::int AS total_seats,
            COUNT(r.id)::int AS reserved_seats
     FROM events e
     LEFT JOIN seats s ON s.event_id = e.id
     LEFT JOIN reservations r ON r.seat_id = s.id AND r.status = 'confirmed'
     GROUP BY e.id
     ORDER BY e.starts_at ASC`
  );
  res.json({ events: result.rows });
}));

router.get('/:eventId/seats', authenticate, asyncHandler(async (req, res) => {
  const eventResult = await query('SELECT * FROM events WHERE id = $1', [req.params.eventId]);
  if (!eventResult.rowCount) throw new HttpError(404, 'Event not found');

  const seatsResult = await query(
    `SELECT s.id, s.row_label, s.seat_number,
            CASE WHEN r.id IS NULL THEN false ELSE true END AS reserved
     FROM seats s
     LEFT JOIN reservations r ON r.seat_id = s.id AND r.status = 'confirmed'
     WHERE s.event_id = $1
     ORDER BY s.row_label, s.seat_number`,
    [req.params.eventId]
  );

  let lockLookupAvailable = true;
  const seats = await Promise.all(seatsResult.rows.map(async (seat) => {
    let lock = null;
    if (!seat.reserved) {
      try {
        lock = await getLock(req.params.eventId, seat.id);
      } catch (error) {
        lockLookupAvailable = false;
        logger.error({ error, eventId: req.params.eventId, seatId: seat.id }, 'seat_lock_lookup_failed');
      }
    }
    let status = 'available';
    const ownedByMe = lock && sameId(lock.userId, req.user.id);
    if (seat.reserved) status = 'reserved';
    else if (ownedByMe) status = 'selected_by_me';
    else if (lock) status = 'locked';

    return {
      id: seat.id,
      rowLabel: seat.row_label,
      seatNumber: seat.seat_number,
      status,
      ownedByMe: Boolean(ownedByMe),
      lock: ownedByMe ? lock : undefined
    };
  }));

  res.json({ event: eventResult.rows[0], seats, lockLookupAvailable });
}));

router.post('/', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const data = eventSchema.parse(req.body);
  const event = await withTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO events (title, description, venue, starts_at, poster_url)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [data.title, data.description, data.venue, data.startsAt, data.posterUrl || null]
    );

    const eventId = result.rows[0].id;
    for (let rowIndex = 0; rowIndex < data.rows; rowIndex += 1) {
      const rowLabel = String.fromCharCode(65 + rowIndex);
      for (let seatNumber = 1; seatNumber <= data.seatsPerRow; seatNumber += 1) {
        await client.query(
          'INSERT INTO seats (event_id, row_label, seat_number) VALUES ($1, $2, $3)',
          [eventId, rowLabel, seatNumber]
        );
      }
    }

    return result.rows[0];
  });

  res.status(201).json({ event });
}));

router.patch('/:eventId', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const patchSchema = z.object({
    title: eventSchema.shape.title.optional(),
    description: eventSchema.shape.description.optional(),
    venue: eventSchema.shape.venue.optional(),
    startsAt: dateTimeSchema.optional(),
    posterUrl: optionalUrlSchema
  });
  const data = patchSchema.parse(req.body);
  const result = await query(
    `UPDATE events
     SET title = COALESCE($2, title),
         description = COALESCE($3, description),
         venue = COALESCE($4, venue),
         starts_at = COALESCE($5, starts_at),
         poster_url = COALESCE($6, poster_url),
         updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [req.params.eventId, data.title, data.description, data.venue, data.startsAt, data.posterUrl]
  );
  if (!result.rowCount) throw new HttpError(404, 'Event not found');
  res.json({ event: result.rows[0] });
}));

router.delete('/:eventId', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const result = await query('DELETE FROM events WHERE id = $1 RETURNING id', [req.params.eventId]);
  if (!result.rowCount) throw new HttpError(404, 'Event not found');
  res.status(204).send();
}));

module.exports = router;
