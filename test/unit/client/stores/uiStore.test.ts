import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from '@client/stores/uiStore';

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
});
