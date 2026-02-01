/**
 * Storage initialization and exports
 */
import { join } from 'node:path';
import { homedir } from 'node:os';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { ProjectStore } from './stores/ProjectStore.js';
import { ShellStore } from './stores/ShellStore.js';
import { SessionStore } from './stores/SessionStore.js';
import { WorkspaceStateStore } from './stores/WorkspaceStateStore.js';
import { ScrollbackStore } from './stores/ScrollbackStore.js';
import { ProjectUrlsStore } from './stores/ProjectUrlsStore.js';
import { ProjectContextStore } from './stores/ProjectContextStore.js';
import { WorktreeMetadataStore } from './stores/WorktreeMetadataStore.js';
import { WorktreeUrlsStore } from './stores/WorktreeUrlsStore.js';

export { JsonStore } from './JsonStore.js';
export { ProjectStore } from './stores/ProjectStore.js';
export { ShellStore } from './stores/ShellStore.js';
export { SessionStore } from './stores/SessionStore.js';
export { WorkspaceStateStore } from './stores/WorkspaceStateStore.js';
export { ScrollbackStore } from './stores/ScrollbackStore.js';
export { ProjectUrlsStore } from './stores/ProjectUrlsStore.js';
export { ProjectContextStore } from './stores/ProjectContextStore.js';
export { WorktreeMetadataStore } from './stores/WorktreeMetadataStore.js';
export { WorktreeUrlsStore } from './stores/WorktreeUrlsStore.js';

export interface Storage {
  projects: ProjectStore;
  shells: ShellStore;
  sessions: SessionStore;
  workspaceStates: WorkspaceStateStore;
  scrollback: ScrollbackStore;
  projectUrls: ProjectUrlsStore;
  projectContext: ProjectContextStore;
  worktreeMetadata: WorktreeMetadataStore;
  worktreeUrls: WorktreeUrlsStore;
}

/**
 * Get the data directory path
 * Configurable via AIFORGE_DATA_DIR environment variable for test isolation
 */
export function getDataDir(): string {
  return process.env.AIFORGE_DATA_DIR ?? join(homedir(), '.aiforge', 'data');
}

/**
 * Initialize storage with default paths
 */
export async function initStorage(): Promise<Storage> {
  const dataDir = getDataDir();

  // Ensure data directory exists
  if (!existsSync(dataDir)) {
    await mkdir(dataDir, { recursive: true });
  }

  return {
    projects: new ProjectStore(join(dataDir, 'projects.json')),
    shells: new ShellStore(join(dataDir, 'shells.json')),
    sessions: new SessionStore(join(dataDir, 'sessions.json')),
    workspaceStates: new WorkspaceStateStore(join(dataDir, 'workspace-states.json')),
    scrollback: new ScrollbackStore({ directory: join(dataDir, 'scrollback') }),
    projectUrls: new ProjectUrlsStore(join(dataDir, 'project-urls.json')),
    projectContext: new ProjectContextStore(join(dataDir, 'project-context.json')),
    worktreeMetadata: new WorktreeMetadataStore(join(dataDir, 'worktree-metadata.json')),
    worktreeUrls: new WorktreeUrlsStore(join(dataDir, 'worktree-urls.json')),
  };
}

/**
 * Create storage with custom paths (useful for testing)
 */
export function createStorage(dataDir: string): Storage {
  return {
    projects: new ProjectStore(join(dataDir, 'projects.json')),
    shells: new ShellStore(join(dataDir, 'shells.json')),
    sessions: new SessionStore(join(dataDir, 'sessions.json')),
    workspaceStates: new WorkspaceStateStore(join(dataDir, 'workspace-states.json')),
    scrollback: new ScrollbackStore({ directory: join(dataDir, 'scrollback') }),
    projectUrls: new ProjectUrlsStore(join(dataDir, 'project-urls.json')),
    projectContext: new ProjectContextStore(join(dataDir, 'project-context.json')),
    worktreeMetadata: new WorktreeMetadataStore(join(dataDir, 'worktree-metadata.json')),
    worktreeUrls: new WorktreeUrlsStore(join(dataDir, 'worktree-urls.json')),
  };
}
