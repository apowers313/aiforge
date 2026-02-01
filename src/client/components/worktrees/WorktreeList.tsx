/**
 * WorktreeList - Displays a list of worktrees for a project
 *
 * Phase 2: Basic list display
 * Phase 8: Refactored to use SidebarItem for consistency with ProjectList
 */
import { useMemo } from 'react';
import { Stack, Text } from '@mantine/core';
import type { WorktreeWithStatus } from '@shared/types';
import { SidebarItem } from '@client/components/common/SidebarItem';
import { useShellsByWorktree } from '@client/hooks/useWorktrees';

interface WorktreeListProps {
  worktrees: WorktreeWithStatus[];
  projectId: string;
  showStatus?: boolean;
}

/**
 * Sort worktrees with main worktree first, then alphabetically by name
 */
function sortWorktrees(worktrees: WorktreeWithStatus[]): WorktreeWithStatus[] {
  return [...worktrees].sort((a, b) => {
    // Main worktree always comes first
    if (a.isMain && !b.isMain) return -1;
    if (!a.isMain && b.isMain) return 1;
    // Otherwise sort alphabetically by name
    return a.name.localeCompare(b.name);
  });
}

/**
 * Wrapper component that fetches shells for a single worktree and renders SidebarItem
 */
function WorktreeItemWrapper({
  worktree,
  projectId,
  showStatus,
}: {
  worktree: WorktreeWithStatus;
  projectId: string;
  showStatus: boolean;
}): React.ReactElement {
  const { data: shells = [] } = useShellsByWorktree(worktree.path);
  // Note: done field may be added by metadata merge - default to false if not present
  const done = 'done' in worktree ? Boolean(worktree.done) : false;

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

export function WorktreeList({ worktrees, projectId, showStatus = true }: WorktreeListProps): React.ReactElement {
  const sortedWorktrees = useMemo(() => sortWorktrees(worktrees), [worktrees]);

  if (worktrees.length === 0) {
    return (
      <Text size="xs" c="dimmed" py="xs">
        No worktrees
      </Text>
    );
  }

  return (
    <Stack gap={0}>
      {sortedWorktrees.map((worktree) => (
        <WorktreeItemWrapper
          key={worktree.path}
          worktree={worktree}
          projectId={projectId}
          showStatus={showStatus}
        />
      ))}
    </Stack>
  );
}
