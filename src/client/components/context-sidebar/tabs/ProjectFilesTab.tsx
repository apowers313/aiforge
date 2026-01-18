/**
 * ProjectFilesTab - Display project file tree with git status
 */
import { useState } from 'react';
import { Box, Text, Group, Switch, Stack, Loader, Center, Alert, ScrollArea } from '@mantine/core';
import { IconFolder, IconFolderOpen, IconFile, IconChevronRight, IconAlertCircle } from '@tabler/icons-react';
import { useProjectFiles } from '@client/hooks/useProjectFiles';
import { useUIStore } from '@client/stores/uiStore';
import { GitStatusBadge } from '../common/GitStatusBadge';
import type { FileTreeNode } from '@shared/types';

interface ProjectFilesTabProps {
  projectId: string;
}

export function ProjectFilesTab({ projectId }: ProjectFilesTabProps): React.ReactElement {
  const [showAllFiles, setShowAllFiles] = useState(false);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const openFilePreview = useUIStore((state) => state.openFilePreview);
  const previewFilePath = useUIStore((state) => state.previewFilePath);

  const { files, isLoading, isError, error } = useProjectFiles(projectId, !showAllFiles);

  const toggleDir = (path: string): void => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleFileClick = (node: FileTreeNode): void => {
    if (node.type === 'directory') {
      toggleDir(node.path);
    } else {
      // Open file preview in center panel
      openFilePreview(projectId, node.path);
    }
  };

  if (isLoading) {
    return (
      <Center data-testid="files-loading" py="xl">
        <Loader size="md" />
      </Center>
    );
  }

  if (isError) {
    return (
      <Box p="md">
        <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
          Error loading files: {error?.message ?? 'Unknown error'}
        </Alert>
      </Box>
    );
  }

  return (
    <Stack h="100%" gap={0}>
      <Group justify="space-between" p="xs" style={{ borderBottom: '1px solid var(--mantine-color-dark-4)' }}>
        <Text size="sm" c="dimmed">
          {showAllFiles ? 'All files' : 'Modified files'}
        </Text>
        <Switch
          data-testid="show-all-toggle"
          size="xs"
          label="Show all"
          checked={showAllFiles}
          onChange={(e) => {
            setShowAllFiles(e.currentTarget.checked);
          }}
        />
      </Group>

      {files.length === 0 ? (
        <Center py="xl">
          <Text size="sm" c="dimmed">
            {showAllFiles ? 'No files found' : 'No modified files'}
          </Text>
        </Center>
      ) : (
        <ScrollArea style={{ flex: 1 }}>
          <Stack gap={0} p="xs">
            {files.map((node) => (
              <FileTreeItem
                key={node.path}
                node={node}
                depth={0}
                expandedDirs={expandedDirs}
                selectedPath={previewFilePath}
                onClick={handleFileClick}
              />
            ))}
          </Stack>
        </ScrollArea>
      )}
    </Stack>
  );
}

interface FileTreeItemProps {
  node: FileTreeNode;
  depth: number;
  expandedDirs: Set<string>;
  selectedPath: string | null;
  onClick: (node: FileTreeNode) => void;
}

function FileTreeItem({ node, depth, expandedDirs, selectedPath, onClick }: FileTreeItemProps): React.ReactElement {
  const isExpanded = expandedDirs.has(node.path);
  const isDir = node.type === 'directory';
  const isSelected = !isDir && selectedPath === node.path;

  return (
    <>
      <Group
        gap="xs"
        py={4}
        px="xs"
        style={{
          paddingLeft: `${String(depth * 16 + 8)}px`,
          cursor: 'pointer',
          borderRadius: 4,
          backgroundColor: isSelected ? 'var(--mantine-color-dark-5)' : 'transparent',
        }}
        onClick={() => {
          onClick(node);
        }}
        data-testid={isDir ? 'directory-item' : 'file-item'}
      >
        {isDir && (
          <IconChevronRight
            size={14}
            style={{
              transform: isExpanded ? 'rotate(90deg)' : 'none',
              transition: 'transform 0.15s ease',
            }}
          />
        )}
        {!isDir && <Box style={{ width: 14 }} />}

        <GitStatusBadge status={node.gitStatus} />

        {isDir ? (
          isExpanded ? (
            <IconFolderOpen size={16} color="var(--mantine-color-yellow-5)" />
          ) : (
            <IconFolder size={16} color="var(--mantine-color-yellow-5)" />
          )
        ) : (
          <IconFile size={16} color="var(--mantine-color-gray-5)" />
        )}

        <Text size="sm" truncate style={{ flex: 1 }}>
          {node.name}
        </Text>
      </Group>

      {isDir && isExpanded && node.children?.map((child) => (
        <FileTreeItem
          key={child.path}
          node={child}
          depth={depth + 1}
          expandedDirs={expandedDirs}
          selectedPath={selectedPath}
          onClick={onClick}
        />
      ))}
    </>
  );
}
