/**
 * Integration tests for socket isolation
 *
 * Verifies that sockets are created under AIFORGE_DATA_DIR/sockets/ and that
 * cleanup only scans the instance-specific directory (not /tmp).
 * This is the key guarantee that E2E tests cannot delete dev server sockets.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getSocketDir, getSocketPath } from '@server/paths.js';
import { PtyDaemonManager } from '@server/services/pty/PtyDaemonManager.js';

describe('socket isolation', () => {
  let tempDir: string;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(async () => {
    // Save environment
    savedEnv.AIFORGE_DATA_DIR = process.env.AIFORGE_DATA_DIR;
    savedEnv.XDG_DATA_HOME = process.env.XDG_DATA_HOME;

    tempDir = await mkdtemp(join(tmpdir(), 'socket-isolation-test-'));
    process.env.AIFORGE_DATA_DIR = tempDir;
    delete process.env.XDG_DATA_HOME;
  });

  afterEach(async () => {
    // Restore environment
    if (savedEnv.AIFORGE_DATA_DIR !== undefined) {
      process.env.AIFORGE_DATA_DIR = savedEnv.AIFORGE_DATA_DIR;
    } else {
      delete process.env.AIFORGE_DATA_DIR;
    }
    if (savedEnv.XDG_DATA_HOME !== undefined) {
      process.env.XDG_DATA_HOME = savedEnv.XDG_DATA_HOME;
    } else {
      delete process.env.XDG_DATA_HOME;
    }

    await rm(tempDir, { recursive: true, force: true });
  });

  it('sockets are created under AIFORGE_DATA_DIR/sockets/', () => {
    const socketDir = getSocketDir();
    expect(socketDir).toBe(join(tempDir, 'sockets'));

    const socketPath = getSocketPath('test-shell');
    expect(socketPath).toBe(join(tempDir, 'sockets', 'test-shell.sock'));
  });

  it('cleanup only scans instance-specific directory', async () => {
    // Create a socket in the test's socket directory
    const socketsDir = getSocketDir();
    await mkdir(socketsDir, { recursive: true });
    await writeFile(join(socketsDir, 'orphan-shell.sock'), '');

    // Create a socket in /tmp that should NOT be found by cleanup
    const tmpSocket = join(tmpdir(), `ai-ide-pty-isolation-test-${String(Date.now())}.sock`);
    await writeFile(tmpSocket, '');

    try {
      const manager = new PtyDaemonManager();
      const orphans = await manager.findOrphanedSockets([]);

      // Should find the orphan in the data dir
      expect(orphans).toHaveLength(1);
      expect(orphans[0]).toContain('orphan-shell.sock');

      // Should NOT find the /tmp socket (only scans instance-specific dir)
      expect(orphans.find((o) => o === tmpSocket)).toBeUndefined();
    } finally {
      // Clean up the /tmp socket we created
      try {
        const { unlink } = await import('node:fs/promises');
        await unlink(tmpSocket);
      } catch {
        // Already cleaned up
      }
    }
  });

  it('findOrphanedSockets excludes valid shell IDs', async () => {
    const socketsDir = getSocketDir();
    await mkdir(socketsDir, { recursive: true });
    await writeFile(join(socketsDir, 'valid-id.sock'), '');
    await writeFile(join(socketsDir, 'orphan-id.sock'), '');

    const manager = new PtyDaemonManager();
    const orphans = await manager.findOrphanedSockets(['valid-id']);

    expect(orphans).toHaveLength(1);
    expect(orphans[0]).toContain('orphan-id.sock');
  });

  it('findOrphanedSockets only matches .sock files', async () => {
    const socketsDir = getSocketDir();
    await mkdir(socketsDir, { recursive: true });
    await writeFile(join(socketsDir, 'some-shell.sock'), '');
    await writeFile(join(socketsDir, 'not-a-socket.txt'), '');
    await writeFile(join(socketsDir, 'readme.md'), '');

    const manager = new PtyDaemonManager();
    const orphans = await manager.findOrphanedSockets([]);

    expect(orphans).toHaveLength(1);
    expect(orphans[0]).toContain('some-shell.sock');
  });
});
