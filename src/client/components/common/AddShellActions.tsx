/**
 * AddShellActions - Reusable action buttons for adding shells
 *
 * Used by SidebarItem for both projects and worktrees to ensure
 * consistent UI and behavior across entity types.
 */
import { ActionIcon, Tooltip } from '@mantine/core';
import { IconSparkles, IconTerminal2 } from '@tabler/icons-react';

interface AddShellActionsProps {
  onAddAiShell: () => void;
  onAddBashShell: () => void;
  disabled?: boolean;
}

export function AddShellActions({
  onAddAiShell,
  onAddBashShell,
  disabled = false,
}: AddShellActionsProps): React.ReactElement | null {
  if (disabled) {
    return null;
  }

  return (
    <>
      <Tooltip label="Add AI Shell" withArrow>
        <ActionIcon
          size="xs"
          variant="subtle"
          onClick={(e): void => {
            e.stopPropagation();
            onAddAiShell();
          }}
          aria-label="Add AI Shell"
          data-testid="add-ai-shell-button"
        >
          <IconSparkles size={12} style={{ color: 'var(--mantine-color-violet-4)' }} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Add Bash Shell" withArrow>
        <ActionIcon
          size="xs"
          variant="subtle"
          onClick={(e): void => {
            e.stopPropagation();
            onAddBashShell();
          }}
          aria-label="Add Bash Shell"
          data-testid="add-shell-button"
        >
          <IconTerminal2 size={12} style={{ color: 'var(--mantine-color-green-4)' }} />
        </ActionIcon>
      </Tooltip>
    </>
  );
}
