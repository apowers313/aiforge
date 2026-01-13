import { Stack, Text } from '@mantine/core';
import type { Shell } from '@shared/types';
import { ShellItem } from './ShellItem';

interface ShellListProps {
  shells: Shell[];
  projectId: string;
}

export function ShellList({ shells, projectId }: ShellListProps): React.ReactElement {
  if (shells.length === 0) {
    return (
      <Text size="xs" c="dimmed" py="xs">
        No shells yet
      </Text>
    );
  }

  return (
    <Stack gap={2}>
      {shells.map((shell) => (
        <ShellItem key={shell.id} shell={shell} projectId={projectId} />
      ))}
    </Stack>
  );
}
