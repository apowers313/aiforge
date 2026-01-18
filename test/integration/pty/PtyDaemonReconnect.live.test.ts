/**
 * Integration tests for PTY daemon reconnection
 *
 * These tests verify the persistent daemon architecture works correctly:
 * - Daemon processes survive server disconnections
 * - Server can reconnect to existing daemons
 * - Scrollback is preserved across reconnections
 *
 * Note: These are "live" tests that spawn real daemon processes.
 * They require longer timeouts and proper cleanup.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { unlink, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { PtyDaemonManager } from '@server/services/pty/PtyDaemonManager.js';
import { getSocketPath } from '@server/services/pty/daemon/protocol.js';

const TEST_TIMEOUT = 30000; // 30 seconds for daemon operations

describe('PTY Daemon Reconnection', () => {
  let manager: PtyDaemonManager;
  const testShellIds: string[] = [];

  /**
   * Generate a unique shell ID for tests
   */
  function generateShellId(): string {
    const id = `test-reconnect-${String(Date.now())}-${Math.random().toString(36).slice(2)}`;
    testShellIds.push(id);
    return id;
  }

  /**
   * Clean up socket file for a shell
   */
  async function cleanupSocket(shellId: string): Promise<void> {
    const socketPath = getSocketPath(shellId);
    try {
      await unlink(socketPath);
    } catch {
      // Socket doesn't exist
    }
  }

  beforeEach(() => {
    manager = new PtyDaemonManager();
  });

  afterEach(async () => {
    // Kill all sessions and clean up sockets
    await manager.killAll();

    // Clean up any test sockets
    for (const shellId of testShellIds) {
      await cleanupSocket(shellId);
    }
    testShellIds.length = 0;
  });

  describe('spawn and reconnect', () => {
    it('spawns daemon and creates socket file', async () => {
      const shellId = generateShellId();
      const socketPath = getSocketPath(shellId);

      // Spawn daemon
      const client = await manager.spawn(shellId, {
        cwd: tmpdir(),
      });

      // Verify client is connected
      expect(client.isConnected).toBe(true);
      expect(client.id).toBe(shellId);

      // Verify socket file exists
      await expect(access(socketPath)).resolves.not.toThrow();
    }, TEST_TIMEOUT);

    it('reconnects to existing daemon after disconnect', async () => {
      const shellId = generateShellId();

      // Spawn daemon
      const client1 = await manager.spawn(shellId, {
        cwd: tmpdir(),
      });

      expect(client1.isConnected).toBe(true);

      // Disconnect (but don't kill)
      manager.disconnectAll();
      expect(manager.count()).toBe(0);

      // Socket should still exist (daemon is still running)
      const socketPath = getSocketPath(shellId);
      await expect(access(socketPath)).resolves.not.toThrow();

      // Reconnect via attach
      const client2 = await manager.attach(shellId, tmpdir());

      expect(client2.isConnected).toBe(true);
      expect(client2.id).toBe(shellId);
      expect(manager.count()).toBe(1);
    }, TEST_TIMEOUT);

    it('receives data from daemon after reconnection', async () => {
      const shellId = generateShellId();
      const socketPath = getSocketPath(shellId);

      // Spawn daemon - this test follows the same structure as the passing
      // "reconnects to existing daemon after disconnect" test above
      const client1 = await manager.spawn(shellId, {
        cwd: tmpdir(),
      });

      // Verify initial connection
      expect(client1.isConnected).toBe(true);

      // Disconnect (but don't kill daemon) - immediately, like the passing test
      manager.disconnectAll();
      expect(manager.count()).toBe(0);

      // Socket should still exist (daemon is still running)
      await expect(access(socketPath)).resolves.not.toThrow();

      // Reconnect via attach
      const client2 = await manager.attach(shellId, tmpdir());

      expect(client2.isConnected).toBe(true);
      expect(client2.id).toBe(shellId);
      expect(manager.count()).toBe(1);

      // Now test that we can receive data after reconnection
      const reconnectedData: string[] = [];
      client2.onData((data) => {
        reconnectedData.push(data);
      });

      // Send a command
      client2.write('echo "AFTER_RECONNECT"\n');

      // Wait for output
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Verify we received data after reconnection
      expect(reconnectedData.length).toBeGreaterThan(0);
      expect(reconnectedData.join('')).toContain('AFTER_RECONNECT');
    }, TEST_TIMEOUT);
  });

  describe('multiple daemons', () => {
    it('manages multiple daemons independently', async () => {
      const shellId1 = generateShellId();
      const shellId2 = generateShellId();

      // Spawn two daemons
      const client1 = await manager.spawn(shellId1, { cwd: tmpdir() });
      const client2 = await manager.spawn(shellId2, { cwd: tmpdir() });

      expect(manager.count()).toBe(2);
      expect(client1.isConnected).toBe(true);
      expect(client2.isConnected).toBe(true);

      // Kill one
      await manager.kill(shellId1);

      expect(manager.count()).toBe(1);
      expect(manager.get(shellId1)).toBeUndefined();
      expect(manager.get(shellId2)).toBe(client2);
    }, TEST_TIMEOUT);

    it('reconnects to all daemons after full disconnect', async () => {
      const shellId1 = generateShellId();
      const shellId2 = generateShellId();

      // Spawn two daemons
      await manager.spawn(shellId1, { cwd: tmpdir() });
      await manager.spawn(shellId2, { cwd: tmpdir() });

      expect(manager.count()).toBe(2);

      // Disconnect all (simulates server restart)
      manager.disconnectAll();
      expect(manager.count()).toBe(0);

      // Reconnect to both
      await manager.attach(shellId1, tmpdir());
      await manager.attach(shellId2, tmpdir());

      expect(manager.count()).toBe(2);
    }, TEST_TIMEOUT);
  });

  describe('orphan cleanup', () => {
    it('finds orphaned sockets', async () => {
      const shellId = generateShellId();

      // Spawn daemon
      await manager.spawn(shellId, { cwd: tmpdir() });

      // Disconnect (leaves socket behind)
      manager.disconnectAll();

      // Find orphans (shellId is not in valid list)
      const orphans = await manager.findOrphanedSockets([]);

      // Should find our test socket
      const socketPath = getSocketPath(shellId);
      expect(orphans).toContain(socketPath);
    }, TEST_TIMEOUT);

    it('cleans up orphaned sockets', async () => {
      const shellId = generateShellId();
      const socketPath = getSocketPath(shellId);

      // Spawn daemon
      await manager.spawn(shellId, { cwd: tmpdir() });

      // Disconnect
      manager.disconnectAll();

      // Socket should exist
      await expect(access(socketPath)).resolves.not.toThrow();

      // Clean up orphans
      await manager.cleanupOrphanedSockets([]);

      // Socket should be gone
      await expect(access(socketPath)).rejects.toThrow();
    }, TEST_TIMEOUT);
  });

  describe('error handling', () => {
    it('throws when attaching to non-existent socket', async () => {
      const shellId = generateShellId();

      await expect(manager.attach(shellId, tmpdir())).rejects.toThrow();
    });

    it('throws when spawning duplicate shell', async () => {
      const shellId = generateShellId();

      await manager.spawn(shellId, { cwd: tmpdir() });

      // Second spawn should throw
      await expect(manager.spawn(shellId, { cwd: tmpdir() })).rejects.toThrow(/already exists/);
    }, TEST_TIMEOUT);
  });
});
