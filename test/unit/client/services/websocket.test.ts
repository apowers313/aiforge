/**
 * ReconnectingWebSocket unit tests
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ReconnectingWebSocket } from '@client/services/websocket.js';
import { createMockWebSocketConstructor } from '@test/mocks/websocket.js';

describe('ReconnectingWebSocket', () => {
  let rws: ReconnectingWebSocket;
  let MockWebSocket: ReturnType<typeof createMockWebSocketConstructor>;

  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket = createMockWebSocketConstructor();
    // Mock global WebSocket
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  afterEach(() => {
    rws.close();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('connects on initialization', () => {
    rws = new ReconnectingWebSocket('ws://localhost:9000/ws/terminal');
    rws.connect();

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0].url).toBe('ws://localhost:9000/ws/terminal');
  });

  it('reconnects after disconnect with exponential backoff', () => {
    rws = new ReconnectingWebSocket('ws://localhost:9000/ws/terminal');
    rws.connect();

    // First disconnect - base delay + jitter (up to 2s)
    MockWebSocket.instances[0].simulateClose();
    vi.advanceTimersByTime(2000);
    expect(MockWebSocket.instances).toHaveLength(2);

    // Second disconnect - 2s + jitter (up to 3s)
    MockWebSocket.instances[1].simulateClose();
    vi.advanceTimersByTime(3000);
    expect(MockWebSocket.instances).toHaveLength(3);

    // Third disconnect - 4s + jitter (up to 5s)
    MockWebSocket.instances[2].simulateClose();
    vi.advanceTimersByTime(5000);
    expect(MockWebSocket.instances).toHaveLength(4);
  });

  it('resets attempts after successful connection', () => {
    rws = new ReconnectingWebSocket('ws://localhost:9000/ws/terminal');
    rws.connect();

    // First disconnect - wait for reconnect
    MockWebSocket.instances[0].simulateClose();
    vi.advanceTimersByTime(2000); // 1s base + jitter
    expect(MockWebSocket.instances).toHaveLength(2);

    // Successful connection, then disconnect
    MockWebSocket.instances[1].simulateOpen();
    MockWebSocket.instances[1].simulateClose();

    // Should be back to base delay (reconnect attempt reset to 0)
    vi.advanceTimersByTime(2000); // 1s base + jitter
    expect(MockWebSocket.instances).toHaveLength(3);
  });

  it('stops reconnecting after max attempts', () => {
    const onMaxRetries = vi.fn();
    rws = new ReconnectingWebSocket('ws://localhost:9000/ws/terminal', {
      maxReconnectAttempts: 3,
      onMaxRetriesReached: onMaxRetries,
    });
    rws.connect();

    // First reconnect attempt (uses base delay + jitter)
    MockWebSocket.instances[0].simulateClose();
    vi.advanceTimersByTime(2000);
    expect(MockWebSocket.instances).toHaveLength(2);

    // Second reconnect attempt (2s + jitter)
    MockWebSocket.instances[1].simulateClose();
    vi.advanceTimersByTime(3000);
    expect(MockWebSocket.instances).toHaveLength(3);

    // Third reconnect attempt (4s + jitter)
    MockWebSocket.instances[2].simulateClose();
    vi.advanceTimersByTime(5000);
    expect(MockWebSocket.instances).toHaveLength(4);

    // Should stop reconnecting after max attempts (3)
    MockWebSocket.instances[3].simulateClose();
    vi.advanceTimersByTime(60000);

    // No more reconnects - max attempts reached
    expect(MockWebSocket.instances).toHaveLength(4);
    expect(onMaxRetries).toHaveBeenCalled();
  });

  it('caps delay at maxDelay', () => {
    rws = new ReconnectingWebSocket('ws://localhost:9000/ws/terminal', {
      maxReconnectAttempts: 20,
      maxDelay: 30000,
    });
    rws.connect();

    // Many reconnection attempts - delay should cap at 30000ms
    for (let i = 0; i < 10; i++) {
      MockWebSocket.instances[i].simulateClose();
      vi.advanceTimersByTime(60000); // Advance past any delay
    }

    // Delay should be capped at 30000ms (checking via getLastReconnectDelay)
    const lastDelay = rws.getLastReconnectDelay();
    expect(lastDelay).toBeLessThanOrEqual(31000); // 30000 + jitter
  });

  it('sends messages when connected', () => {
    rws = new ReconnectingWebSocket('ws://localhost:9000/ws/terminal');
    rws.connect();

    // Simulate connection open
    MockWebSocket.instances[0].simulateOpen();

    rws.send({ type: 'input', shellId: 'shell-1', data: 'test' });

    expect(MockWebSocket.instances[0].sent).toContainEqual({
      type: 'input',
      shellId: 'shell-1',
      data: 'test',
    });
  });

  it('queues messages when disconnected', () => {
    rws = new ReconnectingWebSocket('ws://localhost:9000/ws/terminal');
    rws.connect();

    // Don't simulate open - connection not ready
    rws.send({ type: 'input', shellId: 'shell-1', data: 'queued' });

    // Message should not be sent yet
    expect(MockWebSocket.instances[0].sent).toHaveLength(0);

    // Now open the connection
    MockWebSocket.instances[0].simulateOpen();

    // Message should be sent
    expect(MockWebSocket.instances[0].sent).toContainEqual({
      type: 'input',
      shellId: 'shell-1',
      data: 'queued',
    });
  });

  it('calls onMessage handler', () => {
    const onMessage = vi.fn();
    rws = new ReconnectingWebSocket('ws://localhost:9000/ws/terminal', { onMessage });
    rws.connect();

    MockWebSocket.instances[0].simulateOpen();
    MockWebSocket.instances[0].simulateMessage({ type: 'output', data: 'hello' });

    expect(onMessage).toHaveBeenCalledWith({ type: 'output', data: 'hello' });
  });

  it('calls onOpen handler', () => {
    const onOpen = vi.fn();
    rws = new ReconnectingWebSocket('ws://localhost:9000/ws/terminal', { onOpen });
    rws.connect();

    MockWebSocket.instances[0].simulateOpen();

    expect(onOpen).toHaveBeenCalled();
  });

  it('calls onClose handler', () => {
    const onClose = vi.fn();
    rws = new ReconnectingWebSocket('ws://localhost:9000/ws/terminal', { onClose });
    rws.connect();

    MockWebSocket.instances[0].simulateClose();

    expect(onClose).toHaveBeenCalled();
  });

  it('calls onError handler', () => {
    const onError = vi.fn();
    rws = new ReconnectingWebSocket('ws://localhost:9000/ws/terminal', { onError });
    rws.connect();

    // Create a mock error event (not an actual Error object)
    const errorEvent = { type: 'error' } as Event;
    MockWebSocket.instances[0].onerror?.(errorEvent);

    expect(onError).toHaveBeenCalled();
  });

  it('returns connection status', () => {
    rws = new ReconnectingWebSocket('ws://localhost:9000/ws/terminal');
    expect(rws.isConnected()).toBe(false);

    rws.connect();
    expect(rws.isConnected()).toBe(false); // Still connecting

    MockWebSocket.instances[0].simulateOpen();
    expect(rws.isConnected()).toBe(true);

    MockWebSocket.instances[0].simulateClose();
    expect(rws.isConnected()).toBe(false);
  });

  it('closes connection and stops reconnecting', () => {
    rws = new ReconnectingWebSocket('ws://localhost:9000/ws/terminal');
    rws.connect();

    MockWebSocket.instances[0].simulateOpen();
    rws.close();

    // Should not reconnect after explicit close
    vi.advanceTimersByTime(60000);
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it('does not reconnect on normal close code 1000', () => {
    rws = new ReconnectingWebSocket('ws://localhost:9000/ws/terminal');
    rws.connect();

    MockWebSocket.instances[0].simulateOpen();
    // Close with normal code
    MockWebSocket.instances[0].close(1000, 'Normal closure');

    vi.advanceTimersByTime(60000);
    // Should not have created new connections
    expect(MockWebSocket.instances).toHaveLength(1);
  });
});
