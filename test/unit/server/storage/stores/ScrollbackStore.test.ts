/**
 * Tests for ScrollbackStore - terminal scrollback persistence
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ScrollbackStore, type ScrollbackEntry } from '@server/storage/stores/ScrollbackStore.js';

describe('ScrollbackStore', () => {
  let store: ScrollbackStore;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'scrollback-store-test-'));
    store = new ScrollbackStore({
      directory: tempDir,
      maxFileSize: 10 * 1024, // 10KB for testing
      maxMemoryEntries: 100,
    });
  });

  afterEach(async () => {
    // Wait for any pending writes to complete before cleanup
    await store.flush();
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('append', () => {
    it('adds entry to memory buffer', () => {
      store.append('shell-1', 'output', 'hello');

      const entries = store.getFromMemory('shell-1');
      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe('output');
      expect(entries[0].data).toBe('hello');
      expect(entries[0].ts).toBeDefined();
    });

    it('adds both input and output entries', () => {
      store.append('shell-1', 'output', 'prompt> ');
      store.append('shell-1', 'input', 'ls\n');
      store.append('shell-1', 'output', 'file1.txt\nfile2.txt\n');

      const entries = store.getFromMemory('shell-1');
      expect(entries).toHaveLength(3);
      expect(entries[0].type).toBe('output');
      expect(entries[1].type).toBe('input');
      expect(entries[2].type).toBe('output');
    });

    it('keeps entries separate per shell', () => {
      store.append('shell-1', 'output', 'shell 1 output');
      store.append('shell-2', 'output', 'shell 2 output');

      expect(store.getFromMemory('shell-1')).toHaveLength(1);
      expect(store.getFromMemory('shell-2')).toHaveLength(1);
      expect(store.getFromMemory('shell-1')[0].data).toBe('shell 1 output');
      expect(store.getFromMemory('shell-2')[0].data).toBe('shell 2 output');
    });

    it('trims memory buffer when exceeding maxMemoryEntries', () => {
      const smallStore = new ScrollbackStore({
        directory: tempDir,
        maxMemoryEntries: 5,
      });

      for (let i = 0; i < 10; i++) {
        smallStore.append('shell-1', 'output', `entry ${String(i)}`);
      }

      const entries = smallStore.getFromMemory('shell-1');
      expect(entries).toHaveLength(5);
      expect(entries[0].data).toBe('entry 5');
      expect(entries[4].data).toBe('entry 9');
    });

    it('writes entries to disk asynchronously', async () => {
      store.append('shell-1', 'output', 'test data');

      // Wait for async write to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      const filePath = join(tempDir, 'shell-1.jsonl');
      const content = await readFile(filePath, 'utf-8');
      const entry = JSON.parse(content.trim()) as ScrollbackEntry;

      expect(entry.type).toBe('output');
      expect(entry.data).toBe('test data');
    });
  });

  describe('load', () => {
    it('loads entries from disk into memory', async () => {
      const filePath = join(tempDir, 'shell-1.jsonl');
      const entries = [
        { ts: '2024-01-01T00:00:00.000Z', type: 'output', data: 'line 1' },
        { ts: '2024-01-01T00:00:01.000Z', type: 'input', data: 'cmd\n' },
        { ts: '2024-01-01T00:00:02.000Z', type: 'output', data: 'line 2' },
      ];
      await writeFile(filePath, entries.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf-8');

      const loaded = await store.load('shell-1');

      expect(loaded).toHaveLength(3);
      expect(loaded[0].data).toBe('line 1');
      expect(loaded[1].data).toBe('cmd\n');
      expect(loaded[2].data).toBe('line 2');
    });

    it('returns existing memory buffer if already loaded', async () => {
      store.append('shell-1', 'output', 'memory entry');

      const loaded = await store.load('shell-1');

      expect(loaded).toHaveLength(1);
      expect(loaded[0].data).toBe('memory entry');
    });

    it('returns empty array for non-existent shell', async () => {
      const loaded = await store.load('nonexistent');
      expect(loaded).toEqual([]);
    });

    it('skips malformed JSON lines', async () => {
      const filePath = join(tempDir, 'shell-1.jsonl');
      const content = [
        '{"ts":"2024-01-01T00:00:00.000Z","type":"output","data":"valid"}',
        'not valid json',
        '{"ts":"2024-01-01T00:00:01.000Z","type":"output","data":"also valid"}',
      ].join('\n');
      await writeFile(filePath, content, 'utf-8');

      const loaded = await store.load('shell-1');

      expect(loaded).toHaveLength(2);
      expect(loaded[0].data).toBe('valid');
      expect(loaded[1].data).toBe('also valid');
    });

    it('trims loaded entries to maxMemoryEntries', async () => {
      const smallStore = new ScrollbackStore({
        directory: tempDir,
        maxMemoryEntries: 3,
      });

      const filePath = join(tempDir, 'shell-1.jsonl');
      const entries = Array.from({ length: 10 }, (_, i) => ({
        ts: `2024-01-01T00:00:0${String(i)}.000Z`,
        type: 'output',
        data: `entry ${String(i)}`,
      }));
      await writeFile(filePath, entries.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf-8');

      const loaded = await smallStore.load('shell-1');

      expect(loaded).toHaveLength(3);
      expect(loaded[0].data).toBe('entry 7');
      expect(loaded[2].data).toBe('entry 9');
    });
  });

  describe('getFromMemory', () => {
    it('returns empty array for unknown shell', () => {
      const entries = store.getFromMemory('unknown');
      expect(entries).toEqual([]);
    });

    it('returns current memory buffer', () => {
      store.append('shell-1', 'output', 'data');

      const entries = store.getFromMemory('shell-1');

      expect(entries).toHaveLength(1);
      expect(entries[0].data).toBe('data');
    });
  });

  describe('clear', () => {
    it('clears memory buffer', async () => {
      store.append('shell-1', 'output', 'data');

      await store.clear('shell-1');

      expect(store.getFromMemory('shell-1')).toEqual([]);
    });

    it('truncates disk file', async () => {
      store.append('shell-1', 'output', 'data');
      await new Promise((resolve) => setTimeout(resolve, 100));

      await store.clear('shell-1');

      const filePath = join(tempDir, 'shell-1.jsonl');
      const content = await readFile(filePath, 'utf-8');
      expect(content).toBe('');
    });

    it('does not throw for non-existent shell', async () => {
      await expect(store.clear('nonexistent')).resolves.toBeUndefined();
    });
  });

  describe('delete', () => {
    it('removes memory buffer and file', async () => {
      store.append('shell-1', 'output', 'data');
      await new Promise((resolve) => setTimeout(resolve, 100));

      await store.delete('shell-1');

      expect(store.getFromMemory('shell-1')).toEqual([]);

      const filePath = join(tempDir, 'shell-1.jsonl');
      await expect(readFile(filePath, 'utf-8')).rejects.toThrow();
    });

    it('does not throw for non-existent shell', async () => {
      await expect(store.delete('nonexistent')).resolves.toBeUndefined();
    });
  });

  describe('getOutputText', () => {
    it('returns concatenated output entries only', async () => {
      store.append('shell-1', 'output', 'prompt> ');
      store.append('shell-1', 'input', 'ls\n');
      store.append('shell-1', 'output', 'file1.txt\n');
      store.append('shell-1', 'output', 'file2.txt\n');

      const text = await store.getOutputText('shell-1');

      expect(text).toBe('prompt> file1.txt\nfile2.txt\n');
    });

    it('returns empty string for shell with no output', async () => {
      const text = await store.getOutputText('nonexistent');
      expect(text).toBe('');
    });

    it('loads from disk if not in memory', async () => {
      const filePath = join(tempDir, 'shell-1.jsonl');
      const entries = [
        { ts: '2024-01-01T00:00:00.000Z', type: 'output', data: 'output1' },
        { ts: '2024-01-01T00:00:01.000Z', type: 'input', data: 'cmd' },
        { ts: '2024-01-01T00:00:02.000Z', type: 'output', data: 'output2' },
      ];
      await writeFile(filePath, entries.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf-8');

      const text = await store.getOutputText('shell-1');

      expect(text).toBe('output1output2');
    });
  });

  describe('file rotation', () => {
    it('rotates file when exceeding maxFileSize', async () => {
      // Create a store with very small max file size
      const smallStore = new ScrollbackStore({
        directory: tempDir,
        maxFileSize: 200, // 200 bytes
        maxMemoryEntries: 1000,
      });

      // Write enough data to exceed the limit
      for (let i = 0; i < 10; i++) {
        smallStore.append('shell-1', 'output', `This is entry number ${String(i)} with some padding text\n`);
      }

      // Wait for async writes
      await new Promise((resolve) => setTimeout(resolve, 200));

      // File should have been rotated (keeping only last half)
      const filePath = join(tempDir, 'shell-1.jsonl');
      const content = await readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n').filter((l) => l.length > 0);

      // Should have fewer lines than originally written due to rotation
      expect(lines.length).toBeLessThan(10);
      expect(lines.length).toBeGreaterThan(0);
    });
  });
});
