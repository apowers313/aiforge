import { useCallback, useMemo } from 'react';
import { AppShell as MantineAppShell, Box } from '@mantine/core';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { ResizableDivider } from './ResizableDivider';
import { useUIStore } from '@client/stores/uiStore';
import { Terminal } from '@client/components/terminal/Terminal';
import { EmptyState } from '@client/components/common/EmptyState';
import { AddProjectModal } from '@client/components/projects/AddProjectModal';
import { ContextSidebar } from '@client/components/context-sidebar/ContextSidebar';
import { FilePreview } from '@client/components/context-sidebar/common/FilePreview';
import { useProjects, useCreateProject } from '@client/hooks/useProjects';
import { useAllShells, useActiveShellId } from '@client/hooks/useShells';
import { ApiError } from '@client/services/errors';
import { log } from '@client/services/logger';

const projectLog = log.project;

export function AppShellLayout(): React.ReactElement {
  const sidebarCollapsed = useUIStore((state) => state.sidebarCollapsed);
  const sidebarWidth = useUIStore((state) => state.sidebarWidth);
  const setSidebarWidth = useUIStore((state) => state.setSidebarWidth);
  const addProjectModalOpen = useUIStore((state) => state.addProjectModalOpen);
  const closeAddProjectModal = useUIStore((state) => state.closeAddProjectModal);
  const contextSidebarPinned = useUIStore((state) => state.contextSidebarPinned);
  const previewProjectId = useUIStore((state) => state.previewProjectId);
  const previewFilePath = useUIStore((state) => state.previewFilePath);
  const closeFilePreview = useUIStore((state) => state.closeFilePreview);
  const { data: projects = [] } = useProjects();
  const createProjectMutation = useCreateProject();
  const { activeShellId } = useActiveShellId();

  const handleResize = useCallback(
    (delta: number): void => {
      // Get the current width directly from store to avoid stale closure during rapid drags
      const currentWidth = useUIStore.getState().sidebarWidth;
      setSidebarWidth(currentWidth + delta);
    },
    [setSidebarWidth],
  );

  // Get project IDs for fetching all shells
  const projectIds = useMemo(() => projects.map((p) => p.id), [projects]);

  // Pre-fetch shells for all projects (to populate cache)
  useAllShells(projectIds);

  const handleProjectSelect = (path: string): void => {
    projectLog.info({ path }, 'Creating project');
    createProjectMutation.mutate(path, {
      onSuccess: () => {
        projectLog.info({ path }, 'Project created successfully');
        closeAddProjectModal();
      },
      onError: (error) => {
        // If the project already exists (409 Conflict), close the modal anyway
        // since the user's goal is achieved
        if (ApiError.isApiError(error) && error.status === 409) {
          projectLog.info({ path }, 'Project already exists (409)');
          closeAddProjectModal();
        } else {
          projectLog.error({ path, error: error instanceof Error ? error.message : String(error) }, 'Failed to create project');
        }
      },
    });
  };

  return (
    <>
      <MantineAppShell
        header={{ height: 50 }}
        navbar={{
          width: sidebarWidth,
          breakpoint: 'sm',
          collapsed: { desktop: sidebarCollapsed, mobile: sidebarCollapsed },
        }}
        padding={0}
      >
        <MantineAppShell.Header>
          <Header />
        </MantineAppShell.Header>

        <MantineAppShell.Navbar>
          <Sidebar />
        </MantineAppShell.Navbar>

        <MantineAppShell.Main
          style={{
            backgroundColor: 'var(--mantine-color-dark-8)',
            // Use dvh (dynamic viewport height) for Safari/iOS compatibility
            // Falls back to vh for older browsers via CSS custom property
            height: 'calc(100dvh - 50px)',
          }}
        >
          <Box
            style={{
              display: 'flex',
              height: '100%',
              width: '100%',
            }}
          >
            <Box style={{ flex: 1, minWidth: 0, height: '100%' }}>
              {activeShellId ? (
                <Terminal key={activeShellId} shellId={activeShellId} />
              ) : previewProjectId && previewFilePath ? (
                <FilePreview
                  projectId={previewProjectId}
                  filePath={previewFilePath}
                  onClose={closeFilePreview}
                />
              ) : (
                <EmptyState
                  title="No shell selected"
                  description="Select a shell from the sidebar or create a new one to get started"
                />
              )}
            </Box>
            {contextSidebarPinned && <ContextSidebar />}
          </Box>
          {/* Overlay context sidebar when not pinned */}
          {!contextSidebarPinned && <ContextSidebar />}
        </MantineAppShell.Main>

        <AddProjectModal
          opened={addProjectModalOpen}
          onClose={closeAddProjectModal}
          onSelect={handleProjectSelect}
        />
      </MantineAppShell>
      {/* Resizable divider uses fixed positioning, so it's outside the AppShell */}
      {!sidebarCollapsed && (
        <ResizableDivider sidebarWidth={sidebarWidth} onResize={handleResize} />
      )}
    </>
  );
}
