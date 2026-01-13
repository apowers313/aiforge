import { useMemo } from 'react';
import { AppShell as MantineAppShell } from '@mantine/core';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { useUIStore } from '@client/stores/uiStore';
import { Terminal } from '@client/components/terminal/Terminal';
import { EmptyState } from '@client/components/common/EmptyState';
import { AddProjectModal } from '@client/components/projects/AddProjectModal';
import { useProjects, useCreateProject } from '@client/hooks/useProjects';
import { useAllShells, useActiveShellId } from '@client/hooks/useShells';

export function AppShellLayout(): React.ReactElement {
  const sidebarCollapsed = useUIStore((state) => state.sidebarCollapsed);
  const addProjectModalOpen = useUIStore((state) => state.addProjectModalOpen);
  const closeAddProjectModal = useUIStore((state) => state.closeAddProjectModal);
  const { data: projects = [] } = useProjects();
  const createProjectMutation = useCreateProject();
  const { activeShellId } = useActiveShellId();

  // Get project IDs for fetching all shells
  const projectIds = useMemo(() => projects.map((p) => p.id), [projects]);

  // Pre-fetch shells for all projects (to populate cache)
  useAllShells(projectIds);

  const handleProjectSelect = (path: string): void => {
    createProjectMutation.mutate(path, {
      onSuccess: () => {
        closeAddProjectModal();
      },
    });
  };

  return (
    <MantineAppShell
      header={{ height: 50 }}
      navbar={{
        width: 280,
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
        {activeShellId ? (
          <Terminal key={activeShellId} shellId={activeShellId} />
        ) : (
          <EmptyState
            title="No shell selected"
            description="Select a shell from the sidebar or create a new one to get started"
          />
        )}
      </MantineAppShell.Main>

      <AddProjectModal
        opened={addProjectModalOpen}
        onClose={closeAddProjectModal}
        onSelect={handleProjectSelect}
      />
    </MantineAppShell>
  );
}
