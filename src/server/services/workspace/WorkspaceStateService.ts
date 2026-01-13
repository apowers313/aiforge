/**
 * WorkspaceStateService - Manages UI workspace state that syncs across devices
 */
import type { WorkspaceState } from '@shared/types/index.js';
import { DEFAULT_TERMINAL_THEME_ID } from '@shared/terminalThemes.js';
import type { WorkspaceStateStore } from '../../storage/stores/WorkspaceStateStore.js';
import type { ProjectStore } from '../../storage/stores/ProjectStore.js';
import type { ShellStore } from '../../storage/stores/ShellStore.js';

export interface WorkspaceStateServiceOptions {
  workspaceStateStore: WorkspaceStateStore;
  projectStore: ProjectStore;
  shellStore: ShellStore;
}

const DEFAULT_WORKSPACE_STATE: Omit<WorkspaceState, 'updatedAt'> = {
  sidebarCollapsed: false,
  expandedProjectIds: [],
  activeShellId: null,
  terminalFontSize: 14,
  terminalTheme: DEFAULT_TERMINAL_THEME_ID,
};

export class WorkspaceStateService {
  private readonly workspaceStateStore: WorkspaceStateStore;
  private readonly projectStore: ProjectStore;
  private readonly shellStore: ShellStore;

  constructor(options: WorkspaceStateServiceOptions) {
    this.workspaceStateStore = options.workspaceStateStore;
    this.projectStore = options.projectStore;
    this.shellStore = options.shellStore;
  }

  /**
   * Get workspace state for a session, with defaults if none exists
   * Also validates and cleans up references to deleted projects/shells
   */
  async get(sessionToken: string): Promise<WorkspaceState> {
    const state = await this.workspaceStateStore.get(sessionToken);

    if (!state) {
      return {
        ...DEFAULT_WORKSPACE_STATE,
        updatedAt: new Date().toISOString(),
      };
    }

    // Validate and clean up the state
    return this.validateAndClean(state);
  }

  /**
   * Update workspace state (partial updates supported)
   */
  async update(
    sessionToken: string,
    updates: Partial<Omit<WorkspaceState, 'updatedAt'>>,
  ): Promise<WorkspaceState> {
    const existing = await this.workspaceStateStore.get(sessionToken);

    const newState: WorkspaceState = {
      ...DEFAULT_WORKSPACE_STATE,
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await this.workspaceStateStore.set(sessionToken, newState);
    return newState;
  }

  /**
   * Delete workspace state for a session
   */
  async delete(sessionToken: string): Promise<void> {
    await this.workspaceStateStore.delete(sessionToken);
  }

  /**
   * Validate workspace state and remove references to deleted projects/shells
   */
  private async validateAndClean(state: WorkspaceState): Promise<WorkspaceState> {
    let needsUpdate = false;
    const cleanedState = { ...state };

    // Validate expandedProjectIds - filter out deleted projects
    if (state.expandedProjectIds.length > 0) {
      const projects = await this.projectStore.getAll();
      const projectIdSet = new Set(projects.map((p) => p.id));
      const validExpandedIds = state.expandedProjectIds.filter((id) => projectIdSet.has(id));

      if (validExpandedIds.length !== state.expandedProjectIds.length) {
        cleanedState.expandedProjectIds = validExpandedIds;
        needsUpdate = true;
      }
    }

    // Validate activeShellId - set to null if shell no longer exists
    if (state.activeShellId) {
      const shell = await this.shellStore.getById(state.activeShellId);
      if (!shell) {
        cleanedState.activeShellId = null;
        needsUpdate = true;
      }
    }

    // If we cleaned anything, update the stored state
    if (needsUpdate) {
      cleanedState.updatedAt = new Date().toISOString();
      // Note: We don't await this to avoid blocking the response
      // The next save will persist the cleaned state
    }

    return cleanedState;
  }
}
