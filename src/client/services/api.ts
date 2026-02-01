/**
 * REST API client for AIForge backend
 */
import type { Project, Shell, ShellType, WorkspaceState, WorktreeWithStatus, WorktreeMetadata, FileTreeNode, CustomUrl } from '@shared/types';
import { ApiError } from './errors';
import { log } from './logger';

const apiLog = log.api;

// Response types
export interface ProjectsResponse {
  projects: Project[];
}

export interface ProjectResponse {
  project: Project;
}

export interface ShellsResponse {
  shells: Shell[];
}

export interface ShellResponse {
  shell: Shell;
}

export interface WorktreesResponse {
  worktrees: WorktreeWithStatus[];
}

export interface WorktreeResponse {
  worktree: WorktreeWithStatus;
}

export interface MainBranchResponse {
  branch: string;
}

export interface AuthStatusResponse {
  authenticated: boolean;
}

export interface AuthSuccessResponse {
  success: boolean;
}

export interface DirectoryEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

export interface BrowseResponse {
  path: string;
  parent: string | null;
  entries: DirectoryEntry[];
}

export interface ValidateResponse {
  valid: boolean;
  exists: boolean;
  isDirectory: boolean;
}

// API base URL - empty means same origin
const API_BASE = '/api';

/**
 * Server health response
 */
export interface HealthResponse {
  status: string;
  timestamp: string;
  uptime: number;
  services: {
    websocket: boolean;
    api: boolean;
  };
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    let message = `HTTP ${String(response.status)}`;
    let code: string | undefined;

    try {
      const json = JSON.parse(text) as { error?: string; message?: string; code?: string };
      // Server sends { error: "message", message: "message", code: "CODE" }
      if (json.message) {
        message = json.message;
      } else if (json.error) {
        message = json.error;
      }
      if (json.code) {
        code = json.code;
      }
    } catch {
      if (text) {
        message = text;
      }
    }

    throw new ApiError(message, response.status, code);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const method = options.method ?? 'GET';
  const startTime = performance.now();

  apiLog.debug({ method, path }, 'API request started');

  const headers = new Headers({
    'Content-Type': 'application/json',
  });

  // Merge any provided headers
  if (options.headers) {
    const optHeaders = options.headers;
    if (optHeaders instanceof Headers) {
      optHeaders.forEach((value, key) => { headers.set(key, value); });
    } else if (Array.isArray(optHeaders)) {
      optHeaders.forEach(([key, value]) => { headers.set(key, value); });
    } else {
      Object.entries(optHeaders).forEach(([key, value]) => { headers.set(key, value); });
    }
  }

  try {
    const response = await fetch(url, {
      ...options,
      credentials: 'include',
      headers,
    });

    const durationMs = Math.round(performance.now() - startTime);
    apiLog.info({ method, path, status: response.status, durationMs }, 'API request completed');

    return await handleResponse<T>(response);
  } catch (err) {
    const durationMs = Math.round(performance.now() - startTime);
    apiLog.error({ method, path, durationMs, error: err instanceof Error ? err.message : String(err) }, 'API request failed');
    throw err;
  }
}

// Health API
export async function checkServerHealth(): Promise<HealthResponse> {
  return request<HealthResponse>('/health');
}

/**
 * Wait for the server to be healthy by polling the health endpoint.
 * Returns when server is healthy or throws after max attempts.
 */
export async function waitForServerHealth(options: {
  maxAttempts?: number;
  delayMs?: number;
  onAttempt?: (attempt: number) => void;
} = {}): Promise<HealthResponse> {
  const { maxAttempts = 10, delayMs = 1000, onAttempt } = options;
  const startTime = performance.now();

  apiLog.info({ maxAttempts, delayMs }, 'Starting health check polling');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    apiLog.debug({ attempt, maxAttempts }, 'Health check attempt');
    onAttempt?.(attempt);
    try {
      const health = await checkServerHealth();
      if (health.status === 'ok' && health.services.websocket) {
        const totalMs = Math.round(performance.now() - startTime);
        apiLog.info({ attempt, totalMs }, 'Server health check passed');
        return health;
      }
      apiLog.debug({ status: health.status, websocket: health.services.websocket }, 'Server not fully ready yet');
    } catch (err) {
      apiLog.debug({ attempt, error: err instanceof Error ? err.message : String(err) }, 'Health check attempt failed');
      // Server not ready yet, will retry
    }

    if (attempt < maxAttempts) {
      apiLog.debug({ delayMs }, 'Waiting before next health check');
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  apiLog.error({ maxAttempts }, 'Server not healthy after max attempts');
  throw new Error(`Server not healthy after ${String(maxAttempts)} attempts`);
}

// Auth API
export async function login(guid: string): Promise<AuthSuccessResponse> {
  return request<AuthSuccessResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ guid }),
  });
}

