/**
 * ConnectionStatus - WebSocket connection status indicator
 */
import { Badge, type BadgeProps } from '@mantine/core';
import { IconWifi, IconWifiOff } from '@tabler/icons-react';

interface ConnectionStatusProps extends Omit<BadgeProps, 'children'> {
  isConnected: boolean;
  showLabel?: boolean;
}

export function ConnectionStatus({
  isConnected,
  showLabel = true,
  ...props
}: ConnectionStatusProps): React.ReactElement {
  const color = isConnected ? 'green' : 'red';
  const Icon = isConnected ? IconWifi : IconWifiOff;
  const label = isConnected ? 'Connected' : 'Disconnected';

  return (
    <Badge
      size="sm"
      variant="dot"
      color={color}
      leftSection={<Icon size={12} />}
      data-testid="connection-status"
      data-status={isConnected ? 'connected' : 'disconnected'}
      {...props}
    >
      {showLabel && label}
    </Badge>
  );
}
