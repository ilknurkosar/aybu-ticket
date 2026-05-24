const dotenv = require('dotenv');

dotenv.config({ path: process.env.ENV_FILE || undefined });

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 8080),
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  databaseUrl: process.env.DATABASE_URL || '',
  databaseSsl: process.env.DATABASE_SSL !== 'false',
  redisUrl: process.env.REDIS_URL || '',
  redisToken: process.env.REDIS_TOKEN || '',
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret-change-me',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-me',
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL || '15m',
  refreshTokenTtlDays: Number(process.env.REFRESH_TOKEN_TTL_DAYS || 7),
  lockTtlSeconds: Number(process.env.LOCK_TTL_SECONDS || 300),
  allowedEmailDomain: process.env.ALLOWED_EMAIL_DOMAIN || '@aybu.edu.tr',
  adminEmail: process.env.ADMIN_EMAIL || 'admin@aybu.edu.tr',
  adminPassword: process.env.ADMIN_PASSWORD || 'ChangeMe123!',
  adminFullName: process.env.ADMIN_FULL_NAME || 'AYBU Admin',
  lokiUrl: process.env.GRAFANA_LOKI_URL || '',
  lokiUsername: process.env.GRAFANA_LOKI_USERNAME || '',
  lokiPassword: process.env.GRAFANA_LOKI_PASSWORD || '',
  smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
  smtpPort: Number(process.env.SMTP_PORT || 465),
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  verificationEmailFrom: process.env.VERIFICATION_EMAIL_FROM || process.env.SMTP_USER || '',
  verificationCodeTtl: Number(process.env.VERIFICATION_CODE_TTL || 600)
};

module.exports = { env };
