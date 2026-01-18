import { ActionIcon, Group, Text } from '@mantine/core';
import { IconX, IconPin, IconPinFilled } from '@tabler/icons-react';
import { useUIStore } from '@client/stores/uiStore';
import type { ContextType } from '@shared/types';

interface ContextSidebarHeaderProps {
  contextType: ContextType;
}

export function ContextSidebarHeader({ contextType }: ContextSidebarHeaderProps): React.ReactElement {
  const pinned = useUIStore((state) => state.contextSidebarPinned);
  const closeContextSidebar = useUIStore((state) => state.closeContextSidebar);
  const toggleContextSidebarPin = useUIStore((state) => state.toggleContextSidebarPin);

  const title = contextType === 'project' ? 'Project Context' : 'Shell Context';

  return (
    <Group justify="space-between" p="sm" style={{ borderBottom: '1px solid var(--mantine-color-dark-4)' }}>
      <Text size="sm" fw={600} c="dimmed">
        {title}
      </Text>
      <Group gap="xs">
        <ActionIcon
          variant="subtle"
          size="sm"
          onClick={toggleContextSidebarPin}
          aria-pressed={pinned}
          data-testid="pin-button"
          title={pinned ? 'Unpin sidebar' : 'Pin sidebar'}
        >
          {pinned ? <IconPinFilled size={16} /> : <IconPin size={16} />}
        </ActionIcon>
        <ActionIcon
          variant="subtle"
          size="sm"
          onClick={closeContextSidebar}
          data-testid="close-button"
          title="Close sidebar"
        >
          <IconX size={16} />
        </ActionIcon>
      </Group>
    </Group>
  );
}
