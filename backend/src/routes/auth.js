const express = require('express');
const { asyncHandler } = require('../utils/asyncHandler');
const { authenticate } = require('../middleware/auth');
const authService = require('../services/authService');

const router = express.Router();

router.post('/register', asyncHandler(async (req, res) => {
  const result = await authService.register(req.body);
  res.status(201).json(result);
}));

router.post('/login', asyncHandler(async (req, res) => {
  res.json(await authService.login(req.body));
}));

router.post('/refresh', asyncHandler(async (req, res) => {
  res.json(await authService.refresh(req.body.refreshToken));
}));

router.post('/logout', asyncHandler(async (req, res) => {
  await authService.logout(req.body.refreshToken);
  res.status(204).send();
}));

router.get('/me', authenticate, (req, res) => {
  res.json({ user: authService.publicUser(req.user) });
});

module.exports = router;
