const { httpRequestDuration, httpRequestTotal } = require('../metrics');

function metricsMiddleware(req, res, next) {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const elapsedSeconds = Number(process.hrtime.bigint() - start) / 1e9;
    const route = req.route?.path || req.path;
    httpRequestDuration.observe(
      { method: req.method, route, status: String(res.statusCode) },
      elapsedSeconds
    );
    httpRequestTotal.inc(
      { method: req.method, route, status: String(res.statusCode) }
    );
  });

  next();
}

module.exports = { metricsMiddleware };
