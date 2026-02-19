import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from '@client/stores/uiStore.js';

describe('uiStore', () => {
  beforeEach(() => {
    useUIStore.getState().reset();
  });

  it('starts with default values', () => {
    const state = useUIStore.getState();
    expect(state.sidebarCollapsed).toBe(false);
    expect(state.addProjectModalOpen).toBe(false);
    expect(state.expandedProjectIds).toEqual([]);
  });

  it('toggles sidebar', () => {
    useUIStore.getState().toggleSidebar();
    expect(useUIStore.getState().sidebarCollapsed).toBe(true);
    useUIStore.getState().toggleSidebar();
    expect(useUIStore.getState().sidebarCollapsed).toBe(false);
  });

  it('sets sidebar collapsed state directly', () => {
    useUIStore.getState().setSidebarCollapsed(true);
    expect(useUIStore.getState().sidebarCollapsed).toBe(true);
    useUIStore.getState().setSidebarCollapsed(false);
    expect(useUIStore.getState().sidebarCollapsed).toBe(false);
  });

  it('opens add project modal', () => {
    useUIStore.getState().openAddProjectModal();
    expect(useUIStore.getState().addProjectModalOpen).toBe(true);
  });

  it('closes add project modal', () => {
    useUIStore.getState().openAddProjectModal();
    useUIStore.getState().closeAddProjectModal();
    expect(useUIStore.getState().addProjectModalOpen).toBe(false);
  });

  it('toggles project expanded state', () => {
    useUIStore.getState().toggleProjectExpanded('proj-1');
    expect(useUIStore.getState().expandedProjectIds).toContain('proj-1');
    useUIStore.getState().toggleProjectExpanded('proj-1');
    expect(useUIStore.getState().expandedProjectIds).not.toContain('proj-1');
  });

  it('expands multiple projects', () => {
    useUIStore.getState().toggleProjectExpanded('proj-1');
    useUIStore.getState().toggleProjectExpanded('proj-2');
    expect(useUIStore.getState().expandedProjectIds).toContain('proj-1');
    expect(useUIStore.getState().expandedProjectIds).toContain('proj-2');
  });

  it('sets project expanded state directly', () => {
    useUIStore.getState().setProjectExpanded('proj-1', true);
    expect(useUIStore.getState().expandedProjectIds).toContain('proj-1');
    useUIStore.getState().setProjectExpanded('proj-1', false);
    expect(useUIStore.getState().expandedProjectIds).not.toContain('proj-1');
  });

  it('does not duplicate project id when already expanded', () => {
    useUIStore.getState().setProjectExpanded('proj-1', true);
    useUIStore.getState().setProjectExpanded('proj-1', true);
    const count = useUIStore.getState().expandedProjectIds.filter((id) => id === 'proj-1').length;
    expect(count).toBe(1);
  });

  it('does nothing when collapsing non-expanded project', () => {
    useUIStore.getState().setProjectExpanded('proj-1', false);
    expect(useUIStore.getState().expandedProjectIds).toEqual([]);
  });

  it('resets to initial state', () => {
    useUIStore.getState().toggleSidebar();
    useUIStore.getState().openAddProjectModal();
    useUIStore.getState().toggleProjectExpanded('proj-1');
    useUIStore.getState().reset();
    const state = useUIStore.getState();
    expect(state.sidebarCollapsed).toBe(false);
    expect(state.addProjectModalOpen).toBe(false);
    expect(state.expandedProjectIds).toEqual([]);
  });

  describe('sidebar width', () => {
    it('sets sidebar width', () => {
      useUIStore.getState().setSidebarWidth(300);
      expect(useUIStore.getState().sidebarWidth).toBe(300);
    });

    it('clamps sidebar width to minimum', () => {
      useUIStore.getState().setSidebarWidth(100);
      expect(useUIStore.getState().sidebarWidth).toBe(180);
    });

    it('clamps sidebar width to maximum', () => {
      useUIStore.getState().setSidebarWidth(800);
      expect(useUIStore.getState().sidebarWidth).toBe(600);
    });

    /**
     * Regression test for stale closure bug in rapid resize handling.
     *
     * Bug: When using a captured sidebarWidth in a callback, rapid consecutive
     * updates would use stale values because React didn't re-render between
     * updates.
     *
     * Example of buggy code:
     *   const handleResize = useCallback((delta) => {
     *     setSidebarWidth(sidebarWidth + delta);  // sidebarWidth is stale!
     *   }, [sidebarWidth, setSidebarWidth]);
     *
     * Fix: Use useUIStore.getState().sidebarWidth to get current value:
     *   const handleResize = useCallback((delta) => {
     *     const currentWidth = useUIStore.getState().sidebarWidth;
     *     setSidebarWidth(currentWidth + delta);
     *   }, [setSidebarWidth]);
     *
     * This test verifies that rapid consecutive width updates accumulate
     * correctly using the getState() pattern.
     */
    it('handles rapid consecutive width updates correctly (regression: stale closure)', () => {
      // Start at default width (280)
      const initialWidth = useUIStore.getState().sidebarWidth;
      expect(initialWidth).toBe(280);

      // Simulate rapid drag updates as would happen in ResizableDivider
      // Each update should read the current value via getState(), not a stale closure
      const deltas = [10, 10, 10, 10, 10]; // 5 rapid +10px drags

      for (const delta of deltas) {
        // This mimics the fixed handleResize pattern:
        const currentWidth = useUIStore.getState().sidebarWidth;
        useUIStore.getState().setSidebarWidth(currentWidth + delta);
      }

      // Final width should be 280 + 50 = 330
      // If stale closure bug existed, it would be 280 + 10 = 290 (only last update applied)
      expect(useUIStore.getState().sidebarWidth).toBe(330);
    });

    it('handles rapid consecutive width decreases correctly', () => {
      // Start at 400px
      useUIStore.getState().setSidebarWidth(400);

      // Simulate rapid drag decreases
      const deltas = [-20, -20, -20, -20, -20]; // 5 rapid -20px drags

      for (const delta of deltas) {
        const currentWidth = useUIStore.getState().sidebarWidth;
        useUIStore.getState().setSidebarWidth(currentWidth + delta);
      }

      // Final width should be 400 - 100 = 300
      expect(useUIStore.getState().sidebarWidth).toBe(300);
    });

    it('clamps during rapid updates at minimum boundary', () => {
      // Start near minimum (200px)
      useUIStore.getState().setSidebarWidth(200);

      // Rapid decreases that would go below minimum
      const deltas = [-10, -10, -10, -10, -10]; // Would result in 150, but min is 180

      for (const delta of deltas) {
        const currentWidth = useUIStore.getState().sidebarWidth;
        useUIStore.getState().setSidebarWidth(currentWidth + delta);
      }

      // Should be clamped to minimum (180)
      expect(useUIStore.getState().sidebarWidth).toBe(180);
    });
  });

  describe('context sidebar state', () => {
    beforeEach(() => {
      useUIStore.getState().reset();
    });

    it('opens context sidebar with project type', () => {
      useUIStore.getState().openContextSidebar('project', 'proj-123');
      const state = useUIStore.getState();
      expect(state.contextSidebarOpen).toBe(true);
      expect(state.selectedContextType).toBe('project');
      expect(state.selectedContextId).toBe('proj-123');
    });

    it('opens context sidebar with shell type', () => {
      useUIStore.getState().openContextSidebar('shell', 'shell-456');
      const state = useUIStore.getState();
      expect(state.contextSidebarOpen).toBe(true);
      expect(state.selectedContextType).toBe('shell');
      expect(state.selectedContextId).toBe('shell-456');
    });

    it('closes context sidebar and clears selection', () => {
      useUIStore.getState().openContextSidebar('shell', 'shell-456');
      useUIStore.getState().closeContextSidebar();
      const state = useUIStore.getState();
      expect(state.contextSidebarOpen).toBe(false);
      expect(state.selectedContextId).toBeNull();
      expect(state.selectedContextType).toBeNull();
    });

    it('toggles pin state', () => {
      expect(useUIStore.getState().contextSidebarPinned).toBe(false);
      useUIStore.getState().toggleContextSidebarPin();
      expect(useUIStore.getState().contextSidebarPinned).toBe(true);
      useUIStore.getState().toggleContextSidebarPin();
      expect(useUIStore.getState().contextSidebarPinned).toBe(false);
    });

    it('has default context sidebar width of 320', () => {
      expect(useUIStore.getState().contextSidebarWidth).toBe(320);
    });

    it('clamps context sidebar width to minimum (280)', () => {
      useUIStore.getState().setContextSidebarWidth(200);
      expect(useUIStore.getState().contextSidebarWidth).toBe(280);
    });

    it('clamps context sidebar width to maximum (500)', () => {
      useUIStore.getState().setContextSidebarWidth(600);
      expect(useUIStore.getState().contextSidebarWidth).toBe(500);
    });

    it('sets context sidebar width within bounds', () => {
      useUIStore.getState().setContextSidebarWidth(400);
      expect(useUIStore.getState().contextSidebarWidth).toBe(400);
    });

    it('sets active tab', () => {
      expect(useUIStore.getState().contextSidebarActiveTab).toBe('urls');
      useUIStore.getState().setContextSidebarTab('files');
      expect(useUIStore.getState().contextSidebarActiveTab).toBe('files');
      useUIStore.getState().setContextSidebarTab('todos');
      expect(useUIStore.getState().contextSidebarActiveTab).toBe('todos');
      useUIStore.getState().setContextSidebarTab('notes');
      expect(useUIStore.getState().contextSidebarActiveTab).toBe('notes');
    });

    it('resets to default tab when opening with project type', () => {
      useUIStore.getState().setContextSidebarTab('todos');
      useUIStore.getState().openContextSidebar('project', 'proj-1');
      // When opening project, should reset to 'urls' (first project tab)
      expect(useUIStore.getState().contextSidebarActiveTab).toBe('urls');
    });

    it('resets to default tab when opening with shell type', () => {
      useUIStore.getState().setContextSidebarTab('files');
      useUIStore.getState().openContextSidebar('shell', 'shell-1');
      // When opening shell, should reset to 'urls' (shells no longer have todos/notes tabs)
      expect(useUIStore.getState().contextSidebarActiveTab).toBe('urls');
    });

    it('toggles context sidebar (opens if closed)', () => {
      useUIStore.getState().toggleContextSidebar('project', 'proj-1');
      expect(useUIStore.getState().contextSidebarOpen).toBe(true);
      expect(useUIStore.getState().selectedContextId).toBe('proj-1');
    });

    it('toggles context sidebar (closes if same item clicked)', () => {
      useUIStore.getState().openContextSidebar('project', 'proj-1');
      useUIStore.getState().toggleContextSidebar('project', 'proj-1');
      expect(useUIStore.getState().contextSidebarOpen).toBe(false);
    });

    it('toggles context sidebar (switches to new item if different)', () => {
      useUIStore.getState().openContextSidebar('project', 'proj-1');
      useUIStore.getState().toggleContextSidebar('project', 'proj-2');
      expect(useUIStore.getState().contextSidebarOpen).toBe(true);
      expect(useUIStore.getState().selectedContextId).toBe('proj-2');
    });

    it('preserves context sidebar state in reset except for selection', () => {
      useUIStore.getState().openContextSidebar('project', 'proj-1');
      useUIStore.getState().toggleContextSidebarPin();
      useUIStore.getState().setContextSidebarWidth(400);
      useUIStore.getState().reset();

      // After reset, sidebar should be closed with no selection
      expect(useUIStore.getState().contextSidebarOpen).toBe(false);
      expect(useUIStore.getState().selectedContextId).toBeNull();
      // But pinned and width are persisted UI preferences, so they reset too
      expect(useUIStore.getState().contextSidebarPinned).toBe(false);
      expect(useUIStore.getState().contextSidebarWidth).toBe(320);
    });
  });

  describe('worktree status visibility', () => {
    beforeEach(() => {
      useUIStore.getState().reset();
    });

    it('starts with empty worktreeStatusHiddenProjects', () => {
      expect(useUIStore.getState().worktreeStatusHiddenProjects).toEqual([]);
    });

    it('toggles worktree status visibility (hides when shown)', () => {
      useUIStore.getState().toggleWorktreeStatusVisibility('proj-1');
      expect(useUIStore.getState().worktreeStatusHiddenProjects).toContain('proj-1');
    });

    it('toggles worktree status visibility (shows when hidden)', () => {
      useUIStore.getState().toggleWorktreeStatusVisibility('proj-1');
      useUIStore.getState().toggleWorktreeStatusVisibility('proj-1');
      expect(useUIStore.getState().worktreeStatusHiddenProjects).not.toContain('proj-1');
    });

    it('handles multiple projects independently', () => {
      useUIStore.getState().toggleWorktreeStatusVisibility('proj-1');
      useUIStore.getState().toggleWorktreeStatusVisibility('proj-2');
      expect(useUIStore.getState().worktreeStatusHiddenProjects).toContain('proj-1');
      expect(useUIStore.getState().worktreeStatusHiddenProjects).toContain('proj-2');
      useUIStore.getState().toggleWorktreeStatusVisibility('proj-1');
      expect(useUIStore.getState().worktreeStatusHiddenProjects).not.toContain('proj-1');
      expect(useUIStore.getState().worktreeStatusHiddenProjects).toContain('proj-2');
    });

    it('isWorktreeStatusHidden returns correct value', () => {
      expect(useUIStore.getState().isWorktreeStatusHidden('proj-1')).toBe(false);
      useUIStore.getState().toggleWorktreeStatusVisibility('proj-1');
      expect(useUIStore.getState().isWorktreeStatusHidden('proj-1')).toBe(true);
    });

    it('resets worktreeStatusHiddenProjects on reset', () => {
      useUIStore.getState().toggleWorktreeStatusVisibility('proj-1');
      useUIStore.getState().reset();
      expect(useUIStore.getState().worktreeStatusHiddenProjects).toEqual([]);
    });
  });

  describe('worktree expanded state', () => {
    beforeEach(() => {
      useUIStore.getState().reset();
    });

    it('starts with empty expandedWorktreePaths', () => {
      expect(useUIStore.getState().expandedWorktreePaths).toEqual([]);
    });

    it('toggles worktree expanded state (expands when collapsed)', () => {
      useUIStore.getState().toggleWorktreeExpanded('/path/to/worktree');
      expect(useUIStore.getState().expandedWorktreePaths).toContain('/path/to/worktree');
    });

    it('toggles worktree expanded state (collapses when expanded)', () => {
      useUIStore.getState().toggleWorktreeExpanded('/path/to/worktree');
      useUIStore.getState().toggleWorktreeExpanded('/path/to/worktree');
      expect(useUIStore.getState().expandedWorktreePaths).not.toContain('/path/to/worktree');
    });

    it('expands multiple worktrees simultaneously', () => {
      useUIStore.getState().toggleWorktreeExpanded('/path/to/worktree-1');
      useUIStore.getState().toggleWorktreeExpanded('/path/to/worktree-2');
      useUIStore.getState().toggleWorktreeExpanded('/path/to/worktree-3');

      const expanded = useUIStore.getState().expandedWorktreePaths;
      expect(expanded).toContain('/path/to/worktree-1');
      expect(expanded).toContain('/path/to/worktree-2');
      expect(expanded).toContain('/path/to/worktree-3');
      expect(expanded).toHaveLength(3);
    });

    it('handles worktrees independently (collapse one, keep others)', () => {
      useUIStore.getState().toggleWorktreeExpanded('/path/to/worktree-1');
      useUIStore.getState().toggleWorktreeExpanded('/path/to/worktree-2');

      // Collapse the first one
      useUIStore.getState().toggleWorktreeExpanded('/path/to/worktree-1');

      const expanded = useUIStore.getState().expandedWorktreePaths;
      expect(expanded).not.toContain('/path/to/worktree-1');
      expect(expanded).toContain('/path/to/worktree-2');
    });

    it('resets expandedWorktreePaths on reset', () => {
      useUIStore.getState().toggleWorktreeExpanded('/path/to/worktree');
      useUIStore.getState().reset();
      expect(useUIStore.getState().expandedWorktreePaths).toEqual([]);
    });

    it('handles worktree paths with special characters', () => {
      const specialPath = '/home/user/my project/.worktrees/feature-branch';
      useUIStore.getState().toggleWorktreeExpanded(specialPath);
      expect(useUIStore.getState().expandedWorktreePaths).toContain(specialPath);
    });
  });
});
