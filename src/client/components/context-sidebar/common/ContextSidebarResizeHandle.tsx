/**
 * ContextSidebarResizeHandle - Draggable handle for resizing the context sidebar
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Box } from '@mantine/core';

interface ContextSidebarResizeHandleProps {
  /** Called with delta (change in pixels) during drag - positive = wider */
  onResize: (delta: number) => void;
  /** Called when drag ends */
  onResizeEnd?: () => void;
}

export function ContextSidebarResizeHandle({
  onResize,
  onResizeEnd,
}: ContextSidebarResizeHandleProps): React.ReactElement {
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef<number>(0);

  const handleMouseDown = useCallback((e: React.MouseEvent): void => {
    e.preventDefault();
    setIsDragging(true);
    startXRef.current = e.clientX;
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent): void => {
      if (!isDragging) return;
      // For right sidebar, moving left (negative delta) should increase width
      // So we invert the delta
      const delta = startXRef.current - e.clientX;
      startXRef.current = e.clientX;
      onResize(delta);
    },
    [isDragging, onResize],
  );

  const handleMouseUp = useCallback((): void => {
    if (isDragging) {
      setIsDragging(false);
      onResizeEnd?.();
    }
  }, [isDragging, onResizeEnd]);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      // Prevent text selection while dragging
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
    }

    return (): void => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return (
    <Box
      data-testid="context-sidebar-resize-handle"
      onMouseDown={handleMouseDown}
      style={{
        position: 'absolute',
        top: 0,
        left: -3, // Center the 6px divider on the left edge
        width: 6,
        height: '100%',
        cursor: 'col-resize',
        zIndex: 101,
        backgroundColor: isDragging ? 'var(--mantine-color-blue-6)' : 'transparent',
        transition: isDragging ? 'none' : 'background-color 0.15s ease',
      }}
      onMouseEnter={(e): void => {
        if (!isDragging) {
          (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--mantine-color-dark-4)';
        }
      }}
      onMouseLeave={(e): void => {
        if (!isDragging) {
          (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
        }
      }}
    />
  );
}
