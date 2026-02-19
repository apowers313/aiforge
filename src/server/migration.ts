/**
 * Data migrations for AIForge.
 *
 * - migrateFromLegacyPaths: ~/.aiforge/ -> XDG Base Directory layout
 * - migrateProjectIdsToV5: random UUIDs -> deterministic UUIDv5 based on path
 */
import { existsSync } from 'node:fs';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { logger } from './utils/logger.js';
import { projectIdFromPath } from './utils/projectId.js';

/**
 * Migrate data and config from the legacy ~/.aiforge/ layout to XDG paths.
 *
 * - Data: ~/.aiforge/data/ -> ~/.local/share/aiforge/ (or $XDG_DATA_HOME/aiforge/)
 * - Config: ~/.aiforge/config.json -> ~/.config/aiforge/config.json (or $XDG_CONFIG_HOME/aiforge/)
 *
 * Skips data migration if AIFORGE_DATA_DIR is explicitly set (custom override).
 * Skips any migration if the new path already exists (never overwrites).
 *
 * @param home - Override home directory (used for testing). Defaults to os.homedir().
 */
export async function migrateFromLegacyPaths(home?: string): Promise<void> {
  const homeDir = home ?? homedir();
  const legacyDataDir = join(homeDir, '.aiforge', 'data');
  const legacyConfigFile = join(homeDir, '.aiforge', 'config.json');

  // Skip data migration if AIFORGE_DATA_DIR is explicitly set
  if (!process.env.AIFORGE_DATA_DIR) {
    const xdgData = process.env.XDG_DATA_HOME;
    const dataBase = xdgData && xdgData.length > 0
      ? xdgData
      : join(homeDir, '.local', 'share');
    const newDataDir = join(dataBase, 'aiforge');

    if (existsSync(legacyDataDir) && !existsSync(newDataDir)) {
      await mkdir(dirname(newDataDir), { recursive: true });
      await rename(legacyDataDir, newDataDir);
      logger.info('Migrated data from %s to %s', legacyDataDir, newDataDir);
    }
  }

  // Migrate config
  const xdgConfig = process.env.XDG_CONFIG_HOME;
  const configBase = xdgConfig && xdgConfig.length > 0
    ? xdgConfig
    : join(homeDir, '.config');
  const newConfigPath = join(configBase, 'aiforge', 'config.json');

  if (existsSync(legacyConfigFile) && !existsSync(newConfigPath)) {
    await mkdir(dirname(newConfigPath), { recursive: true });
    await rename(legacyConfigFile, newConfigPath);
    logger.info('Migrated config from %s to %s', legacyConfigFile, newConfigPath);
  }
}

// ---- helpers for JSON file migration ----

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  if (!existsSync(filePath)) {
    return null;
  }
  const raw = await readFile(filePath, 'utf-8');
  return JSON.parse(raw) as T;
}

async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// ---- types mirroring the JSON store shapes (migration-local) ----

interface MigrationProject {
  id: string;
  path: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

interface ProjectsFile {
  version: number;
  projects: MigrationProject[];
}

interface ShellsFile {
  version: number;
  shells: { id: string; projectId: string; [key: string]: unknown }[];
  shellCounter: number;
}

interface WorkspaceStatesFile {
  version: number;
  states: Record<string, { expandedProjectIds?: string[]; [key: string]: unknown }>;
}

/**
 * Migrate project IDs from random UUIDs to deterministic UUIDv5 derived from path.
 *
 * Re-keys all project-keyed data across every JSON store so existing TODOs,
 * URLs, shells, and workspace state continue to reference the correct project.
 *
 * Idempotent: if all IDs already match their deterministic value, no writes occur.
 *
 * @param dataDir - The AIForge data directory containing JSON stores.
 */
export async function migrateProjectIdsToV5(dataDir: string): Promise<void> {
  const projectsPath = join(dataDir, 'projects.json');
  const projectsFile = await readJsonFile<ProjectsFile>(projectsPath);
  if (!projectsFile || projectsFile.projects.length === 0) {
    return;
  }

  // Build remap: oldId -> newId (only for IDs that actually change)
  const remap = new Map<string, string>();
  for (const project of projectsFile.projects) {
    const newId = projectIdFromPath(project.path);
    if (project.id !== newId) {
      remap.set(project.id, newId);
    }
  }

  if (remap.size === 0) {
    return; // Already migrated
  }

  logger.info({ count: remap.size }, 'Migrating project IDs to deterministic UUIDv5');

  // 1. Update projects.json
  for (const project of projectsFile.projects) {
    const newId = remap.get(project.id);
    if (newId) {
      project.id = newId;
    }
  }
  await writeJsonFile(projectsPath, projectsFile);

  // 2. Re-key project-context.json (Record<projectId, contextData>)
  const contextPath = join(dataDir, 'project-context.json');
  const contextData = await readJsonFile<Record<string, unknown>>(contextPath);
  if (contextData) {
    let changed = false;
    const newContext: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(contextData)) {
      const newKey = remap.get(key) ?? key;
      if (newKey !== key) {
        changed = true;
      }
      newContext[newKey] = value;
    }
    if (changed) {
      await writeJsonFile(contextPath, newContext);
    }
  }

  // 3. Re-key project-urls.json (Record<projectId, urls[]>)
  const urlsPath = join(dataDir, 'project-urls.json');
  const urlsData = await readJsonFile<Record<string, unknown>>(urlsPath);
  if (urlsData) {
    let changed = false;
    const newUrls: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(urlsData)) {
      const newKey = remap.get(key) ?? key;
      if (newKey !== key) {
        changed = true;
      }
      newUrls[newKey] = value;
    }
    if (changed) {
      await writeJsonFile(urlsPath, newUrls);
    }
  }

  // 4. Update shells.json -- remap Shell.projectId
  const shellsPath = join(dataDir, 'shells.json');
  const shellsFile = await readJsonFile<ShellsFile>(shellsPath);
  if (shellsFile) {
    let changed = false;
    for (const shell of shellsFile.shells) {
      const newId = remap.get(shell.projectId);
      if (newId) {
        shell.projectId = newId;
        changed = true;
      }
    }
    if (changed) {
      await writeJsonFile(shellsPath, shellsFile);
    }
  }

  // 5. Update workspace-states.json -- remap expandedProjectIds arrays
  const wsPath = join(dataDir, 'workspace-states.json');
  const wsFile = await readJsonFile<WorkspaceStatesFile>(wsPath);
  if (wsFile) {
    let changed = false;
    for (const state of Object.values(wsFile.states)) {
      if (state.expandedProjectIds) {
        const oldIds = state.expandedProjectIds;
        const newIds = oldIds.map((id) => remap.get(id) ?? id);
        if (newIds.some((id, i) => id !== oldIds[i])) {
          state.expandedProjectIds = newIds;
          changed = true;
        }
      }
    }
    if (changed) {
      await writeJsonFile(wsPath, wsFile);
    }
  }

  for (const [oldId, newId] of remap) {
    logger.info({ oldId, newId }, 'Remapped project ID');
  }
}
