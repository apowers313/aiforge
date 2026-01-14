/**
 * Rate limiting integration tests
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestServer, type TestServer } from '../../helpers/server.js';
import { loginRateLimiter } from '@server/api/middleware/rateLimit.js';

describe('Rate Limiting', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await createTestServer({ authGuid: 'test-guid' });
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    // Reset rate limiter between tests to prevent test interference
    loginRateLimiter.reset();
  });

  it('allows requests under rate limit', async () => {
    // Make 5 failed login attempts - should all be allowed
    for (let i = 0; i < 5; i++) {
      const response = await request(server.app)
        .post('/api/auth/login')
        .send({ guid: 'wrong-guid' });

      expect(response.status).toBe(401);
    }
  });

  it('blocks requests exceeding rate limit', async () => {
    // First, exhaust the rate limit with failed attempts
    // The rate limit is 10 requests per 15 minutes
    const requests = [];
    for (let i = 0; i < 15; i++) {
      requests.push(
        request(server.app)
          .post('/api/auth/login')
          .send({ guid: 'wrong-guid' }),
      );
    }

    const responses = await Promise.all(requests);

    // Some requests should be rate limited (429)
    const rateLimited = responses.filter((r) => r.status === 429);

    // At least some should be rate limited
    expect(rateLimited.length).toBeGreaterThan(0);

    // The rate limited responses should have the expected message
    if (rateLimited.length > 0) {
      const body = rateLimited[0].body as { message: string };
      expect(body.message).toContain('Too many');
    }
  });

  it('does not rate limit authenticated endpoints', async () => {
    // Make many requests to an authenticated endpoint
    // Rate limiting should only apply to auth endpoints
    for (let i = 0; i < 20; i++) {
      const response = await request(server.app)
        .get('/api/auth/status')
        .set('Cookie', server.authCookie);

      expect(response.status).toBe(200);
    }
  });

  it('includes rate limit headers', async () => {
    const response = await request(server.app)
      .post('/api/auth/login')
      .send({ guid: 'wrong-guid' });

    // Check for rate limit headers
    expect(response.headers['x-ratelimit-limit']).toBeDefined();
    expect(response.headers['x-ratelimit-remaining']).toBeDefined();
  });
});
