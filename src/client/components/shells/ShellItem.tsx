import { useState } from 'react';
import { Group, Text, UnstyledButton, ActionIcon, Menu, Badge, Modal, TextInput, Button, Stack } from '@mantine/core';
import { IconTerminal2, IconDots, IconTrash, IconPencil, IconRefresh } from '@tabler/icons-react';
import type { Shell } from '@shared/types';
import { useDeleteShell, useUpdateShell, useRestartShell, useActiveShellId } from '@client/hooks/useShells';

interface ShellItemProps {
  shell: Shell;
  projectId: string;
}

export function ShellItem({ shell, projectId }: ShellItemProps): React.ReactElement {
  const { activeShellId, setActiveShell } = useActiveShellId();
  const deleteShellMutation = useDeleteShell();
  const updateShellMutation = useUpdateShell();
  const restartShellMutation = useRestartShell();
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [newName, setNewName] = useState(shell.name);

  const isActive = activeShellId === shell.id;

  const handleClick = (): void => {
    setActiveShell(shell.id);
  };

  const handleDelete = (): void => {
    deleteShellMutation.mutate({ shellId: shell.id, projectId });
  };

  const handleRenameClick = (): void => {
    setNewName(shell.name);
    setRenameModalOpen(true);
  };

  const handleRenameSubmit = (): void => {
    if (!newName.trim() || newName === shell.name) {
      setRenameModalOpen(false);
      return;
    }
    updateShellMutation.mutate(
      { shellId: shell.id, updates: { name: newName.trim() } },
      {
        onSuccess: () => {
          setRenameModalOpen(false);
        },
      },
    );
  };

  const handleRestart = (): void => {
    restartShellMutation.mutate(shell.id);
  };

  const statusColor = shell.status === 'active' ? 'green' : shell.status === 'error' ? 'red' : 'gray';

  return (
    <>
      <Group gap={0} wrap="nowrap">
        <UnstyledButton
          onClick={handleClick}
          style={{
            flex: 1,
            padding: '6px 10px',
            borderRadius: 'var(--mantine-radius-sm)',
            backgroundColor: isActive ? 'var(--mantine-color-dark-5)' : 'transparent',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
          className="shell-item"
          data-testid="shell-item"
        >
          <IconTerminal2 size={14} style={{ flexShrink: 0, color: 'var(--mantine-color-green-4)' }} />
          <Text size="xs" truncate style={{ flex: 1 }}>
            {shell.name}
          </Text>
          <Badge size="xs" variant="dot" color={statusColor}>
            {shell.status}
          </Badge>
        </UnstyledButton>

        <Menu position="bottom-end" withinPortal>
          <Menu.Target>
            <ActionIcon
              variant="subtle"
              size="xs"
              onClick={(e) => { e.stopPropagation(); }}
            >
              <IconDots size={12} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              leftSection={<IconPencil size={14} />}
              onClick={handleRenameClick}
            >
              Rename
            </Menu.Item>
            <Menu.Item
              leftSection={<IconRefresh size={14} />}
              onClick={handleRestart}
            >
              Restart
            </Menu.Item>
            <Menu.Divider />
            <Menu.Item
              color="red"
              leftSection={<IconTrash size={14} />}
              onClick={handleDelete}
            >
              Close Shell
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>

      <Modal
        opened={renameModalOpen}
        onClose={() => { setRenameModalOpen(false); }}
        title="Rename Shell"
        size="sm"
      >
        <Stack>
          <TextInput
            label="Shell name"
            value={newName}
            onChange={(e) => { setNewName(e.currentTarget.value); }}
            placeholder="Enter shell name"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleRenameSubmit();
              }
            }}
          />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => { setRenameModalOpen(false); }}>
              Cancel
            </Button>
            <Button onClick={handleRenameSubmit} loading={updateShellMutation.isPending}>
              Rename
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
