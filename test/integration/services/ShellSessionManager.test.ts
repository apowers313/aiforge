/**
 * ShellSessionManager Integration Tests
 * Tests the full session lifecycle with real dependencies (but mocked PTY)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ShellSessionManager } from '@server/services/shell/ShellSessionManager.js';
import { PtyPool } from '@server/services/pty/PtyPool.js';
import { createMockPty } from '@test/mocks/pty.js';
import type { Shell } from '@shared/types/index.js';
import type { ShellStore } from '@server/storage/stores/ShellStore.js';
import type { ScrollbackStore } from '@server/storage/stores/ScrollbackStore.js';

// Mock shell store with full CRUD
interface MockShellStore {
  shells: Shell[];
  getAll: () => Promise<Shell[]>;
  getById: (id: string) => Promise<Shell | null>;
  create: (shell: Shell) => Promise<void>;
  update: (id: string, updates: Partial<Shell>) => Promise<Shell | null>;
  delete: (id: string) => Promise<boolean>;
}

function createMockShellStore(): MockShellStore {
  const store: MockShellStore = {
    shells: [],
    getAll: vi.fn(() => Promise.resolve(store.shells)),
    getById: vi.fn((id: string) => {
      const shell = store.shells.find((s) => s.id === id);
      return Promise.resolve(shell ?? null);
    }),
    create: vi.fn((shell: Shell) => {
      store.shells.push(shell);
      return Promise.resolve();
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
    delete: vi.fn((id: string) => {
      const index = store.shells.findIndex((s) => s.id === id);
      if (index === -1) return Promise.resolve(false);
      store.shells.splice(index, 1);
      return Promise.resolve(true);
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
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('ShellSessionManager Integration', () => {
  let manager: ShellSessionManager;
  let ptyPool: PtyPool;
  let shellStore: MockShellStore;
  let scrollbackStore: MockScrollbackStore;
  let mockPty: ReturnType<typeof createMockPty>;

  beforeEach(() => {
    mockPty = createMockPty();
    shellStore = createMockShellStore();
    scrollbackStore = createMockScrollbackStore();
    ptyPool = new PtyPool({
      ptyFactory: (): typeof mockPty => mockPty,
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

  it('full session lifecycle: open, write, close', async () => {
    const shell = createTestShell('lifecycle-shell');
    shellStore.shells = [shell];

    // 1. Open session
    const result = await manager.openSession('lifecycle-shell');

    expect(result.shell.id).toBe('lifecycle-shell');
    expect(result.cols).toBeGreaterThan(0);
    expect(result.rows).toBeGreaterThan(0);

    // Verify status is updated to active
    expect(shellStore.update).toHaveBeenCalledWith(
      'lifecycle-shell',
      expect.objectContaining({ status: 'active' }),
    );

    // 2. Verify session is available
    const session = manager.getSession('lifecycle-shell');
    expect(session).toBeDefined();
    if (!session) throw new Error('Session should be defined');

    // 3. Write to session
    session.write('echo test\r');
    expect(mockPty.getWriteBuffer()).toContain('echo test\r');

    // 4. Verify output forwarding
    let outputReceived = false;
    session.onData((_data: string) => {
      outputReceived = true;
    });
    mockPty.simulateData('test output');
    expect(outputReceived).toBe(true);

    // 5. Close session
    await manager.closeSession('lifecycle-shell');

    // Verify status is updated to inactive
    expect(shellStore.update).toHaveBeenCalledWith(
      'lifecycle-shell',
      expect.objectContaining({ status: 'inactive' }),
    );

    // 6. Verify session is no longer available
    const closedSession = manager.getSession('lifecycle-shell');
    expect(closedSession).toBeUndefined();
  });

  it('survives simulated server restart', async () => {
    // 1. Open session with first manager instance
    const shell = createTestShell('restart-shell');
    shellStore.shells = [shell];

    await manager.openSession('restart-shell');

    // Simulate some output being written to scrollback
    scrollbackStore.data.set('restart-shell', [
      { type: 'output', data: 'previous session output\r\n' },
    ]);

    // 2. Simulate server restart - shutdown manager and pool
    manager.shutdown();
    ptyPool.shutdown();

    // Update shell to show it's still marked active (as would happen with daemon mode)
    const existingShell = shellStore.shells[0];
    if (existingShell) {
      shellStore.shells[0] = { ...existingShell, status: 'active' };
    }

    // 3. Create new manager instance (simulating server restart)
    mockPty = createMockPty(); // Fresh PTY
    ptyPool = new PtyPool({
      ptyFactory: (): typeof mockPty => mockPty,
      scrollbackStore: scrollbackStore as unknown as ScrollbackStore,
    });
    manager = new ShellSessionManager({
      ptyPool,
      shellStore: shellStore as unknown as ShellStore,
    });

    // 4. Open session again - should recover state
    const result = await manager.openSession('restart-shell');

    expect(result.shell.id).toBe('restart-shell');
    // Scrollback should include previous data
    expect(result.scrollback).toContain('previous session output');
  });

  it('handles concurrent session opens gracefully', async () => {
    const shell = createTestShell('concurrent-shell');
    shellStore.shells = [shell];

    // Open session concurrently from multiple "clients"
    const [result1, result2] = await Promise.all([
      manager.openSession('concurrent-shell'),
      manager.openSession('concurrent-shell'),
    ]);

    // Both should succeed with the same shell
    expect(result1.shell.id).toBe('concurrent-shell');
    expect(result2.shell.id).toBe('concurrent-shell');

    // Only one session should be created
    expect(ptyPool.count()).toBe(1);
  });

  it('emits events for session lifecycle', async () => {
    const shell = createTestShell('event-shell');
    shellStore.shells = [shell];

    const events: { type: string; data: unknown }[] = [];

    manager.on('session:opened', (data) => {
      events.push({ type: 'opened', data });
    });

    manager.on('session:closed', (data) => {
      events.push({ type: 'closed', data });
    });

    // Open session
    await manager.openSession('event-shell');

    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'opened',
        data: expect.objectContaining({ shellId: 'event-shell' }) as unknown,
      }),
    );

    // Close session
    await manager.closeSession('event-shell');

    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'closed',
        data: expect.objectContaining({
          shellId: 'event-shell',
          reason: 'requested',
        }) as unknown,
      }),
    );
  });

  it('reconciles orphaned shells on demand', async () => {
    // Create shell marked as active but with no running session
    const orphanedShell = createTestShell('orphaned-shell', {
      status: 'active',
      pid: 99999, // Non-existent PID
    });
    shellStore.shells = [orphanedShell];

    // Run reconciliation
    await manager.reconcile();

    // Shell should be marked as inactive
    expect(shellStore.update).toHaveBeenCalledWith(
      'orphaned-shell',
      expect.objectContaining({ status: 'inactive', pid: null }),
    );
  });

  it('periodic reconciliation loop works', async () => {
    vi.useFakeTimers();
    const reconcileSpy = vi.spyOn(manager, 'reconcile').mockResolvedValue();

    // Start reconciliation loop with 1 second interval
    manager.startReconciliationLoop(1000);

    // Advance time by 3 seconds
    await vi.advanceTimersByTimeAsync(3000);

    // Should have been called 3 times
    expect(reconcileSpy).toHaveBeenCalledTimes(3);

    // Stop the loop
    manager.stopReconciliationLoop();

    // Advance more time
    await vi.advanceTimersByTimeAsync(3000);

    // Should still be 3 (not called after stop)
    expect(reconcileSpy).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
  });

  it('handles session state query correctly', async () => {
    const shell = createTestShell('state-shell');
    shellStore.shells = [shell];

    // Before opening - should be closed
    const closedState = await manager.getSessionState('state-shell');
    expect(closedState?.status).toBe('closed');

    // Open session
    await manager.openSession('state-shell');

    // After opening - should be open
    const openState = await manager.getSessionState('state-shell');
    expect(openState?.status).toBe('open');

    // Close session
    await manager.closeSession('state-shell');

    // After closing - should be closed again
    const closedAgainState = await manager.getSessionState('state-shell');
    expect(closedAgainState?.status).toBe('closed');
  });

  it('returns null for non-existent shell state query', async () => {
    const state = await manager.getSessionState('non-existent');
    expect(state).toBeNull();
  });
});
