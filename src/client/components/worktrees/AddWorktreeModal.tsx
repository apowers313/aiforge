import { useState } from 'react';
import { Modal, TextInput, Button, Group, Stack, Text } from '@mantine/core';
import { useCreateWorktree, useMainBranch } from '@client/hooks/useWorktrees';

interface AddWorktreeModalProps {
  projectId: string;
  opened: boolean;
  onClose: () => void;
}

export function AddWorktreeModal({
  projectId,
  opened,
  onClose,
}: AddWorktreeModalProps): React.ReactElement {
  const [name, setName] = useState('');
  const [baseBranch, setBaseBranch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: mainBranch } = useMainBranch(projectId);
  const createWorktree = useCreateWorktree(projectId);

  const handleClose = (): void => {
    setName('');
    setBaseBranch('');
    setError(null);
    onClose();
  };

  const handleSubmit = async (): Promise<void> => {
    if (!name.trim()) {
      setError('Worktree name is required');
      return;
    }

    // Validate branch name format
    const branchNameRegex = /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/;
    if (!branchNameRegex.test(name.trim())) {
      setError(
        'Invalid branch name: must start with alphanumeric and contain only alphanumeric, dots, underscores, hyphens, and forward slashes',
      );
      return;
    }

    setError(null);

    try {
      await createWorktree.mutateAsync({
        name: name.trim(),
        baseBranch: baseBranch.trim() || undefined,
      });
      handleClose();
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to create worktree');
      }
    }
  };

  const isCreateDisabled = !name.trim() || createWorktree.isPending;

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Add Worktree"
      centered
    >
      <Stack gap="md">
        <TextInput
          label="Worktree name"
          description="This will be used as the branch name"
          placeholder="feature/my-feature"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          error={error}
          data-autofocus
        />

        <TextInput
          label="Base branch (optional)"
          description={`Defaults to ${mainBranch ?? 'main'}`}
          placeholder={mainBranch ?? 'main'}
          value={baseBranch}
          onChange={(e) => {
            setBaseBranch(e.target.value);
          }}
        />

        {error && (
          <Text c="red" size="sm">
            {error}
          </Text>
        )}

        <Group justify="flex-end" mt="md">
          <Button variant="subtle" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              void handleSubmit();
            }}
            disabled={isCreateDisabled}
            loading={createWorktree.isPending}
          >
            Create
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
