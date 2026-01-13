/**
 * Unit tests for SessionCleanup service
 */
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { SessionCleanup } from '@server/services/auth/SessionCleanup.js';
import type { SessionStore, StoredSession } from '@server/storage/stores/SessionStore.js';

interface MockSessionStore extends SessionStore {
  sessions: StoredSession[];
  deleteExpiredMock: Mock;
}

// Create a mock session store
function createMockSessionStore(): MockSessionStore {
  const sessions: StoredSession[] = [];
  const deleteExpiredMock = vi.fn(() => {
    const now = new Date().toISOString();
    const validSessions = sessions.filter((s) => s.expiresAt > now);
    sessions.length = 0;
    sessions.push(...validSessions);
    return Promise.resolve();
  });

  return {
    sessions,
    deleteExpiredMock,
    create: vi.fn((session: StoredSession) => {
      sessions.push(session);
      return Promise.resolve();
    }),
    findByToken: vi.fn((token: string) => {
      return Promise.resolve(sessions.find((s) => s.token === token) ?? null);
    }),
    delete: vi.fn((token: string) => {
      const index = sessions.findIndex((s) => s.token === token);
      if (index !== -1) {
        sessions.splice(index, 1);
      }
      return Promise.resolve();
    }),
    deleteExpired: deleteExpiredMock,
  };
}

describe('SessionCleanup', () => {
  let cleanup: SessionCleanup;
  let mockSessionStore: MockSessionStore;

  beforeEach(() => {
    vi.useFakeTimers();
    mockSessionStore = createMockSessionStore();
    cleanup = new SessionCleanup(mockSessionStore, 60000);
  });

  afterEach(() => {
    cleanup.stop();
    vi.useRealTimers();
  });

  it('removes expired sessions', async () => {
    const now = new Date();
    mockSessionStore.sessions.push(
      {
        token: 'expired-token',
        expiresAt: new Date(now.getTime() - 1000).toISOString(),
        createdAt: new Date(now.getTime() - 86400000).toISOString(),
      },
      {
        token: 'valid-token',
        expiresAt: new Date(now.getTime() + 86400000).toISOString(),
        createdAt: now.toISOString(),
      },
    );

    const removed = await cleanup.cleanup();

    expect(removed).toBe(1);
    expect(mockSessionStore.deleteExpiredMock).toHaveBeenCalled();
  });

  it('does not write if no sessions expired', async () => {
    const now = new Date();
    mockSessionStore.sessions.push({
      token: 'valid-token',
      expiresAt: new Date(now.getTime() + 86400000).toISOString(),
      createdAt: now.toISOString(),
    });

    const removed = await cleanup.cleanup();

    expect(removed).toBe(0);
    expect(mockSessionStore.deleteExpiredMock).not.toHaveBeenCalled();
  });

  it('runs cleanup on startup', async () => {
    const cleanupSpy = vi.spyOn(cleanup, 'cleanup').mockResolvedValue(0);
    cleanup.start();

    // Need to advance timers to trigger the immediate cleanup call
    await vi.advanceTimersByTimeAsync(0);

    expect(cleanupSpy).toHaveBeenCalled();
    cleanup.stop(); // Stop the interval to prevent it from running
  });

  it('runs cleanup at configured interval', async () => {
    const cleanupSpy = vi.spyOn(cleanup, 'cleanup').mockResolvedValue(0);
    cleanup.start();

    // Initial cleanup on startup
    await vi.advanceTimersByTimeAsync(0);
    expect(cleanupSpy).toHaveBeenCalledTimes(1);

    // Advance by interval
    await vi.advanceTimersByTimeAsync(60000);
    expect(cleanupSpy).toHaveBeenCalledTimes(2);

    // Advance by another interval
    await vi.advanceTimersByTimeAsync(60000);
    expect(cleanupSpy).toHaveBeenCalledTimes(3);

    cleanup.stop(); // Stop the interval
  });

  it('stops cleanup interval when stop is called', async () => {
    const cleanupSpy = vi.spyOn(cleanup, 'cleanup').mockResolvedValue(0);
    cleanup.start();

    await vi.advanceTimersByTimeAsync(0);
    expect(cleanupSpy).toHaveBeenCalledTimes(1);

    cleanup.stop();

    await vi.advanceTimersByTimeAsync(60000);

    // Should still be 1 because interval was stopped
    expect(cleanupSpy).toHaveBeenCalledTimes(1);
  });

  it('handles empty session store', async () => {
    const removed = await cleanup.cleanup();

    expect(removed).toBe(0);
    expect(mockSessionStore.deleteExpiredMock).not.toHaveBeenCalled();
  });

  it('handles all sessions being expired', async () => {
    const now = new Date();
    mockSessionStore.sessions.push(
      {
        token: 'expired-1',
        expiresAt: new Date(now.getTime() - 1000).toISOString(),
        createdAt: new Date(now.getTime() - 86400000).toISOString(),
      },
      {
        token: 'expired-2',
        expiresAt: new Date(now.getTime() - 2000).toISOString(),
        createdAt: new Date(now.getTime() - 86400000).toISOString(),
      },
    );

    const removed = await cleanup.cleanup();

    expect(removed).toBe(2);
    expect(mockSessionStore.deleteExpiredMock).toHaveBeenCalled();
  });
});
