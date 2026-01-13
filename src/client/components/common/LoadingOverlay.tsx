/**
 * LoadingOverlay - Full-screen or container loading state
 */
import { Box, Loader, Text, Stack } from '@mantine/core';

interface LoadingOverlayProps {
  visible: boolean;
  message?: string;
  fullScreen?: boolean;
}

export function LoadingOverlay({
  visible,
  message,
  fullScreen = false,
}: LoadingOverlayProps): React.ReactElement | null {
  if (!visible) {
    return null;
  }

  return (
    <Box
      data-testid="loading-overlay"
      style={{
        position: fullScreen ? 'fixed' : 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        zIndex: 1000,
      }}
    >
      <Stack align="center" gap="md">
        <Loader size="lg" color="blue" data-testid="loading-spinner" />
        {message && (
          <Text c="white" size="sm" data-testid="loading-message">
            {message}
          </Text>
        )}
      </Stack>
    </Box>
  );
}
