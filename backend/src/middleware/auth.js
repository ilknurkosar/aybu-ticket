const { query } = require('../db/pool');
const { HttpError } = require('../utils/httpError');
const { verifyAccessToken } = require('../utils/tokens');

async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) throw new HttpError(401, 'Authentication required');

    const payload = verifyAccessToken(token);
    const result = await query('SELECT id, email, full_name, role, email_verified, created_at FROM users WHERE id = $1', [payload.sub]);

    if (!result.rowCount) throw new HttpError(401, 'User no longer exists');

    req.user = result.rows[0];
    next();
  } catch (error) {
    next(error.status ? error : new HttpError(401, 'Invalid or expired token'));
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return next(new HttpError(403, 'Admin access required'));
  next();
}

function requireVerifiedEmail(req, res, next) {
  if (!req.user?.email_verified) return next(new HttpError(403, 'Email verification required'));
  next();
}

module.exports = { authenticate, requireAdmin, requireVerifiedEmail };
