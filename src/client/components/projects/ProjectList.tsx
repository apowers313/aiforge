import { Stack } from '@mantine/core';
import type { Project } from '@shared/types';
import { SidebarItem } from '@client/components/common/SidebarItem';
import { useShells } from '@client/hooks/useShells';
import { useWorktrees } from '@client/hooks/useWorktrees';

interface ProjectListProps {
  projects: Project[];
}

/**
 * Wrapper component that fetches data for a single project and renders SidebarItem
 */
function ProjectItemWrapper({ project }: { project: Project }): React.ReactElement {
  const { data: shells = [] } = useShells(project.id);
  const { data: worktrees = [] } = useWorktrees(project.id);

  return (
    <SidebarItem
      variant={{
        type: 'project',
        project,
        worktrees,
        shells,
      }}
    />
  );
}

export function ProjectList({ projects }: ProjectListProps): React.ReactElement {
  return (
    <Stack gap={0}>
      {projects.map((project) => (
        <ProjectItemWrapper key={project.id} project={project} />
      ))}
    </Stack>
  );
}
