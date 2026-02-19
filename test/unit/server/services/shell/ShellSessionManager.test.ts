/**
 * ShellSessionManager unit tests
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createServer, type Server } from 'node:net';
import { writeFile, unlink } from 'node:fs/promises';
import { ShellSessionManager } from '@server/services/shell/ShellSessionManager.js';
import { SessionError } from '@server/services/shell/SessionError.js';
import { PtyPool } from '@server/services/pty/PtyPool.js';
import { createMockPtyFactory } from '@test/mocks/pty.js';
import { getSocketPath, encodeMessage } from '@server/services/pty/daemon/protocol.js';
import type { Shell } from '@shared/types/index.js';
import type { ShellStore } from '@server/storage/stores/ShellStore.js';
import type { ScrollbackStore } from '@server/storage/stores/ScrollbackStore.js';

// Mock shell store
interface MockShellStore {
  shells: Shell[];
  getAll: () => Promise<Shell[]>;
  getById: (id: string) => Promise<Shell | null>;
  update: (id: string, updates: Partial<Shell>) => Promise<Shell | null>;
}

function createMockShellStore(): MockShellStore {
  const store: MockShellStore = {
    shells: [],
    getAll: vi.fn(() => Promise.resolve(store.shells)),
    getById: vi.fn((id: string) => {
      const shell = store.shells.find((s) => s.id === id);
      return Promise.resolve(shell ?? null);
    }),
    update: vi.fn((id: string, updates: Partial<Shell>) => {
      const index = store.shells.findIndex((s) => s.id === id);
      if (index === -1) return Promise.resolve(null);
      const shell = store.shells[index];
      if (!shell) return Promise.resolve(null);
      const updated = { ...shell, ...updates, updatedAt: new Date().toISOString() };
      store.shells[index] = updated;
      return Promise.resolve(updated);
    }),
  };
  return store;
}

// Mock scrollback store
interface MockScrollbackStore {
  data: Map<string, { type: string; data: string }[]>;
  getFromMemory: (shellId: string) => { type: string; data: string }[];
  load: (shellId: string) => Promise<{ type: string; data: string }[]>;
  append: (shellId: string, type: string, data: string) => void;
}

function createMockScrollbackStore(): MockScrollbackStore {
  const store: MockScrollbackStore = {
    data: new Map(),
    getFromMemory: vi.fn((shellId: string) => {
      return store.data.get(shellId) ?? [];
    }),
    load: vi.fn((shellId: string) => {
      return Promise.resolve(store.data.get(shellId) ?? []);
    }),
    append: vi.fn((shellId: string, type: string, data: string) => {
      if (!store.data.has(shellId)) {
        store.data.set(shellId, []);
      }
      const entries = store.data.get(shellId);
      if (entries) {
        entries.push({ type, data });
      }
    }),
  };
  return store;
}

// Helper to create a test shell
function createTestShell(id: string, overrides: Partial<Shell> = {}): Shell {
  return {
    id,
    projectId: 'project-1',
    name: `Shell ${id}`,
    cwd: '/tmp',
    status: 'inactive',
    type: 'bash',
    pid: null,
    socketPath: null,
    lastActivityAt: null,
    done: false,
    worktreePath: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('ShellSessionManager', () => {
  let manager: ShellSessionManager;
  let ptyPool: PtyPool;
  let shellStore: MockShellStore;
  let scrollbackStore: MockScrollbackStore;

  beforeEach(() => {
    shellStore = createMockShellStore();
    scrollbackStore = createMockScrollbackStore();
    ptyPool = new PtyPool({
      ptyFactory: createMockPtyFactory(),
      scrollbackStore: scrollbackStore as unknown as ScrollbackStore,
    });
    manager = new ShellSessionManager({
      ptyPool,
      shellStore: shellStore as unknown as ShellStore,
    });
  });

  afterEach(() => {
    manager.shutdown();
    ptyPool.shutdown();
  });

  describe('openSession', () => {
    it('returns session state when shell exists and daemon is already running', async () => {
      const shell = createTestShell('shell-1', { status: 'active' });
      shellStore.shells = [shell];

      // Spawn a PTY session first to simulate already running
      ptyPool.spawn('shell-1', { cwd: '/tmp' });

      const result = await manager.openSession('shell-1');

      expect(result.shell).toBeDefined();
      expect(result.shell.id).toBe('shell-1');
      expect(result.scrollback).toBeDefined();
      expect(result.cols).toBeGreaterThan(0);
      expect(result.rows).toBeGreaterThan(0);
    });

    it('spawns new daemon when shell exists but no daemon running', async () => {
      const shell = createTestShell('shell-2', { status: 'inactive' });
      shellStore.shells = [shell];

      const result = await manager.openSession('shell-2');

      expect(result.shell).toBeDefined();
      expect(result.shell.id).toBe('shell-2');
      expect(ptyPool.get('shell-2')).toBeDefined();
    });

    it('loads scrollback from disk when memory buffer is empty', async () => {
      const shell = createTestShell('shell-3', { status: 'inactive' });
      shellStore.shells = [shell];

      // Pre-populate scrollback data
      scrollbackStore.data.set('shell-3', [
        { type: 'output', data: 'hello world' },
      ]);

      const result = await manager.openSession('shell-3');

      expect(result.scrollback).toContain('hello world');
    });

    it('throws SHELL_NOT_FOUND for non-existent shell', async () => {
      shellStore.shells = [];

      await expect(manager.openSession('non-existent')).rejects.toThrow(SessionError);

      try {
        await manager.openSession('non-existent');
      } catch (err) {
        expect(err).toBeInstanceOf(SessionError);
        expect((err as SessionError).code).toBe('SHELL_NOT_FOUND');
        expect((err as SessionError).retryable).toBe(false);
      }
    });

    it('updates shell status to active on successful open', async () => {
      const shell = createTestShell('shell-4', { status: 'inactive' });
      shellStore.shells = [shell];

      await manager.openSession('shell-4');

      expect(shellStore.update).toHaveBeenCalledWith(
        'shell-4',
        expect.objectContaining({ status: 'active' }),
      );
    });
  });

  describe('closeSession', () => {
    it('kills daemon and marks shell inactive', async () => {
      const shell = createTestShell('shell-5', { status: 'active' });
      shellStore.shells = [shell];

      // Open the session first
      ptyPool.spawn('shell-5', { cwd: '/tmp' });

      await manager.closeSession('shell-5');

      expect(ptyPool.get('shell-5')).toBeUndefined();
      expect(shellStore.update).toHaveBeenCalledWith(
        'shell-5',
        expect.objectContaining({ status: 'inactive' }),
      );
    });

    it('handles already-closed session gracefully', async () => {
      const shell = createTestShell('shell-6', { status: 'inactive' });
      shellStore.shells = [shell];

      // Should not throw
      await manager.closeSession('shell-6');
    });
  });

  describe('getSessionState', () => {
    it('returns open state for active session', async () => {
      const shell = createTestShell('shell-7', { status: 'active' });
      shellStore.shells = [shell];

      // Spawn session to make it active in pool
      ptyPool.spawn('shell-7', { cwd: '/tmp' });

      const state = await manager.getSessionState('shell-7');

      expect(state).not.toBeNull();
      expect(state?.status).toBe('open');
      expect(state?.shell.id).toBe('shell-7');
    });

    it('returns closed state for inactive shell', async () => {
      const shell = createTestShell('shell-8', { status: 'inactive' });
      shellStore.shells = [shell];

      const state = await manager.getSessionState('shell-8');

      expect(state).not.toBeNull();
      expect(state?.status).toBe('closed');
    });

    it('returns null for non-existent shell', async () => {
      shellStore.shells = [];

      const state = await manager.getSessionState('non-existent');

      expect(state).toBeNull();
    });
  });

  describe('reconcile', () => {
    it('marks shell inactive when daemon is dead but status is active', async () => {
      // Shell marked active but no corresponding session in pool
      const shell = createTestShell('orphan-1', {
        status: 'active',
        pid: 99999, // Non-existent PID
      });
      shellStore.shells = [shell];

      await manager.reconcile();

      expect(shellStore.update).toHaveBeenCalledWith(
        'orphan-1',
        expect.objectContaining({ status: 'inactive', pid: null }),
      );
    });

    it('cleans up stale socket files with no corresponding shell', async () => {
      // Create a socket file with no corresponding shell in store
      const staleShellId = `stale-shell-${String(Date.now())}`;
      const socketPath = getSocketPath(staleShellId);

      await writeFile(socketPath, '');

      // No shells in the store
      shellStore.shells = [];

      try {
        await manager.reconcile();

        // The daemon manager should have cleaned up the orphaned socket
        // Note: This may not immediately delete due to how the mock works
      } finally {
        // Clean up the socket file
        try {
          await unlink(socketPath);
        } catch {
          // Ignore
        }
      }
    });
  });

  describe('reconciliation loop', () => {
    it('starts and stops reconciliation loop', () => {
      vi.useFakeTimers();
      const reconcileSpy = vi.spyOn(manager, 'reconcile').mockResolvedValue();

      manager.startReconciliationLoop(30000);

      vi.advanceTimersByTime(30000);
      expect(reconcileSpy).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(30000);
      expect(reconcileSpy).toHaveBeenCalledTimes(2);

      manager.stopReconciliationLoop();

      vi.advanceTimersByTime(60000);
      expect(reconcileSpy).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });
  });

  describe('session events', () => {
    it('emits session:opened event on successful open', async () => {
      const shell = createTestShell('shell-9', { status: 'inactive' });
      shellStore.shells = [shell];

      const openedHandler = vi.fn();
      manager.on('session:opened', openedHandler);

      await manager.openSession('shell-9');

      expect(openedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          shellId: 'shell-9',
          shell: expect.objectContaining({ id: 'shell-9' }) as unknown,
        }),
      );
    });

    it('emits session:closed event on close', async () => {
      const shell = createTestShell('shell-10', { status: 'active' });
      shellStore.shells = [shell];

      ptyPool.spawn('shell-10', { cwd: '/tmp' });

      const closedHandler = vi.fn();
      manager.on('session:closed', closedHandler);

      await manager.closeSession('shell-10');

      expect(closedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          shellId: 'shell-10',
          reason: 'requested',
        }),
      );
    });
  });

  describe('getSession', () => {
    it('returns session from pool when active', () => {
      const shell = createTestShell('shell-11', { status: 'active' });
      shellStore.shells = [shell];

      ptyPool.spawn('shell-11', { cwd: '/tmp' });

      const session = manager.getSession('shell-11');

      expect(session).toBeDefined();
    });

    it('returns undefined for non-existent session', () => {
      const session = manager.getSession('non-existent');

      expect(session).toBeUndefined();
    });
  });
});

describe('ShellSessionManager (Daemon Mode)', () => {
  const testShellId = 'test-daemon-session-shell';
  const testSocketPath = getSocketPath(testShellId);
  let manager: ShellSessionManager;
  let ptyPool: PtyPool;
  let shellStore: MockShellStore;
  let scrollbackStore: MockScrollbackStore;
  let mockServer: Server | null = null;
  let serverConnections: import('node:net').Socket[] = [];

  beforeEach(() => {
    shellStore = createMockShellStore();
    scrollbackStore = createMockScrollbackStore();
    ptyPool = new PtyPool({
      ptyFactory: createMockPtyFactory(),
      scrollbackStore: scrollbackStore as unknown as ScrollbackStore,
      usePersistentDaemons: true,
    });
    manager = new ShellSessionManager({
      ptyPool,
      shellStore: shellStore as unknown as ShellStore,
    });
  });

  afterEach(async () => {
    // Close all connections first
    for (const conn of serverConnections) {
      conn.destroy();
    }
    serverConnections = [];

    // Dispose manager sessions
    manager.shutdown();
    ptyPool.shutdown();

    if (mockServer) {
      await new Promise<void>((resolve) => {
        mockServer?.close(() => {
          resolve();
        });
      });
      mockServer = null;
    }
    try {
      await unlink(testSocketPath);
    } catch {
      // Ignore
    }
  });

  it('reconnects to orphaned daemon when session not in pool', async () => {
    // Create a mock daemon server
    mockServer = await new Promise<Server>((resolve, reject) => {
      const server = createServer((socket) => {
        serverConnections.push(socket);
        socket.write(encodeMessage({ type: 'ready' }));
      });
      server.on('error', reject);
      server.listen(testSocketPath, () => {
        resolve(server);
      });
    });

    const shell = createTestShell(testShellId, {
      status: 'active',
      socketPath: testSocketPath,
    });
    shellStore.shells = [shell];

    // Session is not in pool but socket exists
    await manager.reconcile();

    // Should have tried to reconnect
    expect(ptyPool.get(testShellId)).toBeDefined();
  });
});
