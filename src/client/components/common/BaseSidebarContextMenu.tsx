/**
 * BaseSidebarContextMenu - Shared context menu for sidebar items (projects and worktrees)
 *
 * Provides consistent menu structure:
 * 1. Add AI Shell / Add Bash Shell (common)
 * 2. Entity-specific items (via middleItems prop)
 * 3. Danger zone action (delete/remove)
 *
 * This ensures feature parity between project and worktree context menus.
 */
import { type ReactNode } from 'react';
import { Menu, Tooltip } from '@mantine/core';
import { IconSparkles, IconTerminal2, IconTrash } from '@tabler/icons-react';

interface BaseSidebarContextMenuProps {
  /** Whether the menu is open */
  opened: boolean;
  /** Position for the menu */
  position: { x: number; y: number };
  /** Called when menu closes */
  onClose: () => void;
  /** Called when Add AI Shell is clicked */
  onAddAiShell: () => void;
  /** Called when Add Bash Shell is clicked */
  onAddBashShell: () => void;
  /** Whether shell creation is disabled (e.g., worktree is done) */
  shellActionsDisabled?: boolean;
  /** Items rendered at the very top of the menu (e.g., status indicators) */
  topItems?: ReactNode;
  /** Entity-specific menu items rendered between shell actions and danger zone */
  middleItems?: ReactNode;
  /** Label for the danger action (e.g., "Delete Project", "Remove Worktree") */
  dangerLabel: string;
  /** Called when the danger action is clicked */
  onDangerAction: () => void;
  /** Whether the danger action is disabled */
  dangerDisabled?: boolean;
  /** Tooltip shown when danger action is disabled */
  dangerDisabledTooltip?: string;
}

export function BaseSidebarContextMenu({
  opened,
  position,
  onClose,
  onAddAiShell,
  onAddBashShell,
  shellActionsDisabled = false,
  topItems,
  middleItems,
  dangerLabel,
  onDangerAction,
  dangerDisabled = false,
  dangerDisabledTooltip,
}: BaseSidebarContextMenuProps): React.ReactElement | null {
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

  const handleDangerAction = (): void => {
    if (!dangerDisabled) {
      onDangerAction();
      onClose();
    }
  };

  const dangerMenuItem = (
    <Menu.Item
      color="red"
      leftSection={<IconTrash size={14} />}
      onClick={handleDangerAction}
      disabled={dangerDisabled}
    >
      {dangerLabel}
    </Menu.Item>
  );

  return (
    <Menu opened={opened} onClose={onClose} position="bottom-start" withinPortal>
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
        {/* Top items (e.g., status indicators) */}
        {topItems && (
          <>
            {topItems}
            <Menu.Divider />
          </>
        )}

        {/* Shell creation actions - consistent across all sidebar items */}
        {!shellActionsDisabled && (
          <>
            <Menu.Item
              leftSection={<IconSparkles size={14} style={{ color: 'var(--mantine-color-violet-4)' }} />}
              onClick={handleAddAiShell}
            >
              Add AI Shell
            </Menu.Item>
            <Menu.Item
              leftSection={<IconTerminal2 size={14} style={{ color: 'var(--mantine-color-green-4)' }} />}
              onClick={handleAddBashShell}
            >
              Add Bash Shell
            </Menu.Item>
            <Menu.Divider />
          </>
        )}

        {/* Entity-specific items */}
        {middleItems}

        {/* Danger zone */}
        <Menu.Divider />
        {dangerDisabledTooltip ? (
          <Tooltip label={dangerDisabledTooltip} disabled={!dangerDisabled} position="right" withArrow>
            {dangerMenuItem}
          </Tooltip>
        ) : (
          dangerMenuItem
        )}
      </Menu.Dropdown>
    </Menu>
  );
}
