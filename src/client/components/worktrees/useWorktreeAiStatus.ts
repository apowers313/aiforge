/**
 * Hook to calculate AI status for a worktree based on its shells
 *
 * Status priority: red > green > blue > null
 * - red: Has idle AI shell (waiting for user)
 * - green: Has active AI shell (processing)
 * - blue: Worktree is done OR all AI shells are done
 * - null: No AI shells
 */
import { useState, useEffect } from 'react';
import type { Shell } from '@shared/types';
import { useUIStore } from '@client/stores/uiStore';

export type WorktreeAiStatus = 'red' | 'green' | 'blue' | null;

/**
 * Check if a shell has recent activity
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
 * Get status color CSS variable
 */
export function getWorktreeStatusColor(status: WorktreeAiStatus): string | null {
  switch (status) {
    case 'red':
      return 'var(--mantine-color-red-6)';
    case 'green':
      return 'var(--mantine-color-green-6)';
    case 'blue':
      return 'var(--mantine-color-blue-6)';
    default:
      return null;
  }
}

/**
 * Hook to determine the AI status for a worktree
 *
 * @param shells - Shells associated with this worktree
 * @param worktreeDone - Whether the worktree is marked as done
 * @param idleTimeoutMs - Timeout before AI shell is considered idle (default: 5000)
 * @returns Status: 'red' | 'green' | 'blue' | null
 */
export function useWorktreeAiStatus(
  shells: Shell[],
  worktreeDone: boolean,
  idleTimeoutMs = 5000,
): WorktreeAiStatus {
  const [status, setStatus] = useState<WorktreeAiStatus>(null);
  const shellActivityTimestamps = useUIStore((state) => state.shellActivityTimestamps);

  useEffect(() => {
    const checkStatus = (): void => {
      // If worktree is done, return blue regardless of shell activity
      if (worktreeDone) {
        setStatus('blue');
        return;
      }

      const aiShells = shells.filter((s) => s.type === 'ai');

      if (aiShells.length === 0) {
        setStatus(null);
        return;
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
  }, [shells, worktreeDone, shellActivityTimestamps, idleTimeoutMs]);

  return status;
}
