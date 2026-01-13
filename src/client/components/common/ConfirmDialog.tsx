/**
 * ConfirmDialog - Confirmation dialog for destructive actions
 */
import { Modal, Button, Group, Text, Stack } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';

interface ConfirmDialogProps {
  opened: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmColor?: string;
  loading?: boolean;
}

export function ConfirmDialog({
  opened,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmColor = 'red',
  loading = false,
}: ConfirmDialogProps): React.ReactElement {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={title}
      centered
      size="sm"
      data-testid="confirm-dialog"
    >
      <Stack gap="lg">
        <Group align="flex-start" gap="md">
          <IconAlertTriangle
            size={24}
            style={{ color: `var(--mantine-color-${confirmColor}-6)`, flexShrink: 0 }}
          />
          <Text size="sm" data-testid="confirm-message">
            {message}
          </Text>
        </Group>

        <Group justify="flex-end" gap="sm">
          <Button
            variant="subtle"
            onClick={onClose}
            disabled={loading}
            data-testid="confirm-cancel"
          >
            {cancelLabel}
          </Button>
          <Button
            color={confirmColor}
            onClick={onConfirm}
            loading={loading}
            data-testid="confirm-delete"
          >
            {confirmLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
