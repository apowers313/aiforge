/**
 * Tests for storage initialization
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { getDataDir, initStorage, createStorage } from '@server/storage/index.js';

describe('storage', () => {
  let tempDir: string;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'storage-test-'));
    // Set test environment
    process.env.AIFORGE_DATA_DIR = tempDir;
    delete process.env.XDG_DATA_HOME;
  });

  afterEach(async () => {
    // Restore original environment
    process.env = { ...originalEnv };
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('getDataDir', () => {
    it('returns AIFORGE_DATA_DIR when set', () => {
      process.env.AIFORGE_DATA_DIR = '/custom/path';
      expect(getDataDir()).toBe('/custom/path');
    });

    it('returns XDG default path when no env vars are set', () => {
      delete process.env.AIFORGE_DATA_DIR;
      delete process.env.XDG_DATA_HOME;
      const result = getDataDir();
      expect(result).toBe(join(homedir(), '.local', 'share', 'aiforge'));
    });

    it('uses XDG_DATA_HOME when set', () => {
      delete process.env.AIFORGE_DATA_DIR;
      process.env.XDG_DATA_HOME = '/custom/share';
      expect(getDataDir()).toBe('/custom/share/aiforge');
    });

    it('AIFORGE_DATA_DIR takes priority over XDG_DATA_HOME', () => {
      process.env.AIFORGE_DATA_DIR = '/override';
      process.env.XDG_DATA_HOME = '/custom/share';
      expect(getDataDir()).toBe('/override');
    });
  });

  describe('initStorage', () => {
    it('creates data directory if it does not exist', async () => {
      const newDir = join(tempDir, 'new-data');
      process.env.AIFORGE_DATA_DIR = newDir;

      expect(existsSync(newDir)).toBe(false);

      await initStorage();

      expect(existsSync(newDir)).toBe(true);
    });

    it('returns storage object with all stores', async () => {
      const storage = await initStorage();

      expect(storage.projects).toBeDefined();
      expect(storage.shells).toBeDefined();
      expect(storage.sessions).toBeDefined();
      expect(storage.workspaceStates).toBeDefined();
      expect(storage.scrollback).toBeDefined();
      expect(storage.projectUrls).toBeDefined();
      expect(storage.projectContext).toBeDefined();
      expect(storage.worktreeMetadata).toBeDefined();
      expect(storage.worktreeUrls).toBeDefined();
    });

    it('creates sockets subdirectory during init', async () => {
      const newDir = join(tempDir, 'new-data');
      process.env.AIFORGE_DATA_DIR = newDir;
      await initStorage();
      expect(existsSync(join(newDir, 'sockets'))).toBe(true);
    });
  });

  describe('createStorage', () => {
    it('returns storage object with all stores', () => {
      const storage = createStorage(tempDir);

      expect(storage.projects).toBeDefined();
      expect(storage.shells).toBeDefined();
      expect(storage.sessions).toBeDefined();
      expect(storage.workspaceStates).toBeDefined();
      expect(storage.scrollback).toBeDefined();
      expect(storage.projectUrls).toBeDefined();
      expect(storage.projectContext).toBeDefined();
      expect(storage.worktreeMetadata).toBeDefined();
      expect(storage.worktreeUrls).toBeDefined();
    });
  });
});
