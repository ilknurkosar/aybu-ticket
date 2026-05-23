const { ZodError } = require('zod');
const { logger } = require('../logger');

function notFound(req, res) {
  res.status(404).json({ error: 'Not found' });
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  if (error instanceof ZodError) {
    return res.status(400).json({ error: 'Validation failed', details: error.flatten() });
  }

  const status = error.status || 500;
  if (status >= 500) {
    logger.error({ error, path: req.path }, 'request_failed');
  }

  return res.status(status).json({
    error: status >= 500 ? 'Internal server error' : error.message,
    details: error.details
  });
}

module.exports = { notFound, errorHandler };
