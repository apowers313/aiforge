/**
 * ProjectItem - Displays a single project in the sidebar
 *
 * This is now a thin wrapper around SidebarItem for backwards compatibility.
 * All logic has been unified in SidebarItem to ensure feature parity with WorktreeItem.
 */
import type { Project } from '@shared/types';
import { SidebarItem } from '@client/components/common/SidebarItem';
import { useShells } from '@client/hooks/useShells';
import { useWorktrees } from '@client/hooks/useWorktrees';

interface ProjectItemProps {
  project: Project;
}

export function ProjectItem({ project }: ProjectItemProps): React.ReactElement {
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
