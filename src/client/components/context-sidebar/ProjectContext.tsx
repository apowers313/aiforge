/**
 * ProjectContext - Wrapper for project context sidebar content
 */
import { Text } from '@mantine/core';
import { useUIStore } from '@client/stores/uiStore';
import { ProjectUrlsTab } from './tabs/ProjectUrlsTab';
import { ProjectFilesTab } from './tabs/ProjectFilesTab';
import type { ContextSidebarTab } from '@shared/types';

export function ProjectContext(): React.ReactElement {
  const activeTab = useUIStore((state) => state.contextSidebarActiveTab);
  const selectedContextId = useUIStore((state) => state.selectedContextId);

  if (!selectedContextId) {
    return <Text c="dimmed">No project selected</Text>;
  }

  return <TabContent projectId={selectedContextId} activeTab={activeTab} />;
}

interface TabContentProps {
  projectId: string;
  activeTab: ContextSidebarTab;
}

function TabContent({ projectId, activeTab }: TabContentProps): React.ReactElement {
  switch (activeTab) {
    case 'urls':
      return <ProjectUrlsTab projectId={projectId} />;
    case 'files':
      return <ProjectFilesTab projectId={projectId} />;
    default:
      return <Text c="dimmed">Unknown tab</Text>;
  }
}
