# AYBU Cinema Booking Platform

Cloud-native cinema/event ticket reservation platform for AYBU students. The system prevents concurrent double-booking with Redis distributed locks and PostgreSQL uniqueness constraints.

## Stack

- Backend: Node.js, Express.js
- Frontend: React, Vite
- Database: PostgreSQL, Neon-compatible
- Cache/locking: Redis, Upstash-compatible REST Redis or local Redis
- Deployment: Docker, Google Cloud Run
- CI/CD: GitHub Actions
- Monitoring: Prometheus `/metrics`
- Logging: structured JSON logs for Cloud Run stdout and Loki/Grafana Cloud ingestion

## Features

- Real authentication with email/password and JWT access/refresh tokens
- Registration restricted to `@aybu.edu.tr` email addresses
- Student and admin roles
- Redis seat locks with TTL countdown
- Atomic lock acquisition with `SET key value NX EX ttl`
- PostgreSQL transaction-based checkout
- `UNIQUE(event_id, seat_id)` reservation safety constraint
- Modern dark cinema frontend
- Admin dashboard with occupancy, active locks, recent reservations and event creation
- Prometheus metrics endpoint
- Dockerized backend and frontend
- GitHub Actions CI and Cloud Run deployment workflow

## Project Structure

```txt
backend/
  src/
    cache/
    config/
    db/
    logger/
    metrics/
    middleware/
    routes/
    services/
    utils/
  migrations/
  tests/
frontend/
  src/
    api/
    auth/
    App.jsx
    styles.css
.github/workflows/
docker-compose.yml
.env.example
```

## Local Development

Copy env template:

```bash
cp .env.example .env
```

Install dependencies:

```bash
npm run install:all
```

Start local PostgreSQL and Redis:

```bash
docker compose up postgres redis
```

Run migrations and seed demo data:

```bash
npm --prefix backend run migrate
npm --prefix backend run seed
```

Start backend:

```bash
npm run dev:backend
```

Start frontend:

```bash
npm run dev:frontend
```

Local URLs:

```txt
Frontend: http://localhost:5173
Backend:  http://localhost:8080
Metrics:  http://localhost:8080/metrics
```

Default seeded admin:

```txt
Email: admin@aybu.edu.tr
Password: ChangeMe123!
```

Change this in production with `ADMIN_EMAIL`, `ADMIN_PASSWORD` and `ADMIN_FULL_NAME`.

## Docker Compose

Run the full local stack:

```bash
docker compose up --build
```

This starts:

- PostgreSQL on `5432`
- Redis on `6379`
- Backend on `8081`
- Frontend on `5173`

Docker Compose maps backend to `8081` because `8080` is commonly used by local tools such as GeoServer. The backend still listens on `8080` inside the container.

## Environment Variables

Required production values:

```env
NODE_ENV=production
PORT=8080
CLIENT_URL=https://your-frontend-url

DATABASE_URL=postgresql://...
DATABASE_SSL=true

REDIS_URL=https://...
REDIS_TOKEN=...

JWT_ACCESS_SECRET=long-random-secret
JWT_REFRESH_SECRET=another-long-random-secret

LOCK_TTL_SECONDS=300
ALLOWED_EMAIL_DOMAIN=@aybu.edu.tr

ADMIN_EMAIL=admin@aybu.edu.tr
ADMIN_PASSWORD=change-this
ADMIN_FULL_NAME=AYBU Admin
```

Frontend build variable:

```env
VITE_API_URL=https://your-cloud-run-url/api
```

## API Summary

Auth:

```txt
POST /api/auth/register
POST /api/auth/login
POST /api/auth/refresh
POST /api/auth/logout
GET  /api/auth/me
```

Events and seats:

```txt
GET    /api/events
GET    /api/events/:eventId/seats
POST   /api/events              admin only
PATCH  /api/events/:eventId     admin only
DELETE /api/events/:eventId     admin only
```

Locks and reservations:

```txt
POST   /api/locks
DELETE /api/locks/:lockId
POST   /api/reservations
GET    /api/reservations/mine
```

Dashboard:

```txt
GET /api/dashboard/summary       admin only
GET /api/dashboard/users         admin only
GET /api/dashboard/reservations  admin only
```

