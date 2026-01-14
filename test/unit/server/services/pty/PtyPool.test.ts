/**
 * PtyPool unit tests
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createServer, type Server } from 'node:net';
import { writeFile, unlink } from 'node:fs/promises';
import { PtyPool } from '@server/services/pty/PtyPool.js';
import { createMockPty, createMockPtyFactory } from '@test/mocks/pty.js';
import { getSocketPath, encodeMessage } from '@server/services/pty/daemon/protocol.js';
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

describe('PtyPool (Daemon Mode)', () => {
  let pool: PtyPool;
  let mockShellStore: MockShellStore;

  beforeEach(() => {
    mockShellStore = createMockShellStore();
    pool = new PtyPool({
      ptyFactory: createMockPtyFactory(),
      usePersistentDaemons: true,
    });
  });

  afterEach(() => {
    pool.shutdown();
  });

  it('sets usePersistentDaemons flag', () => {
    expect(pool.usePersistentDaemons).toBe(true);
  });

  it('creates daemonManager when persistent mode enabled', () => {
    expect(pool.daemonManager).not.toBeNull();
  });

  it('daemonManager is null when persistent mode disabled', () => {
    const nonDaemonPool = new PtyPool({ ptyFactory: createMockPtyFactory() });
    expect(nonDaemonPool.daemonManager).toBeNull();
    nonDaemonPool.shutdown();
  });

  describe('hasDaemon', () => {
    const testShellId = 'test-daemon-pool-shell';
    const testSocketPath = getSocketPath(testShellId);

    afterEach(async () => {
      try {
        await unlink(testSocketPath);
      } catch {
        // Ignore
      }
    });

    it('returns false when socket does not exist', async () => {
      const result = await pool.hasDaemon(testShellId);
      expect(result).toBe(false);
    });

    it('returns true when socket exists', async () => {
      await writeFile(testSocketPath, '');
      const result = await pool.hasDaemon(testShellId);
      expect(result).toBe(true);
    });

    it('returns false in non-daemon mode', async () => {
      const nonDaemonPool = new PtyPool({ ptyFactory: createMockPtyFactory() });
      await writeFile(testSocketPath, '');
      const result = await nonDaemonPool.hasDaemon(testShellId);
      expect(result).toBe(false);
      nonDaemonPool.shutdown();
    });
  });

  describe('attach', () => {
    const testShellId = 'test-attach-pool-shell';
    const testSocketPath = getSocketPath(testShellId);
    let mockServer: Server | null = null;

    afterEach(async () => {
      if (mockServer) {
        await new Promise<void>((resolve) => {
          mockServer?.close(() => { resolve(); });
        });
        mockServer = null;
      }
      try {
        await unlink(testSocketPath);
      } catch {
        // Ignore
      }
    });

    it('returns null when socket does not exist', async () => {
      const result = await pool.attach(testShellId, '/test/cwd');
      expect(result).toBeNull();
    });

    it('attaches to existing daemon', async () => {
      mockServer = await new Promise<Server>((resolve, reject) => {
        const server = createServer((socket) => {
          socket.write(encodeMessage({ type: 'ready' }));
        });
        server.on('error', reject);
        server.listen(testSocketPath, () => { resolve(server); });
      });

      const client = await pool.attach(testShellId, '/test/cwd');
      expect(client).not.toBeNull();
      expect(client?.id).toBe(testShellId);
      client?.dispose();
    });

    it('returns null in non-daemon mode', async () => {
      const nonDaemonPool = new PtyPool({ ptyFactory: createMockPtyFactory() });
      mockServer = await new Promise<Server>((resolve, reject) => {
        const server = createServer((socket) => {
          socket.write(encodeMessage({ type: 'ready' }));
        });
        server.on('error', reject);
        server.listen(testSocketPath, () => { resolve(server); });
      });

      const result = await nonDaemonPool.attach(testShellId, '/test/cwd');
      expect(result).toBeNull();
      nonDaemonPool.shutdown();
    });
  });

  describe('cleanupOrphans with socketPath', () => {
    const testShellId = 'test-orphan-socket-shell';
    const testSocketPath = getSocketPath(testShellId);

    afterEach(async () => {
      try {
        await unlink(testSocketPath);
      } catch {
        // Ignore
      }
    });

    it('marks shell as inactive when socket is gone', async () => {
      mockShellStore.shells = [{
        id: testShellId,
        projectId: 'project-1',
        name: 'Shell 1',
        cwd: '/tmp',
        pid: null,
        socketPath: testSocketPath,
        status: 'active',
        type: 'bash',
        lastActivityAt: null,
        done: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }];

      await pool.cleanupOrphans(mockShellStore as unknown as Parameters<typeof pool.cleanupOrphans>[0]);

      expect(mockShellStore.update).toHaveBeenCalledWith(
        testShellId,
        expect.objectContaining({ status: 'inactive', pid: null, socketPath: null }),
      );
    });

    it('does not cleanup shell when socket exists', async () => {
      await writeFile(testSocketPath, '');

      mockShellStore.shells = [{
        id: testShellId,
        projectId: 'project-1',
        name: 'Shell 1',
        cwd: '/tmp',
        pid: null,
        socketPath: testSocketPath,
        status: 'active',
        type: 'bash',
        lastActivityAt: null,
        done: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }];

      await pool.cleanupOrphans(mockShellStore as unknown as Parameters<typeof pool.cleanupOrphans>[0]);

      expect(mockShellStore.update).not.toHaveBeenCalled();
    });
  });

  describe('reconnectDaemons', () => {
    const testShellId = 'test-reconnect-shell';
    const testSocketPath = getSocketPath(testShellId);
    let mockServer: Server | null = null;
    let serverConnections: import('node:net').Socket[] = [];

    afterEach(async () => {
      // Close all connections first
      for (const conn of serverConnections) {
        conn.destroy();
      }
      serverConnections = [];

      // Dispose pool sessions
      const session = pool.get(testShellId);
      if (session && 'dispose' in session) {
        (session as { dispose: () => void }).dispose();
      }

      if (mockServer) {
        await new Promise<void>((resolve) => {
          mockServer?.close(() => { resolve(); });
        });
        mockServer = null;
      }
      try {
        await unlink(testSocketPath);
      } catch {
        // Ignore
      }
    });

    it('returns 0 in non-daemon mode', async () => {
      const nonDaemonPool = new PtyPool({ ptyFactory: createMockPtyFactory() });
      const count = await nonDaemonPool.reconnectDaemons(
        mockShellStore as unknown as Parameters<typeof pool.reconnectDaemons>[0],
      );
      expect(count).toBe(0);
      nonDaemonPool.shutdown();
    });

    it('reconnects to existing daemons', async () => {
      mockServer = await new Promise<Server>((resolve, reject) => {
        const server = createServer((socket) => {
          serverConnections.push(socket);
          socket.write(encodeMessage({ type: 'ready' }));
        });
        server.on('error', reject);
        server.listen(testSocketPath, () => { resolve(server); });
      });

      mockShellStore.shells = [{
        id: testShellId,
        projectId: 'project-1',
        name: 'Shell 1',
        cwd: '/tmp',
        pid: null,
        socketPath: testSocketPath,
        status: 'active',
        type: 'bash',
        lastActivityAt: null,
        done: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }];

      const count = await pool.reconnectDaemons(
        mockShellStore as unknown as Parameters<typeof pool.reconnectDaemons>[0],
      );

      expect(count).toBe(1);
      expect(pool.get(testShellId)).toBeDefined();
    });

    it('marks shell inactive when socket is gone', async () => {
      mockShellStore.shells = [{
        id: testShellId,
        projectId: 'project-1',
        name: 'Shell 1',
        cwd: '/tmp',
        pid: null,
        socketPath: testSocketPath, // Socket doesn't exist
        status: 'active',
        type: 'bash',
        lastActivityAt: null,
        done: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }];

      const count = await pool.reconnectDaemons(
        mockShellStore as unknown as Parameters<typeof pool.reconnectDaemons>[0],
      );

      expect(count).toBe(0);
      expect(mockShellStore.update).toHaveBeenCalledWith(
        testShellId,
        expect.objectContaining({ status: 'inactive', socketPath: null }),
      );
    });

    it('skips inactive shells', async () => {
      mockShellStore.shells = [{
        id: testShellId,
        projectId: 'project-1',
        name: 'Shell 1',
        cwd: '/tmp',
        pid: null,
        socketPath: testSocketPath,
        status: 'inactive',
        type: 'bash',
        lastActivityAt: null,
        done: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }];

      const count = await pool.reconnectDaemons(
        mockShellStore as unknown as Parameters<typeof pool.reconnectDaemons>[0],
      );

      expect(count).toBe(0);
    });
  });

  describe('shutdown in daemon mode', () => {
    it('disconnects without killing daemons', () => {
      // Should not throw
      pool.shutdown();
      expect(pool.count()).toBe(0);
    });
  });

  describe('forceShutdown', () => {
    it('kills all daemons', async () => {
      // Should not throw
      await pool.forceShutdown();
      expect(pool.count()).toBe(0);
    });
  });
});
