/**
 * ProjectContextMenu - Context menu for project items
 *
 * Extends BaseSidebarContextMenu with project-specific items:
 * - Add Worktree
 * - Show/Hide Worktree Status
 */
import { Menu, Tooltip } from '@mantine/core';
import { IconFolderPlus, IconEye, IconEyeOff } from '@tabler/icons-react';
import type { Project } from '@shared/types';
import { BaseSidebarContextMenu } from '@client/components/common/BaseSidebarContextMenu';

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
  worktreeStatusHidden?: boolean;
  onToggleWorktreeStatus?: () => void;
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
  worktreeStatusHidden = false,
  onToggleWorktreeStatus,
}: ProjectContextMenuProps): React.ReactElement | null {
  const handleAddWorktree = (): void => {
    if (worktreeEnabled && onAddWorktree) {
      onAddWorktree();
      onClose();
    }
  };

  const handleToggleWorktreeStatus = (): void => {
    if (onToggleWorktreeStatus) {
      onToggleWorktreeStatus();
      onClose();
    }
  };

  // Project-specific menu items
  const middleItems = (
    <>
      <Tooltip label="Coming soon" disabled={worktreeEnabled} position="right" withArrow>
        <Menu.Item
          leftSection={<IconFolderPlus size={14} />}
          onClick={handleAddWorktree}
          disabled={!worktreeEnabled}
        >
          Add Worktree...
        </Menu.Item>
      </Tooltip>
      {onToggleWorktreeStatus && (
        <Menu.Item
          leftSection={worktreeStatusHidden ? <IconEye size={14} /> : <IconEyeOff size={14} />}
          onClick={handleToggleWorktreeStatus}
        >
          {worktreeStatusHidden ? 'Show Worktree Status' : 'Hide Worktree Status'}
        </Menu.Item>
      )}
    </>
  );

  return (
    <BaseSidebarContextMenu
      opened={opened}
      position={position}
      onClose={onClose}
      onAddAiShell={onAddAiShell}
      onAddBashShell={onAddBashShell}
      middleItems={middleItems}
      dangerLabel="Delete Project"
      onDangerAction={onDelete}
    />
  );
}
