const express = require('express');
const { z } = require('zod');
const { authenticate, requireVerifiedEmail } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const { createLock, releaseLock } = require('../services/lockService');

const router = express.Router();

const lockSchema = z.object({
  eventId: z.string().uuid(),
  seatId: z.string().uuid()
});

router.post('/', authenticate, requireVerifiedEmail, asyncHandler(async (req, res) => {
  const data = lockSchema.parse(req.body);
  const lock = await createLock({ ...data, userId: req.user.id });
  res.status(201).json({ lock });
}));

router.delete('/:lockId', authenticate, requireVerifiedEmail, asyncHandler(async (req, res) => {
  const data = lockSchema.parse(req.body);
  const released = await releaseLock({ ...data, lockId: req.params.lockId, userId: req.user.id });
  res.json({ released });
}));

module.exports = router;
