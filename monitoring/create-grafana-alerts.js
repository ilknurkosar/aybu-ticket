const fs = require('fs');
const path = require('path');

const grafanaUrl = (process.env.GRAFANA_URL || '').replace(/\/$/, '');
const apiToken = process.env.GRAFANA_API_TOKEN || '';
const datasourceUid = process.env.GRAFANA_PROMETHEUS_UID || '';
const folderTitle = process.env.GRAFANA_ALERT_FOLDER || 'AYBU Ticket Alerts';
const folderUid = process.env.GRAFANA_ALERT_FOLDER_UID || 'aybu-ticket-alerts';
const ruleGroup = process.env.GRAFANA_ALERT_RULE_GROUP || 'aybu-ticket-production';
const emailAddress = process.env.GRAFANA_ALERT_EMAIL || '';

if (!grafanaUrl || !apiToken || !datasourceUid) {
  console.error('Missing required env vars: GRAFANA_URL, GRAFANA_API_TOKEN, GRAFANA_PROMETHEUS_UID');
  process.exit(1);
}

const alertsPath = path.join(__dirname, 'grafana-alerts.json');
const alerts = JSON.parse(fs.readFileSync(alertsPath, 'utf8')).alerts;

function slug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

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

async function ensureFolder() {
  try {
    return await grafana(`/api/folders/${folderUid}`);
  } catch (error) {
    if (!String(error.message).includes('404')) throw error;
  }

  return grafana('/api/folders', {
    method: 'POST',
    body: JSON.stringify({ uid: folderUid, title: folderTitle })
  });
}

async function ensureEmailContactPoint() {
  if (!emailAddress) return;
  const name = 'aybu-ticket-email';
  const contactPoints = await grafana('/api/v1/provisioning/contact-points');
  if (contactPoints.some((point) => point.name === name)) return;

  await grafana('/api/v1/provisioning/contact-points', {
    method: 'POST',
    body: JSON.stringify({
      name,
      type: 'email',
      settings: { addresses: emailAddress },
      disableResolveMessage: false
    })
  });
}

function alertRulePayload(alert) {
  const uid = `aybu-${slug(alert.title)}`;
  return {
    uid,
    title: alert.title,
    folderUID: folderUid,
    ruleGroup,
    condition: 'C',
    data: [
      {
        refId: 'A',
        datasourceUid,
        queryType: '',
        relativeTimeRange: { from: 600, to: 0 },
        model: {
          datasource: { type: 'prometheus', uid: datasourceUid },
          editorMode: 'code',
          expr: alert.expr,
          instant: true,
          intervalMs: 1000,
          legendFormat: '__auto',
          maxDataPoints: 43200,
          range: false,
          refId: 'A'
        }
      },
      {
        refId: 'B',
        datasourceUid: '__expr__',
        queryType: '',
        relativeTimeRange: { from: 0, to: 0 },
        model: {
          datasource: { type: '__expr__', uid: '__expr__' },
          expression: 'A',
          reducer: 'last',
          refId: 'B',
          type: 'reduce'
        }
      },
      {
        refId: 'C',
        datasourceUid: '__expr__',
        queryType: '',
        relativeTimeRange: { from: 0, to: 0 },
        model: {
          conditions: [
            {
              evaluator: { params: [0], type: 'gt' },
              operator: { type: 'and' },
              query: { params: ['C'] },
              reducer: { params: [], type: 'last' },
              type: 'query'
            }
          ],
          datasource: { type: '__expr__', uid: '__expr__' },
          expression: 'B',
          refId: 'C',
          type: 'threshold'
        }
      }
    ],
    noDataState: 'NoData',
    execErrState: 'Error',
    for: alert.for,
    annotations: alert.annotations || {},
    labels: alert.labels || {},
    isPaused: false
  };
}

async function upsertAlertRule(alert) {
  const payload = alertRulePayload(alert);
  const existing = await grafana('/api/v1/provisioning/alert-rules');
  const found = existing.find((rule) => rule.uid === payload.uid);

  if (found) {
    await grafana(`/api/v1/provisioning/alert-rules/${payload.uid}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    console.log(`updated ${alert.title}`);
    return;
  }

  await grafana('/api/v1/provisioning/alert-rules', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  console.log(`created ${alert.title}`);
}

async function main() {
  await ensureFolder();
  await ensureEmailContactPoint();
  for (const alert of alerts) {
    await upsertAlertRule(alert);
  }

  if (emailAddress) {
    console.log('email contact point created/verified: aybu-ticket-email');
    console.log('In Grafana, route notifications to this contact point via Alerting > Notification policies.');
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
