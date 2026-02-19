/**
 * Tests for legacy data migration
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';

// Mock logger to avoid config dependency in tests
vi.mock('@server/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { migrateFromLegacyPaths, migrateProjectIdsToV5 } from '@server/migration.js';
import { projectIdFromPath } from '@server/utils/projectId.js';

describe('migrateFromLegacyPaths', () => {
  let tempDir: string;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'migration-test-'));
    // Clear env vars that affect path resolution
    delete process.env.AIFORGE_DATA_DIR;
    delete process.env.XDG_DATA_HOME;
    delete process.env.XDG_CONFIG_HOME;
  });

  afterEach(async () => {
    process.env = { ...originalEnv };
    await rm(tempDir, { recursive: true, force: true });
  });

  it('migrates data from ~/.aiforge/data/ to XDG data dir', async () => {
    const legacyDir = join(tempDir, '.aiforge', 'data');
    await mkdir(legacyDir, { recursive: true });
    await writeFile(join(legacyDir, 'projects.json'), '[]');

    const newDataDir = join(tempDir, '.local', 'share', 'aiforge');

    await migrateFromLegacyPaths(tempDir);

    expect(existsSync(join(newDataDir, 'projects.json'))).toBe(true);
    expect(existsSync(legacyDir)).toBe(false);
  });

  it('migrates config.json to XDG config dir', async () => {
    const legacyConfig = join(tempDir, '.aiforge', 'config.json');
    await mkdir(join(tempDir, '.aiforge'), { recursive: true });
    await writeFile(legacyConfig, '{"port": 9042}');

    const newConfig = join(tempDir, '.config', 'aiforge', 'config.json');

    await migrateFromLegacyPaths(tempDir);

    expect(existsSync(newConfig)).toBe(true);
    const content = await readFile(newConfig, 'utf-8');
    expect(JSON.parse(content)).toEqual({ port: 9042 });
  });

  it('skips migration if new paths already exist', async () => {
    // Both old and new exist -- don't overwrite new
    const legacyDir = join(tempDir, '.aiforge', 'data');
    await mkdir(legacyDir, { recursive: true });
    await writeFile(join(legacyDir, 'projects.json'), '["old"]');

    const newDataDir = join(tempDir, '.local', 'share', 'aiforge');
    await mkdir(newDataDir, { recursive: true });
    await writeFile(join(newDataDir, 'projects.json'), '["new"]');

    await migrateFromLegacyPaths(tempDir);

    // New data should be untouched
    const content = await readFile(join(newDataDir, 'projects.json'), 'utf-8');
    expect(JSON.parse(content)).toEqual(['new']);
  });

  it('skips migration if legacy paths do not exist', async () => {
    // No legacy, no new -- nothing to migrate, should not throw
    await migrateFromLegacyPaths(tempDir);
  });

  it('skips migration when AIFORGE_DATA_DIR is set', async () => {
    process.env.AIFORGE_DATA_DIR = '/custom/path';
    const legacyDir = join(tempDir, '.aiforge', 'data');
    await mkdir(legacyDir, { recursive: true });

    await migrateFromLegacyPaths(tempDir);

    // Legacy should still exist (not moved)
    expect(existsSync(legacyDir)).toBe(true);
  });

  it('migrates both data and config in a single call', async () => {
    // Create both legacy data and config
    const legacyDir = join(tempDir, '.aiforge', 'data');
    await mkdir(legacyDir, { recursive: true });
    await writeFile(join(legacyDir, 'shells.json'), '[]');

    const legacyConfig = join(tempDir, '.aiforge', 'config.json');
    await writeFile(legacyConfig, '{"host": "localhost"}');

    await migrateFromLegacyPaths(tempDir);

    // Both should be migrated
    const newDataDir = join(tempDir, '.local', 'share', 'aiforge');
    const newConfig = join(tempDir, '.config', 'aiforge', 'config.json');

    expect(existsSync(join(newDataDir, 'shells.json'))).toBe(true);
    expect(existsSync(newConfig)).toBe(true);
  });

  it('skips config migration if new config already exists', async () => {
    // Legacy config exists, but new config also exists
    await mkdir(join(tempDir, '.aiforge'), { recursive: true });
    await writeFile(join(tempDir, '.aiforge', 'config.json'), '{"port": 1111}');

    const newConfigDir = join(tempDir, '.config', 'aiforge');
    await mkdir(newConfigDir, { recursive: true });
    await writeFile(join(newConfigDir, 'config.json'), '{"port": 2222}');

    await migrateFromLegacyPaths(tempDir);

    // New config should be untouched
    const content = await readFile(join(newConfigDir, 'config.json'), 'utf-8');
    expect(JSON.parse(content)).toEqual({ port: 2222 });
  });

  it('creates parent directories for new paths during migration', async () => {
    // Legacy data exists, but the entire .local/share/ tree does not
    const legacyDir = join(tempDir, '.aiforge', 'data');
    await mkdir(legacyDir, { recursive: true });
    await writeFile(join(legacyDir, 'projects.json'), '["test"]');

    // .local/share/ doesn't exist yet
    expect(existsSync(join(tempDir, '.local'))).toBe(false);

    await migrateFromLegacyPaths(tempDir);

    const newDataDir = join(tempDir, '.local', 'share', 'aiforge');
    expect(existsSync(join(newDataDir, 'projects.json'))).toBe(true);
  });
});

// ---- migrateProjectIdsToV5 ----

describe('migrateProjectIdsToV5', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'v5-migration-test-'));
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  function writeJson(name: string, data: unknown): Promise<void> {
    return writeFile(join(dataDir, name), JSON.stringify(data, null, 2), 'utf-8');
  }

  async function readJson<T>(name: string): Promise<T> {
    const raw = await readFile(join(dataDir, name), 'utf-8');
    return JSON.parse(raw) as T;
  }

  it('remaps project IDs from random UUIDs to deterministic v5', async () => {
    const oldId = '00000000-0000-0000-0000-000000000001';
    const path = '/home/user/my-project';
    const expectedId = projectIdFromPath(path);

    await writeJson('projects.json', {
      version: 1,
      projects: [{ id: oldId, path, name: 'my-project', createdAt: '', updatedAt: '' }],
    });

    await migrateProjectIdsToV5(dataDir);

    const result = await readJson<{ projects: { id: string }[] }>('projects.json');
    const project = result.projects[0];
    expect(project?.id).toBe(expectedId);
    expect(project?.id).not.toBe(oldId);
  });

  it('re-keys project-context.json entries', async () => {
    const oldId = 'aaaa-bbbb';
    const path = '/home/user/ctx-project';
    const expectedId = projectIdFromPath(path);

    await writeJson('projects.json', {
      version: 1,
      projects: [{ id: oldId, path, name: 'ctx', createdAt: '', updatedAt: '' }],
    });
    await writeJson('project-context.json', {
      [oldId]: { todos: [{ id: 't1', text: 'do it' }], notes: 'hello' },
    });

    await migrateProjectIdsToV5(dataDir);

    const ctx = await readJson<Record<string, unknown>>('project-context.json');
    expect(ctx[expectedId]).toBeDefined();
    expect(ctx[oldId]).toBeUndefined();
  });

  it('re-keys project-urls.json entries', async () => {
    const oldId = 'aaaa-cccc';
    const path = '/home/user/urls-project';
    const expectedId = projectIdFromPath(path);

    await writeJson('projects.json', {
      version: 1,
      projects: [{ id: oldId, path, name: 'urls', createdAt: '', updatedAt: '' }],
    });
    await writeJson('project-urls.json', {
      [oldId]: [{ id: 'u1', name: 'Docs', url: 'https://example.com' }],
    });

    await migrateProjectIdsToV5(dataDir);

    const urls = await readJson<Record<string, unknown>>('project-urls.json');
    expect(urls[expectedId]).toBeDefined();
    expect(urls[oldId]).toBeUndefined();
  });

  it('updates Shell.projectId in shells.json', async () => {
    const oldId = 'aaaa-dddd';
    const path = '/home/user/shell-project';
    const expectedId = projectIdFromPath(path);

    await writeJson('projects.json', {
      version: 1,
      projects: [{ id: oldId, path, name: 'shells', createdAt: '', updatedAt: '' }],
    });
    await writeJson('shells.json', {
      version: 1,
      shells: [{ id: 's1', projectId: oldId, name: 'bash-1' }],
      shellCounter: 1,
    });

    await migrateProjectIdsToV5(dataDir);

    const shells = await readJson<{ shells: { projectId: string }[] }>('shells.json');
    expect(shells.shells[0]?.projectId).toBe(expectedId);
  });

  it('updates expandedProjectIds in workspace-states.json', async () => {
    const oldId = 'aaaa-eeee';
    const path = '/home/user/ws-project';
    const expectedId = projectIdFromPath(path);

    await writeJson('projects.json', {
      version: 1,
      projects: [{ id: oldId, path, name: 'ws', createdAt: '', updatedAt: '' }],
    });
    await writeJson('workspace-states.json', {
      version: 1,
      states: {
        'session-1': { expandedProjectIds: [oldId, 'unrelated-id'], sidebarCollapsed: false },
      },
    });

    await migrateProjectIdsToV5(dataDir);

    const ws = await readJson<{ states: Record<string, { expandedProjectIds: string[] }> }>('workspace-states.json');
    const ids = ws.states['session-1']?.expandedProjectIds;
    expect(ids).toContain(expectedId);
    expect(ids).toContain('unrelated-id'); // not remapped
    expect(ids).not.toContain(oldId);
  });

  it('leaves already-migrated data unchanged', async () => {
    const path = '/home/user/already-done';
    const deterministicId = projectIdFromPath(path);

    await writeJson('projects.json', {
      version: 1,
      projects: [{ id: deterministicId, path, name: 'done', createdAt: '', updatedAt: '' }],
    });

    await migrateProjectIdsToV5(dataDir);

    const result = await readJson<{ projects: { id: string }[] }>('projects.json');
    expect(result.projects[0]?.id).toBe(deterministicId);
  });

  it('handles missing projects.json gracefully', async () => {
    // No files at all -- should not throw
    await migrateProjectIdsToV5(dataDir);
  });

  it('handles empty projects array gracefully', async () => {
    await writeJson('projects.json', { version: 1, projects: [] });
    await migrateProjectIdsToV5(dataDir);
  });

  it('handles missing secondary files gracefully', async () => {
    const oldId = 'aaaa-ffff';
    const path = '/home/user/no-secondary';

    await writeJson('projects.json', {
      version: 1,
      projects: [{ id: oldId, path, name: 'solo', createdAt: '', updatedAt: '' }],
    });
    // No project-context.json, project-urls.json, shells.json, or workspace-states.json

    await migrateProjectIdsToV5(dataDir);

    const result = await readJson<{ projects: { id: string }[] }>('projects.json');
    expect(result.projects[0]?.id).toBe(projectIdFromPath(path));
  });

  it('migrates multiple projects at once', async () => {
    const projects = [
      { id: 'old-1', path: '/home/user/proj-a', name: 'a', createdAt: '', updatedAt: '' },
      { id: 'old-2', path: '/home/user/proj-b', name: 'b', createdAt: '', updatedAt: '' },
    ];

    await writeJson('projects.json', { version: 1, projects });
    await writeJson('shells.json', {
      version: 1,
      shells: [
        { id: 's1', projectId: 'old-1', name: 'bash-1' },
        { id: 's2', projectId: 'old-2', name: 'bash-2' },
      ],
      shellCounter: 2,
    });

    await migrateProjectIdsToV5(dataDir);

    const result = await readJson<{ projects: { id: string; path: string }[] }>('projects.json');
    for (const p of result.projects) {
      expect(p.id).toBe(projectIdFromPath(p.path));
    }

    const shells = await readJson<{ shells: { projectId: string }[] }>('shells.json');
    expect(shells.shells[0]?.projectId).toBe(projectIdFromPath('/home/user/proj-a'));
    expect(shells.shells[1]?.projectId).toBe(projectIdFromPath('/home/user/proj-b'));
  });
});
