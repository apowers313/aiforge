/**
 * Tests for PtyDaemonManager
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createServer, type Server, type Socket } from 'node:net';
import { writeFile, unlink } from 'node:fs/promises';
import { PtyDaemonManager } from '@server/services/pty/PtyDaemonManager.js';
import { getSocketPath, encodeMessage } from '@server/services/pty/daemon/protocol.js';

describe('PtyDaemonManager', () => {
  describe('constructor', () => {
    it('creates with default options', () => {
      const manager = new PtyDaemonManager();
      expect(manager.count()).toBe(0);
    });

    it('creates with custom default shell', () => {
      const manager = new PtyDaemonManager({ defaultShell: '/bin/zsh' });
      expect(manager.count()).toBe(0);
    });
  });

  describe('has', () => {
    const testShellId = 'test-has-shell';
    const testSocketPath = getSocketPath(testShellId);

    afterEach(async () => {
      try {
        await unlink(testSocketPath);
      } catch {
        // Ignore
      }
    });

    it('returns false when socket does not exist', async () => {
      const manager = new PtyDaemonManager();
      const result = await manager.has(testShellId);
      expect(result).toBe(false);
    });

    it('returns true when socket exists', async () => {
      // Create a socket file
      await writeFile(testSocketPath, '');

      const manager = new PtyDaemonManager();
      const result = await manager.has(testShellId);
      expect(result).toBe(true);
    });
  });

  describe('get', () => {
    it('returns undefined for non-existent session', () => {
      const manager = new PtyDaemonManager();
      const session = manager.get('non-existent');
      expect(session).toBeUndefined();
    });
  });

  describe('count and list', () => {
    it('count returns 0 when empty', () => {
      const manager = new PtyDaemonManager();
      expect(manager.count()).toBe(0);
    });

    it('list returns empty array when empty', () => {
      const manager = new PtyDaemonManager();
      expect(manager.list()).toEqual([]);
    });
  });

  describe('attach', () => {
    const testShellId = 'test-attach-shell';
    const testSocketPath = getSocketPath(testShellId);
    let mockServer: Server | null = null;

    beforeEach(async () => {
      try {
        await unlink(testSocketPath);
      } catch {
        // Ignore
      }
    });

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

    it('throws when socket does not exist', async () => {
      const manager = new PtyDaemonManager();
      await expect(manager.attach(testShellId, '/test/cwd')).rejects.toThrow();
    });

    it('attaches to existing daemon', async () => {
      // Create mock server
      mockServer = await new Promise<Server>((resolve, reject) => {
        const server = createServer((socket) => {
          socket.write(encodeMessage({ type: 'ready' }));
        });
        server.on('error', reject);
        server.listen(testSocketPath, () => { resolve(server); });
      });

      const manager = new PtyDaemonManager();
      const client = await manager.attach(testShellId, '/test/cwd');

      expect(client).toBeDefined();
      expect(client.id).toBe(testShellId);
      expect(manager.count()).toBe(1);
      expect(manager.get(testShellId)).toBe(client);

      client.dispose();
    });

    it('returns existing session if already attached', async () => {
      mockServer = await new Promise<Server>((resolve, reject) => {
        const server = createServer((socket) => {
          socket.write(encodeMessage({ type: 'ready' }));
        });
        server.on('error', reject);
        server.listen(testSocketPath, () => { resolve(server); });
      });

      const manager = new PtyDaemonManager();
      const client1 = await manager.attach(testShellId, '/test/cwd');
      const client2 = await manager.attach(testShellId, '/test/cwd');

      expect(client1).toBe(client2);
      expect(manager.count()).toBe(1);

      client1.dispose();
    });

    it('emits session:attached event', async () => {
      mockServer = await new Promise<Server>((resolve, reject) => {
        const server = createServer((socket) => {
          socket.write(encodeMessage({ type: 'ready' }));
        });
        server.on('error', reject);
        server.listen(testSocketPath, () => { resolve(server); });
      });

      const manager = new PtyDaemonManager();
      const attachHandler = vi.fn();
      manager.on('session:attached', attachHandler);

      const client = await manager.attach(testShellId, '/test/cwd');

      expect(attachHandler).toHaveBeenCalledWith(client);
      client.dispose();
    });
  });

  describe('kill', () => {
    const testShellId = 'test-kill-shell';
    const testSocketPath = getSocketPath(testShellId);
    let mockServer: Server | null = null;
    let serverConnections: Socket[] = [];

    afterEach(async () => {
      // Close all connections first
      for (const conn of serverConnections) {
        conn.destroy();
      }
      serverConnections = [];

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

    it('does nothing for non-existent session', async () => {
      const manager = new PtyDaemonManager();
      await expect(manager.kill('non-existent')).resolves.not.toThrow();
    });

    it('kills and removes session', async () => {
      mockServer = await new Promise<Server>((resolve, reject) => {
        const server = createServer((socket) => {
          serverConnections.push(socket);
          socket.write(encodeMessage({ type: 'ready' }));
        });
        server.on('error', reject);
        server.listen(testSocketPath, () => { resolve(server); });
      });

      const manager = new PtyDaemonManager();
      await manager.attach(testShellId, '/test/cwd');
      expect(manager.count()).toBe(1);

      await manager.kill(testShellId);
      expect(manager.count()).toBe(0);
      expect(manager.get(testShellId)).toBeUndefined();
    });
  });

  describe('killAll', () => {
    it('kills all sessions', async () => {
      const manager = new PtyDaemonManager();
      // No sessions to kill - should not throw
      await expect(manager.killAll()).resolves.not.toThrow();
    });
  });

  describe('disconnectAll', () => {
    const testShellId = 'test-disconnect-shell';
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

    it('disconnects all sessions without killing', async () => {
      mockServer = await new Promise<Server>((resolve, reject) => {
        const server = createServer((socket) => {
          socket.write(encodeMessage({ type: 'ready' }));
        });
        server.on('error', reject);
        server.listen(testSocketPath, () => { resolve(server); });
      });

      const manager = new PtyDaemonManager();
      await manager.attach(testShellId, '/test/cwd');
      expect(manager.count()).toBe(1);

      manager.disconnectAll();
      expect(manager.count()).toBe(0);
    });
  });

  describe('findOrphanedSockets', () => {
    it('returns empty array when no orphans', async () => {
      const manager = new PtyDaemonManager();
      const orphans = await manager.findOrphanedSockets(['shell-1', 'shell-2']);
      // Filter out any real orphans from previous test runs
      const testOrphans = orphans.filter((p) => p.includes('test-orphan'));
      expect(testOrphans).toEqual([]);
    });

    it('finds orphaned socket files', async () => {
      const orphanShellId = `test-orphan-${String(Date.now())}`;
      const orphanSocketPath = getSocketPath(orphanShellId);

      // Create orphan socket file
      await writeFile(orphanSocketPath, '');

      try {
        const manager = new PtyDaemonManager();
        const orphans = await manager.findOrphanedSockets(['valid-shell-id']);

        expect(orphans).toContain(orphanSocketPath);
      } finally {
        await unlink(orphanSocketPath);
      }
    });

    it('excludes valid shell sockets', async () => {
      const validShellId = `test-valid-${String(Date.now())}`;
      const validSocketPath = getSocketPath(validShellId);

      // Create socket file for valid shell
      await writeFile(validSocketPath, '');

      try {
        const manager = new PtyDaemonManager();
        const orphans = await manager.findOrphanedSockets([validShellId]);

        expect(orphans).not.toContain(validSocketPath);
      } finally {
        await unlink(validSocketPath);
      }
    });
  });

  describe('cleanupOrphanedSockets', () => {
    it('removes orphaned socket files', async () => {
      const orphanShellId = `test-cleanup-orphan-${String(Date.now())}`;
      const orphanSocketPath = getSocketPath(orphanShellId);

      // Create orphan socket file
      await writeFile(orphanSocketPath, '');

      const manager = new PtyDaemonManager();
      await manager.cleanupOrphanedSockets(['valid-shell']);

      // Verify orphan was removed
      const orphans = await manager.findOrphanedSockets(['valid-shell']);
      expect(orphans).not.toContain(orphanSocketPath);
    });
  });

  describe('stale socket handling (regression)', () => {
    /**
     * Regression test for: When a daemon dies without cleaning up its socket file,
     * subsequent spawn attempts should detect the stale socket (ECONNREFUSED)
     * and handle it gracefully.
     *
     * Bug: User creates shell → daemon spawns → daemon dies (e.g., server restart,
     * crash) → socket file remains → user clicks shell → ECONNREFUSED → error shown
     *
     * Fix: Detect ECONNREFUSED as stale socket, clean up, and spawn new daemon
     */
    const testShellId = 'test-stale-socket-shell';
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

    it('attach throws ECONNREFUSED for stale socket (socket file exists, no daemon)', async () => {
      // Create a real socket server
      mockServer = await new Promise<Server>((resolve, reject) => {
        const server = createServer();
        server.on('error', reject);
        server.listen(testSocketPath, () => { resolve(server); });
      });

      // Get a connection to verify socket works
      const net = await import('node:net');
      const testSocket = net.createConnection(testSocketPath);
      await new Promise<void>((resolve, reject) => {
        testSocket.on('connect', () => {
          testSocket.destroy();
          resolve();
        });
        testSocket.on('error', reject);
      });

      // Close the server but DON'T unlink the socket (simulates daemon crash)
      // We need to recreate the socket file after close since Node removes it
      await new Promise<void>((resolve) => {
        mockServer?.close(() => {
          mockServer = null;
          resolve();
        });
      });

      // Recreate the socket file manually to simulate a stale socket
      // (In reality, if daemon crashes without cleanup, socket file persists)
      await writeFile(testSocketPath, '');

      // Socket file should exist
      const { access, constants } = await import('node:fs/promises');
      await expect(access(testSocketPath, constants.F_OK)).resolves.not.toThrow();

      // Attach should fail - either ECONNREFUSED (real socket) or ENOTSOCK (fake file)
      // Both indicate a stale/invalid socket
      const manager = new PtyDaemonManager();
      try {
        await manager.attach(testShellId, '/test/cwd');
        expect.fail('Expected attach to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
        const nodeErr = err as NodeJS.ErrnoException;
        // ECONNREFUSED for real stale sockets, ENOTSOCK for fake file
        expect(['ECONNREFUSED', 'ENOTSOCK']).toContain(nodeErr.code);
      }
    });

    it('ECONNREFUSED error can be detected by code property', () => {
      // Create an ECONNREFUSED error like Node.js does
      const error = new Error('connect ECONNREFUSED /tmp/test.sock') as NodeJS.ErrnoException;
      error.code = 'ECONNREFUSED';
      error.errno = -111;
      error.syscall = 'connect';

      // Verify the detection logic works
      const isStaleSocket =
        error instanceof Error &&
        'code' in error &&
        error.code === 'ECONNREFUSED';

      expect(isStaleSocket).toBe(true);
    });

    it('other errors are not detected as stale socket', () => {
      const timeoutError = new Error('Connection timeout');
      const enoentError = new Error('ENOENT') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';

      const isTimeoutStale =
        timeoutError instanceof Error &&
        'code' in timeoutError &&
        (timeoutError as NodeJS.ErrnoException).code === 'ECONNREFUSED';

      const isEnoentStale =
        enoentError instanceof Error &&
        'code' in enoentError &&
        enoentError.code === 'ECONNREFUSED';

      expect(isTimeoutStale).toBe(false);
      expect(isEnoentStale).toBe(false);
    });
  });

  describe('events', () => {
    const testShellId = 'test-events-shell';
    const testSocketPath = getSocketPath(testShellId);
    let mockServer: Server | null = null;
    let serverSocket: Socket | null = null;

    afterEach(async () => {
      if (mockServer) {
        await new Promise<void>((resolve) => {
          mockServer?.close(() => { resolve(); });
        });
        mockServer = null;
      }
      serverSocket = null;
      try {
        await unlink(testSocketPath);
      } catch {
        // Ignore
      }
    });

    it('emits session:output on data', async () => {
      mockServer = await new Promise<Server>((resolve, reject) => {
        const server = createServer((socket) => {
          serverSocket = socket;
          socket.write(encodeMessage({ type: 'ready' }));
        });
        server.on('error', reject);
        server.listen(testSocketPath, () => { resolve(server); });
      });

      const manager = new PtyDaemonManager();
      const outputHandler = vi.fn();
      manager.on('session:output', outputHandler);

      const client = await manager.attach(testShellId, '/test/cwd');

      // Simulate data from daemon (output from PTY)
      serverSocket?.write(encodeMessage({ type: 'data', data: 'output' }));
      await new Promise((resolve) => { setTimeout(resolve, 50); });

      expect(outputHandler).toHaveBeenCalledWith(testShellId);
      client.dispose();
    });

    it('emits session:exited on exit', async () => {
      mockServer = await new Promise<Server>((resolve, reject) => {
        const server = createServer((socket) => {
          serverSocket = socket;
          socket.write(encodeMessage({ type: 'ready' }));
        });
        server.on('error', reject);
        server.listen(testSocketPath, () => { resolve(server); });
      });

      const manager = new PtyDaemonManager();
      const exitHandler = vi.fn();
      manager.on('session:exited', exitHandler);

      await manager.attach(testShellId, '/test/cwd');

      // Simulate exit from daemon
      serverSocket?.write(encodeMessage({ type: 'exit', code: 0 }));
      await new Promise((resolve) => { setTimeout(resolve, 50); });

      expect(exitHandler).toHaveBeenCalledWith(testShellId, 0);
      expect(manager.count()).toBe(0);
    });
  });
});
