/**
 * WorktreeContextMenu - Context menu for worktree items
 *
 * Extends BaseSidebarContextMenu with worktree-specific items:
 * - Status icons at top (modified files, ahead/behind commits)
 * - Mark as Done / Mark as Active
 */
import { Group, Menu, Text } from '@mantine/core';
import { IconCheck, IconRefresh, IconEdit, IconArrowUp, IconArrowDown, IconGitBranch } from '@tabler/icons-react';
import type { WorktreeWithStatus } from '@shared/types';
import { BaseSidebarContextMenu } from '@client/components/common/BaseSidebarContextMenu';

interface WorktreeContextMenuProps {
  worktree: WorktreeWithStatus;
  opened: boolean;
  position: { x: number; y: number };
  done?: boolean;
  onClose: () => void;
  onRemove: () => void;
  onToggleDone?: (done: boolean) => void;
  onAddAiShell?: () => void;
  onAddBashShell?: () => void;
}

export function WorktreeContextMenu({
  worktree,
  opened,
  position,
  done = false,
  onClose,
  onRemove,
  onToggleDone,
  onAddAiShell,
  onAddBashShell,
}: WorktreeContextMenuProps): React.ReactElement | null {
  const isMainWorktree = worktree.isMain;

  const handleToggleDone = (): void => {
    onToggleDone?.(!done);
    onClose();
  };

  // Build status items for top of menu
  const hasStatus = worktree.modifiedCount > 0 || worktree.ahead > 0 || worktree.behind > 0 || worktree.isMain || done;

  const topItems = hasStatus ? (
    <Menu.Label>
      <Group gap="xs">
        {worktree.isMain && (
          <Group gap={4}>
            <IconGitBranch size={12} style={{ color: 'var(--mantine-color-green-5)' }} />
            <Text size="xs" c="green">main</Text>
          </Group>
        )}
        {done && (
          <Group gap={4}>
            <IconCheck size={12} style={{ color: 'var(--mantine-color-blue-5)' }} />
            <Text size="xs" c="blue">done</Text>
          </Group>
        )}
        {worktree.modifiedCount > 0 && (
          <Group gap={4}>
            <IconEdit size={12} style={{ color: 'var(--mantine-color-yellow-5)' }} />
            <Text size="xs" c="yellow">{worktree.modifiedCount} modified</Text>
          </Group>
        )}
        {worktree.ahead > 0 && (
          <Group gap={4}>
            <IconArrowUp size={12} style={{ color: 'var(--mantine-color-green-5)' }} />
            <Text size="xs" c="green">{worktree.ahead} ahead</Text>
          </Group>
        )}
        {worktree.behind > 0 && (
          <Group gap={4}>
            <IconArrowDown size={12} style={{ color: 'var(--mantine-color-red-5)' }} />
            <Text size="xs" c="red">{worktree.behind} behind</Text>
          </Group>
        )}
      </Group>
    </Menu.Label>
  ) : null;

  // Worktree-specific menu items
  const middleItems = (
    <Menu.Item
      color={done ? 'gray' : 'blue'}
      leftSection={done ? <IconRefresh size={14} /> : <IconCheck size={14} />}
      onClick={handleToggleDone}
    >
      {done ? 'Mark as Active' : 'Mark as Done'}
    </Menu.Item>
  );

  // No-op handlers for when shell actions are disabled or not provided
  const handleAddAiShell = onAddAiShell ?? ((): void => { /* no-op */ });
  const handleAddBashShell = onAddBashShell ?? ((): void => { /* no-op */ });

  return (
    <BaseSidebarContextMenu
      opened={opened}
      position={position}
      onClose={onClose}
      onAddAiShell={handleAddAiShell}
      onAddBashShell={handleAddBashShell}
      shellActionsDisabled={done}
      topItems={topItems}
      middleItems={middleItems}
      dangerLabel="Remove Worktree"
      onDangerAction={onRemove}
      dangerDisabled={isMainWorktree}
      dangerDisabledTooltip="Cannot remove main worktree"
    />
  );
}
