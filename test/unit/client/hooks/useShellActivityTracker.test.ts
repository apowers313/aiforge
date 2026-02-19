/**
 * useShellActivityTracker hook tests
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useShellActivityTracker } from '@client/hooks/useShellActivityTracker.js';
import { createMockWebSocketConstructor } from '@test/mocks/websocket.js';

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

describe('useShellActivityTracker', () => {
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

  it('records activity on shell.activity message', async () => {
    renderHook(() => { useShellActivityTracker(); });

    // Flush health check promise
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Connect WebSocket
    act(() => {
      MockWebSocket.instances[0]?.simulateOpen();
    });

    // Simulate shell.activity broadcast
    act(() => {
      MockWebSocket.instances[0]?.simulateMessage({
        type: 'shell.activity',
        shellId: 'shell-42',
      });
    });

    expect(mockRecordShellActivity).toHaveBeenCalledWith('shell-42');
  });

  it('ignores non-activity messages', async () => {
    renderHook(() => { useShellActivityTracker(); });

    // Flush health check promise
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Connect WebSocket
    act(() => {
      MockWebSocket.instances[0]?.simulateOpen();
    });

    // Simulate various non-activity messages
    act(() => {
      MockWebSocket.instances[0]?.simulateMessage({
        type: 'session.output',
        shellId: 'shell-1',
        data: 'hello',
        isScrollback: false,
      });
    });

    act(() => {
      MockWebSocket.instances[0]?.simulateMessage({
        type: 'session.opened',
        shellId: 'shell-1',
        requestId: 'req-1',
        shell: {},
        scrollback: '',
        cols: 80,
        rows: 24,
      });
    });

    act(() => {
      MockWebSocket.instances[0]?.simulateMessage({
        type: 'session.closed',
        shellId: 'shell-1',
        reason: 'requested',
      });
    });

    expect(mockRecordShellActivity).not.toHaveBeenCalled();
  });

  it('connects with waitForHealth', async () => {
    renderHook(() => { useShellActivityTracker(); });

    // Before health check resolves, no WebSocket should be created
    expect(MockWebSocket.instances.length).toBe(0);

    // Flush health check promise
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // After health check, WebSocket should be created
    expect(MockWebSocket.instances.length).toBe(1);
  });
});
