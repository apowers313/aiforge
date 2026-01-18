/**
 * ProjectUrlsTab - URLs tab for project context sidebar
 */
import { useState, useMemo } from 'react';
import { Stack, Text, ActionIcon, Loader, Alert, Divider, Box } from '@mantine/core';
import { IconPlus, IconAlertCircle } from '@tabler/icons-react';
import { useProjectMetadata } from '@client/hooks/useProjectMetadata';
import { useProjectUrls } from '@client/hooks/useProjectUrls';
import { UrlItem, type AutoDetectedUrl } from '../common/UrlItem';
import { AddUrlModal } from '../common/AddUrlModal';

interface ProjectUrlsTabProps {
  projectId: string;
}

export function ProjectUrlsTab({ projectId }: ProjectUrlsTabProps): React.ReactElement {
  const [modalOpened, setModalOpened] = useState(false);
  const [deletingUrlId, setDeletingUrlId] = useState<string | null>(null);

  const { metadata, isLoading: isLoadingMetadata, isError: isMetadataError } = useProjectMetadata(projectId);
  const { urls, isLoading: isLoadingUrls, isError: isUrlsError, addUrl, deleteUrl, isAdding } = useProjectUrls(projectId);

  const isLoading = isLoadingMetadata || isLoadingUrls;
  const isError = isMetadataError || isUrlsError;

  // Generate auto-detected URLs from metadata
  const autoDetectedUrls = useMemo((): AutoDetectedUrl[] => {
    if (!metadata) return [];

    const detectedUrls: AutoDetectedUrl[] = [];

    // GitHub URL
    if (metadata.gitRemoteType === 'github' && metadata.gitRemoteUrl) {
      // Convert git URL to web URL
      let webUrl = metadata.gitRemoteUrl;
      if (webUrl.startsWith('git@github.com:')) {
        webUrl = `https://github.com/${webUrl.replace('git@github.com:', '').replace(/\.git$/, '')}`;
      } else if (webUrl.endsWith('.git')) {
        webUrl = webUrl.replace(/\.git$/, '');
      }

      detectedUrls.push({
        id: 'auto-github',
        name: 'GitHub',
        url: webUrl,
        type: 'github',
        isAutoDetected: true,
      });

      // GitHub Actions if workflows exist
      if (metadata.hasGithubWorkflows) {
        detectedUrls.push({
          id: 'auto-github-actions',
          name: 'Actions',
          url: `${webUrl}/actions`,
          type: 'github-actions',
          isAutoDetected: true,
        });
      }
    }

    // NPM URL if package.json exists with a name
    if (metadata.hasPackageJson && metadata.packageName) {
      detectedUrls.push({
        id: 'auto-npm',
        name: 'NPM',
        url: `https://www.npmjs.com/package/${metadata.packageName}`,
        type: 'npm',
        isAutoDetected: true,
      });
    }

    return detectedUrls;
  }, [metadata]);

  const handleAddUrl = async (name: string, url: string): Promise<void> => {
    await addUrl(name, url);
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

  const hasAutoDetectedUrls = autoDetectedUrls.length > 0;
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
          Custom
        </Text>
        <ActionIcon
          variant="subtle"
          color="blue"
          size="sm"
          onClick={() => { setModalOpened(true); }}
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

      {/* Add URL Modal */}
      <AddUrlModal
        opened={modalOpened}
        onClose={() => { setModalOpened(false); }}
        onSubmit={handleAddUrl}
        isSubmitting={isAdding}
      />
    </Stack>
  );
}
