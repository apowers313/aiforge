/**
 * WorktreeContext - Wrapper for worktree context sidebar content
 * Phase 7: Worktree context sidebar with URLs and Files tabs
 */
import { Text } from '@mantine/core';
import { useUIStore } from '@client/stores/uiStore';
import { WorktreeUrlsTab } from './tabs/WorktreeUrlsTab';
import { WorktreeFilesTab } from './tabs/WorktreeFilesTab';
import type { ContextSidebarTab } from '@shared/types';

export function WorktreeContext(): React.ReactElement {
  const activeTab = useUIStore((state) => state.contextSidebarActiveTab);
  const selectedContextId = useUIStore((state) => state.selectedContextId);

  // For worktrees, selectedContextId contains the worktree path
  if (!selectedContextId) {
    return <Text c="dimmed">No worktree selected</Text>;
  }

  return <TabContent worktreePath={selectedContextId} activeTab={activeTab} />;
}

interface TabContentProps {
  worktreePath: string;
  activeTab: ContextSidebarTab;
}

function TabContent({ worktreePath, activeTab }: TabContentProps): React.ReactElement {
  switch (activeTab) {
    case 'urls':
      return <WorktreeUrlsTab worktreePath={worktreePath} />;
    case 'files':
      return <WorktreeFilesTab worktreePath={worktreePath} />;
    default:
      return <Text c="dimmed">Unknown tab</Text>;
  }
}
