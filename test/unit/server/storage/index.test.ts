/**
 * Tests for storage initialization
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import { getDataDir, initStorage, createStorage } from '@server/storage/index.js';

describe('storage', () => {
  let tempDir: string;
  const originalEnv = process.env.AIFORGE_DATA_DIR;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'storage-test-'));
    // Set test environment
    process.env.AIFORGE_DATA_DIR = tempDir;
  });

  afterEach(async () => {
    // Restore original environment
    if (originalEnv !== undefined) {
      process.env.AIFORGE_DATA_DIR = originalEnv;
    } else {
      delete process.env.AIFORGE_DATA_DIR;
    }
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('getDataDir', () => {
    it('returns AIFORGE_DATA_DIR when set', () => {
      process.env.AIFORGE_DATA_DIR = '/custom/path';
      expect(getDataDir()).toBe('/custom/path');
    });

    it('returns default path when AIFORGE_DATA_DIR is not set', () => {
      delete process.env.AIFORGE_DATA_DIR;
      const result = getDataDir();
      expect(result).toContain('.aiforge');
      expect(result).toContain('data');
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
