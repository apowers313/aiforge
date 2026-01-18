import { useCallback, useEffect, useRef, useState } from 'react';
import { Box } from '@mantine/core';

interface ResizableDividerProps {
  /** Current width of the sidebar in pixels */
  sidebarWidth: number;
  /** Called with delta (change in pixels) during drag */
  onResize: (delta: number) => void;
  /** Called when drag ends */
  onResizeEnd?: () => void;
}

export function ResizableDivider({ sidebarWidth, onResize, onResizeEnd }: ResizableDividerProps): React.ReactElement {
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
      const delta = e.clientX - startXRef.current;
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
      onMouseDown={handleMouseDown}
      style={{
        position: 'fixed',
        top: 50, // Below header
        left: sidebarWidth - 3, // Center the 6px divider on the edge
        width: 6,
        height: 'calc(100vh - 50px)',
        cursor: 'col-resize',
        zIndex: 100,
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
