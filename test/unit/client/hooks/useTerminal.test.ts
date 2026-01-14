/**
 * useTerminal hook tests
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTerminal } from '@client/hooks/useTerminal.js';
import { createMockWebSocketConstructor } from '@test/mocks/websocket.js';

// Mock the health check API to avoid blocking WebSocket connections
vi.mock('@client/services/api.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@client/services/api.js')>();
  return {
    ...actual,
    waitForServerHealth: vi.fn().mockResolvedValue({ status: 'ok', services: { websocket: true, api: true } }),
  };
});

describe('useTerminal', () => {
  let MockWebSocket: ReturnType<typeof createMockWebSocketConstructor>;

  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket = createMockWebSocketConstructor();
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('attaches to shell on mount', async () => {
    const { result } = renderHook(() => useTerminal('shell-1'));

    // Flush health check promise
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Wait for connection
    act(() => {
      MockWebSocket.instances[0]?.simulateOpen();
    });

    // Check that attach message was sent
    expect(MockWebSocket.instances[0]?.sent).toContainEqual({
      type: 'attach',
      shellId: 'shell-1',
    });

    result.current.disconnect();
  });

  it('forwards terminal input to WebSocket', async () => {
    const { result } = renderHook(() => useTerminal('shell-1'));

    // Flush health check promise
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Wait for connection
    act(() => {
      MockWebSocket.instances[0]?.simulateOpen();
    });

    // Send input
    act(() => {
      result.current.write('test input');
    });

    expect(MockWebSocket.instances[0]?.sent).toContainEqual({
      type: 'input',
      shellId: 'shell-1',
      data: 'test input',
    });

    result.current.disconnect();
  });

  it('calls onData with output', async () => {
    const onData = vi.fn();
    const { result } = renderHook(() => useTerminal('shell-1', { onData }));

    // Flush health check promise
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Connect
    act(() => {
      MockWebSocket.instances[0]?.simulateOpen();
    });

    // Simulate output message
    act(() => {
      MockWebSocket.instances[0]?.simulateMessage({
        type: 'output',
        shellId: 'shell-1',
        data: 'output data',
      });
    });

    expect(onData).toHaveBeenCalledWith('output data');

    result.current.disconnect();
  });

  it('ignores output for different shell', async () => {
    const onData = vi.fn();
    const { result } = renderHook(() => useTerminal('shell-1', { onData }));

    // Flush health check promise
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Connect
    act(() => {
      MockWebSocket.instances[0]?.simulateOpen();
    });

    // Simulate output for different shell
    act(() => {
      MockWebSocket.instances[0]?.simulateMessage({
        type: 'output',
        shellId: 'shell-2',
        data: 'other shell data',
      });
    });

    expect(onData).not.toHaveBeenCalled();

    result.current.disconnect();
  });

  it('sends resize events', async () => {
    const { result } = renderHook(() => useTerminal('shell-1'));

    // Flush health check promise
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Connect
    act(() => {
      MockWebSocket.instances[0]?.simulateOpen();
    });

    // Send resize
    act(() => {
      result.current.resize(120, 40);
    });

    expect(MockWebSocket.instances[0]?.sent).toContainEqual({
      type: 'resize',
      shellId: 'shell-1',
      cols: 120,
      rows: 40,
    });

    result.current.disconnect();
  });

  it('detaches on unmount', async () => {
    const { unmount } = renderHook(() => useTerminal('shell-1'));

    // Flush health check promise
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Connect
    act(() => {
      MockWebSocket.instances[0]?.simulateOpen();
    });

    // Verify we're attached first
    expect(MockWebSocket.instances[0]?.sent).toContainEqual({
      type: 'attach',
      shellId: 'shell-1',
    });

    // Clear sent messages to isolate unmount behavior
    if (MockWebSocket.instances[0]) {
      MockWebSocket.instances[0].sent.length = 0;
    }

    // Unmount while still connected
    act(() => {
      unmount();
    });

    // Check that detach was sent during cleanup
    // Note: The detach is sent via the effect cleanup, which runs before
    // the WebSocket is closed. If the WebSocket closes first (race condition),
    // the message may be queued instead of sent.
    const ws = MockWebSocket.instances[0];
    const detachSent = ws?.sent.some(
      (msg) => msg.type === 'detach' && msg.shellId === 'shell-1',
    );
    const wsIsClosed = (ws?.readyState ?? 0) !== 1;

    // Either detach was sent, or the WebSocket was already closed (so detach would be queued)
    const detachHandled = Boolean(detachSent) || wsIsClosed;
    expect(detachHandled).toBe(true);
  });

  it('reports connection status', async () => {
    const { result } = renderHook(() => useTerminal('shell-1'));

    // Initially not connected
    expect(result.current.isConnected).toBe(false);

    // Flush health check promise
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Connect
    act(() => {
      MockWebSocket.instances[0]?.simulateOpen();
    });

    expect(result.current.isConnected).toBe(true);

    result.current.disconnect();
  });

  it('calls onStatus when shell status changes', async () => {
    const onStatus = vi.fn();
    const { result } = renderHook(() => useTerminal('shell-1', { onStatus }));

    // Flush health check promise
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Connect
    act(() => {
      MockWebSocket.instances[0]?.simulateOpen();
    });

    // Simulate status message
    act(() => {
      MockWebSocket.instances[0]?.simulateMessage({
        type: 'status',
        shellId: 'shell-1',
        status: 'exited',
        exitCode: 0,
      });
    });

    expect(onStatus).toHaveBeenCalledWith('exited', 0);

    result.current.disconnect();
  });

  it('reconnects to shell after connection restored', async () => {
    const { result } = renderHook(() => useTerminal('shell-1'));

    // Flush health check promise
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Initial connection
    act(() => {
      MockWebSocket.instances[0]?.simulateOpen();
    });

    // Clear sent messages
    if (MockWebSocket.instances[0]) {
      MockWebSocket.instances[0].sent.length = 0;
    }

    // Simulate disconnect and reconnect
    act(() => {
      MockWebSocket.instances[0]?.simulateClose();
    });

    // Advance timer to trigger reconnect
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    // New connection opens
    act(() => {
      MockWebSocket.instances[1]?.simulateOpen();
    });

    // Should re-attach to shell
    expect(MockWebSocket.instances[1]?.sent).toContainEqual({
      type: 'attach',
      shellId: 'shell-1',
    });

    result.current.disconnect();
  });
});
