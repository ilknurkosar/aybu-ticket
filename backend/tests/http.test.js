import request from 'supertest';
import { describe, expect, it } from 'vitest';
import appModule from '../src/app.js';

const { createApp } = appModule;

describe('public platform endpoints', () => {
  const app = createApp();

  it('returns health status', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });

  it('returns prometheus metrics', async () => {
    const response = await request(app).get('/metrics');
    expect(response.status).toBe(200);
    expect(response.text).toContain('aybu_http_request_duration_seconds');
  });
});
