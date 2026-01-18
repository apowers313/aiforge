/**
 * ReconnectingOverlay - Overlay shown during terminal reconnection
 *
 * Displays a semi-transparent overlay with reconnection progress.
 */
import { Box, Text, Loader, Group } from '@mantine/core';

interface ReconnectingOverlayProps {
  /**
   * Current reconnection attempt number
   */
  attempt: number;

  /**
   * Maximum number of reconnection attempts
   */
  maxAttempts: number;
}

export function ReconnectingOverlay({ attempt, maxAttempts }: ReconnectingOverlayProps): React.ReactElement {
  return (
    <Box
      data-testid="reconnecting-overlay"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
      }}
    >
      <Group gap="md">
        <Loader size="sm" color="yellow" />
        <Box>
          <Text size="sm" c="yellow" fw={500}>
            Reconnecting...
          </Text>
          <Text size="xs" c="dimmed">
            Attempt {attempt} of {maxAttempts}
          </Text>
        </Box>
      </Group>
    </Box>
  );
}
