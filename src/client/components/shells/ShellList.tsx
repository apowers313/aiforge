import { useMemo } from 'react';
import { Stack, Text } from '@mantine/core';
import type { Shell } from '@shared/types';
import { ShellItem } from './ShellItem';

interface ShellListProps {
  shells: Shell[];
  projectId: string;
  /** Offset in pixels for positioning the AI activity indicator in the left gutter */
  indicatorOffset?: number;
}

/**
 * Sort shells with AI shells at the top, then by creation time
 */
function sortShells(shells: Shell[]): Shell[] {
  return [...shells].sort((a, b) => {
    // AI shells come first
    if (a.type === 'ai' && b.type !== 'ai') return -1;
    if (a.type !== 'ai' && b.type === 'ai') return 1;
    // Within same type, sort by creation time (newest first for AI, oldest first for bash)
    if (a.type === 'ai' && b.type === 'ai') {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

export function ShellList({ shells, projectId, indicatorOffset }: ShellListProps): React.ReactElement {
  const sortedShells = useMemo(() => sortShells(shells), [shells]);

  if (shells.length === 0) {
    return (
      <Text size="xs" c="dimmed" py="xs">
        No shells yet
      </Text>
    );
  }

  return (
    <Stack gap={2}>
      {sortedShells.map((shell) => (
        <ShellItem key={shell.id} shell={shell} projectId={projectId} indicatorOffset={indicatorOffset} />
      ))}
    </Stack>
  );
}
