/**
 * FileTree - Shared file tree component using Mantine's Tree
 * Used by both ProjectFilesTab and WorktreeFilesTab
 */
import { useMemo, useCallback, useEffect } from 'react';
import { Box, Text, Group, Switch, Stack, Loader, Center, Alert, ScrollArea, Tree, useTree } from '@mantine/core';
import { IconFolder, IconFolderOpen, IconFile, IconChevronRight, IconAlertCircle } from '@tabler/icons-react';
import { GitStatusBadge } from './GitStatusBadge';
import type { TreeNodeData, RenderTreeNodePayload } from '@mantine/core';
import type { FileTreeNode, GitStatus } from '@shared/types';

interface FileTreeProps {
  files: FileTreeNode[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  showAllFiles: boolean;
  onToggleShowAll: (showAll: boolean) => void;
  onFileClick?: (node: FileTreeNode) => void;
  selectedPath?: string | null;
}

interface FileNodeProps {
  type: 'file' | 'directory';
  gitStatus: GitStatus;
}

function toTreeData(nodes: FileTreeNode[]): TreeNodeData[] {
  return nodes.map((node) => ({
    value: node.path,
    label: node.name,
    nodeProps: { type: node.type, gitStatus: node.gitStatus } as FileNodeProps,
    children: node.children ? toTreeData(node.children) : undefined,
  }));
}

function buildNodeLookup(nodes: FileTreeNode[], map: Map<string, FileTreeNode>): void {
  for (const node of nodes) {
    map.set(node.path, node);
    if (node.children) {
      buildNodeLookup(node.children, map);
    }
  }
}

function renderNode({ node, expanded, hasChildren, elementProps }: RenderTreeNodePayload): React.ReactNode {
  const props = node.nodeProps as FileNodeProps | undefined;
  const isDir = props?.type === 'directory';
  const gitStatus = props?.gitStatus ?? null;

  return (
    <Group
      {...elementProps}
      gap="xs"
      py={4}
      wrap="nowrap"
      style={{
        ...elementProps.style,
        cursor: 'pointer',
        borderRadius: 4,
      }}
    >
      {hasChildren ? (
        <IconChevronRight
          size={14}
          style={{
            transform: expanded ? 'rotate(90deg)' : 'none',
            transition: 'transform 0.15s ease',
            flexShrink: 0,
          }}
        />
      ) : (
        <Box style={{ width: 14, flexShrink: 0 }} />
      )}

      <GitStatusBadge status={gitStatus} />

      {isDir ? (
        expanded ? (
          <IconFolderOpen size={16} color="var(--mantine-color-yellow-5)" style={{ flexShrink: 0 }} />
        ) : (
          <IconFolder size={16} color="var(--mantine-color-yellow-5)" style={{ flexShrink: 0 }} />
        )
      ) : (
        <IconFile size={16} color="var(--mantine-color-gray-5)" style={{ flexShrink: 0 }} />
      )}

      <Text size="sm" truncate style={{ flex: 1 }}>
        {node.label}
      </Text>
    </Group>
  );
}

export function FileTree({
  files,
  isLoading,
  isError,
  error,
  showAllFiles,
  onToggleShowAll,
  onFileClick,
  selectedPath,
}: FileTreeProps): React.ReactElement {
  const tree = useTree();

  const treeData = useMemo(() => toTreeData(files), [files]);

  const nodeLookup = useMemo(() => {
    const map = new Map<string, FileTreeNode>();
    buildNodeLookup(files, map);
    return map;
  }, [files]);

  // Sync selectedPath to tree's selected state
  // tree methods are stable but the tree object itself isn't, so we extract the stable refs
  const { setSelectedState, clearSelected } = tree;
  useEffect(() => {
    if (selectedPath) {
      setSelectedState([selectedPath]);
    } else {
      clearSelected();
    }
  }, [selectedPath, setSelectedState, clearSelected]);

  const handleClick = useCallback((value: string): void => {
    const node = nodeLookup.get(value);
    if (node && onFileClick) {
      onFileClick(node);
    }
  }, [nodeLookup, onFileClick]);

  const renderNodeWithSelection = useCallback(
    (payload: RenderTreeNodePayload): React.ReactNode => {
      const isSelected = selectedPath != null && payload.node.value === selectedPath;
      const props = payload.node.nodeProps as FileNodeProps | undefined;
      const isDir = props?.type === 'directory';

      // For files with onFileClick, handle the click
      const originalOnClick = payload.elementProps.onClick;
      const wrappedElementProps = {
        ...payload.elementProps,
        'data-selected': isSelected || undefined,
        style: {
          ...payload.elementProps.style,
          backgroundColor: isSelected ? 'var(--mantine-color-dark-5)' : undefined,
        },
        onClick: (e: React.MouseEvent): void => {
          originalOnClick(e);
          if (!isDir && onFileClick) {
            handleClick(payload.node.value);
          }
        },
      };

      return renderNode({ ...payload, elementProps: wrappedElementProps });
    },
    [selectedPath, onFileClick, handleClick],
  );

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
            onToggleShowAll(e.currentTarget.checked);
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
          <Tree
            data={treeData}
            tree={tree}
            levelOffset={16}
            expandOnClick
            renderNode={onFileClick ? renderNodeWithSelection : renderNode}
          />
        </ScrollArea>
      )}
    </Stack>
  );
}
