import { Box, SegmentedControl, Stack, Text } from '@mantine/core';
import { useClickOutside } from '@mantine/hooks';
import { useUIStore } from '@client/stores/uiStore';
import { ContextSidebarHeader } from './ContextSidebarHeader';
import { ProjectContext } from './ProjectContext';
import type { ContextSidebarTab } from '@shared/types';

export function ContextSidebar(): React.ReactElement | null {
  const open = useUIStore((state) => state.contextSidebarOpen);
  const pinned = useUIStore((state) => state.contextSidebarPinned);
  const width = useUIStore((state) => state.contextSidebarWidth);
  const contextType = useUIStore((state) => state.selectedContextType);
  const activeTab = useUIStore((state) => state.contextSidebarActiveTab);
  const setContextSidebarTab = useUIStore((state) => state.setContextSidebarTab);
  const closeContextSidebar = useUIStore((state) => state.closeContextSidebar);

  // Close sidebar when clicking outside (only when unpinned/overlay mode)
  const sidebarRef = useClickOutside(() => {
    if (!pinned && open) {
      closeContextSidebar();
    }
  });

  if (!open || !contextType) {
    return null;
  }

  // Determine which tabs to show based on context type
  const isProject = contextType === 'project';
  const tabs = isProject
    ? [
      { label: 'URLs', value: 'urls' as ContextSidebarTab },
      { label: 'Files', value: 'files' as ContextSidebarTab },
    ]
    : [
      { label: 'TODOs', value: 'todos' as ContextSidebarTab },
      { label: 'Notes', value: 'notes' as ContextSidebarTab },
    ];

  return (
    <Box
      ref={sidebarRef}
      data-testid="context-sidebar"
      style={{
        width: `${String(width)}px`,
        height: '100%',
        backgroundColor: 'var(--mantine-color-dark-7)',
        borderLeft: '1px solid var(--mantine-color-dark-4)',
        display: 'flex',
        flexDirection: 'column',
        position: pinned ? 'relative' : 'fixed',
        right: pinned ? undefined : 0,
        top: pinned ? undefined : '50px', // Below header
        bottom: pinned ? undefined : 0,
        zIndex: pinned ? undefined : 100,
        transition: 'transform 0.2s ease-in-out',
      }}
    >
      <ContextSidebarHeader contextType={contextType} />

      <Box p="sm">
        <SegmentedControl
          value={activeTab}
          onChange={(value): void => { setContextSidebarTab(value as ContextSidebarTab); }}
          data={tabs}
          fullWidth
          size="xs"
        />
      </Box>

      <Stack flex={1} p="sm" pt={0} style={{ overflow: 'auto' }}>
        {isProject ? (
          <ProjectContext />
        ) : (
          <Text size="sm" c="dimmed">
            {activeTab === 'todos' && 'TODOs tab content'}
            {activeTab === 'notes' && 'Notes tab content'}
          </Text>
        )}
      </Stack>
    </Box>
  );
}
