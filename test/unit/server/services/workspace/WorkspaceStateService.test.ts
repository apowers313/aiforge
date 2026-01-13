/**
 * Tests for WorkspaceStateService - workspace state business logic
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WorkspaceStateService } from '@server/services/workspace/WorkspaceStateService.js';
import { WorkspaceStateStore } from '@server/storage/stores/WorkspaceStateStore.js';
import { ProjectStore } from '@server/storage/stores/ProjectStore.js';
import { ShellStore } from '@server/storage/stores/ShellStore.js';

describe('WorkspaceStateService', () => {
  let service: WorkspaceStateService;
  let workspaceStateStore: WorkspaceStateStore;
  let projectStore: ProjectStore;
  let shellStore: ShellStore;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'workspace-service-test-'));
    workspaceStateStore = new WorkspaceStateStore(join(tempDir, 'workspace-states.json'));
    projectStore = new ProjectStore(join(tempDir, 'projects.json'));
    shellStore = new ShellStore(join(tempDir, 'shells.json'));
    service = new WorkspaceStateService({
      workspaceStateStore,
      projectStore,
      shellStore,
    });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('get', () => {
    it('returns default state for new session', async () => {
      const state = await service.get('new-session');

      expect(state.sidebarCollapsed).toBe(false);
      expect(state.expandedProjectIds).toEqual([]);
      expect(state.activeShellId).toBeNull();
      expect(state.updatedAt).toBeDefined();
    });

    it('returns stored state for existing session', async () => {
      const token = 'existing-session';
      await service.update(token, {
        sidebarCollapsed: true,
        expandedProjectIds: ['project-1'],
        activeShellId: 'shell-1',
      });

      // Add project and shell so they pass validation
      await projectStore.create({
        id: 'project-1',
        path: '/test/path',
        name: 'Test Project',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await shellStore.create({
        id: 'shell-1',
        projectId: 'project-1',
        name: 'Shell 1',
        status: 'stopped',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const state = await service.get(token);

      expect(state.sidebarCollapsed).toBe(true);
      expect(state.expandedProjectIds).toEqual(['project-1']);
      expect(state.activeShellId).toBe('shell-1');
    });

    it('filters out deleted projects from expandedProjectIds', async () => {
      const token = 'filter-projects-session';

      // Create project first so update works
      await projectStore.create({
        id: 'existing-project',
        path: '/test/path',
        name: 'Existing Project',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await service.update(token, {
        expandedProjectIds: ['deleted-project', 'existing-project'],
      });

      const state = await service.get(token);

      // Only existing project should remain
      expect(state.expandedProjectIds).toEqual(['existing-project']);
    });

    it('sets activeShellId to null if shell was deleted', async () => {
      const token = 'filter-shell-session';
      await service.update(token, {
        activeShellId: 'deleted-shell',
      });

      const state = await service.get(token);

      expect(state.activeShellId).toBeNull();
    });
  });

  describe('update', () => {
    it('updates partial state', async () => {
      const token = 'partial-update-session';

      // First update
      await service.update(token, {
        sidebarCollapsed: true,
      });

      // Second update - should preserve sidebarCollapsed
      await service.update(token, {
        activeShellId: 'shell-1',
      });

      // Get from store directly (no validation) to check raw state
      const rawState = await workspaceStateStore.get(token);

      expect(rawState?.sidebarCollapsed).toBe(true);
      expect(rawState?.activeShellId).toBe('shell-1');
    });

    it('returns updated state', async () => {
      const token = 'return-state-session';

      const result = await service.update(token, {
        sidebarCollapsed: true,
        expandedProjectIds: ['p1', 'p2'],
      });

      expect(result.sidebarCollapsed).toBe(true);
      expect(result.expandedProjectIds).toEqual(['p1', 'p2']);
      expect(result.updatedAt).toBeDefined();
    });

    it('sets updatedAt timestamp', async () => {
      const token = 'timestamp-session';
      const before = new Date().toISOString();

      await service.update(token, { sidebarCollapsed: true });

      const state = await workspaceStateStore.get(token);
      const after = new Date().toISOString();

      expect(state).not.toBeNull();
      if (state) {
        expect(state.updatedAt).toBeDefined();
        expect(state.updatedAt >= before).toBe(true);
        expect(state.updatedAt <= after).toBe(true);
      }
    });
  });

  describe('delete', () => {
    it('removes state for session', async () => {
      const token = 'delete-session';
      await service.update(token, { sidebarCollapsed: true });

      await service.delete(token);

      const rawState = await workspaceStateStore.get(token);
      expect(rawState).toBeNull();
    });

    it('does not throw for non-existent session', async () => {
      await expect(service.delete('nonexistent')).resolves.toBeUndefined();
    });
  });
});
