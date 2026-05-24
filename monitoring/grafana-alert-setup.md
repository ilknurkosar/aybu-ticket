# Grafana Alert & Dashboard Setup

This project keeps alert definitions in `monitoring/grafana-alerts.json`
and dashboard definition in `monitoring/aybu-ticket-dashboard.json`.

Both are **automatically provisioned** via CI/CD after each backend deploy
(`.github/workflows/deploy.yml`). To run manually:

### Prerequisites

Add these secrets to GitHub repository:

| Secret | Description |
|---|---|
| `GRAFANA_URL` | Your Grafana instance URL (e.g. `https://YOUR-STACK.grafana.net`) |
| `GRAFANA_API_TOKEN` | Service account token with alerting + folders write |
| `GRAFANA_PROMETHEUS_UID` | Prometheus datasource UID |
| `GRAFANA_ALERT_EMAIL` | Email for alert notifications |
| `GRAFANA_DASHBOARD_FOLDER_UID` | (Optional) Folder UID for the dashboard |

### Manual run

```powershell
$env:GRAFANA_URL="https://YOUR-STACK.grafana.net"
$env:GRAFANA_API_TOKEN="YOUR_GRAFANA_API_TOKEN"
$env:GRAFANA_PROMETHEUS_UID="grafanacloud-ilknurkosar-prom"
$env:GRAFANA_ALERT_EMAIL="your-email@example.com"
node monitoring/create-grafana-alerts.js
node monitoring/create-grafana-dashboard.js
```

Required token permissions:

- Alerting provisioning read/write
- Folders read/write

After the script runs, connect notifications:

1. Grafana Cloud > Alerting > Contact points
2. Confirm `aybu-ticket-email` exists
3. Grafana Cloud > Alerting > Notification policies
4. Route label `team=aybu` to `aybu-ticket-email`

Important alerts:

- Backend is down
- Email verification send failures
- High HTTP 5xx error rate
- High HTTP p95 latency
- DB pool waiting connections
- Reservation failures detected
