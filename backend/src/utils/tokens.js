const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { env } = require('../config/env');

function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, fullName: user.full_name || user.fullName },
    env.jwtAccessSecret,
    { expiresIn: env.accessTokenTtl }
  );
}

function signRefreshToken(user) {
  return jwt.sign({ sub: user.id, type: 'refresh' }, env.jwtRefreshSecret, {
    expiresIn: `${env.refreshTokenTtlDays}d`
  });
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.jwtAccessSecret);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, env.jwtRefreshSecret);
}

module.exports = { signAccessToken, signRefreshToken, hashToken, verifyAccessToken, verifyRefreshToken };
