/**
 * WebSocket Heartbeat unit tests
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HeartbeatManager } from '@server/websocket/heartbeat.js';
import { createMockWebSocketServer, type MockWebSocket, type MockWebSocketServer } from '@test/mocks/websocket.js';

describe('WebSocket Heartbeat', () => {
  let heartbeatManager: HeartbeatManager;
  let wss: MockWebSocketServer;
  let mockClient: MockWebSocket;

  beforeEach(() => {
    vi.useFakeTimers();
    wss = createMockWebSocketServer();
    heartbeatManager = new HeartbeatManager(wss as unknown as ConstructorParameters<typeof HeartbeatManager>[0], {
      interval: 30000,
      timeout: 10000,
    });
    mockClient = wss.simulateConnection();
  });

  afterEach(() => {
    heartbeatManager.stop();
    vi.useRealTimers();
  });

  it('sends ping at configured interval', () => {
    heartbeatManager.start();
    vi.advanceTimersByTime(30000); // HEARTBEAT_INTERVAL
    expect(mockClient.ping).toHaveBeenCalled();
  });

  it('marks client as alive on pong', () => {
    heartbeatManager.start();

    // Set client as not alive (will be done by heartbeat)
    mockClient.isAlive = false;

    // Simulate pong response
    mockClient.simulatePong();

    expect(mockClient.isAlive).toBe(true);
  });

  it('terminates unresponsive clients', () => {
    heartbeatManager.start();

    // First heartbeat - marks client as not alive
    mockClient.isAlive = false;
    vi.advanceTimersByTime(30000);

    expect(mockClient.terminate).toHaveBeenCalled();
  });

  it('keeps responsive clients connected', () => {
    heartbeatManager.start();

    // First ping
    vi.advanceTimersByTime(30000);
    mockClient.simulatePong();

    // Second ping
    vi.advanceTimersByTime(30000);

    expect(mockClient.terminate).not.toHaveBeenCalled();
  });

  it('does not terminate client that responded', () => {
    heartbeatManager.start();

    // First heartbeat cycle
    vi.advanceTimersByTime(30000);
    // Client responds with pong
    mockClient.simulatePong();

    // Second heartbeat cycle
    vi.advanceTimersByTime(30000);

    // Client should still be connected
    expect(mockClient.terminate).not.toHaveBeenCalled();
    expect(mockClient.ping).toHaveBeenCalledTimes(2);
  });

  it('handles multiple clients independently', () => {
    const client2 = wss.simulateConnection();
    heartbeatManager.start();

    // First heartbeat
    vi.advanceTimersByTime(30000);

    // Only client1 responds
    mockClient.simulatePong();
    // client2 does not respond

    // Mark client2 as not alive (simulating the heartbeat marking)
    client2.isAlive = false;

    // Second heartbeat
    vi.advanceTimersByTime(30000);

    // client1 should be alive, client2 should be terminated
    expect(mockClient.terminate).not.toHaveBeenCalled();
    expect(client2.terminate).toHaveBeenCalled();
  });

  it('stops heartbeat when manager is stopped', () => {
    heartbeatManager.start();
    heartbeatManager.stop();

    vi.advanceTimersByTime(60000);

    // No pings should have been sent after stop
    expect(mockClient.ping).not.toHaveBeenCalled();
  });

  it('can restart heartbeat after stopping', () => {
    heartbeatManager.start();
    heartbeatManager.stop();
    heartbeatManager.start();

    vi.advanceTimersByTime(30000);

    expect(mockClient.ping).toHaveBeenCalled();
  });

  it('does not ping closed clients', () => {
    heartbeatManager.start();

    // Close the client
    mockClient.close();
    wss.clients.delete(mockClient);

    vi.advanceTimersByTime(30000);

    // Ping should not have been called because client was removed
    expect(mockClient.ping).not.toHaveBeenCalled();
  });

  it('removes client on close event', () => {
    heartbeatManager.start();

    expect(wss.clients.has(mockClient)).toBe(true);

    mockClient.simulateClose();

    expect(wss.clients.has(mockClient)).toBe(false);
  });
});
