/**
 * ShellContext - Wrapper for shell context sidebar content
 */
import { Text } from '@mantine/core';
import { useUIStore } from '@client/stores/uiStore';
import { ShellTodosTab } from './tabs/ShellTodosTab';
import { ShellNotesTab } from './tabs/ShellNotesTab';
import type { ContextSidebarTab } from '@shared/types';

export function ShellContext(): React.ReactElement {
  const activeTab = useUIStore((state) => state.contextSidebarActiveTab);
  const selectedContextId = useUIStore((state) => state.selectedContextId);

  if (!selectedContextId) {
    return <Text c="dimmed">No shell selected</Text>;
  }

  return <TabContent shellId={selectedContextId} activeTab={activeTab} />;
}

interface TabContentProps {
  shellId: string;
  activeTab: ContextSidebarTab;
}

function TabContent({ shellId, activeTab }: TabContentProps): React.ReactElement {
  switch (activeTab) {
    case 'todos':
      return <ShellTodosTab shellId={shellId} />;
    case 'notes':
      return <ShellNotesTab shellId={shellId} />;
    default:
      return <Text c="dimmed">Unknown tab</Text>;
  }
}
