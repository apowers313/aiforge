import { useRef, useEffect, useCallback } from 'react';
import { Box, SegmentedControl, Stack, Transition } from '@mantine/core';
import { useUIStore } from '@client/stores/uiStore';
import { ContextSidebarHeader } from './ContextSidebarHeader';
import { ProjectContext } from './ProjectContext';
import { ShellContext } from './ShellContext';
import { ContextSidebarResizeHandle } from './common/ContextSidebarResizeHandle';
import type { ContextSidebarTab } from '@shared/types';

/**
 * Check if an element is inside a Mantine portal (Menu, Modal, Popover, etc.)
 * These elements are rendered outside the normal DOM hierarchy and should not
 * trigger click-outside behavior.
 */
function isInsideMantinePortal(element: Element | null): boolean {
  if (!element) return false;

  let current: Element | null = element;
  while (current) {
    // Check for Mantine portal markers
    if (
      current.hasAttribute('data-portal') ||
      current.hasAttribute('data-mantine-dropdown') ||
      current.hasAttribute('data-mantine-modal') ||
      current.hasAttribute('data-mantine-popover') ||
      current.classList.contains('mantine-Portal-root') ||
      current.classList.contains('mantine-Menu-dropdown') ||
      current.classList.contains('mantine-Modal-root') ||
      current.classList.contains('mantine-Popover-dropdown')
    ) {
      return true;
    }
    current = current.parentElement;
  }
  return false;
}

export function ContextSidebar(): React.ReactElement | null {
  const open = useUIStore((state) => state.contextSidebarOpen);
  const pinned = useUIStore((state) => state.contextSidebarPinned);
  const width = useUIStore((state) => state.contextSidebarWidth);
  const contextType = useUIStore((state) => state.selectedContextType);
  const activeTab = useUIStore((state) => state.contextSidebarActiveTab);
  const setContextSidebarTab = useUIStore((state) => state.setContextSidebarTab);
  const setContextSidebarWidth = useUIStore((state) => state.setContextSidebarWidth);
  const closeContextSidebar = useUIStore((state) => state.closeContextSidebar);

  const sidebarRef = useRef<HTMLDivElement>(null);

  const handleResize = useCallback(
    (delta: number): void => {
      // Get the current width directly from store to avoid stale closure during rapid drags
      const currentWidth = useUIStore.getState().contextSidebarWidth;
      setContextSidebarWidth(currentWidth + delta);
    },
    [setContextSidebarWidth],
  );

  // Custom click-outside handler that ignores clicks on Mantine portaled elements
  const handleClickOutside = useCallback(
    (event: MouseEvent) => {
      if (!pinned && open && sidebarRef.current) {
        const target = event.target as Element;

        // Don't close if clicking inside the sidebar
        if (sidebarRef.current.contains(target)) {
          return;
        }

        // Don't close if clicking inside a Mantine portal (Menu, Modal, etc.)
        if (isInsideMantinePortal(target)) {
          return;
        }

        closeContextSidebar();
      }
    },
    [pinned, open, closeContextSidebar],
  );

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return (): void => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [handleClickOutside]);

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

  const shouldShow = open && contextType !== null;

  // Custom slide-right transition styles
  const slideRightTransition = {
    in: { opacity: 1, transform: 'translateX(0)' },
    out: { opacity: 0, transform: 'translateX(100%)' },
    common: { transformOrigin: 'right' },
    transitionProperty: 'transform, opacity',
  };

  return (
    <Transition
      mounted={shouldShow}
      transition={slideRightTransition}
      duration={200}
      timingFunction="ease-in-out"
    >
      {(styles): React.ReactElement => (
        <Box
          ref={sidebarRef}
          data-testid="context-sidebar"
          style={{
            ...styles,
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
          }}
        >
          <ContextSidebarResizeHandle onResize={handleResize} />
          <ContextSidebarHeader contextType={contextType ?? 'project'} />

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
            {isProject ? <ProjectContext /> : <ShellContext />}
          </Stack>
        </Box>
      )}
    </Transition>
  );
}
