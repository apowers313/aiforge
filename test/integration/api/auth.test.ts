/**
 * Auth API integration tests
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestServer, type TestServer } from '../../helpers/server.js';

interface AuthStatusResponse {
  authenticated: boolean;
}

describe('Auth API', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await createTestServer({ authGuid: 'test-guid' });
  });

  afterAll(async () => {
    await server.close();
  });

  describe('POST /api/auth/login', () => {
    it('returns 200 and sets cookie on valid GUID', async () => {
      const response = await request(server.app)
        .post('/api/auth/login')
        .send({ guid: 'test-guid' })
        .expect(200);

      expect(response.headers['set-cookie']).toBeDefined();
      const setCookie = response.headers['set-cookie'] as string[];
      expect(setCookie[0]).toContain('session=');
    });

    it('returns 401 on invalid GUID', async () => {
      await request(server.app)
        .post('/api/auth/login')
        .send({ guid: 'wrong-guid' })
        .expect(401);
    });

    it('returns 400 on missing GUID', async () => {
      await request(server.app)
        .post('/api/auth/login')
        .send({})
        .expect(400);
    });
  });

  describe('GET /api/auth/status', () => {
    it('returns authenticated:true with valid session', async () => {
      const response = await request(server.app)
        .get('/api/auth/status')
        .set('Cookie', server.authCookie)
        .expect(200);

      const body = response.body as AuthStatusResponse;
      expect(body.authenticated).toBe(true);
    });

    it('returns authenticated:false without session', async () => {
      const response = await request(server.app)
        .get('/api/auth/status')
        .expect(200);

      const body = response.body as AuthStatusResponse;
      expect(body.authenticated).toBe(false);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('clears session cookie', async () => {
      // First login to get a fresh cookie
      const loginResponse = await request(server.app)
        .post('/api/auth/login')
        .send({ guid: 'test-guid' });

      const setCookie = loginResponse.headers['set-cookie'] as string[];
      const freshCookie = setCookie[0]?.split(';')[0] ?? '';

      const response = await request(server.app)
        .post('/api/auth/logout')
        .set('Cookie', freshCookie)
        .expect(200);

      // Check that the cookie is cleared (expires in the past)
      const logoutCookie = response.headers['set-cookie'] as string[];
      expect(logoutCookie[0]).toMatch(/session=;|Expires=Thu, 01 Jan 1970/);
    });
  });
});
