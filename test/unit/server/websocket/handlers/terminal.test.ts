/**
 * TerminalHandler unit tests - Session Protocol
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TerminalHandler } from '@server/websocket/handlers/terminal.js';
import { ShellSessionManager } from '@server/services/shell/ShellSessionManager.js';
import { PtyPool } from '@server/services/pty/PtyPool.js';
import { createMockPty, createMockPtyFactory } from '@test/mocks/pty.js';
import { createMockWebSocket, type MockWebSocket } from '@test/mocks/websocket.js';
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

describe('Session Message Protocol', () => {
  let handler: TerminalHandler;
  let sessionManager: ShellSessionManager;
  let ptyPool: PtyPool;
  let shellStore: MockShellStore;
  let scrollbackStore: MockScrollbackStore;
  let mockWs: MockWebSocket;

  beforeEach(() => {
    shellStore = createMockShellStore();
    scrollbackStore = createMockScrollbackStore();
    ptyPool = new PtyPool({
      ptyFactory: createMockPtyFactory(),
      scrollbackStore: scrollbackStore as unknown as ScrollbackStore,
    });
    sessionManager = new ShellSessionManager({
      ptyPool,
      shellStore: shellStore as unknown as ShellStore,
    });
    handler = new TerminalHandler(sessionManager);
    mockWs = createMockWebSocket();
  });

  afterEach(() => {
    sessionManager.shutdown();
    ptyPool.shutdown();
  });

  describe('session.open', () => {
    it('returns session.opened with shell, scrollback, and dimensions', async () => {
      const shell = createTestShell('shell-1');
      shellStore.shells = [shell];

      // Pre-populate scrollback
      scrollbackStore.data.set('shell-1', [
        { type: 'output', data: 'previous output' },
      ]);

      handler.handleMessage(mockWs, {
        type: 'session.open',
        shellId: 'shell-1',
        requestId: 'req-1',
      });

      // Wait for async processing
      await vi.waitFor(() => {
        expect(mockWs.sent.length).toBeGreaterThan(0);
      });

      const response = mockWs.sent.find((m) => (m as { type: string }).type === 'session.opened');
      expect(response).toBeDefined();
      expect(response).toMatchObject({
        type: 'session.opened',
        shellId: 'shell-1',
        requestId: 'req-1',
        shell: expect.objectContaining({ id: 'shell-1' }) as unknown,
        cols: expect.any(Number) as unknown,
        rows: expect.any(Number) as unknown,
      });
    });

    it('returns session.error for non-existent shell', async () => {
      shellStore.shells = [];

      handler.handleMessage(mockWs, {
        type: 'session.open',
        shellId: 'non-existent',
        requestId: 'req-2',
      });

      await vi.waitFor(() => {
        expect(mockWs.sent.length).toBeGreaterThan(0);
      });

      const response = mockWs.sent.find((m) => (m as { type: string }).type === 'session.error');
      expect(response).toBeDefined();
      expect(response).toMatchObject({
        type: 'session.error',
        shellId: 'non-existent',
        requestId: 'req-2',
        code: 'SHELL_NOT_FOUND',
        retryable: false,
      });
    });

    it('correlates response with requestId', async () => {
      const shell = createTestShell('shell-2');
      shellStore.shells = [shell];

      const requestId = 'unique-request-id-123';

      handler.handleMessage(mockWs, {
        type: 'session.open',
        shellId: 'shell-2',
        requestId,
      });

      await vi.waitFor(() => {
        expect(mockWs.sent.length).toBeGreaterThan(0);
      });

      const response = mockWs.sent.find((m) => (m as { type: string }).type === 'session.opened');
      expect(response).toBeDefined();
      expect((response as { requestId: string }).requestId).toBe(requestId);
    });

    it('subscribes client to shell output after successful open', async () => {
      const mockPty = createMockPty();
      ptyPool = new PtyPool({
        ptyFactory: (): typeof mockPty => mockPty,
        scrollbackStore: scrollbackStore as unknown as ScrollbackStore,
      });
      sessionManager = new ShellSessionManager({
        ptyPool,
        shellStore: shellStore as unknown as ShellStore,
      });
      handler = new TerminalHandler(sessionManager);

      const shell = createTestShell('shell-3');
      shellStore.shells = [shell];

      handler.handleMessage(mockWs, {
        type: 'session.open',
        shellId: 'shell-3',
        requestId: 'req-3',
      });

      await vi.waitFor(() => {
        const opened = mockWs.sent.find((m) => (m as { type: string }).type === 'session.opened');
        expect(opened).toBeDefined();
      });

      mockWs.clearSent();

      // Simulate PTY output
      mockPty.simulateData('new output');

      await vi.waitFor(() => {
        const output = mockWs.sent.find((m) => (m as { type: string }).type === 'session.output');
        expect(output).toBeDefined();
      });

      expect(mockWs.sent).toContainEqual(
        expect.objectContaining({
          type: 'session.output',
          shellId: 'shell-3',
          data: 'new output',
        }),
      );
    });
  });

  describe('session.close', () => {
    it('returns session.closed with reason requested', async () => {
      const shell = createTestShell('shell-4');
      shellStore.shells = [shell];

      // Open the session first
      handler.handleMessage(mockWs, {
        type: 'session.open',
        shellId: 'shell-4',
        requestId: 'req-4',
      });

      await vi.waitFor(() => {
        const opened = mockWs.sent.find((m) => (m as { type: string }).type === 'session.opened');
        expect(opened).toBeDefined();
      });

      mockWs.clearSent();

      // Now close it
      handler.handleMessage(mockWs, {
        type: 'session.close',
        shellId: 'shell-4',
        requestId: 'close-req-1',
      });

      await vi.waitFor(() => {
        expect(mockWs.sent.length).toBeGreaterThan(0);
      });

      expect(mockWs.sent).toContainEqual(
        expect.objectContaining({
          type: 'session.closed',
          shellId: 'shell-4',
          requestId: 'close-req-1',
          reason: 'requested',
        }),
      );
    });

    it('unsubscribes client from shell output', async () => {
      const mockPty = createMockPty();
      ptyPool = new PtyPool({
        ptyFactory: (): typeof mockPty => mockPty,
        scrollbackStore: scrollbackStore as unknown as ScrollbackStore,
      });
      sessionManager = new ShellSessionManager({
        ptyPool,
        shellStore: shellStore as unknown as ShellStore,
      });
      handler = new TerminalHandler(sessionManager);

      const shell = createTestShell('shell-5');
      shellStore.shells = [shell];

      // Open session
      handler.handleMessage(mockWs, {
        type: 'session.open',
        shellId: 'shell-5',
        requestId: 'req-5',
      });

      await vi.waitFor(() => {
        const opened = mockWs.sent.find((m) => (m as { type: string }).type === 'session.opened');
        expect(opened).toBeDefined();
      });

      // Close session
      handler.handleMessage(mockWs, {
        type: 'session.close',
        shellId: 'shell-5',
      });

      await vi.waitFor(() => {
        const closed = mockWs.sent.find((m) => (m as { type: string }).type === 'session.closed');
        expect(closed).toBeDefined();
      });

      mockWs.clearSent();

      // Simulate PTY output - should NOT receive it
      mockPty.simulateData('after close output');

      // Wait a bit
      await new Promise((r) => setTimeout(r, 50));

      // Should not have received output
      expect(mockWs.sent.filter((m) => (m as { type: string }).type === 'session.output')).toHaveLength(0);
    });
  });

  describe('session.input', () => {
    it('forwards input to PTY when session is open', async () => {
      const mockPty = createMockPty();
      ptyPool = new PtyPool({
        ptyFactory: (): typeof mockPty => mockPty,
        scrollbackStore: scrollbackStore as unknown as ScrollbackStore,
      });
      sessionManager = new ShellSessionManager({
        ptyPool,
        shellStore: shellStore as unknown as ShellStore,
      });
      handler = new TerminalHandler(sessionManager);

      const shell = createTestShell('shell-6');
      shellStore.shells = [shell];

      // Open session
      handler.handleMessage(mockWs, {
        type: 'session.open',
        shellId: 'shell-6',
        requestId: 'req-6',
      });

      await vi.waitFor(() => {
        const opened = mockWs.sent.find((m) => (m as { type: string }).type === 'session.opened');
        expect(opened).toBeDefined();
      });

      // Send input
      handler.handleMessage(mockWs, {
        type: 'session.input',
        shellId: 'shell-6',
        data: 'ls -la\r',
      });

      expect(mockPty.getWriteBuffer()).toContain('ls -la\r');
    });

    it('returns session.error when session not open', () => {
      // No session opened
      handler.handleMessage(mockWs, {
        type: 'session.input',
        shellId: 'non-existent',
        data: 'test',
      });

      expect(mockWs.sent).toContainEqual(
        expect.objectContaining({
          type: 'session.error',
          shellId: 'non-existent',
          code: 'SHELL_NOT_FOUND',
        }),
      );
    });
  });

  describe('session.resize', () => {
    it('resizes PTY when session is open', async () => {
      const mockPty = createMockPty();
      ptyPool = new PtyPool({
        ptyFactory: (): typeof mockPty => mockPty,
        scrollbackStore: scrollbackStore as unknown as ScrollbackStore,
      });
      sessionManager = new ShellSessionManager({
        ptyPool,
        shellStore: shellStore as unknown as ShellStore,
      });
      handler = new TerminalHandler(sessionManager);

      const shell = createTestShell('shell-7');
      shellStore.shells = [shell];

      // Open session
      handler.handleMessage(mockWs, {
        type: 'session.open',
        shellId: 'shell-7',
        requestId: 'req-7',
      });

      await vi.waitFor(() => {
        const opened = mockWs.sent.find((m) => (m as { type: string }).type === 'session.opened');
        expect(opened).toBeDefined();
      });

      // Resize
      handler.handleMessage(mockWs, {
        type: 'session.resize',
        shellId: 'shell-7',
        cols: 120,
        rows: 40,
      });

      expect(mockPty.resize).toHaveBeenCalledWith(120, 40);
    });
  });

  describe('session.output', () => {
    it('broadcasts to all clients with open session for shell', async () => {
      const mockPty = createMockPty();
      ptyPool = new PtyPool({
        ptyFactory: (): typeof mockPty => mockPty,
        scrollbackStore: scrollbackStore as unknown as ScrollbackStore,
      });
      sessionManager = new ShellSessionManager({
        ptyPool,
        shellStore: shellStore as unknown as ShellStore,
      });
      handler = new TerminalHandler(sessionManager);

      const shell = createTestShell('shell-8');
      shellStore.shells = [shell];

      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();

      // Both clients open the session
      handler.handleMessage(ws1, {
        type: 'session.open',
        shellId: 'shell-8',
        requestId: 'req-8a',
      });

      await vi.waitFor(() => {
        const opened = ws1.sent.find((m) => (m as { type: string }).type === 'session.opened');
        expect(opened).toBeDefined();
      });

      handler.handleMessage(ws2, {
        type: 'session.open',
        shellId: 'shell-8',
        requestId: 'req-8b',
      });

      await vi.waitFor(() => {
        const opened = ws2.sent.find((m) => (m as { type: string }).type === 'session.opened');
        expect(opened).toBeDefined();
      });

      ws1.clearSent();
      ws2.clearSent();

      // Simulate PTY output
      mockPty.simulateData('broadcast message');

      await vi.waitFor(() => {
        expect(ws1.sent.some((m) => (m as { type: string }).type === 'session.output')).toBe(true);
      });

      expect(ws1.sent).toContainEqual(
        expect.objectContaining({
          type: 'session.output',
          shellId: 'shell-8',
          data: 'broadcast message',
        }),
      );

      expect(ws2.sent).toContainEqual(
        expect.objectContaining({
          type: 'session.output',
          shellId: 'shell-8',
          data: 'broadcast message',
        }),
      );
    });
  });

  describe('client disconnect', () => {
    it('cleans up client subscriptions on disconnect', async () => {
      const mockPty = createMockPty();
      ptyPool = new PtyPool({
        ptyFactory: (): typeof mockPty => mockPty,
        scrollbackStore: scrollbackStore as unknown as ScrollbackStore,
      });
      sessionManager = new ShellSessionManager({
        ptyPool,
        shellStore: shellStore as unknown as ShellStore,
      });
      handler = new TerminalHandler(sessionManager);

      const shell = createTestShell('shell-9');
      shellStore.shells = [shell];

      // Open session
      handler.handleMessage(mockWs, {
        type: 'session.open',
        shellId: 'shell-9',
        requestId: 'req-9',
      });

      await vi.waitFor(() => {
        const opened = mockWs.sent.find((m) => (m as { type: string }).type === 'session.opened');
        expect(opened).toBeDefined();
      });

      // Disconnect
      handler.handleDisconnect(mockWs);
      mockWs.clearSent();

      // Simulate output - should not receive
      mockPty.simulateData('after disconnect');

      await new Promise((r) => setTimeout(r, 50));

      expect(mockWs.sent.filter((m) => (m as { type: string }).type === 'session.output')).toHaveLength(0);
    });
  });

  describe('backward compatibility', () => {
    it('still handles legacy input message', async () => {
      const mockPty = createMockPty();
      ptyPool = new PtyPool({
        ptyFactory: (): typeof mockPty => mockPty,
        scrollbackStore: scrollbackStore as unknown as ScrollbackStore,
      });
      sessionManager = new ShellSessionManager({
        ptyPool,
        shellStore: shellStore as unknown as ShellStore,
      });
      handler = new TerminalHandler(sessionManager);

      const shell = createTestShell('shell-legacy');
      shellStore.shells = [shell];

      // Open session first
      handler.handleMessage(mockWs, {
        type: 'session.open',
        shellId: 'shell-legacy',
        requestId: 'req-legacy',
      });

      await vi.waitFor(() => {
        const opened = mockWs.sent.find((m) => (m as { type: string }).type === 'session.opened');
        expect(opened).toBeDefined();
      });

      // Send legacy input message
      handler.handleMessage(mockWs, {
        type: 'input',
        shellId: 'shell-legacy',
        data: 'legacy command\r',
      });

      expect(mockPty.getWriteBuffer()).toContain('legacy command\r');
    });

    it('still handles legacy resize message', async () => {
      const mockPty = createMockPty();
      ptyPool = new PtyPool({
        ptyFactory: (): typeof mockPty => mockPty,
        scrollbackStore: scrollbackStore as unknown as ScrollbackStore,
      });
      sessionManager = new ShellSessionManager({
        ptyPool,
        shellStore: shellStore as unknown as ShellStore,
      });
      handler = new TerminalHandler(sessionManager);

      const shell = createTestShell('shell-legacy-2');
      shellStore.shells = [shell];

      // Open session first
      handler.handleMessage(mockWs, {
        type: 'session.open',
        shellId: 'shell-legacy-2',
        requestId: 'req-legacy-2',
      });

      await vi.waitFor(() => {
        const opened = mockWs.sent.find((m) => (m as { type: string }).type === 'session.opened');
        expect(opened).toBeDefined();
      });

      // Send legacy resize message
      handler.handleMessage(mockWs, {
        type: 'resize',
        shellId: 'shell-legacy-2',
        cols: 100,
        rows: 30,
      });

      expect(mockPty.resize).toHaveBeenCalledWith(100, 30);
    });
  });

  describe('ignores unknown message types', () => {
    it('does not crash on unknown message types', () => {
      handler.handleMessage(mockWs, {
        type: 'unknown_type' as string,
        shellId: 'shell-1',
      } as unknown as Parameters<typeof handler.handleMessage>[1]);

      expect(mockWs.sent).toEqual([]);
    });
  });
});
