const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { env } = require('../config/env');
const { query } = require('../db/pool');
const { HttpError } = require('../utils/httpError');
const { signAccessToken, signRefreshToken, hashToken, verifyRefreshToken } = require('../utils/tokens');

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
      `INSERT INTO users (email, full_name, password_hash, role)
       VALUES ($1, $2, $3, 'student')
       RETURNING id, email, full_name, role, created_at`,
      [email, data.fullName.trim(), passwordHash]
    );

    const user = result.rows[0];
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
    `SELECT rt.*, u.email, u.full_name, u.role
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
    role: stored.rows[0].role
  };

  return { user: publicUser(user), tokens: await issueTokens(user) };
}

async function logout(refreshToken) {
  if (!refreshToken) return;
  await query('UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1', [hashToken(refreshToken)]);
}

module.exports = { register, login, refresh, logout, publicUser, assertAybuEmail };
