const express = require('express');
const { query } = require('../db/pool');
const { authenticate, requireAdmin, requireVerifiedEmail } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const { countActiveLocks } = require('../services/lockService');

const router = express.Router();

router.use(authenticate, requireVerifiedEmail, requireAdmin);

router.get('/summary', asyncHandler(async (req, res) => {
  const [stats, events, recentReservations, activeLocks] = await Promise.all([
    query(`
      SELECT
        (SELECT COUNT(*)::int FROM users) AS total_users,
        (SELECT COUNT(*)::int FROM events) AS total_events,
        (SELECT COUNT(*)::int FROM seats) AS total_seats,
        (SELECT COUNT(*)::int FROM reservations WHERE status = 'confirmed') AS total_reservations
    `),
    query(`
      SELECT e.id, e.title, e.venue, e.starts_at,
             COUNT(s.id)::int AS total_seats,
             COUNT(r.id)::int AS reserved_seats,
             CASE WHEN COUNT(s.id) = 0 THEN 0
                  ELSE ROUND((COUNT(r.id)::numeric / COUNT(s.id)::numeric) * 100, 1)
             END AS occupancy
      FROM events e
      LEFT JOIN seats s ON s.event_id = e.id
      LEFT JOIN reservations r ON r.seat_id = s.id AND r.status = 'confirmed'
      GROUP BY e.id
      ORDER BY e.starts_at ASC
    `),
    query(`
      SELECT r.id, r.created_at, u.email, e.title, s.row_label, s.seat_number
      FROM reservations r
      JOIN users u ON u.id = r.user_id
      JOIN events e ON e.id = r.event_id
      JOIN seats s ON s.id = r.seat_id
      ORDER BY r.created_at DESC
      LIMIT 10
    `),
    countActiveLocks()
  ]);

  const base = stats.rows[0];
  res.json({
    summary: {
      totalUsers: base.total_users,
      totalEvents: base.total_events,
      totalSeats: base.total_seats,
      totalReservations: base.total_reservations,
      activeLocks,
      reservationRate: base.total_seats ? Number(((base.total_reservations / base.total_seats) * 100).toFixed(1)) : 0
    },
    events: events.rows,
    recentReservations: recentReservations.rows
  });
}));

router.get('/users', asyncHandler(async (req, res) => {
  const result = await query('SELECT id, email, full_name, role, created_at FROM users ORDER BY created_at DESC LIMIT 100');
  res.json({ users: result.rows });
}));

router.get('/reservations', asyncHandler(async (req, res) => {
  const result = await query(`
    SELECT r.id, r.status, r.created_at, u.email, e.title, s.row_label, s.seat_number
    FROM reservations r
    JOIN users u ON u.id = r.user_id
    JOIN events e ON e.id = r.event_id
    JOIN seats s ON s.id = r.seat_id
    ORDER BY r.created_at DESC
    LIMIT 200
  `);
  res.json({ reservations: result.rows });
}));

module.exports = router;
