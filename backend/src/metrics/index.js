const client = require('prom-client');

client.collectDefaultMetrics({ prefix: 'aybu_' });

const httpRequestDuration = new client.Histogram({
  name: 'aybu_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5]
});

const seatLockAttempts = new client.Counter({
  name: 'aybu_seat_lock_attempts_total',
  help: 'Seat lock attempts total'
});

const seatLockSuccess = new client.Counter({
  name: 'aybu_seat_lock_success_total',
  help: 'Successful seat locks total'
});

const seatLockConflict = new client.Counter({
  name: 'aybu_seat_lock_conflict_total',
  help: 'Seat lock conflicts total'
});

const reservationSuccess = new client.Counter({
  name: 'aybu_reservation_success_total',
  help: 'Successful reservations total'
});

const reservationFailed = new client.Counter({
  name: 'aybu_reservation_failed_total',
  help: 'Failed reservations total',
  labelNames: ['reason']
});

const activeLocks = new client.Gauge({
  name: 'aybu_active_locks',
  help: 'Currently held seat locks (with TTL)'
});

const dbPoolTotal = new client.Gauge({
  name: 'aybu_db_pool_total',
  help: 'Database pool total connections',
  labelNames: ['state']
});

const httpRequestTotal = new client.Counter({
  name: 'aybu_http_requests_total',
  help: 'HTTP requests total',
  labelNames: ['method', 'route', 'status']
});

module.exports = {
  registry: client.register,
  httpRequestDuration,
  seatLockAttempts,
  seatLockSuccess,
  seatLockConflict,
  reservationSuccess,
  reservationFailed,
  activeLocks,
  dbPoolTotal,
  httpRequestTotal
};