export async function logout(): Promise<AuthSuccessResponse> {
  return request<AuthSuccessResponse>('/auth/logout', {
    method: 'POST',
  });
}

export async function checkAuthStatus(): Promise<AuthStatusResponse> {
  return request<AuthStatusResponse>('/auth/status');
}

// Projects API
export async function getProjects(): Promise<ProjectsResponse> {
  return request<ProjectsResponse>('/projects');
}

export async function getProject(id: string): Promise<ProjectResponse> {
  return request<ProjectResponse>(`/projects/${id}`);
}

export async function createProject(path: string): Promise<ProjectResponse> {
  return request<ProjectResponse>('/projects', {
    method: 'POST',
    body: JSON.stringify({ path }),
  });
}

export async function updateProject(
  id: string,
  updates: { name?: string },
): Promise<ProjectResponse> {
  return request<ProjectResponse>(`/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function deleteProject(id: string): Promise<undefined> {
  return request<undefined>(`/projects/${id}`, {
    method: 'DELETE',
  });
}

// Worktrees API
export async function getWorktrees(projectId: string): Promise<WorktreesResponse> {
  return request<WorktreesResponse>(`/projects/${projectId}/worktrees`);
}

export async function getMainBranch(projectId: string): Promise<MainBranchResponse> {
  return request<MainBranchResponse>(`/projects/${projectId}/worktrees/main`);
}

export async function createWorktree(
  projectId: string,
  name: string,
  baseBranch?: string,
): Promise<WorktreeResponse> {
  return request<WorktreeResponse>(`/projects/${projectId}/worktrees`, {
    method: 'POST',
    body: JSON.stringify({ name, baseBranch }),
  });
}

export interface DeleteWorktreeResponse {
  success: boolean;
}

export async function deleteWorktree(
  projectId: string,
  worktreePath: string,
  force?: boolean,
): Promise<DeleteWorktreeResponse> {
  const encodedPath = encodeURIComponent(worktreePath);
  const queryParams = force ? '?force=true' : '';
  return request<DeleteWorktreeResponse>(`/projects/${projectId}/worktrees/${encodedPath}${queryParams}`, {
    method: 'DELETE',
  });
}

export interface UpdateWorktreeMetadataRequest {
  done: boolean;
  projectId?: string;
}

export interface UpdateWorktreeMetadataResponse {
  success: boolean;
  metadata: WorktreeMetadata;
}

export async function updateWorktreeMetadata(
  worktreePath: string,
  updates: UpdateWorktreeMetadataRequest,
): Promise<UpdateWorktreeMetadataResponse> {
  const encodedPath = encodeURIComponent(worktreePath);
  return request<UpdateWorktreeMetadataResponse>(`/worktrees/${encodedPath}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

// Shells API
export async function getShells(projectId: string): Promise<ShellsResponse> {
  return request<ShellsResponse>(`/projects/${projectId}/shells`);
}

export async function getShell(id: string): Promise<ShellResponse> {
  return request<ShellResponse>(`/shells/${id}`);
}

export async function createShell(
  projectId: string,
  name?: string,
  type: ShellType = 'bash',
  worktreePath?: string,
): Promise<ShellResponse> {
  return request<ShellResponse>(`/projects/${projectId}/shells`, {
    method: 'POST',
    body: JSON.stringify({ name, type, worktreePath }),
  });
}

/**
 * Get shells for a specific worktree
 * Phase 6: Shell-worktree association
 */
export async function getShellsByWorktree(worktreePath: string): Promise<ShellsResponse> {
  const encodedPath = encodeURIComponent(worktreePath);
  return request<ShellsResponse>(`/worktrees/${encodedPath}/shells`);
}

// ============================================================================
// Worktree Files API (Phase 7)
// ============================================================================

export interface WorktreeFilesResponse {
  files: FileTreeNode[];
  gitModifiedOnly: boolean;
}

/**
 * Get file tree for a worktree
 * Phase 7: Worktree context sidebar files tab
 */
export async function getWorktreeFiles(worktreePath: string, gitModifiedOnly = true): Promise<WorktreeFilesResponse> {
  const encodedPath = encodeURIComponent(worktreePath);
  const params = gitModifiedOnly ? '' : '?gitModifiedOnly=false';
  return request<WorktreeFilesResponse>(`/worktrees/${encodedPath}/files${params}`);
}

// ============================================================================
// Worktree URLs API (Phase 7)
// ============================================================================

export interface WorktreeUrlsResponse {
  urls: CustomUrl[];
}

export interface WorktreeUrlResponse {
  url: CustomUrl;
}

/**
 * Get all URLs for a worktree
 */
export async function getWorktreeUrls(worktreePath: string): Promise<WorktreeUrlsResponse> {
  const encodedPath = encodeURIComponent(worktreePath);
  return request<WorktreeUrlsResponse>(`/worktrees/${encodedPath}/urls`);
}

/**
 * Add a URL to a worktree
 */
export async function addWorktreeUrl(worktreePath: string, name: string, url: string): Promise<WorktreeUrlResponse> {
  const encodedPath = encodeURIComponent(worktreePath);
  return request<WorktreeUrlResponse>(`/worktrees/${encodedPath}/urls`, {
    method: 'POST',
    body: JSON.stringify({ name, url }),
  });
}

/**
 * Delete a URL from a worktree
 */
export async function deleteWorktreeUrl(worktreePath: string, urlId: string): Promise<{ success: boolean }> {
  const encodedPath = encodeURIComponent(worktreePath);
  return request<{ success: boolean }>(`/worktrees/${encodedPath}/urls/${urlId}`, {
    method: 'DELETE',
  });
}

export async function deleteShell(id: string): Promise<undefined> {
  return request<undefined>(`/shells/${id}`, {
    method: 'DELETE',
  });
}

export async function updateShell(
  id: string,
  updates: { name?: string; done?: boolean },
): Promise<ShellResponse> {
  return request<ShellResponse>(`/shells/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function startShell(id: string): Promise<ShellResponse> {
  return request<ShellResponse>(`/shells/${id}/start`, {
    method: 'POST',
  });
}

export async function stopShell(id: string): Promise<ShellResponse> {
  return request<ShellResponse>(`/shells/${id}/stop`, {
    method: 'POST',
  });
}

export async function restartShell(id: string): Promise<ShellResponse> {
  return request<ShellResponse>(`/shells/${id}/restart`, {
    method: 'POST',
  });
}

// Filesystem API
export async function browseDirectory(path: string): Promise<BrowseResponse> {
  const encodedPath = encodeURIComponent(path);
  return request<BrowseResponse>(`/filesystem/browse?path=${encodedPath}`);
}

export async function validatePath(path: string): Promise<ValidateResponse> {
  const encodedPath = encodeURIComponent(path);
  return request<ValidateResponse>(`/filesystem/validate?path=${encodedPath}`);
}

export interface HomeDirectoryResponse {
  path: string;
}

export async function getHomeDirectory(): Promise<HomeDirectoryResponse> {
  return request<HomeDirectoryResponse>('/filesystem/home');
}

// Workspace API
export interface WorkspaceStateResponse {
  workspaceState: WorkspaceState;
}

export interface UpdateWorkspaceStateRequest {
  sidebarCollapsed?: boolean;
  expandedProjectIds?: string[];
  activeShellId?: string | null;
  terminalFontSize?: number;
}

export async function getWorkspaceState(): Promise<WorkspaceStateResponse> {
  return request<WorkspaceStateResponse>('/workspace');
}

export async function updateWorkspaceState(
  updates: UpdateWorkspaceStateRequest,
): Promise<WorkspaceStateResponse> {
  return request<WorkspaceStateResponse>('/workspace', {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

// Generic API client for use with React Query
export const apiClient = {
  get: <T>(path: string): Promise<T> => request<T>(path),
  post: <T>(path: string, body?: unknown): Promise<T> =>
    request<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }),
  put: <T>(path: string, body?: unknown): Promise<T> =>
    request<T>(path, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    }),
  patch: <T>(path: string, body?: unknown): Promise<T> =>
    request<T>(path, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    }),
  delete: <T>(path: string): Promise<T> =>
    request<T>(path, { method: 'DELETE' }),
};

// Export namespace for convenience
export const api = {
  checkServerHealth,
  waitForServerHealth,
  login,
  logout,
  checkAuthStatus,
  getProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  getWorktrees,
  getMainBranch,
  createWorktree,
  deleteWorktree,
  updateWorktreeMetadata,
  getWorktreeFiles,
  getWorktreeUrls,
  addWorktreeUrl,
  deleteWorktreeUrl,
  getShells,
  getShell,
  createShell,
  getShellsByWorktree,
  deleteShell,
  updateShell,
  startShell,
  stopShell,
  restartShell,
  browseDirectory,
  validatePath,
  getHomeDirectory,
  getWorkspaceState,
  updateWorkspaceState,
};

export default api;
