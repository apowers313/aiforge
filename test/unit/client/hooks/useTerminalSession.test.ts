/**
 * useTerminalSession hook tests
 *
 * Tests the new terminal session hook with explicit state machine
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTerminalSession } from '@client/hooks/useTerminalSession.js';
import { createMockWebSocketConstructor } from '@test/mocks/websocket.js';
import type { Shell, SessionOpenedMessage, SessionErrorMessage, SessionClosedMessage, SessionOutputMessage } from '@shared/types/index.js';

// Mock the health check API to avoid blocking WebSocket connections
vi.mock('@client/services/api.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@client/services/api.js')>();
  return {
    ...actual,
    waitForServerHealth: vi.fn().mockResolvedValue({ status: 'ok', services: { websocket: true, api: true } }),
  };
});

// Mock recordShellActivity from uiStore
const mockRecordShellActivity = vi.fn();
vi.mock('@client/stores/uiStore.js', () => ({
  useUIStore: vi.fn((selector: (state: { recordShellActivity: typeof mockRecordShellActivity }) => unknown) => {
    return selector({ recordShellActivity: mockRecordShellActivity });
  }),
}));

// Helper to create a mock shell
function createMockShell(id: string): Shell {
  return {
    id,
    projectId: 'project-1',
    name: 'Test Shell',
    cwd: '/home/test',
    status: 'active',
    type: 'bash',
    pid: 12345,
    socketPath: '/tmp/shell.sock',
    lastActivityAt: new Date().toISOString(),
    done: false,
    worktreePath: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// Helper to create session.opened message
function createSessionOpenedMessage(shellId: string, requestId: string): SessionOpenedMessage {
  return {
    type: 'session.opened',
    shellId,
    requestId,
    shell: createMockShell(shellId),
    scrollback: 'previous output\n',
    cols: 80,
    rows: 24,
  };
}

// Helper to create session.error message
function createSessionErrorMessage(shellId: string, requestId: string, code: 'SHELL_NOT_FOUND' | 'DAEMON_SPAWN_FAILED' | 'CONNECTION_LOST' | 'INTERNAL_ERROR', retryable: boolean): SessionErrorMessage {
  return {
    type: 'session.error',
    shellId,
    requestId,
    code,
    message: `Error: ${code}`,
    retryable,
  };
}

// Helper to create session.closed message
function createSessionClosedMessage(shellId: string, reason: 'requested' | 'shell_deleted' | 'daemon_exited' | 'error'): SessionClosedMessage {
  return {
    type: 'session.closed',
    shellId,
    reason,
  };
}

// Helper to create session.output message
function createSessionOutputMessage(shellId: string, data: string, isScrollback = false): SessionOutputMessage {
  return {
    type: 'session.output',
    shellId,
    data,
    isScrollback,
  };
}

describe('useTerminalSession', () => {
  let MockWebSocket: ReturnType<typeof createMockWebSocketConstructor>;

  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket = createMockWebSocketConstructor();
    vi.stubGlobal('WebSocket', MockWebSocket);
    mockRecordShellActivity.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  describe('state transitions', () => {
    it('starts in closed state', () => {
      const { result } = renderHook(() =>
        useTerminalSession('shell-1', { autoOpen: false }),
      );

      expect(result.current.state.status).toBe('closed');
    });

    it('transitions closed → opening → open on successful open', async () => {
      const { result } = renderHook(() =>
        useTerminalSession('shell-1', { autoOpen: false }),
      );

      // Initially closed
      expect(result.current.state.status).toBe('closed');

      // Flush health check promise
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      // Connect WebSocket
      act(() => {
        MockWebSocket.instances[0]?.simulateOpen();
      });

      // Trigger open
      act(() => {
        result.current.open();
      });

      // Should be in opening state
      expect(result.current.state.status).toBe('opening');

      // Get the request ID from the sent message
      const sentMessages = MockWebSocket.instances[0]?.sent ?? [];
      const openMessage = sentMessages.find((msg: unknown) => (msg as { type: string }).type === 'session.open');
      expect(openMessage).toBeDefined();
      const requestId = (openMessage as { requestId: string }).requestId;

      // Simulate session.opened response
      act(() => {
        MockWebSocket.instances[0]?.simulateMessage(
          createSessionOpenedMessage('shell-1', requestId),
        );
      });

      // Should be in open state
      expect(result.current.state.status).toBe('open');
      if (result.current.state.status === 'open') {
        expect(result.current.state.shell.id).toBe('shell-1');
        expect(result.current.state.scrollback).toBe('previous output\n');
      }
    });

    it('transitions to error state on session.error', async () => {
      const { result } = renderHook(() =>
        useTerminalSession('shell-1', { autoOpen: false }),
      );

      // Flush health check promise
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      // Connect WebSocket
      act(() => {
        MockWebSocket.instances[0]?.simulateOpen();
      });

      // Trigger open
      act(() => {
        result.current.open();
      });

      // Get the request ID
      const sentMessages = MockWebSocket.instances[0]?.sent ?? [];
      const openMessage = sentMessages.find((msg: unknown) => (msg as { type: string }).type === 'session.open');
      const requestId = (openMessage as { requestId: string }).requestId;

      // Simulate error response
      act(() => {
        MockWebSocket.instances[0]?.simulateMessage(
          createSessionErrorMessage('shell-1', requestId, 'SHELL_NOT_FOUND', false),
        );
      });

      // Should be in error state
      expect(result.current.state.status).toBe('error');
      if (result.current.state.status === 'error') {
        expect(result.current.state.code).toBe('SHELL_NOT_FOUND');
        expect(result.current.state.retryable).toBe(false);
      }
    });

    it('transitions to reconnecting on WebSocket disconnect', async () => {
      const { result } = renderHook(() =>
        useTerminalSession('shell-1', { autoOpen: false }),
      );

      // Flush health check promise
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      // Connect WebSocket and open session
      act(() => {
        MockWebSocket.instances[0]?.simulateOpen();
      });

      act(() => {
        result.current.open();
      });

      // Get the request ID and simulate successful open
      const sentMessages = MockWebSocket.instances[0]?.sent ?? [];
      const openMessage = sentMessages.find((msg: unknown) => (msg as { type: string }).type === 'session.open');
      const requestId = (openMessage as { requestId: string }).requestId;

      act(() => {
        MockWebSocket.instances[0]?.simulateMessage(
          createSessionOpenedMessage('shell-1', requestId),
        );
      });

      expect(result.current.state.status).toBe('open');

      // Simulate WebSocket disconnect (abnormal close triggers reconnect)
      act(() => {
        MockWebSocket.instances[0]?.simulateClose(1006, 'Connection lost');
      });

      // Should transition to reconnecting
      expect(result.current.state.status).toBe('reconnecting');
      if (result.current.state.status === 'reconnecting') {
        expect(result.current.state.attempt).toBe(1);
      }
    });

    it('transitions reconnecting → open on successful reconnect', async () => {
      const { result } = renderHook(() =>
        useTerminalSession('shell-1', { autoOpen: false, maxReconnectAttempts: 5 }),
      );

      // Flush health check promise
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      // Connect and open session
      act(() => {
        MockWebSocket.instances[0]?.simulateOpen();
      });

      act(() => {
        result.current.open();
      });

      const sentMessages1 = MockWebSocket.instances[0]?.sent ?? [];
      const openMessage1 = sentMessages1.find((msg: unknown) => (msg as { type: string }).type === 'session.open');
      const requestId1 = (openMessage1 as { requestId: string }).requestId;

      act(() => {
        MockWebSocket.instances[0]?.simulateMessage(
          createSessionOpenedMessage('shell-1', requestId1),
        );
      });

      // Simulate disconnect
      act(() => {
        MockWebSocket.instances[0]?.simulateClose(1006, 'Connection lost');
      });

      expect(result.current.state.status).toBe('reconnecting');

      // Advance timer to trigger reconnect
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });

      // New WebSocket instance connects
      act(() => {
        MockWebSocket.instances[1]?.simulateOpen();
      });

      // Get new request ID and simulate successful open
      const sentMessages2 = MockWebSocket.instances[1]?.sent ?? [];
      const openMessage2 = sentMessages2.find((msg: unknown) => (msg as { type: string }).type === 'session.open');
      const requestId2 = (openMessage2 as { requestId: string }).requestId;

      act(() => {
        MockWebSocket.instances[1]?.simulateMessage(
          createSessionOpenedMessage('shell-1', requestId2),
        );
      });

      // Should be back to open state
      expect(result.current.state.status).toBe('open');
    });

    it('transitions reconnecting → error after max attempts', async () => {
      const { result } = renderHook(() =>
        useTerminalSession('shell-1', { autoOpen: false, maxReconnectAttempts: 2 }),
      );

      // Flush health check promise
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      // Connect and open session
      act(() => {
        MockWebSocket.instances[0]?.simulateOpen();
      });

      act(() => {
        result.current.open();
      });

      const sentMessages = MockWebSocket.instances[0]?.sent ?? [];
      const openMessage = sentMessages.find((msg: unknown) => (msg as { type: string }).type === 'session.open');
      const requestId = (openMessage as { requestId: string }).requestId;

      act(() => {
        MockWebSocket.instances[0]?.simulateMessage(
          createSessionOpenedMessage('shell-1', requestId),
        );
      });

      // Simulate disconnect
      act(() => {
        MockWebSocket.instances[0]?.simulateClose(1006, 'Connection lost');
      });

      expect(result.current.state.status).toBe('reconnecting');

      // Simulate max retries reached - advance timers multiple times
      for (let i = 0; i < 3; i++) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(5000);
        });

        // Simulate connection failure (close without open)
        if (MockWebSocket.instances[i + 1]) {
          act(() => {
            MockWebSocket.instances[i + 1]?.simulateClose(1006, 'Connection failed');
          });
        }
      }

      // Should transition to error state after max attempts
      expect(result.current.state.status).toBe('error');
      if (result.current.state.status === 'error') {
        expect(result.current.state.code).toBe('CONNECTION_LOST');
        expect(result.current.state.retryable).toBe(true);
      }
    });
  });

  describe('actions', () => {
    it('open() sends session.open message with requestId', async () => {
      const { result } = renderHook(() =>
        useTerminalSession('shell-1', { autoOpen: false }),
      );

      // Flush health check promise
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      // Connect WebSocket
      act(() => {
        MockWebSocket.instances[0]?.simulateOpen();
      });

      // Trigger open
      act(() => {
        result.current.open();
      });

      const sentMessages = MockWebSocket.instances[0]?.sent ?? [];
      const openMessage = sentMessages.find((msg: unknown) => (msg as { type: string }).type === 'session.open');

      expect(openMessage).toBeDefined();
      expect((openMessage as { type: string; shellId: string; requestId: string }).type).toBe('session.open');
      expect((openMessage as { shellId: string }).shellId).toBe('shell-1');
      expect((openMessage as { requestId: string }).requestId).toBeDefined();
    });

    it('write() sends session.input message', async () => {
      const { result } = renderHook(() =>
        useTerminalSession('shell-1', { autoOpen: false }),
      );

      // Flush health check promise
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      // Connect and open session
      act(() => {
        MockWebSocket.instances[0]?.simulateOpen();
      });

      act(() => {
        result.current.open();
      });

      const sentMessages1 = MockWebSocket.instances[0]?.sent ?? [];
      const openMessage = sentMessages1.find((msg: unknown) => (msg as { type: string }).type === 'session.open');
      const requestId = (openMessage as { requestId: string }).requestId;

      act(() => {
        MockWebSocket.instances[0]?.simulateMessage(
          createSessionOpenedMessage('shell-1', requestId),
        );
      });

      // Send input
      act(() => {
        result.current.write('ls -la');
      });

      const sentMessages2 = MockWebSocket.instances[0]?.sent ?? [];
      const inputMessage = sentMessages2.find((msg: unknown) => (msg as { type: string }).type === 'session.input');

      expect(inputMessage).toBeDefined();
      expect((inputMessage as { type: string }).type).toBe('session.input');
      expect((inputMessage as { shellId: string }).shellId).toBe('shell-1');
      expect((inputMessage as { data: string }).data).toBe('ls -la');
    });

    it('resize() sends session.resize message', async () => {
      const { result } = renderHook(() =>
        useTerminalSession('shell-1', { autoOpen: false }),
      );

      // Flush health check promise
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      // Connect and open session
      act(() => {
        MockWebSocket.instances[0]?.simulateOpen();
      });

      act(() => {
        result.current.open();
      });

      const sentMessages1 = MockWebSocket.instances[0]?.sent ?? [];
      const openMessage = sentMessages1.find((msg: unknown) => (msg as { type: string }).type === 'session.open');
      const requestId = (openMessage as { requestId: string }).requestId;

      act(() => {
        MockWebSocket.instances[0]?.simulateMessage(
          createSessionOpenedMessage('shell-1', requestId),
        );
      });

      // Send resize
      act(() => {
        result.current.resize(120, 40);
      });

      const sentMessages2 = MockWebSocket.instances[0]?.sent ?? [];
      const resizeMessage = sentMessages2.find((msg: unknown) => (msg as { type: string }).type === 'session.resize');

      expect(resizeMessage).toBeDefined();
      expect((resizeMessage as { type: string }).type).toBe('session.resize');
      expect((resizeMessage as { shellId: string }).shellId).toBe('shell-1');
      expect((resizeMessage as { cols: number }).cols).toBe(120);
      expect((resizeMessage as { rows: number }).rows).toBe(40);
    });

    it('retry() re-opens when in retryable error state', async () => {
      const { result } = renderHook(() =>
        useTerminalSession('shell-1', { autoOpen: false }),
      );

      // Flush health check promise
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      // Connect WebSocket
      act(() => {
        MockWebSocket.instances[0]?.simulateOpen();
      });

      // Trigger open
      act(() => {
        result.current.open();
      });

      const sentMessages1 = MockWebSocket.instances[0]?.sent ?? [];
      const openMessage1 = sentMessages1.find((msg: unknown) => (msg as { type: string }).type === 'session.open');
      const requestId1 = (openMessage1 as { requestId: string }).requestId;

      // Simulate retryable error
      act(() => {
        MockWebSocket.instances[0]?.simulateMessage(
          createSessionErrorMessage('shell-1', requestId1, 'DAEMON_SPAWN_FAILED', true),
        );
      });

      expect(result.current.state.status).toBe('error');
      if (result.current.state.status === 'error') {
        expect(result.current.state.retryable).toBe(true);
      }

      // Clear sent messages
      if (MockWebSocket.instances[0]) {
        (MockWebSocket.instances[0] as unknown as { _sent: unknown[] })._sent = [];
      }

      // Retry
      act(() => {
        result.current.retry();
      });

      // Should send new session.open message
      const sentMessages2 = MockWebSocket.instances[0]?.sent ?? [];
      const openMessage2 = sentMessages2.find((msg: unknown) => (msg as { type: string }).type === 'session.open');

      expect(openMessage2).toBeDefined();
      expect(result.current.state.status).toBe('opening');
    });

    it('close() sends session.close and transitions to closed', async () => {
      const { result } = renderHook(() =>
        useTerminalSession('shell-1', { autoOpen: false }),
      );

      // Flush health check promise
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      // Connect and open session
      act(() => {
        MockWebSocket.instances[0]?.simulateOpen();
      });

      act(() => {
        result.current.open();
      });

      const sentMessages1 = MockWebSocket.instances[0]?.sent ?? [];
      const openMessage = sentMessages1.find((msg: unknown) => (msg as { type: string }).type === 'session.open');
      const requestId = (openMessage as { requestId: string }).requestId;

      act(() => {
        MockWebSocket.instances[0]?.simulateMessage(
          createSessionOpenedMessage('shell-1', requestId),
        );
      });

      expect(result.current.state.status).toBe('open');

      // Close session
      act(() => {
        result.current.close();
      });

      const sentMessages2 = MockWebSocket.instances[0]?.sent ?? [];
      const closeMessage = sentMessages2.find((msg: unknown) => (msg as { type: string }).type === 'session.close');

      expect(closeMessage).toBeDefined();
      expect((closeMessage as { type: string }).type).toBe('session.close');
      expect((closeMessage as { shellId: string }).shellId).toBe('shell-1');

      // Simulate server confirmation
      act(() => {
        MockWebSocket.instances[0]?.simulateMessage(
          createSessionClosedMessage('shell-1', 'requested'),
        );
      });

      expect(result.current.state.status).toBe('closed');
    });
  });

  describe('output handling', () => {
    it('calls onOutput callback when session.output received', async () => {
      const onOutput = vi.fn();
      const { result } = renderHook(() =>
        useTerminalSession('shell-1', { autoOpen: false, onOutput }),
      );

      // Flush health check promise
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      // Connect and open session
      act(() => {
        MockWebSocket.instances[0]?.simulateOpen();
      });

      act(() => {
        result.current.open();
      });

      const sentMessages = MockWebSocket.instances[0]?.sent ?? [];
      const openMessage = sentMessages.find((msg: unknown) => (msg as { type: string }).type === 'session.open');
      const requestId = (openMessage as { requestId: string }).requestId;

      act(() => {
        MockWebSocket.instances[0]?.simulateMessage(
          createSessionOpenedMessage('shell-1', requestId),
        );
      });

      // Clear onOutput calls from initial scrollback
      onOutput.mockClear();

      // Simulate output
      act(() => {
        MockWebSocket.instances[0]?.simulateMessage(
          createSessionOutputMessage('shell-1', 'Hello, World!', false),
        );
      });

      expect(onOutput).toHaveBeenCalledWith('Hello, World!');
    });

    it('provides scrollback in state, not via onOutput', async () => {
      const onOutput = vi.fn();
      const { result } = renderHook(() =>
        useTerminalSession('shell-1', { autoOpen: false, onOutput }),
      );

      // Flush health check promise
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      // Connect and open session
      act(() => {
        MockWebSocket.instances[0]?.simulateOpen();
      });

      act(() => {
        result.current.open();
      });

      const sentMessages = MockWebSocket.instances[0]?.sent ?? [];
      const openMessage = sentMessages.find((msg: unknown) => (msg as { type: string }).type === 'session.open');
      const requestId = (openMessage as { requestId: string }).requestId;

      act(() => {
        MockWebSocket.instances[0]?.simulateMessage(
          createSessionOpenedMessage('shell-1', requestId),
        );
      });

      // Scrollback should be in state
      expect(result.current.state.status).toBe('open');
      if (result.current.state.status === 'open') {
        expect(result.current.state.scrollback).toBe('previous output\n');
      }

      // onOutput should not have been called for scrollback from session.opened
      expect(onOutput).not.toHaveBeenCalled();
    });
  });

  describe('stability', () => {
    it('does not send duplicate session.open on re-render', async () => {
      const { result, rerender } = renderHook(
        ({ shellId }) => useTerminalSession(shellId, { autoOpen: false }),
        { initialProps: { shellId: 'shell-1' } },
      );

      // Flush health check promise
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      // Connect WebSocket
      act(() => {
        MockWebSocket.instances[0]?.simulateOpen();
      });

      // Trigger open
      act(() => {
        result.current.open();
      });

      // Force re-renders
      act(() => {
        rerender({ shellId: 'shell-1' });
      });
      act(() => {
        rerender({ shellId: 'shell-1' });
      });

      // Count session.open messages
      const sentMessages = MockWebSocket.instances[0]?.sent ?? [];
      const openMessages = sentMessages.filter((msg: unknown) => (msg as { type: string }).type === 'session.open');

      expect(openMessages.length).toBe(1);
    });

    it('handles shellId prop changes correctly', async () => {
      const { result, rerender } = renderHook(
        ({ shellId }) => useTerminalSession(shellId, { autoOpen: false }),
        { initialProps: { shellId: 'shell-1' } },
      );

      // Flush health check promise
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      // Connect WebSocket
      act(() => {
        MockWebSocket.instances[0]?.simulateOpen();
      });

      // Open shell-1
      act(() => {
        result.current.open();
      });

      const sentMessages1 = MockWebSocket.instances[0]?.sent ?? [];
      const openMessage1 = sentMessages1.find((msg: unknown) => (msg as { type: string }).type === 'session.open');
      const requestId1 = (openMessage1 as { requestId: string }).requestId;

      act(() => {
        MockWebSocket.instances[0]?.simulateMessage(
          createSessionOpenedMessage('shell-1', requestId1),
        );
      });

      expect(result.current.state.status).toBe('open');

      // Change to shell-2
      act(() => {
        rerender({ shellId: 'shell-2' });
      });

      // Should reset to closed state for new shell
      expect(result.current.state.status).toBe('closed');

      // Open shell-2
      act(() => {
        result.current.open();
      });

      // Should send close for shell-1 and open for shell-2
      const sentMessages2 = MockWebSocket.instances[0]?.sent ?? [];
      const closeMessage = sentMessages2.find((msg: unknown) =>
        (msg as { type: string }).type === 'session.close' &&
        (msg as { shellId: string }).shellId === 'shell-1',
      );
      const openMessage2 = sentMessages2.find((msg: unknown) =>
        (msg as { type: string }).type === 'session.open' &&
        (msg as { shellId: string }).shellId === 'shell-2',
      );

      expect(closeMessage).toBeDefined();
      expect(openMessage2).toBeDefined();
    });

    it('cleans up on unmount', async () => {
      const { result, unmount } = renderHook(() =>
        useTerminalSession('shell-1', { autoOpen: false }),
      );

      // Flush health check promise
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      // Connect and open session
      act(() => {
        MockWebSocket.instances[0]?.simulateOpen();
      });

      act(() => {
        result.current.open();
      });

      const sentMessages1 = MockWebSocket.instances[0]?.sent ?? [];
      const openMessage = sentMessages1.find((msg: unknown) => (msg as { type: string }).type === 'session.open');
      const requestId = (openMessage as { requestId: string }).requestId;

      act(() => {
        MockWebSocket.instances[0]?.simulateMessage(
          createSessionOpenedMessage('shell-1', requestId),
        );
      });

      expect(result.current.state.status).toBe('open');

      // Unmount
      act(() => {
        unmount();
      });

      // Check that session.close was sent during cleanup, or that WebSocket is closed
      // (when WebSocket closes first during cleanup, the message may be queued instead of sent)
      const ws = MockWebSocket.instances[0];
      const sentMessages2 = ws?.sent ?? [];
      const closeSent = sentMessages2.some(
        (msg: unknown) => (msg as { type: string }).type === 'session.close' &&
        (msg as { shellId: string }).shellId === 'shell-1',
      );
      const wsIsClosed = (ws?.readyState ?? 0) !== 1; // OPEN = 1

      // Either close was sent, or the WebSocket was already closed
      const cleanupHandled = closeSent || wsIsClosed;
      expect(cleanupHandled).toBe(true);
    });
  });

  describe('autoOpen behavior', () => {
    it('auto-opens session when autoOpen is true (default)', async () => {
      const { result } = renderHook(() =>
        useTerminalSession('shell-1'),
      );

      // Flush health check promise
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      // Connect WebSocket
      act(() => {
        MockWebSocket.instances[0]?.simulateOpen();
      });

      // Should have auto-opened
      expect(result.current.state.status).toBe('opening');

      const sentMessages = MockWebSocket.instances[0]?.sent ?? [];
      const openMessage = sentMessages.find((msg: unknown) => (msg as { type: string }).type === 'session.open');
      expect(openMessage).toBeDefined();
    });
  });

  describe('shell activity tracking', () => {
    beforeEach(() => {
      mockRecordShellActivity.mockClear();
    });

    it('records activity when user writes input', async () => {
      const { result } = renderHook(() =>
        useTerminalSession('shell-1', { autoOpen: false }),
      );

      // Flush health check promise
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      // Connect and open session
      act(() => {
        MockWebSocket.instances[0]?.simulateOpen();
      });

      act(() => {
        result.current.open();
      });

      const sentMessages = MockWebSocket.instances[0]?.sent ?? [];
      const openMessage = sentMessages.find((msg: unknown) => (msg as { type: string }).type === 'session.open');
      const requestId = (openMessage as { requestId: string }).requestId;

      act(() => {
        MockWebSocket.instances[0]?.simulateMessage(
          createSessionOpenedMessage('shell-1', requestId),
        );
      });

      // Clear any activity from setup
      mockRecordShellActivity.mockClear();

      // Write input
      act(() => {
        result.current.write('ls -la');
      });

      // Should record activity
      expect(mockRecordShellActivity).toHaveBeenCalledWith('shell-1');
    });
  });
});
