const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { env } = require('../config/env');
const { query } = require('../db/pool');
const { HttpError } = require('../utils/httpError');
const { signAccessToken, signRefreshToken, hashToken, verifyRefreshToken } = require('../utils/tokens');
const { sendVerificationCode, verifyCode } = require('./emailService');
const { logger } = require('../logger');

const registerSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(2).max(120),
  password: z.string().min(8).max(200)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function assertAybuEmail(email) {
  if (!email.endsWith(env.allowedEmailDomain)) {
    throw new HttpError(400, `Only ${env.allowedEmailDomain} email addresses can register`);
  }
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    role: user.role,
    emailVerified: user.email_verified,
    createdAt: user.created_at
  };
}

async function persistRefreshToken(userId, refreshToken) {
  const tokenHash = hashToken(refreshToken);
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, now() + ($3 || ' days')::interval)`,
    [userId, tokenHash, String(env.refreshTokenTtlDays)]
  );
}

async function issueTokens(user) {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  await persistRefreshToken(user.id, refreshToken);
  return { accessToken, refreshToken };
}

async function register(input) {
  const data = registerSchema.parse(input);
  const email = normalizeEmail(data.email);
  assertAybuEmail(email);

  const passwordHash = await bcrypt.hash(data.password, 12);

  try {
    const result = await query(
      `INSERT INTO users (email, full_name, password_hash, role, email_verified)
       VALUES ($1, $2, $3, 'student', false)
       RETURNING id, email, full_name, role, email_verified, created_at`,
      [email, data.fullName.trim(), passwordHash]
    );

    const user = result.rows[0];
    sendVerificationCode(email).catch((error) => {
      logger.error({ error, email }, 'send_verification_failed');
    });
    return { user: publicUser(user), tokens: await issueTokens(user) };
  } catch (error) {
    if (error.code === '23505') throw new HttpError(409, 'Email is already registered');
    throw error;
  }
}

async function login(input) {
  const data = loginSchema.parse(input);
  const email = normalizeEmail(data.email);
  const result = await query('SELECT * FROM users WHERE email = $1', [email]);

  if (!result.rowCount) throw new HttpError(401, 'Invalid email or password');

  const user = result.rows[0];
  const passwordMatches = await bcrypt.compare(data.password, user.password_hash);
  if (!passwordMatches) throw new HttpError(401, 'Invalid email or password');

  return { user: publicUser(user), tokens: await issueTokens(user) };
}

async function sendVerification(userId) {
  const result = await query('SELECT id, email, email_verified FROM users WHERE id = $1', [userId]);
  if (!result.rowCount) throw new HttpError(404, 'User not found');
  const user = result.rows[0];
  if (user.email_verified) throw new HttpError(400, 'Email is already verified');
  await sendVerificationCode(user.email);
}

async function verifyEmail(userId, code) {
  const result = await query('SELECT id, email, email_verified FROM users WHERE id = $1', [userId]);
  if (!result.rowCount) throw new HttpError(404, 'User not found');
  const user = result.rows[0];
  if (user.email_verified) throw new HttpError(400, 'Email is already verified');
  const ok = await verifyCode(user.email, code);
  if (!ok) throw new HttpError(400, 'Invalid or expired verification code');
  await query('UPDATE users SET email_verified = true WHERE id = $1', [userId]);
}

async function refresh(refreshToken) {
  if (!refreshToken) throw new HttpError(400, 'refreshToken is required');

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new HttpError(401, 'Invalid refresh token');
  }

  const tokenHash = hashToken(refreshToken);
  const stored = await query(
    `SELECT rt.*, u.email, u.full_name, u.role, u.email_verified
      FROM refresh_tokens rt
      JOIN users u ON u.id = rt.user_id
      WHERE rt.token_hash = $1 AND rt.revoked_at IS NULL AND rt.expires_at > now()`,
    [tokenHash]
  );

  if (!stored.rowCount || stored.rows[0].user_id !== payload.sub) {
    throw new HttpError(401, 'Refresh token expired or revoked');
  }

  await query('UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1', [tokenHash]);
  const user = {
    id: stored.rows[0].user_id,
    email: stored.rows[0].email,
    full_name: stored.rows[0].full_name,
    role: stored.rows[0].role,
    email_verified: stored.rows[0].email_verified
  };

  return { user: publicUser(user), tokens: await issueTokens(user) };
}

async function logout(refreshToken) {
  if (!refreshToken) return;
  await query('UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1', [hashToken(refreshToken)]);
}

module.exports = { register, login, refresh, logout, sendVerification, verifyEmail, publicUser, assertAybuEmail };
