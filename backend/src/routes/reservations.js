const express = require('express');
const { z } = require('zod');
const { authenticate, requireVerifiedEmail } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const { createReservation, listUserReservations, cancelReservation } = require('../services/reservationService');

const router = express.Router();

const checkoutSchema = z.object({
  eventId: z.string().uuid(),
  seatId: z.string().uuid(),
  lockId: z.string().uuid()
});

router.post('/', authenticate, requireVerifiedEmail, asyncHandler(async (req, res) => {
  const data = checkoutSchema.parse(req.body);
  const reservation = await createReservation({ ...data, userId: req.user.id });
  res.status(201).json({ reservation });
}));

router.get('/mine', authenticate, requireVerifiedEmail, asyncHandler(async (req, res) => {
  res.json({ reservations: await listUserReservations(req.user.id) });
}));

router.delete('/:reservationId', authenticate, requireVerifiedEmail, asyncHandler(async (req, res) => {
  const reservationId = z.string().uuid().parse(req.params.reservationId);
  await cancelReservation({ reservationId, userId: req.user.id });
  res.status(204).send();
}));

module.exports = router;
