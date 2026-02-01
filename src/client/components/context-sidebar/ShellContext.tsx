/**
 * ShellContext - Wrapper for shell context sidebar content
 * Note: TODOs and Notes are now associated with projects, not shells.
 * This component shows a message directing users to use the project context.
 */
import { Text, Stack } from '@mantine/core';
import { useUIStore } from '@client/stores/uiStore';

export function ShellContext(): React.ReactElement {
  const selectedContextId = useUIStore((state) => state.selectedContextId);

  if (!selectedContextId) {
    return <Text c="dimmed">No shell selected</Text>;
  }

  return (
    <Stack align="center" justify="center" p="lg">
      <Text c="dimmed" ta="center">
        TODOs and Notes are now managed at the project level.
      </Text>
      <Text c="dimmed" ta="center" size="sm">
        Click on a project name to access TODOs and Notes.
      </Text>
    </Stack>
  );
}
