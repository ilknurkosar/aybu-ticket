const express = require('express');
const { z } = require('zod');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const { createReservation, listUserReservations } = require('../services/reservationService');

const router = express.Router();

const checkoutSchema = z.object({
  eventId: z.string().uuid(),
  seatId: z.string().uuid(),
  lockId: z.string().uuid()
});

router.post('/', authenticate, asyncHandler(async (req, res) => {
  const data = checkoutSchema.parse(req.body);
  const reservation = await createReservation({ ...data, userId: req.user.id });
  res.status(201).json({ reservation });
}));

router.get('/mine', authenticate, asyncHandler(async (req, res) => {
  res.json({ reservations: await listUserReservations(req.user.id) });
}));

module.exports = router;
