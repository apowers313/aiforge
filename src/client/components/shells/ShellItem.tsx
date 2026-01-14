import { useState, useEffect } from 'react';
import { Box, Group, Text, UnstyledButton, ActionIcon, Menu, Badge, Modal, TextInput, Button, Stack } from '@mantine/core';
import { IconTerminal2, IconDots, IconTrash, IconPencil, IconRefresh, IconSparkles, IconCheck, IconPlayerPlay } from '@tabler/icons-react';
import type { Shell } from '@shared/types';
import { useDeleteShell, useUpdateShell, useRestartShell, useActiveShellId } from '@client/hooks/useShells';
import { useUIStore } from '@client/stores/uiStore';

interface ShellItemProps {
  shell: Shell;
  projectId: string;
  /** Timeout in milliseconds before AI shell is considered idle (default: 5000) */
  aiIdleTimeoutMs?: number;
  /** Offset in pixels for positioning the AI activity indicator in the left gutter */
  indicatorOffset?: number;
}

/**
 * Check if a shell has recent activity (utility function)
 */
function isShellRecentlyActive(
  shell: Shell,
  clientActivityTimestamp: number | undefined,
  idleTimeoutMs: number,
): boolean {
  let lastActivityTime: number | null = null;

  if (clientActivityTimestamp) {
    lastActivityTime = clientActivityTimestamp;
  } else if (shell.lastActivityAt) {
    lastActivityTime = new Date(shell.lastActivityAt).getTime();
  }

  if (!lastActivityTime) {
    return false;
  }

  const now = Date.now();
  return now - lastActivityTime < idleTimeoutMs;
}

/**
 * Hook to determine if an AI shell has had recent activity (input or output)
 * Uses client-side tracking from UI store for immediate responsiveness
 */
export function useAiShellActivity(shell: Shell, idleTimeoutMs: number): boolean {
  const [isRecentlyActive, setIsRecentlyActive] = useState(false);
  const clientActivityTimestamp = useUIStore(
    (state) => state.shellActivityTimestamps[shell.id],
  );

  useEffect(() => {
    if (shell.type !== 'ai') {
      return;
    }

    const checkActivity = (): void => {
      const isActive = isShellRecentlyActive(shell, clientActivityTimestamp, idleTimeoutMs);
      setIsRecentlyActive(isActive);
    };

    // Check immediately
    checkActivity();

    // Set up interval to re-check periodically
    const interval = setInterval(checkActivity, 1000);

    return (): void => {
      clearInterval(interval);
    };
  }, [shell.type, shell.id, shell.lastActivityAt, clientActivityTimestamp, idleTimeoutMs]);

  return isRecentlyActive;
}

export type ProjectAiStatus = 'red' | 'green' | 'blue' | null;

/**
 * Hook to determine the aggregated AI status for a project
 * Returns:
 * - 'red' if any AI shell is idle (not done, not recently active)
 * - 'green' if any AI shell is active (not done, recently active)
 * - 'blue' if all AI shells are done
 * - null if there are no AI shells
 */
export function useProjectAiStatus(shells: Shell[], idleTimeoutMs = 5000): ProjectAiStatus {
  const [status, setStatus] = useState<ProjectAiStatus>(null);
  const shellActivityTimestamps = useUIStore((state) => state.shellActivityTimestamps);

  useEffect(() => {
    const aiShells = shells.filter((s) => s.type === 'ai');

    if (aiShells.length === 0) {
      setStatus(null);
      return;
    }

    const checkStatus = (): void => {
      let hasRed = false;
      let hasGreen = false;
      let hasBlue = false;

      for (const shell of aiShells) {
        if (shell.done) {
          hasBlue = true;
        } else {
          const isActive = isShellRecentlyActive(
            shell,
            shellActivityTimestamps[shell.id],
            idleTimeoutMs,
          );
          if (isActive) {
            hasGreen = true;
          } else {
            hasRed = true;
          }
        }
      }

      // Priority: red > green > blue
      if (hasRed) {
        setStatus('red');
      } else if (hasGreen) {
        setStatus('green');
      } else if (hasBlue) {
        setStatus('blue');
      } else {
        setStatus(null);
      }
    };

    // Check immediately
    checkStatus();

    // Set up interval to re-check periodically
    const interval = setInterval(checkStatus, 1000);

    return (): void => {
      clearInterval(interval);
    };
  }, [shells, shellActivityTimestamps, idleTimeoutMs]);

  return status;
}

