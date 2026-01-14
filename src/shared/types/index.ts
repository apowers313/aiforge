/**
 * Shared type definitions for AIForge
 * Used by both client and server
 */

// Project represents a directory being managed by AIForge
export interface Project {
  id: string;
  name: string;
  path: string;
  createdAt: string; // ISO 8601 date string
  updatedAt: string; // ISO 8601 date string
}

// Shell status
export type ShellStatus = 'inactive' | 'active' | 'error';

// Shell type - regular bash shell or AI shell
export type ShellType = 'bash' | 'ai';

// Shell represents a terminal session within a project
export interface Shell {
  id: string;
  projectId: string;
  name: string;
  cwd: string;
  status: ShellStatus;
  type: ShellType;
  pid: number | null;
  socketPath: string | null; // Unix socket path for persistent daemon (null if not using daemon)
  lastActivityAt: string | null; // ISO 8601 date string - when shell last had input or output
  done: boolean; // Whether the AI shell is marked as done (only applies to AI shells)
  createdAt: string; // ISO 8601 date string
  updatedAt: string; // ISO 8601 date string
}

// Session represents a user's connection to AIForge
export interface Session {
  id: string;
  userId: string | null; // null for anonymous sessions
  connectedAt: string; // ISO 8601 date string
  lastActivityAt: string; // ISO 8601 date string
}

// WebSocket message types
export type WebSocketMessageType =
  | 'shell:create'
  | 'shell:destroy'
  | 'shell:input'
  | 'shell:output'
  | 'shell:resize'
  | 'shell:status'
  | 'project:create'
  | 'project:delete'
  | 'project:update'
  | 'error'
  | 'ping'
  | 'pong';

// Base WebSocket message structure
export interface WebSocketMessage<T = unknown> {
  type: WebSocketMessageType;
  payload: T;
  timestamp: string; // ISO 8601 date string
  requestId?: string; // For request/response correlation
}

// Shell input message payload
export interface ShellInputPayload {
  shellId: string;
  data: string;
}

// Shell output message payload
export interface ShellOutputPayload {
  shellId: string;
  data: string;
}

// Shell resize message payload
export interface ShellResizePayload {
  shellId: string;
  cols: number;
  rows: number;
}

// Shell status message payload
export interface ShellStatusPayload {
  shellId: string;
  status: ShellStatus;
  pid: number | null;
}

// Shell create message payload
export interface ShellCreatePayload {
  projectId: string;
  name?: string;
  cwd?: string;
}

// Shell create response payload
export interface ShellCreatedPayload {
  shell: Shell;
}

// Shell destroy message payload
export interface ShellDestroyPayload {
  shellId: string;
}

// Project create message payload
export interface ProjectCreatePayload {
  name: string;
  path: string;
}

// Project created response payload
export interface ProjectCreatedPayload {
  project: Project;
}

// Project delete message payload
export interface ProjectDeletePayload {
  projectId: string;
}

// Project update message payload
export interface ProjectUpdatePayload {
  projectId: string;
  name?: string;
}

// Error message payload
export interface ErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

// Server configuration
export interface ServerConfig {
  port: number;
  host: string;
  authGuid: string;
  scrollbackLines: number;
  logLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
}

// Workspace UI state that syncs across devices
export interface WorkspaceState {
  sidebarCollapsed: boolean;
  expandedProjectIds: string[];
  activeShellId: string | null;
  terminalFontSize: number; // Font size for all terminals (default: 14)
  terminalTheme: string; // Terminal color theme ID (default: 'tokyo-night')
  updatedAt: string; // ISO 8601 date string
}
