import { useState, useEffect } from 'react';
import { ActionIcon, Menu, Badge, Modal, TextInput, Button, Stack, Group } from '@mantine/core';
import { IconTerminal2, IconDots, IconTrash, IconPencil, IconRefresh, IconSparkles, IconCheck, IconPlayerPlay } from '@tabler/icons-react';
import type { Shell } from '@shared/types';
import { useDeleteShell, useUpdateShell, useRestartShell, useActiveShellId } from '@client/hooks/useShells';
import { useUIStore } from '@client/stores/uiStore';
import { TreeItem } from '@client/components/common/TreeItem';

interface ShellItemProps {
  shell: Shell;
  projectId: string;
  /** Timeout in milliseconds before AI shell is considered idle (default: 5000) */
  aiIdleTimeoutMs?: number;
  /** Tree depth for proper indentation (default: 1) */
  depth?: number;
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
 * Worktree info needed for status calculation
 */
export interface WorktreeStatusInfo {
  path: string;
  done: boolean;
}

/**
 * Calculate status for a group of AI shells
 * Returns: 'red' | 'green' | 'blue' | null
 */
function calculateShellGroupStatus(
  aiShells: Shell[],
  shellActivityTimestamps: Record<string, number>,
  idleTimeoutMs: number,
): ProjectAiStatus {
  if (aiShells.length === 0) {
    return null;
  }

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
  if (hasRed) return 'red';
  if (hasGreen) return 'green';
  if (hasBlue) return 'blue';
  return null;
}

/**
 * Hook to determine the aggregated AI status for a project
 *
 * Status aggregation:
 * 1. Direct AI shells (shells with no worktreePath) contribute to project status
 * 2. Each worktree's status is calculated from its AI shells
 *    - If worktree is marked done → 'blue' (regardless of shell activity)
 *    - Otherwise, status comes from worktree's AI shells
 * 3. All statuses are aggregated with priority: red > green > blue > null
 *
 * @param shells - All shells for the project (including worktree shells)
 * @param worktrees - Worktrees with their done status (optional, for status aggregation)
 * @param idleTimeoutMs - Timeout before AI shell is considered idle (default: 5000)
 * @returns Aggregated status: 'red' | 'green' | 'blue' | null
 */
export function useProjectAiStatus(
  shells: Shell[],
  worktrees: WorktreeStatusInfo[] = [],
  idleTimeoutMs = 5000,
): ProjectAiStatus {
  const [status, setStatus] = useState<ProjectAiStatus>(null);
  const shellActivityTimestamps = useUIStore((state) => state.shellActivityTimestamps);

  useEffect(() => {
    // Separate direct project shells from worktree shells
    const directShells = shells.filter((s) => s.worktreePath == null);
    const directAiShells = directShells.filter((s) => s.type === 'ai');

    const checkStatus = (): void => {
      const allStatuses: ProjectAiStatus[] = [];

      // 1. Calculate status for direct AI shells
      const directStatus = calculateShellGroupStatus(directAiShells, shellActivityTimestamps, idleTimeoutMs);
      if (directStatus !== null) {
        allStatuses.push(directStatus);
      }

      // 2. Calculate status for each worktree
      for (const worktree of worktrees) {
        if (worktree.done) {
          // Worktree marked as done → blue
          allStatuses.push('blue');
        } else {
          // Get shells for this worktree
          const worktreeShells = shells.filter((s) => s.worktreePath === worktree.path);
          const worktreeAiShells = worktreeShells.filter((s) => s.type === 'ai');
          const worktreeStatus = calculateShellGroupStatus(worktreeAiShells, shellActivityTimestamps, idleTimeoutMs);
          if (worktreeStatus !== null) {
            allStatuses.push(worktreeStatus);
          }
        }
      }

      // 3. Aggregate all statuses with priority: red > green > blue
      if (allStatuses.length === 0) {
        setStatus(null);
        return;
      }

      if (allStatuses.includes('red')) {
        setStatus('red');
      } else if (allStatuses.includes('green')) {
        setStatus('green');
      } else if (allStatuses.includes('blue')) {
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
  }, [shells, worktrees, shellActivityTimestamps, idleTimeoutMs]);

  return status;
}

export function ShellItem({ shell, projectId, aiIdleTimeoutMs = 5000, depth = 1 }: ShellItemProps): React.ReactElement {
  const { activeShellId, setActiveShell } = useActiveShellId();
  const toggleContextSidebar = useUIStore((state) => state.toggleContextSidebar);
  const deleteShellMutation = useDeleteShell();
  const updateShellMutation = useUpdateShell();
  const restartShellMutation = useRestartShell();
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [newName, setNewName] = useState(shell.name);
  const [contextMenuOpened, setContextMenuOpened] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const isAiRecentlyActive = useAiShellActivity(shell, aiIdleTimeoutMs);

  const isActive = activeShellId === shell.id;
  const isAiShell = shell.type === 'ai';

  const handleClick = (): void => {
    setActiveShell(shell.id);
    toggleContextSidebar('shell', shell.id);
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

  // Build the icon based on shell type
  const icon = isAiShell ? (
    <IconSparkles size={14} style={{ color: 'var(--mantine-color-violet-4)' }} />
  ) : (
    <IconTerminal2 size={14} style={{ color: 'var(--mantine-color-green-4)' }} />
  );

  // Menu for shell options (always visible)
  const menu = (
    <Menu position="bottom-end" withinPortal opened={contextMenuOpened} onClose={(): void => { setContextMenuOpened(false); }}>
      <Menu.Target>
        <ActionIcon
          variant="subtle"
          size="xs"
          onClick={(e): void => { e.stopPropagation(); setContextMenuOpened(true); }}
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
  );

  // Build badges for display (includes status badge and menu)
  const badges = (
    <>
      <Badge size="xs" variant="dot" color={statusColor}>
        {shell.status}
      </Badge>
      {menu}
    </>
  );

  return (
    <>
      <TreeItem
        label={shell.name}
        icon={icon}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        depth={depth}
        statusColor={isAiShell ? activityIndicatorColor : null}
        selected={isActive}
        hovered={isHovered}
        onHoverChange={setIsHovered}
        strikethrough={shell.done}
        dimmed={shell.done}
        badges={badges}
        testId="shell-item"
        nameTestId="shell-name"
      />

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
