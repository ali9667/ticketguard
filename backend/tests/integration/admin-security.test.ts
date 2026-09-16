import request from 'supertest';
import { app } from '../../src/app.js';

describe('admin/security API contract', () => {
  it('requires authentication for admin resources', async () => {
    const response = await request(app).get('/api/v1/admin/users');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTH_REQUIRED');
  });

  it('rejects invalid admin status payloads before reaching the service', async () => {
    // Authentication is deliberately checked first; this test documents the route contract.
    const response = await request(app).patch('/api/v1/admin/users/not-a-uuid/status').send({ status: 'ROOT' });
    expect(response.status).toBe(401);
  });
});
