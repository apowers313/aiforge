/**
 * Tests for SessionStore - session data persistence
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SessionStore, type StoredSession } from '@server/storage/stores/SessionStore.js';

function createSession(overrides: Partial<StoredSession> = {}): StoredSession {
  const now = new Date();
  const future = new Date(now.getTime() + 3600000); // 1 hour from now
  return {
    token: 'test-token',
    expiresAt: future.toISOString(),
    createdAt: now.toISOString(),
    ...overrides,
  };
}

describe('SessionStore', () => {
  let store: SessionStore;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'session-store-test-'));
    store = new SessionStore(join(tempDir, 'sessions.json'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('create', () => {
    it('creates a session', async () => {
      const session = createSession({ token: 'my-token' });
      await store.create(session);

      const found = await store.findByToken('my-token');
      expect(found).not.toBeNull();
      expect(found?.token).toBe('my-token');
    });
  });

  describe('findByToken', () => {
    it('returns null for non-existent token', async () => {
      const session = await store.findByToken('non-existent');
      expect(session).toBeNull();
    });

    it('returns session by token', async () => {
      await store.create(createSession({ token: 'token-1' }));
      await store.create(createSession({ token: 'token-2' }));

      const session = await store.findByToken('token-1');
      expect(session).not.toBeNull();
      expect(session?.token).toBe('token-1');
    });
  });

  describe('delete', () => {
    it('deletes a session by token', async () => {
      await store.create(createSession({ token: 'to-delete' }));

      await store.delete('to-delete');

      const found = await store.findByToken('to-delete');
      expect(found).toBeNull();
    });

    it('does not affect other sessions', async () => {
      await store.create(createSession({ token: 'token-1' }));
      await store.create(createSession({ token: 'token-2' }));

      await store.delete('token-1');

      const found = await store.findByToken('token-2');
      expect(found).not.toBeNull();
    });
  });

  describe('deleteExpired', () => {
    it('deletes expired sessions', async () => {
      const past = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago
      const future = new Date(Date.now() + 3600000).toISOString(); // 1 hour from now

      await store.create(createSession({ token: 'expired', expiresAt: past }));
      await store.create(createSession({ token: 'valid', expiresAt: future }));

      await store.deleteExpired();

      const expired = await store.findByToken('expired');
      const valid = await store.findByToken('valid');

      expect(expired).toBeNull();
      expect(valid).not.toBeNull();
    });

    it('keeps all sessions when none are expired', async () => {
      const future = new Date(Date.now() + 3600000).toISOString();

      await store.create(createSession({ token: 'valid-1', expiresAt: future }));
      await store.create(createSession({ token: 'valid-2', expiresAt: future }));

      await store.deleteExpired();

      const s1 = await store.findByToken('valid-1');
      const s2 = await store.findByToken('valid-2');

      expect(s1).not.toBeNull();
      expect(s2).not.toBeNull();
    });

    it('deletes all sessions when all are expired', async () => {
      const past = new Date(Date.now() - 3600000).toISOString();

      await store.create(createSession({ token: 'expired-1', expiresAt: past }));
      await store.create(createSession({ token: 'expired-2', expiresAt: past }));

      await store.deleteExpired();

      const s1 = await store.findByToken('expired-1');
      const s2 = await store.findByToken('expired-2');

      expect(s1).toBeNull();
      expect(s2).toBeNull();
    });
  });
});
