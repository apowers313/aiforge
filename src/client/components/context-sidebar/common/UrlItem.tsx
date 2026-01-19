/**
 * UrlItem - Single URL row in the URLs tab
 */
import { ActionIcon, Group, Text, Anchor, ThemeIcon } from '@mantine/core';
import { IconExternalLink, IconTrash, IconPencil, IconBrandGithub, IconBrandNpm, IconRun, IconLink } from '@tabler/icons-react';
import type { CustomUrl } from '@shared/types';

export interface AutoDetectedUrl {
  id: string;
  name: string;
  url: string;
  type: 'github' | 'github-actions' | 'npm' | 'other';
  isAutoDetected: true;
}

interface UrlItemProps {
  url: CustomUrl | AutoDetectedUrl;
  onDelete?: (id: string) => void;
  onEdit?: (url: CustomUrl) => void;
  isDeleting?: boolean;
}

function getUrlIcon(type: string): React.ReactElement {
  switch (type) {
    case 'github':
      return <IconBrandGithub size={16} />;
    case 'github-actions':
      return <IconRun size={16} />;
    case 'npm':
      return <IconBrandNpm size={16} />;
    default:
      return <IconLink size={16} />;
  }
}

function getIconColor(type: string): string {
  switch (type) {
    case 'github':
      return 'gray';
    case 'github-actions':
      return 'green';
    case 'npm':
      return 'red';
    default:
      return 'blue';
  }
}

export function UrlItem({ url, onDelete, onEdit, isDeleting }: UrlItemProps): React.ReactElement {
  const isAutoDetected = 'isAutoDetected' in url && url.isAutoDetected;
  const type = 'type' in url ? url.type : 'other';

  return (
    <Group
      justify="space-between"
      wrap="nowrap"
      py="xs"
      px="xs"
      style={{
        borderRadius: 'var(--mantine-radius-sm)',
      }}
      className="url-item"
    >
      <Group wrap="nowrap" gap="sm" style={{ flex: 1, minWidth: 0 }}>
        <ThemeIcon variant="light" color={getIconColor(type)} size="sm">
          {getUrlIcon(type)}
        </ThemeIcon>
        <Anchor
          href={url.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          <Text size="sm" truncate>
            {url.name}
          </Text>
          <IconExternalLink size={12} style={{ opacity: 0.7, flexShrink: 0 }} />
        </Anchor>
      </Group>

      {!isAutoDetected && (
        <Group gap={4}>
          {onEdit && (
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              onClick={() => { onEdit(url as CustomUrl); }}
              title="Edit URL"
              data-testid="edit-url-button"
            >
              <IconPencil size={14} />
            </ActionIcon>
          )}
          {onDelete && (
            <ActionIcon
              variant="subtle"
              color="red"
              size="sm"
              onClick={() => { onDelete(url.id); }}
              loading={isDeleting}
              title="Delete URL"
              data-testid="delete-url-button"
            >
              <IconTrash size={14} />
            </ActionIcon>
          )}
        </Group>
      )}
    </Group>
  );
}
