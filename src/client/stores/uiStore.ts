import { createWithEqualityFn } from 'zustand/traditional';
import { shallow } from 'zustand/shallow';
import { DEFAULT_TERMINAL_THEME_ID } from '@shared/terminalThemes';

interface WorkspaceStateUpdate {
  sidebarCollapsed?: boolean;
  expandedProjectIds?: string[];
  activeShellId?: string | null;
  terminalFontSize?: number;
  terminalTheme?: string;
}

interface UIState {
  // Sidebar state
  sidebarCollapsed: boolean;
  expandedProjectIds: string[];

  // Modal state
  addProjectModalOpen: boolean;

  // Selection state (UI-only, no server sync needed)
  selectedProjectId: string | null;
  activeShellId: string | null;

  // Terminal settings
  terminalFontSize: number;
  terminalTheme: string;

  // Shell activity tracking (for AI shell activity indicator)
  // Maps shellId -> timestamp of last activity (input or output)
  shellActivityTimestamps: Record<string, number>;

  // Actions
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  openAddProjectModal: () => void;
  closeAddProjectModal: () => void;
  toggleProjectExpanded: (projectId: string) => void;
  setProjectExpanded: (projectId: string, expanded: boolean) => void;
  setSelectedProject: (id: string | null) => void;
  setActiveShell: (id: string | null) => void;
  setTerminalFontSize: (size: number) => void;
  setTerminalTheme: (themeId: string) => void;
  setWorkspaceState: (state: WorkspaceStateUpdate) => void;
  recordShellActivity: (shellId: string) => void;
  getShellActivityTimestamp: (shellId: string) => number | undefined;
  reset: () => void;
}

const DEFAULT_TERMINAL_FONT_SIZE = 14;

const initialState = {
  sidebarCollapsed: false,
  addProjectModalOpen: false,
  expandedProjectIds: [] as string[],
  selectedProjectId: null as string | null,
  activeShellId: null as string | null,
  terminalFontSize: DEFAULT_TERMINAL_FONT_SIZE,
  terminalTheme: DEFAULT_TERMINAL_THEME_ID,
  shellActivityTimestamps: {} as Record<string, number>,
};

export const useUIStore = createWithEqualityFn<UIState>()((set) => ({
  ...initialState,

  toggleSidebar: (): void => {
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }));
  },

  setSidebarCollapsed: (collapsed: boolean): void => {
    set({ sidebarCollapsed: collapsed });
  },

  openAddProjectModal: (): void => {
    set({ addProjectModalOpen: true });
  },

  closeAddProjectModal: (): void => {
    set({ addProjectModalOpen: false });
  },

  toggleProjectExpanded: (projectId: string): void => {
    set((state) => {
      const index = state.expandedProjectIds.indexOf(projectId);
      if (index >= 0) {
        return {
          expandedProjectIds: state.expandedProjectIds.filter((id) => id !== projectId),
        };
      }
      return {
        expandedProjectIds: [...state.expandedProjectIds, projectId],
      };
    });
  },

  setProjectExpanded: (projectId: string, expanded: boolean): void => {
    set((state) => {
      const isCurrentlyExpanded = state.expandedProjectIds.includes(projectId);
      if (expanded && !isCurrentlyExpanded) {
        return {
          expandedProjectIds: [...state.expandedProjectIds, projectId],
        };
      }
      if (!expanded && isCurrentlyExpanded) {
        return {
          expandedProjectIds: state.expandedProjectIds.filter((id) => id !== projectId),
        };
      }
      return {};
    });
  },

  setSelectedProject: (id: string | null): void => {
    set({ selectedProjectId: id });
  },

  setActiveShell: (id: string | null): void => {
    set({ activeShellId: id });
  },

  setTerminalFontSize: (size: number): void => {
    set({ terminalFontSize: size });
  },

  setTerminalTheme: (themeId: string): void => {
    set({ terminalTheme: themeId });
  },

  setWorkspaceState: (state: WorkspaceStateUpdate): void => {
    set((current) => ({
      sidebarCollapsed: state.sidebarCollapsed ?? current.sidebarCollapsed,
      expandedProjectIds: state.expandedProjectIds ?? current.expandedProjectIds,
      activeShellId: state.activeShellId !== undefined ? state.activeShellId : current.activeShellId,
      terminalFontSize: state.terminalFontSize ?? current.terminalFontSize,
      terminalTheme: state.terminalTheme ?? current.terminalTheme,
    }));
  },

  recordShellActivity: (shellId: string): void => {
    set((state) => ({
      shellActivityTimestamps: {
        ...state.shellActivityTimestamps,
        [shellId]: Date.now(),
      },
    }));
  },

  getShellActivityTimestamp: (shellId: string): number | undefined => {
    // This is a selector, not an action - but zustand allows it
    return useUIStore.getState().shellActivityTimestamps[shellId];
  },

  reset: (): void => {
    set(initialState);
  },
}), shallow);
