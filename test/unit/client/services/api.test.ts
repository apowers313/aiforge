import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { api } from '@client/services/api';
import { ApiError } from '@client/services/errors';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('ApiClient', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('adds credentials to requests', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ projects: [] }),
    });

    await api.getProjects();

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('throws ApiError on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: () => Promise.resolve(''),
    });

    await expect(api.getProjects()).rejects.toThrow(ApiError);
  });

  it('parses JSON response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ projects: [{ id: '1' }] }),
    });

    const result = await api.getProjects();
    expect(result.projects).toHaveLength(1);
  });

  it('includes error message from JSON response', async () => {
    // Server sends { error: "message", message: "message", code: "CODE" }
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: () => Promise.resolve(JSON.stringify({ error: 'Bad request', message: 'Bad request', code: 'BAD_REQUEST' })),
    });

    await expect(api.getProjects()).rejects.toThrow('Bad request');
  });

  it('handles 204 No Content responses', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
    });

    await api.deleteProject('test-id');
    // Verify no error thrown - deleteProject returns undefined on 204
  });

  describe('Auth API', () => {
    it('calls login endpoint with GUID', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
      });

      await api.login('my-guid');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/auth/login',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ guid: 'my-guid' }),
        }),
      );
    });

    it('calls logout endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
      });

      await api.logout();

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/auth/logout',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('calls auth status endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ authenticated: true }),
      });

      const result = await api.checkAuthStatus();

      expect(result.authenticated).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/auth/status',
        expect.any(Object),
      );
    });
  });

  describe('Projects API', () => {
    it('creates project with path', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ project: { id: '1', name: 'test', path: '/tmp' } }),
      });

      await api.createProject('/tmp');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/projects',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ path: '/tmp' }),
        }),
      );
    });

    it('updates project', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ project: { id: '1', name: 'new-name' } }),
      });

      await api.updateProject('1', { name: 'new-name' });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/projects/1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ name: 'new-name' }),
        }),
      );
    });

    it('deletes project', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      await api.deleteProject('1');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/projects/1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  describe('Shells API', () => {
    it('gets shells for project', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ shells: [] }),
      });

      await api.getShells('project-1');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/projects/project-1/shells',
        expect.any(Object),
      );
    });

    it('creates shell for project', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ shell: { id: '1' } }),
      });

      await api.createShell('project-1', 'my-shell');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/projects/project-1/shells',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'my-shell' }),
        }),
      );
    });

    it('deletes shell', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      await api.deleteShell('shell-1');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/shells/shell-1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('updates shell (rename)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ shell: { id: 'shell-1', name: 'new-name' } }),
      });

      const result = await api.updateShell('shell-1', { name: 'new-name' });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/shells/shell-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ name: 'new-name' }),
        }),
      );
      expect(result.shell.name).toBe('new-name');
    });

    it('restarts shell', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ shell: { id: 'shell-1', status: 'active' } }),
      });

      const result = await api.restartShell('shell-1');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/shells/shell-1/restart',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(result.shell.status).toBe('active');
    });
  });

  describe('Filesystem API', () => {
    it('browses directory', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          path: '/home',
          parent: '/',
          entries: [{ name: 'user', type: 'directory' }],
        }),
      });

      const result = await api.browseDirectory('/home');

      expect(result.path).toBe('/home');
      expect(result.entries).toHaveLength(1);
    });

    it('encodes path for browse', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ path: '/home/user', entries: [] }),
      });

      await api.browseDirectory('/home/user');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/filesystem/browse?path=%2Fhome%2Fuser',
        expect.any(Object),
      );
    });

    it('validates path', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ valid: true, exists: true, isDirectory: true }),
      });

      const result = await api.validatePath('/tmp');

      expect(result.valid).toBe(true);
    });
  });
});
