import { useState, useEffect, useCallback } from 'react';
import { Modal, Box, Group, Button, Text, Stack, UnstyledButton, Breadcrumbs, Anchor, Loader, Alert, Center } from '@mantine/core';
import { IconFolder, IconAlertCircle } from '@tabler/icons-react';
import { api, type DirectoryEntry } from '@client/services/api';

interface AddProjectModalProps {
  opened: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
}

interface BreadcrumbItem {
  name: string;
  path: string;
}

function pathToBreadcrumbs(path: string, homePath: string): BreadcrumbItem[] {
  if (!homePath || !path) {
    return [];
  }

  // Get the username from home path (last segment)
  const homeSegments = homePath.split('/').filter(Boolean);
  const username = homeSegments[homeSegments.length - 1] ?? 'home';

  const breadcrumbs: BreadcrumbItem[] = [{ name: username, path: homePath }];

  // Only add breadcrumbs for paths beyond the home directory
  if (path.startsWith(homePath) && path !== homePath) {
    const relativePath = path.slice(homePath.length);
    const parts = relativePath.split('/').filter(Boolean);
    let currentPath = homePath;
    for (const part of parts) {
      currentPath += '/' + part;
      breadcrumbs.push({ name: part, path: currentPath });
    }
  }

  return breadcrumbs;
}

export function AddProjectModal({ opened, onClose, onSelect }: AddProjectModalProps): React.ReactElement | null {
  const [currentPath, setCurrentPath] = useState('');
  const [homePath, setHomePath] = useState('');
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDirectory = useCallback(async (path: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.browseDirectory(path);
      setCurrentPath(result.path);
      setEntries(result.entries.filter((e) => e.isDirectory));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load directory';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (opened) {
      // Fetch user's home directory and browse it
      setIsLoading(true);
      void (async (): Promise<void> => {
        try {
          const homeResult = await api.getHomeDirectory();
          setHomePath(homeResult.path);
          await fetchDirectory(homeResult.path);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to get home directory';
          setError(message);
          setIsLoading(false);
        }
      })();
    }
  }, [opened, fetchDirectory]);

  const handleDirectoryClick = (entry: DirectoryEntry): void => {
    const newPath = currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`;
    void fetchDirectory(newPath);
  };

  const handleBreadcrumbClick = (path: string): void => {
    void fetchDirectory(path);
  };

  const handleSelect = (): void => {
    onSelect(currentPath);
    setCurrentPath('');
    setHomePath('');
  };

  const handleClose = (): void => {
    onClose();
    setCurrentPath('');
    setHomePath('');
  };

  if (!opened) {
    return null;
  }

  const breadcrumbs = pathToBreadcrumbs(currentPath, homePath);

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Add Project"
      size="lg"
      centered
    >
      <Box data-testid="directory-browser">
        <Box mb="md">
          <Text size="xs" c="dimmed" mb={4}>
            Current path:
          </Text>
          <Text data-testid="current-path" fw={500}>
            {currentPath}
          </Text>
        </Box>

        <Breadcrumbs mb="md" separator="/">
          {breadcrumbs.map((crumb, index) => (
            <Anchor
              key={crumb.path}
              component="button"
              size="sm"
              onClick={() => { handleBreadcrumbClick(crumb.path); }}
              data-testid={index === 0 ? 'breadcrumb-home' : undefined}
            >
              {crumb.name}
            </Anchor>
          ))}
        </Breadcrumbs>

        <Box
          style={{
            border: '1px solid var(--mantine-color-dark-4)',
            borderRadius: 'var(--mantine-radius-sm)',
            maxHeight: 300,
            overflow: 'auto',
          }}
          p="xs"
        >
          {isLoading ? (
            <Center py="xl" data-testid="loading-indicator">
              <Loader size="sm" />
            </Center>
          ) : error ? (
            <Alert
              icon={<IconAlertCircle size={16} />}
              color="red"
              data-testid="error-message"
            >
              {error}
            </Alert>
          ) : entries.length === 0 ? (
            <Text size="sm" c="dimmed" ta="center" py="xl">
              No subdirectories
            </Text>
          ) : (
            <Stack gap={4}>
              {entries.map((entry) => (
                <UnstyledButton
                  key={entry.name}
                  onClick={() => { handleDirectoryClick(entry); }}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--mantine-radius-sm)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                  className="directory-item"
                >
                  <IconFolder size={18} style={{ color: 'var(--mantine-color-blue-4)' }} />
                  <Text size="sm">{entry.name}</Text>
                </UnstyledButton>
              ))}
            </Stack>
          )}
        </Box>

        <Group justify="flex-end" mt="lg">
          <Button variant="subtle" onClick={handleClose} data-testid="cancel-button">
            Cancel
          </Button>
          <Button onClick={handleSelect} data-testid="select-directory-button" disabled={isLoading}>
            Select This Directory
          </Button>
        </Group>
      </Box>
    </Modal>
  );
}
