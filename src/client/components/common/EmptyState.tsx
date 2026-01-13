import { Stack, Text, Box } from '@mantine/core';
import { IconTerminal2 } from '@tabler/icons-react';

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
}

export function EmptyState({ title, description, icon }: EmptyStateProps): React.ReactElement {
  return (
    <Box
      style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Stack align="center" gap="md">
        {icon ?? (
          <IconTerminal2
            size={48}
            style={{ color: 'var(--mantine-color-dark-3)', opacity: 0.5 }}
          />
        )}
        <Text size="lg" fw={500} c="dimmed">
          {title}
        </Text>
        <Text size="sm" c="dimmed" ta="center" maw={400}>
          {description}
        </Text>
      </Stack>
    </Box>
  );
}
