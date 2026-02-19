/**
 * UrlsTab - Shared URLs tab for context sidebars
 * Used by both ProjectUrlsTab and WorktreeUrlsTab
 */
import { useState } from 'react';
import { Stack, Text, ActionIcon, Loader, Alert, Divider, Box } from '@mantine/core';
import { IconPlus, IconAlertCircle } from '@tabler/icons-react';
import { UrlItem, type AutoDetectedUrl } from './UrlItem';
import { AddUrlModal } from './AddUrlModal';
import type { CustomUrl } from '@shared/types';

interface UrlsTabProps {
  urls: CustomUrl[];
  isLoading: boolean;
  isError: boolean;
  addUrl: (name: string, url: string) => Promise<void>;
  deleteUrl: (urlId: string) => Promise<void>;
  isAdding: boolean;
  updateUrl?: (urlId: string, data: { name?: string; url?: string }) => Promise<void>;
  isUpdating?: boolean;
  autoDetectedUrls?: AutoDetectedUrl[];
  customLabel?: string;
}

export function UrlsTab({
  urls,
  isLoading,
  isError,
  addUrl,
  deleteUrl,
  isAdding,
  updateUrl,
  isUpdating,
  autoDetectedUrls,
  customLabel = 'Custom',
}: UrlsTabProps): React.ReactElement {
  const [modalOpened, setModalOpened] = useState(false);
  const [editingUrl, setEditingUrl] = useState<CustomUrl | null>(null);
  const [deletingUrlId, setDeletingUrlId] = useState<string | null>(null);

  const handleAddUrl = async (name: string, url: string): Promise<void> => {
    if (editingUrl && updateUrl) {
      await updateUrl(editingUrl.id, { name, url });
    } else {
      await addUrl(name, url);
    }
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

  const hasAutoDetectedUrls = autoDetectedUrls !== undefined && autoDetectedUrls.length > 0;
  const hasCustomUrls = urls.length > 0;
  const hasAnyUrls = hasAutoDetectedUrls || hasCustomUrls;

  return (
    <Stack gap="xs">
      {/* Auto-detected URLs */}
      {hasAutoDetectedUrls && (
        <>
          <Text size="xs" c="dimmed" fw={500} tt="uppercase">
            Detected
          </Text>
          {autoDetectedUrls.map((url) => (
            <UrlItem key={url.id} url={url} />
          ))}
        </>
      )}

      {/* Divider between sections */}
      {hasAutoDetectedUrls && (
        <Divider my="xs" />
      )}

      {/* Custom URLs header with add button */}
      <Box style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text size="xs" c="dimmed" fw={500} tt="uppercase">
          {customLabel}
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
            onEdit={updateUrl ? handleEditUrl : undefined}
            onDelete={(id) => { void handleDeleteUrl(id); }}
            isDeleting={deletingUrlId === url.id}
          />
        ))
      ) : (
        <Text size="sm" c="dimmed" ta="center" py="md">
          No URLs added yet
        </Text>
      )}

      {/* Empty state for no URLs at all */}
      {!hasAnyUrls && (
        <Text size="sm" c="dimmed" ta="center">
          Click + to add a custom URL
        </Text>
      )}

      {/* Add/Edit URL Modal */}
      <AddUrlModal
        opened={modalOpened}
        onClose={handleCloseModal}
        onSubmit={handleAddUrl}
        isSubmitting={isAdding || (isUpdating ?? false)}
        isEditMode={editingUrl !== null}
        initialName={editingUrl?.name ?? ''}
        initialUrl={editingUrl?.url ?? ''}
      />
    </Stack>
  );
}
