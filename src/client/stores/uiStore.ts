import { createWithEqualityFn } from 'zustand/traditional';
import { shallow } from 'zustand/shallow';
import { DEFAULT_TERMINAL_THEME_ID } from '@shared/terminalThemes';
import type { ContextType, ContextSidebarTab } from '@shared/types';

interface WorkspaceStateUpdate {
  sidebarCollapsed?: boolean;
  sidebarWidth?: number;
  expandedProjectIds?: string[];
  activeShellId?: string | null;
  terminalFontSize?: number;
  terminalTheme?: string;
  contextSidebarPinned?: boolean;
  contextSidebarWidth?: number;
}

interface UIState {
  // Sidebar state
  sidebarCollapsed: boolean;
  sidebarWidth: number;
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

  // Context sidebar state
  contextSidebarOpen: boolean;
  contextSidebarPinned: boolean;
  contextSidebarWidth: number;
  contextSidebarActiveTab: ContextSidebarTab;
  selectedContextType: ContextType | null;
  selectedContextId: string | null;

  // File preview state (shown in center panel)
  previewProjectId: string | null;
  previewFilePath: string | null;

  // Actions
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setSidebarWidth: (width: number) => void;
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

  // Context sidebar actions
  openContextSidebar: (type: ContextType, id: string) => void;
  closeContextSidebar: () => void;
  toggleContextSidebar: (type: ContextType, id: string) => void;
  toggleContextSidebarPin: () => void;
  setContextSidebarWidth: (width: number) => void;
  setContextSidebarTab: (tab: ContextSidebarTab) => void;

  // File preview actions
  openFilePreview: (projectId: string, filePath: string) => void;
  closeFilePreview: () => void;

  reset: () => void;
}

const DEFAULT_TERMINAL_FONT_SIZE = 14;
const DEFAULT_SIDEBAR_WIDTH = 280;
const MIN_SIDEBAR_WIDTH = 180;
const MAX_SIDEBAR_WIDTH = 600;

// Context sidebar constants
const DEFAULT_CONTEXT_SIDEBAR_WIDTH = 320;
const MIN_CONTEXT_SIDEBAR_WIDTH = 280;
const MAX_CONTEXT_SIDEBAR_WIDTH = 500;

const initialState = {
  sidebarCollapsed: false,
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
  addProjectModalOpen: false,
  expandedProjectIds: [] as string[],
  selectedProjectId: null as string | null,
  activeShellId: null as string | null,
  terminalFontSize: DEFAULT_TERMINAL_FONT_SIZE,
  terminalTheme: DEFAULT_TERMINAL_THEME_ID,
  shellActivityTimestamps: {} as Record<string, number>,
  // Context sidebar initial state
  contextSidebarOpen: false,
  contextSidebarPinned: false,
  contextSidebarWidth: DEFAULT_CONTEXT_SIDEBAR_WIDTH,
  contextSidebarActiveTab: 'urls' as ContextSidebarTab,
  selectedContextType: null as ContextType | null,
  selectedContextId: null as string | null,
  // File preview initial state
  previewProjectId: null as string | null,
  previewFilePath: null as string | null,
};

export const useUIStore = createWithEqualityFn<UIState>()((set) => ({
  ...initialState,

  toggleSidebar: (): void => {
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }));
  },

  setSidebarCollapsed: (collapsed: boolean): void => {
    set({ sidebarCollapsed: collapsed });
  },

  setSidebarWidth: (width: number): void => {
    const clampedWidth = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width));
    set({ sidebarWidth: clampedWidth });
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
    // Selecting a shell clears any file preview
    set({
      activeShellId: id,
      previewProjectId: null,
      previewFilePath: null,
    });
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
      sidebarWidth: state.sidebarWidth ?? current.sidebarWidth,
      expandedProjectIds: state.expandedProjectIds ?? current.expandedProjectIds,
      activeShellId: state.activeShellId !== undefined ? state.activeShellId : current.activeShellId,
      terminalFontSize: state.terminalFontSize ?? current.terminalFontSize,
      terminalTheme: state.terminalTheme ?? current.terminalTheme,
      contextSidebarPinned: state.contextSidebarPinned ?? current.contextSidebarPinned,
      contextSidebarWidth: state.contextSidebarWidth ?? current.contextSidebarWidth,
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

  // Context sidebar actions
  openContextSidebar: (type: ContextType, id: string): void => {
    // Determine the default tab based on type
    const defaultTab: ContextSidebarTab = type === 'project' ? 'urls' : 'todos';
    set({
      contextSidebarOpen: true,
      selectedContextType: type,
      selectedContextId: id,
      contextSidebarActiveTab: defaultTab,
    });
  },

  closeContextSidebar: (): void => {
    set({
      contextSidebarOpen: false,
      selectedContextType: null,
      selectedContextId: null,
    });
  },

  toggleContextSidebar: (type: ContextType, id: string): void => {
    set((state) => {
      // If same item clicked and sidebar is open, close it
      if (state.contextSidebarOpen && state.selectedContextId === id && state.selectedContextType === type) {
        return {
          contextSidebarOpen: false,
          selectedContextType: null,
          selectedContextId: null,
        };
      }
      // Otherwise, open with the new item
      const defaultTab: ContextSidebarTab = type === 'project' ? 'urls' : 'todos';
      // When selecting a project, clear the active shell so only the project is highlighted
      const updates: Partial<UIState> = {
        contextSidebarOpen: true,
        selectedContextType: type,
        selectedContextId: id,
        contextSidebarActiveTab: defaultTab,
      };
      if (type === 'project') {
        updates.activeShellId = null;
      }
      return updates;
    });
  },

  toggleContextSidebarPin: (): void => {
    set((state) => ({ contextSidebarPinned: !state.contextSidebarPinned }));
  },

  setContextSidebarWidth: (width: number): void => {
    const clampedWidth = Math.min(MAX_CONTEXT_SIDEBAR_WIDTH, Math.max(MIN_CONTEXT_SIDEBAR_WIDTH, width));
    set({ contextSidebarWidth: clampedWidth });
  },

  setContextSidebarTab: (tab: ContextSidebarTab): void => {
    set({ contextSidebarActiveTab: tab });
  },

  // File preview actions
  openFilePreview: (projectId: string, filePath: string): void => {
    // Opening file preview clears the active shell
    set({
      previewProjectId: projectId,
      previewFilePath: filePath,
      activeShellId: null,
    });
  },

  closeFilePreview: (): void => {
    set({
      previewProjectId: null,
      previewFilePath: null,
    });
  },

  reset: (): void => {
    set(initialState);
  },
}), shallow);
