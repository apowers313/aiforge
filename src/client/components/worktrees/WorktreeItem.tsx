/**
 * WorktreeItem - Displays a single worktree in the project sidebar
 *
 * This is now a thin wrapper around SidebarItem for backwards compatibility.
 * All logic has been unified in SidebarItem to ensure feature parity with ProjectItem.
 */
import type { WorktreeWithStatus } from '@shared/types';
import { SidebarItem } from '@client/components/common/SidebarItem';
import { useShellsByWorktree } from '@client/hooks/useWorktrees';

interface WorktreeItemProps {
  worktree: WorktreeWithStatus;
  projectId: string;
  done?: boolean;
  showStatus?: boolean;
}

export function WorktreeItem({
  worktree,
  projectId,
  done = false,
  showStatus = true,
}: WorktreeItemProps): React.ReactElement {
  const { data: shells = [] } = useShellsByWorktree(worktree.path);

  return (
    <SidebarItem
      variant={{
        type: 'worktree',
        worktree,
        projectId,
        shells,
        done,
        showStatus,
      }}
    />
  );
}
