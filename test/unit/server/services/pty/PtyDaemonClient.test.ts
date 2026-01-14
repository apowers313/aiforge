/**
 * Tests for PtyDaemonClient
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createServer, type Server, type Socket } from 'node:net';
import { unlink } from 'node:fs/promises';
import { PtyDaemonClient } from '@server/services/pty/PtyDaemonClient.js';
import { getSocketPath, encodeMessage } from '@server/services/pty/daemon/protocol.js';

describe('PtyDaemonClient', () => {
  const testShellId = 'test-shell-123';
  const testSocketPath = getSocketPath(testShellId);
  let mockServer: Server | null = null;
  let serverConnections: Socket[] = [];

  const createMockServer = (): Promise<Server> => {
    return new Promise((resolve, reject) => {
      const server = createServer((socket) => {
        serverConnections.push(socket);
        // Send ready message on connection
        socket.write(encodeMessage({ type: 'ready' }));
      });

      server.on('error', reject);
      server.listen(testSocketPath, () => {
        resolve(server);
      });
    });
  };

  beforeEach(async () => {
    serverConnections = [];
    // Clean up socket file if it exists
    try {
      await unlink(testSocketPath);
    } catch {
      // Socket doesn't exist, that's fine
    }
  });

  afterEach(async () => {
    // Close all connections
    for (const conn of serverConnections) {
      conn.destroy();
    }
    serverConnections = [];

    // Close server
    if (mockServer) {
      await new Promise<void>((resolve) => {
        mockServer?.close(() => { resolve(); });
      });
      mockServer = null;
    }

    // Clean up socket file
    try {
      await unlink(testSocketPath);
    } catch {
      // Socket doesn't exist, that's fine
    }
  });

  describe('constructor', () => {
    it('sets id and socket path', () => {
      const client = new PtyDaemonClient(testShellId, '/test/cwd');
      expect(client.id).toBe(testShellId);
      expect(client.socketPath).toBe(testSocketPath);
      expect(client.cwd).toBe('/test/cwd');
    });

    it('uses default cols and rows', () => {
      const client = new PtyDaemonClient(testShellId, '/test/cwd');
      expect(client.cols).toBe(80);
      expect(client.rows).toBe(24);
    });

    it('uses custom cols and rows', () => {
      const client = new PtyDaemonClient(testShellId, '/test/cwd', 120, 40);
      expect(client.cols).toBe(120);
      expect(client.rows).toBe(40);
    });
  });

  describe('connect', () => {
    it('connects to daemon socket and receives ready', async () => {
      mockServer = await createMockServer();
      const client = new PtyDaemonClient(testShellId, '/test/cwd');

      await client.connect();

      expect(client.isConnected).toBe(true);
      client.dispose();
    });

    it('rejects on connection error', async () => {
      // No server running
      const client = new PtyDaemonClient(testShellId, '/test/cwd');

      await expect(client.connect()).rejects.toThrow();
      client.dispose();
    });

    it('returns immediately if already connected', async () => {
      mockServer = await createMockServer();
      const client = new PtyDaemonClient(testShellId, '/test/cwd');

      await client.connect();
      await client.connect(); // Should not throw

      expect(client.isConnected).toBe(true);
      client.dispose();
    });
  });

  describe('write', () => {
    it('sends input message to daemon', async () => {
      mockServer = await createMockServer();
      const client = new PtyDaemonClient(testShellId, '/test/cwd');
      await client.connect();

      const receivedData: string[] = [];
      serverConnections[0]?.on('data', (data) => {
        receivedData.push(data.toString());
      });

      client.write('test input');

      // Wait for message to be sent
      await new Promise((resolve) => { setTimeout(resolve, 50); });

      expect(receivedData.join('')).toContain('"type":"input"');
      expect(receivedData.join('')).toContain('"data":"test input"');
      client.dispose();
    });

    it('emits input event', async () => {
      mockServer = await createMockServer();
      const client = new PtyDaemonClient(testShellId, '/test/cwd');
      await client.connect();

      const inputHandler = vi.fn();
      client.on('input', inputHandler);

      client.write('test');

      expect(inputHandler).toHaveBeenCalledWith('test');
      client.dispose();
    });
  });

  describe('resize', () => {
    it('sends resize message and updates local state', async () => {
      mockServer = await createMockServer();
      const client = new PtyDaemonClient(testShellId, '/test/cwd');
      await client.connect();

      const receivedData: string[] = [];
      serverConnections[0]?.on('data', (data) => {
        receivedData.push(data.toString());
      });

      client.resize(100, 50);

      expect(client.cols).toBe(100);
      expect(client.rows).toBe(50);

      await new Promise((resolve) => { setTimeout(resolve, 50); });

      expect(receivedData.join('')).toContain('"type":"resize"');
      expect(receivedData.join('')).toContain('"cols":100');
      expect(receivedData.join('')).toContain('"rows":50');
      client.dispose();
    });
  });

  describe('kill', () => {
    it('sends kill message without signal', async () => {
      mockServer = await createMockServer();
      const client = new PtyDaemonClient(testShellId, '/test/cwd');
      await client.connect();

      const receivedData: string[] = [];
      serverConnections[0]?.on('data', (data) => {
        receivedData.push(data.toString());
      });

      client.kill();

      await new Promise((resolve) => { setTimeout(resolve, 50); });

      expect(receivedData.join('')).toContain('"type":"kill"');
      client.dispose();
    });

    it('sends kill message with signal', async () => {
      mockServer = await createMockServer();
      const client = new PtyDaemonClient(testShellId, '/test/cwd');
      await client.connect();

      const receivedData: string[] = [];
      serverConnections[0]?.on('data', (data) => {
        receivedData.push(data.toString());
      });

      client.kill('SIGTERM');

      await new Promise((resolve) => { setTimeout(resolve, 50); });

      expect(receivedData.join('')).toContain('"type":"kill"');
      expect(receivedData.join('')).toContain('"signal":"SIGTERM"');
      client.dispose();
    });
  });

  describe('daemon messages', () => {
    it('emits data event on data message', async () => {
      mockServer = await createMockServer();
      const client = new PtyDaemonClient(testShellId, '/test/cwd');
      await client.connect();

      const dataHandler = vi.fn();
      client.on('data', dataHandler);

      // Server sends data message
      serverConnections[0]?.write(encodeMessage({ type: 'data', data: 'output text' }));

      await new Promise((resolve) => { setTimeout(resolve, 50); });

      expect(dataHandler).toHaveBeenCalledWith('output text');
      client.dispose();
    });

    it('emits exit event on exit message', async () => {
      mockServer = await createMockServer();
      const client = new PtyDaemonClient(testShellId, '/test/cwd');
      await client.connect();

      const exitHandler = vi.fn();
      client.on('exit', exitHandler);

      // Server sends exit message
      serverConnections[0]?.write(encodeMessage({ type: 'exit', code: 0 }));

      await new Promise((resolve) => { setTimeout(resolve, 50); });

      expect(exitHandler).toHaveBeenCalledWith({ exitCode: 0, signal: undefined });
      client.dispose();
    });

    it('emits pong event on pong message', async () => {
      mockServer = await createMockServer();
      const client = new PtyDaemonClient(testShellId, '/test/cwd');
      await client.connect();

      const pongHandler = vi.fn();
      client.on('pong', pongHandler);

      // Server sends pong message
      serverConnections[0]?.write(encodeMessage({ type: 'pong' }));

      await new Promise((resolve) => { setTimeout(resolve, 50); });

      expect(pongHandler).toHaveBeenCalled();
      client.dispose();
    });
  });

  describe('onData / onExit', () => {
    it('onData returns unsubscribe function', async () => {
      mockServer = await createMockServer();
      const client = new PtyDaemonClient(testShellId, '/test/cwd');
      await client.connect();

      const handler = vi.fn();
      const unsubscribe = client.onData(handler);

      serverConnections[0]?.write(encodeMessage({ type: 'data', data: 'test1' }));
      await new Promise((resolve) => { setTimeout(resolve, 50); });
      expect(handler).toHaveBeenCalledTimes(1);

      unsubscribe();

      serverConnections[0]?.write(encodeMessage({ type: 'data', data: 'test2' }));
      await new Promise((resolve) => { setTimeout(resolve, 50); });
      expect(handler).toHaveBeenCalledTimes(1); // Still 1, not called again

      client.dispose();
    });

    it('onExit returns unsubscribe function', async () => {
      mockServer = await createMockServer();
      const client = new PtyDaemonClient(testShellId, '/test/cwd');
      await client.connect();

      const handler = vi.fn();
      const unsubscribe = client.onExit(handler);

      expect(typeof unsubscribe).toBe('function');

      unsubscribe();
      client.dispose();
    });
  });

  describe('dispose', () => {
    it('cleans up connection and state', async () => {
      mockServer = await createMockServer();
      const client = new PtyDaemonClient(testShellId, '/test/cwd');
      await client.connect();

      expect(client.isConnected).toBe(true);

      client.dispose();

      expect(client.isConnected).toBe(false);
    });

    it('removes all listeners', async () => {
      mockServer = await createMockServer();
      const client = new PtyDaemonClient(testShellId, '/test/cwd');
      await client.connect();

      const handler = vi.fn();
      client.on('data', handler);

      client.dispose();

      expect(client.listenerCount('data')).toBe(0);
    });
  });
});
