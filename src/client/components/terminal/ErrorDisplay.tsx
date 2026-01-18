/**
 * ErrorDisplay - Error state display for terminal sessions
 *
 * Shows error message with optional retry button for retryable errors.
 */
import { Center, Alert, Button, Text } from '@mantine/core';
import { IconAlertTriangle, IconRefresh } from '@tabler/icons-react';
import { getTerminalThemeColors } from '@shared/terminalThemes';
import { useUIStore } from '@client/stores/uiStore';

interface ErrorDisplayProps {
  /**
   * Error message to display
   */
  message: string;

  /**
   * Optional retry callback - shows retry button when provided
   */
  onRetry?: () => void;
}

export function ErrorDisplay({ message, onRetry }: ErrorDisplayProps): React.ReactElement {
  const terminalTheme = useUIStore((s) => s.terminalTheme);
  const themeColors = getTerminalThemeColors(terminalTheme);

  return (
    <Center style={{ height: '100%', backgroundColor: themeColors.background }}>
      <Alert
        icon={<IconAlertTriangle size={16} />}
        title="Session Error"
        color="red"
        variant="filled"
        style={{ maxWidth: 400 }}
      >
        <Text size="sm" mb={onRetry ? 'md' : undefined}>
          {message}
        </Text>
        {onRetry && (
          <Button
            leftSection={<IconRefresh size={14} />}
            size="sm"
            variant="white"
            onClick={onRetry}
          >
            Retry
          </Button>
        )}
      </Alert>
    </Center>
  );
}
