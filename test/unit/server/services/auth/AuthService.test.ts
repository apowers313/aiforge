/**
 * Tests for AuthService - Authentication logic
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AuthService } from '@server/services/auth/AuthService.js';
import { SessionStore } from '@server/storage/stores/SessionStore.js';

describe('AuthService', () => {
  let service: AuthService;
  let sessionStore: SessionStore;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'auth-test-'));
    sessionStore = new SessionStore(join(tempDir, 'sessions.json'));
    service = new AuthService({
      authGuid: 'correct-guid',
      sessionStore,
      sessionMaxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('validates correct GUID', () => {
    expect(service.validateGuid('correct-guid')).toBe(true);
  });

  it('rejects incorrect GUID', () => {
    expect(service.validateGuid('wrong-guid')).toBe(false);
  });

  it('creates session on successful login', async () => {
    const session = await service.login('correct-guid');
    expect(session.token).toBeDefined();
    expect(session.expiresAt).toBeDefined();
  });

  it('throws on invalid login', async () => {
    await expect(service.login('wrong')).rejects.toThrow('Invalid GUID');
  });

  it('validates session token', async () => {
    const session = await service.login('correct-guid');
    const valid = await service.validateSession(session.token);
    expect(valid).toBe(true);
  });

  it('rejects invalid session token', async () => {
    const valid = await service.validateSession('nonexistent-token');
    expect(valid).toBe(false);
  });

  it('invalidates session on logout', async () => {
    const session = await service.login('correct-guid');
    await service.logout(session.token);
    const valid = await service.validateSession(session.token);
    expect(valid).toBe(false);
  });

  it('rejects expired sessions', async () => {
    // Create service with very short session duration
    const shortService = new AuthService({
      authGuid: 'correct-guid',
      sessionStore,
      sessionMaxAge: 1, // 1 millisecond
    });

    const session = await shortService.login('correct-guid');

    // Wait for session to expire
    await new Promise((resolve) => setTimeout(resolve, 10));

    const valid = await shortService.validateSession(session.token);
    expect(valid).toBe(false);
  });
});
