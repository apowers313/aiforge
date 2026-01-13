/**
 * REST API client for AIForge backend
 */
import type { Project, Shell, WorkspaceState } from '@shared/types';
import { ApiError } from './errors';

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

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    let message = `HTTP ${String(response.status)}`;
    let code: string | undefined;

    try {
      const json = JSON.parse(text) as { error?: { message?: string; code?: string } };
      if (json.error?.message) {
        message = json.error.message;
      }
      if (json.error?.code) {
        code = json.error.code;
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

  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers,
  });

  return handleResponse<T>(response);
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
): Promise<ShellResponse> {
  return request<ShellResponse>(`/projects/${projectId}/shells`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function deleteShell(id: string): Promise<undefined> {
  return request<undefined>(`/shells/${id}`, {
    method: 'DELETE',
  });
}

export async function updateShell(
  id: string,
  updates: { name?: string },
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

// Export namespace for convenience
export const api = {
  login,
  logout,
  checkAuthStatus,
  getProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  getShells,
  getShell,
  createShell,
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
