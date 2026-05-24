const fs = require('fs');
const path = require('path');

const grafanaUrl = (process.env.GRAFANA_URL || '').replace(/\/$/, '');
const apiToken = process.env.GRAFANA_API_TOKEN || '';

if (!grafanaUrl || !apiToken) {
  console.error('Missing required env vars: GRAFANA_URL, GRAFANA_API_TOKEN');
  process.exit(1);
}

const dashboardPath = path.join(__dirname, 'aybu-ticket-dashboard.json');
let dashboard = JSON.parse(fs.readFileSync(dashboardPath, 'utf8'));

async function grafana(pathname, options = {}) {
  const response = await fetch(`${grafanaUrl}${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  if (response.status === 204) return null;
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${pathname} failed: ${response.status} ${text}`);
  }
  return body;
}

async function main() {
  const payload = {
    dashboard,
    overwrite: true,
    folderUid: process.env.GRAFANA_DASHBOARD_FOLDER_UID || '',
    message: 'Deployed via aybu-ticket CI/CD'
  };

  const result = await grafana('/api/dashboards/db', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  console.log(`dashboard ${result.status}: ${result.title || dashboard.title}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