Ops:

```txt
GET /health
GET /metrics
```

## Concurrency Design

Seat locking uses one Redis key per event seat:

```txt
lock:event:{eventId}:seat:{seatId}
```

Lock acquisition is atomic:

```txt
SET lock:event:{eventId}:seat:{seatId} value NX EX 300
```

Checkout flow:

```txt
1. User must be authenticated
2. Backend checks the Redis lock exists
3. Backend checks lock ownership by userId and lockId
4. Backend starts PostgreSQL transaction
5. Reservation insert is attempted
6. UNIQUE(event_id, seat_id) prevents duplicate reservation
7. Redis lock is deleted after successful checkout
```

## Monitoring

Prometheus metrics are exposed at:

```txt
GET /metrics
```

Live backend example:

```txt
https://aybu-ticket-backend-173211781636.europe-west1.run.app/metrics
```

Important metrics:

```txt
aybu_http_request_duration_seconds
aybu_seat_lock_attempts_total
aybu_seat_lock_success_total
aybu_seat_lock_conflict_total
aybu_reservation_success_total
aybu_reservation_failed_total
```

For Grafana Cloud, scrape `/metrics` from Cloud Run using Grafana Alloy or another Prometheus-compatible scraper, then remote-write to Grafana Cloud Metrics.

Cost-conscious option:

```txt
Do not deploy a permanently running collector on Google Cloud unless required.
Use Grafana Cloud's free-tier guidance or run Grafana Alloy locally during demos.
```

Grafana Cloud Metrics values to keep in GitHub Secrets if using a collector:

```txt
GRAFANA_PROMETHEUS_REMOTE_WRITE_URL
GRAFANA_PROMETHEUS_USERNAME
GRAFANA_PROMETHEUS_PASSWORD
```

## Logging

The backend writes structured JSON logs to stdout using `pino`. If Grafana Loki credentials are provided, the backend also pushes application logs directly to Grafana Cloud Loki.

Required Loki environment variables:

```txt
GRAFANA_LOKI_URL
GRAFANA_LOKI_USERNAME
GRAFANA_LOKI_PASSWORD
```

`GRAFANA_LOKI_URL` can be either the base Loki URL or the full push URL:

```txt
https://logs-prod-xxx.grafana.net
https://logs-prod-xxx.grafana.net/loki/api/v1/push
```

Suggested Loki labels:

```txt
app="aybu-cinema-booking"
env="production"
level="info"
```

## GitHub Secrets

Add these secrets before using `.github/workflows/deploy.yml`:

```txt
GCP_PROJECT_ID
GCP_REGION
GCP_SERVICE_ACCOUNT_KEY
CLIENT_URL
DATABASE_URL
REDIS_URL
REDIS_TOKEN
JWT_ACCESS_SECRET
JWT_REFRESH_SECRET
ADMIN_EMAIL
ADMIN_PASSWORD
ADMIN_FULL_NAME
GRAFANA_LOKI_URL
GRAFANA_LOKI_USERNAME
GRAFANA_LOKI_PASSWORD
VITE_API_URL
```

Create a Google Artifact Registry repository named:

```txt
aybu-ticket
```

## Tests

Run backend tests:

```bash
npm --prefix backend test
```

Current automated tests cover:

- AYBU-only registration policy
- JWT utility behavior
- health endpoint
- Prometheus metrics endpoint

Recommended extra integration tests before production:

- two users attempt to lock the same seat simultaneously
- checkout after Redis TTL expiry
- checkout with another user's lock
- duplicate reservation race blocked by PostgreSQL constraint

## Production Setup Order

1. Create Neon PostgreSQL database and copy `DATABASE_URL`.
2. Create Upstash Redis database and copy REST URL/token.
3. Create Google Cloud project, Cloud Run service and Artifact Registry repository.
4. Add GitHub Actions secrets.
5. Run migrations against Neon.
6. Run seed once to create admin and demo event.
7. Deploy backend through GitHub Actions.
8. Build/deploy frontend with `VITE_API_URL` pointing to Cloud Run.
9. Configure Grafana Cloud metrics and Loki log ingestion.
