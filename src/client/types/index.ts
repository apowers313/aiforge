// Re-export shared types for convenience
export type { Project, Shell, Session, ServerConfig } from '@shared/types';

// Client-specific types
export interface TerminalHistory {
  shellId: string;
  commands: string[];
  historyIndex: number;
}

export interface DirectoryBrowserState {
  currentPath: string;
  selectedPath: string | null;
}
