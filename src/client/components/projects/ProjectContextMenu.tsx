import { Menu, Tooltip } from '@mantine/core';
import { IconSparkles, IconPlus, IconFolderPlus, IconTrash } from '@tabler/icons-react';
import type { Project } from '@shared/types';

interface ProjectContextMenuProps {
  project: Project;
  opened: boolean;
  position: { x: number; y: number };
  onClose: () => void;
  onAddAiShell: () => void;
  onAddBashShell: () => void;
  onAddWorktree?: () => void;
  onDelete: () => void;
  worktreeEnabled?: boolean;
}

export function ProjectContextMenu({
  project: _project,
  opened,
  position,
  onClose,
  onAddAiShell,
  onAddBashShell,
  onAddWorktree,
  onDelete,
  worktreeEnabled = false,
}: ProjectContextMenuProps): React.ReactElement | null {
  if (!opened) {
    return null;
  }

  const handleAddAiShell = (): void => {
    onAddAiShell();
    onClose();
  };

  const handleAddBashShell = (): void => {
    onAddBashShell();
    onClose();
  };

  const handleAddWorktree = (): void => {
    if (worktreeEnabled && onAddWorktree) {
      onAddWorktree();
      onClose();
    }
  };

  const handleDelete = (): void => {
    onDelete();
    onClose();
  };

  return (
    <Menu
      opened={opened}
      onClose={onClose}
      position="bottom-start"
      withinPortal
    >
      <Menu.Target>
        <div
          style={{
            position: 'fixed',
            left: position.x,
            top: position.y,
            width: 1,
            height: 1,
          }}
        />
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          leftSection={<IconSparkles size={14} style={{ color: 'var(--mantine-color-violet-4)' }} />}
          onClick={handleAddAiShell}
        >
          Add AI Shell
        </Menu.Item>
        <Menu.Item
          leftSection={<IconPlus size={14} />}
          onClick={handleAddBashShell}
        >
          Add Bash Shell
        </Menu.Item>
        <Menu.Divider />
        <Tooltip
          label="Coming soon"
          disabled={worktreeEnabled}
          position="right"
          withArrow
        >
          <Menu.Item
            leftSection={<IconFolderPlus size={14} />}
            onClick={handleAddWorktree}
            disabled={!worktreeEnabled}
          >
            Add Worktree...
          </Menu.Item>
        </Tooltip>
        <Menu.Divider />
        <Menu.Item
          color="red"
          leftSection={<IconTrash size={14} />}
          onClick={handleDelete}
        >
          Delete Project
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
