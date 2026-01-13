/**
 * PtyPool unit tests
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PtyPool } from '@server/services/pty/PtyPool.js';
import { createMockPty, createMockPtyFactory } from '@test/mocks/pty.js';
import type { Shell } from '@shared/types/index.js';

// Mock ShellStore interface
interface MockShellStore {
  shells: Shell[];
  getAll: () => Promise<Shell[]>;
  update: (id: string, updates: Partial<Shell>) => Promise<Shell | null>;
}

function createMockShellStore(): MockShellStore {
  const store: MockShellStore = {
    shells: [],
    getAll: vi.fn(() => Promise.resolve(store.shells)),
    update: vi.fn((id: string, updates: Partial<Shell>) => {
      const shell = store.shells.find((s) => s.id === id);
      if (!shell) return Promise.resolve(null);
      Object.assign(shell, updates);
      return Promise.resolve(shell);
    }),
  };
  return store;
}

describe('PtyPool', () => {
  let pool: PtyPool;
  let mockShellStore: MockShellStore;

  beforeEach(() => {
    mockShellStore = createMockShellStore();
    pool = new PtyPool({ ptyFactory: createMockPtyFactory() });
  });

  afterEach(() => {
    pool.shutdown();
  });

  it('tracks sessions by shell ID', () => {
    const session = pool.spawn('shell-1', { cwd: '/tmp' });
    expect(pool.get('shell-1')).toBe(session);
  });

  it('cleans up orphaned sessions on startup', async () => {
    // Shell in database with PID that doesn't exist
    mockShellStore.shells = [{
      id: 'orphan-1',
      projectId: 'project-1',
      name: 'Shell 1',
      cwd: '/tmp',
      pid: 99999, // Non-existent PID
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }];

    await pool.cleanupOrphans(mockShellStore as unknown as Parameters<typeof pool.cleanupOrphans>[0]);

    expect(mockShellStore.update).toHaveBeenCalledWith(
      'orphan-1',
      expect.objectContaining({ status: 'inactive', pid: null }),
    );
  });

  it('does not cleanup session if process exists', async () => {
    // Create a shell with current process PID (which definitely exists)
    mockShellStore.shells = [{
      id: 'active-1',
      projectId: 'project-1',
      name: 'Shell 1',
      cwd: '/tmp',
      pid: process.pid, // Current process PID (exists)
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }];

    await pool.cleanupOrphans(mockShellStore as unknown as Parameters<typeof pool.cleanupOrphans>[0]);

    // Should not have updated the active shell
    expect(mockShellStore.update).not.toHaveBeenCalledWith(
      'active-1',
      expect.anything(),
    );
  });

  it('gracefully shuts down all sessions', () => {
    pool.spawn('shell-1', { cwd: '/tmp' });
    pool.spawn('shell-2', { cwd: '/tmp' });

    pool.shutdown();

    expect(pool.count()).toBe(0);
  });

  it('runs periodic cleanup', () => {
    vi.useFakeTimers();
    const cleanupSpy = vi.spyOn(pool, 'cleanupOrphans').mockResolvedValue();

    pool.startCleanupInterval(60000, mockShellStore as unknown as Parameters<typeof pool.cleanupOrphans>[0]);
    vi.advanceTimersByTime(60000);

    expect(cleanupSpy).toHaveBeenCalled();

    pool.stopCleanupInterval();
    vi.useRealTimers();
  });

  it('stops cleanup interval', () => {
    vi.useFakeTimers();
    const cleanupSpy = vi.spyOn(pool, 'cleanupOrphans').mockResolvedValue();

    pool.startCleanupInterval(60000, mockShellStore as unknown as Parameters<typeof pool.cleanupOrphans>[0]);
    pool.stopCleanupInterval();

    vi.advanceTimersByTime(120000);

    expect(cleanupSpy).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('returns count of active sessions', () => {
    expect(pool.count()).toBe(0);
    pool.spawn('shell-1', { cwd: '/tmp' });
    expect(pool.count()).toBe(1);
  });

  it('kills specific session', () => {
    pool.spawn('shell-1', { cwd: '/tmp' });
    pool.spawn('shell-2', { cwd: '/tmp' });

    pool.kill('shell-1');

    expect(pool.get('shell-1')).toBeUndefined();
    expect(pool.get('shell-2')).toBeDefined();
  });

  it('cleans up sessions with null PID', async () => {
    mockShellStore.shells = [{
      id: 'null-pid-1',
      projectId: 'project-1',
      name: 'Shell 1',
      cwd: '/tmp',
      pid: null,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }];

    await pool.cleanupOrphans(mockShellStore as unknown as Parameters<typeof pool.cleanupOrphans>[0]);

    expect(mockShellStore.update).toHaveBeenCalledWith(
      'null-pid-1',
      expect.objectContaining({ status: 'inactive', pid: null }),
    );
  });

  it('handles cleanup when no shells exist', async () => {
    mockShellStore.shells = [];

    // Should not throw
    await pool.cleanupOrphans(mockShellStore as unknown as Parameters<typeof pool.cleanupOrphans>[0]);
  });

  it('emits events from underlying manager', async () => {
    const events: string[] = [];
    const mockPty = createMockPty();
    pool = new PtyPool({ ptyFactory: (): typeof mockPty => mockPty });

    pool.on('session:spawned', () => events.push('spawned'));
    pool.on('session:exited', () => events.push('exited'));

    pool.spawn('shell-1', { cwd: '/tmp' });
    expect(events).toContain('spawned');

    mockPty.simulateExit(0);
    await new Promise((r) => setTimeout(r, 10));
    expect(events).toContain('exited');
  });
});
