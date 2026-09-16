import request from 'supertest';
import { app } from '../../src/app.js';

test('health endpoint responds', async () => {
  const response = await request(app).get('/api/v1/health');
  expect(response.status).toBe(200);
  expect(response.body.success).toBe(true);
});
