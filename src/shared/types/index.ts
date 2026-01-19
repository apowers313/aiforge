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
  httpsCert?: string;  // Path to HTTPS certificate file
  httpsKey?: string;   // Path to HTTPS private key file
}

// Workspace UI state that syncs across devices
export interface WorkspaceState {
  sidebarCollapsed: boolean;
  sidebarWidth: number; // Sidebar width in pixels (default: 280, min: 180, max: 600)
  expandedProjectIds: string[];
  activeShellId: string | null;
  terminalFontSize: number; // Font size for all terminals (default: 14)
  terminalTheme: string; // Terminal color theme ID (default: 'tokyo-night')
  contextSidebarPinned: boolean; // Whether context sidebar is pinned (takes space) vs overlay
  contextSidebarWidth: number; // Context sidebar width in pixels (default: 320, min: 280, max: 500)
  updatedAt: string; // ISO 8601 date string
}

// Context sidebar types - used for displaying context information
export type ContextType = 'project' | 'shell';
export type ContextSidebarTab = 'urls' | 'files' | 'todos' | 'notes';

// Custom URL stored per-project (server-persisted via API)
export interface CustomUrl {
  id: string;
  name: string;
  url: string;
  createdAt: string; // ISO 8601 date string
}

// TODO item stored per-shell (server-persisted via API)
export interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  order: number; // Sort order (lower = higher in list)
  createdAt: string; // ISO 8601 date string
  completedAt: string | null; // ISO 8601 date string or null
}

// Shell context data (server-persisted via API)
export interface ShellContextData {
  todos: TodoItem[];
  notes: string;
}

// Project metadata (read-only, computed on-demand)
export interface ProjectMetadata {
  gitRemoteUrl: string | null;
  gitRemoteType: 'github' | 'gitlab' | 'bitbucket' | 'other' | null;
  hasPackageJson: boolean;
  packageName: string | null;
  hasGithubWorkflows: boolean;
}

// Git status for files
export type GitStatus = 'modified' | 'untracked' | 'staged' | 'deleted' | 'renamed' | null;

// File tree node for project files display
export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  gitStatus: GitStatus;
  children?: FileTreeNode[];
}

// File preview response
export interface FilePreview {
  content: string;
  language: string;
  truncated: boolean;
  totalLines: number;
}

// ============================================================================
// Session Protocol Types (new unified protocol for terminal sessions)
// ============================================================================

/**
 * Error codes for session operations
 */
export type SessionErrorCode =
  | 'SHELL_NOT_FOUND'
  | 'DAEMON_SPAWN_FAILED'
  | 'CONNECTION_LOST'
  | 'INTERNAL_ERROR';

/**
 * Session state as seen by clients
 */
export type SessionStatus = 'closed' | 'open';

/**
 * Session message type union
 */
export type SessionMessageType =
  | 'session.open'
  | 'session.opened'
  | 'session.close'
  | 'session.closed'
  | 'session.input'
  | 'session.resize'
  | 'session.output'
  | 'session.error';

/**
 * Client → Server: Request to open a session
 */
export interface SessionOpenMessage {
  type: 'session.open';
  shellId: string;
  requestId: string;
}

/**
 * Server → Client: Session opened successfully
 */
export interface SessionOpenedMessage {
  type: 'session.opened';
  shellId: string;
  requestId: string;
  shell: Shell;
  scrollback: string;
  cols: number;
  rows: number;
}

/**
 * Client → Server: Request to close a session
 */
export interface SessionCloseMessage {
  type: 'session.close';
  shellId: string;
  requestId?: string;
}

/**
 * Session close reasons
 */
export type SessionCloseReason = 'requested' | 'shell_deleted' | 'daemon_exited' | 'error';

/**
 * Server → Client: Session closed
 */
export interface SessionClosedMessage {
  type: 'session.closed';
  shellId: string;
  requestId?: string;
  reason: SessionCloseReason;
}

/**
 * Client → Server: Send input to session
 */
export interface SessionInputMessage {
  type: 'session.input';
  shellId: string;
  data: string;
}

/**
 * Client → Server: Resize session terminal
 */
export interface SessionResizeMessage {
  type: 'session.resize';
  shellId: string;
  cols: number;
  rows: number;
}

/**
 * Server → Client: Output from session
 */
export interface SessionOutputMessage {
  type: 'session.output';
  shellId: string;
  data: string;
  isScrollback?: boolean;
}

/**
 * Server → Client: Session error
 */
export interface SessionErrorMessage {
  type: 'session.error';
  shellId: string;
  requestId?: string;
  code: SessionErrorCode;
  message: string;
  retryable: boolean;
}

/**
 * Union of all session messages
 */
export type SessionMessage =
  | SessionOpenMessage
  | SessionOpenedMessage
  | SessionCloseMessage
  | SessionClosedMessage
  | SessionInputMessage
  | SessionResizeMessage
  | SessionOutputMessage
  | SessionErrorMessage;

/**
 * Type guard for session messages
 */
export function isSessionMessage(msg: unknown): msg is SessionMessage {
  if (typeof msg !== 'object' || msg === null) return false;
  const type = (msg as { type?: unknown }).type;
  if (typeof type !== 'string') return false;
  return type.startsWith('session.');
}

/**
 * Type guard for SessionOpenMessage
 */
export function isSessionOpenMessage(msg: unknown): msg is SessionOpenMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type?: unknown }).type === 'session.open'
  );
}

/**
 * Type guard for SessionOpenedMessage
 */
export function isSessionOpenedMessage(msg: unknown): msg is SessionOpenedMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type?: unknown }).type === 'session.opened'
  );
}

/**
 * Type guard for SessionErrorMessage
 */
export function isSessionErrorMessage(msg: unknown): msg is SessionErrorMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type?: unknown }).type === 'session.error'
  );
}

/**
 * Type guard for SessionOutputMessage
 */
export function isSessionOutputMessage(msg: unknown): msg is SessionOutputMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type?: unknown }).type === 'session.output'
  );
}

/**
 * Type guard for SessionClosedMessage
 */
export function isSessionClosedMessage(msg: unknown): msg is SessionClosedMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type?: unknown }).type === 'session.closed'
  );
}

/**
 * Generate a unique request ID for session operations
 */
export function generateRequestId(): string {
  const timestamp = String(Date.now());
  const random = Math.random().toString(36).substring(2, 11);
  return `${timestamp}-${random}`;
}
