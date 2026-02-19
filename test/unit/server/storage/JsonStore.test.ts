/**
 * Tests for JsonStore - Generic JSON file store with atomic writes
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { JsonStore } from '@server/storage/JsonStore.js';

interface TestData {
  version: number;
  items: { id: string }[];
}

describe('JsonStore', () => {
  let tempDir: string;
  let store: JsonStore<TestData>;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'jsonstore-test-'));
    store = new JsonStore<TestData>({
      filePath: join(tempDir, 'test.json'),
      defaultValue: { version: 1, items: [] },
    });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('creates file with default value if not exists', async () => {
    const data = await store.read();
    expect(data.items).toEqual([]);
  });

  it('persists data across reads', async () => {
    await store.write({ version: 1, items: [{ id: '1' }] });
    const data = await store.read();
    expect(data.items).toHaveLength(1);
  });

  it('performs atomic writes', async () => {
    // Verify no .tmp files left behind
    await store.write({ version: 1, items: [{ id: '1' }] });
    const files = await readdir(tempDir);
    expect(files).toEqual(['test.json']);
  });

  it('handles concurrent updates with locking', async () => {
    const updates = Array(10).fill(null).map((_, i) =>
      store.update((data) => ({
        version: 1,
        items: [...data.items, { id: String(i) }],
      })),
    );
    await Promise.all(updates);
    const data = await store.read();
    expect(data.items).toHaveLength(10);
  }, 15000);

  it('handles update function correctly', async () => {
    await store.update((data) => ({
      ...data,
      items: [...data.items, { id: 'first' }],
    }));

    await store.update((data) => ({
      ...data,
      items: [...data.items, { id: 'second' }],
    }));

    const data = await store.read();
    expect(data.items).toHaveLength(2);
    expect(data.items[0]?.id).toBe('first');
    expect(data.items[1]?.id).toBe('second');
  });

  it('creates parent directories if they do not exist', async () => {
    const nestedStore = new JsonStore<TestData>({
      filePath: join(tempDir, 'nested', 'deep', 'test.json'),
      defaultValue: { version: 1, items: [] },
    });

    await nestedStore.write({ version: 1, items: [{ id: 'nested' }] });
    const data = await nestedStore.read();
    expect(data.items).toHaveLength(1);
  });
});