export function ShellItem({ shell, projectId, aiIdleTimeoutMs = 5000, indicatorOffset = 7 }: ShellItemProps): React.ReactElement {
  const { activeShellId, setActiveShell } = useActiveShellId();
  const deleteShellMutation = useDeleteShell();
  const updateShellMutation = useUpdateShell();
  const restartShellMutation = useRestartShell();
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [newName, setNewName] = useState(shell.name);
  const [contextMenuOpened, setContextMenuOpened] = useState(false);
  const isAiRecentlyActive = useAiShellActivity(shell, aiIdleTimeoutMs);

  const isActive = activeShellId === shell.id;
  const isAiShell = shell.type === 'ai';

  const handleClick = (): void => {
    console.log(`[TERMINAL_SWITCH] ${performance.now().toFixed(2)}ms - Click on shell: ${shell.id} (${shell.name})`);
    (window as unknown as { __terminalSwitchStart?: number }).__terminalSwitchStart = performance.now();
    setActiveShell(shell.id);
  };

  const handleDelete = (): void => {
    deleteShellMutation.mutate({ shellId: shell.id, projectId });
  };

  const handleRenameClick = (): void => {
    setNewName(shell.name);
    setRenameModalOpen(true);
  };

  const handleRenameSubmit = (): void => {
    if (!newName.trim() || newName === shell.name) {
      setRenameModalOpen(false);
      return;
    }
    updateShellMutation.mutate(
      { shellId: shell.id, updates: { name: newName.trim() } },
      {
        onSuccess: () => {
          setRenameModalOpen(false);
        },
      },
    );
  };

  const handleRestart = (): void => {
    restartShellMutation.mutate(shell.id);
  };

  const handleToggleDone = (): void => {
    updateShellMutation.mutate({
      shellId: shell.id,
      updates: { done: !shell.done },
    });
  };

  const statusColor = shell.status === 'active' ? 'green' : shell.status === 'error' ? 'red' : 'gray';

  // Activity indicator color for AI shells
  // Blue when done, green when active, red when idle
  const activityIndicatorColor = shell.done
    ? 'var(--mantine-color-blue-6)'
    : isAiRecentlyActive
      ? 'var(--mantine-color-green-6)'
      : 'var(--mantine-color-red-6)';

  const handleContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuOpened(true);
  };

  return (
    <>
      <Box
        style={{
          display: 'flex',
          alignItems: 'stretch',
          position: 'relative',
        }}
        onContextMenu={handleContextMenu}
      >
        {/* Activity indicator for AI shells - positioned in the left gutter */}
        {isAiShell && (
          <Box
            style={{
              position: 'absolute',
              left: -indicatorOffset,
              top: 0,
              bottom: 0,
              width: 3,
              backgroundColor: activityIndicatorColor,
              borderRadius: 'var(--mantine-radius-xs)',
            }}
            data-testid="ai-activity-indicator"
          />
        )}
        <Group gap={0} wrap="nowrap" style={{ flex: 1 }}>
          <UnstyledButton
            onClick={handleClick}
            style={{
              flex: 1,
              padding: '6px 10px',
              borderRadius: 'var(--mantine-radius-sm)',
              backgroundColor: isActive ? 'var(--mantine-color-dark-5)' : 'transparent',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
            className="shell-item"
            data-testid="shell-item"
          >
            {isAiShell ? (
              <IconSparkles size={14} style={{ flexShrink: 0, color: 'var(--mantine-color-violet-4)' }} />
            ) : (
              <IconTerminal2 size={14} style={{ flexShrink: 0, color: 'var(--mantine-color-green-4)' }} />
            )}
            <Text size="xs" truncate style={{ flex: 1 }}>
              {shell.name}
            </Text>
            <Badge size="xs" variant="dot" color={statusColor}>
              {shell.status}
            </Badge>
          </UnstyledButton>

          <Menu position="bottom-end" withinPortal opened={contextMenuOpened} onClose={() => { setContextMenuOpened(false); }}>
            <Menu.Target>
              <ActionIcon
                variant="subtle"
                size="xs"
                onClick={(e) => { e.stopPropagation(); setContextMenuOpened(true); }}
              >
                <IconDots size={12} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<IconPencil size={14} />}
                onClick={handleRenameClick}
              >
                Rename
              </Menu.Item>
              <Menu.Item
                leftSection={<IconRefresh size={14} />}
                onClick={handleRestart}
              >
                Restart
              </Menu.Item>
              {isAiShell && (
                <Menu.Item
                  leftSection={shell.done ? <IconPlayerPlay size={14} /> : <IconCheck size={14} />}
                  onClick={handleToggleDone}
                >
                  {shell.done ? 'Mark as Active' : 'Mark as Done'}
                </Menu.Item>
              )}
              <Menu.Divider />
              <Menu.Item
                color="red"
                leftSection={<IconTrash size={14} />}
                onClick={handleDelete}
              >
                Close Shell
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Box>

      <Modal
        opened={renameModalOpen}
        onClose={() => { setRenameModalOpen(false); }}
        title="Rename Shell"
        size="sm"
      >
        <Stack>
          <TextInput
            label="Shell name"
            value={newName}
            onChange={(e) => { setNewName(e.currentTarget.value); }}
            placeholder="Enter shell name"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleRenameSubmit();
              }
            }}
          />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => { setRenameModalOpen(false); }}>
              Cancel
            </Button>
            <Button onClick={handleRenameSubmit} loading={updateShellMutation.isPending}>
              Rename
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
