/**
 * GitStatusBadge - Displays git status indicator for files
 */
import { Badge, Tooltip } from '@mantine/core';
import type { GitStatus } from '@shared/types';

interface GitStatusBadgeProps {
  status: GitStatus;
}

const STATUS_CONFIG: Record<
  NonNullable<GitStatus>,
  { label: string; color: string; tooltip: string }
> = {
  modified: { label: 'M', color: 'yellow', tooltip: 'Modified' },
  untracked: { label: '?', color: 'green', tooltip: 'Untracked (new)' },
  staged: { label: 'A', color: 'blue', tooltip: 'Staged' },
  deleted: { label: 'D', color: 'red', tooltip: 'Deleted' },
  renamed: { label: 'R', color: 'grape', tooltip: 'Renamed' },
};

export function GitStatusBadge({ status }: GitStatusBadgeProps): React.ReactElement | null {
  if (!status) {
    return null;
  }

  const config = STATUS_CONFIG[status];

  return (
    <Tooltip label={config.tooltip} withArrow>
      <Badge
        data-testid={`git-status-${status}`}
        color={config.color}
        size="xs"
        variant="filled"
        radius="xs"
        style={{ minWidth: 20, padding: '0 4px' }}
      >
        {config.label}
      </Badge>
    </Tooltip>
  );
}
