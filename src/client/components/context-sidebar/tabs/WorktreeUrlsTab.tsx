/**
 * WorktreeUrlsTab - URLs tab for worktree context sidebar
 * Phase 7: Custom URLs management for worktrees (no auto-detected URLs)
 */
import { useState } from 'react';
import { Stack, Text, ActionIcon, Loader, Alert, Box } from '@mantine/core';
import { IconPlus, IconAlertCircle } from '@tabler/icons-react';
import { useWorktreeUrls } from '@client/hooks/useWorktrees';
import { UrlItem } from '../common/UrlItem';
import { AddUrlModal } from '../common/AddUrlModal';
import type { CustomUrl } from '@shared/types';

interface WorktreeUrlsTabProps {
  worktreePath: string;
}

export function WorktreeUrlsTab({ worktreePath }: WorktreeUrlsTabProps): React.ReactElement {
  const [modalOpened, setModalOpened] = useState(false);
  const [editingUrl, setEditingUrl] = useState<CustomUrl | null>(null);
  const [deletingUrlId, setDeletingUrlId] = useState<string | null>(null);

  const { urls, isLoading, isError, addUrl, deleteUrl, isAdding } = useWorktreeUrls(worktreePath);

  const handleAddUrl = async (name: string, url: string): Promise<void> => {
    // Note: Worktree URLs currently only support add/delete, not update
    // If editing is needed in the future, add updateUrl to the hook
    await addUrl(name, url);
  };

  const handleEditUrl = (url: CustomUrl): void => {
    setEditingUrl(url);
    setModalOpened(true);
  };

  const handleCloseModal = (): void => {
    setModalOpened(false);
    setEditingUrl(null);
  };

  const handleOpenAddModal = (): void => {
    setEditingUrl(null);
    setModalOpened(true);
  };

  const handleDeleteUrl = async (urlId: string): Promise<void> => {
    setDeletingUrlId(urlId);
    try {
      await deleteUrl(urlId);
    } finally {
      setDeletingUrlId(null);
    }
  };

  if (isLoading) {
    return (
      <Box data-testid="urls-loading" p="md" style={{ display: 'flex', justifyContent: 'center' }}>
        <Loader size="sm" />
      </Box>
    );
  }

  if (isError) {
    return (
      <Alert icon={<IconAlertCircle size={16} />} title="Error" color="red">
        Failed to load URLs. Please try again.
      </Alert>
    );
  }

  const hasCustomUrls = urls.length > 0;

  return (
    <Stack gap="xs">
      {/* Custom URLs header with add button */}
      <Box style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text size="xs" c="dimmed" fw={500} tt="uppercase">
          Custom URLs
        </Text>
        <ActionIcon
          variant="subtle"
          color="blue"
          size="sm"
          onClick={handleOpenAddModal}
          title="Add custom URL"
          data-testid="add-url-button"
        >
          <IconPlus size={14} />
        </ActionIcon>
      </Box>

      {/* Custom URLs */}
      {hasCustomUrls ? (
        urls.map((url) => (
          <UrlItem
            key={url.id}
            url={url}
            onEdit={handleEditUrl}
            onDelete={(id) => { void handleDeleteUrl(id); }}
            isDeleting={deletingUrlId === url.id}
          />
        ))
      ) : (
        <Text size="sm" c="dimmed" ta="center" py="md">
          No URLs added yet. Click + to add a custom URL.
        </Text>
      )}

      {/* Add/Edit URL Modal */}
      <AddUrlModal
        opened={modalOpened}
        onClose={handleCloseModal}
        onSubmit={handleAddUrl}
        isSubmitting={isAdding}
        isEditMode={editingUrl !== null}
        initialName={editingUrl?.name ?? ''}
        initialUrl={editingUrl?.url ?? ''}
      />
    </Stack>
  );
}
