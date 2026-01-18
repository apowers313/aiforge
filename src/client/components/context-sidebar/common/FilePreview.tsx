/**
 * FilePreview - Preview file content with syntax highlighting
 */
import { Box, Text, Group, ActionIcon, Stack, Alert, Loader, Center } from '@mantine/core';
import { IconX, IconAlertCircle } from '@tabler/icons-react';
import Editor from '@monaco-editor/react';
import MDEditor from '@uiw/react-md-editor';
import { PhotoProvider, PhotoView } from 'react-photo-view';
import 'react-photo-view/dist/react-photo-view.css';
import { useFilePreview } from '@client/hooks/useProjectFiles';
import { detectFileType } from '@client/utils/fileTypes';

interface FilePreviewProps {
  projectId: string;
  filePath: string;
  onClose: () => void;
}

export function FilePreview({ projectId, filePath, onClose }: FilePreviewProps): React.ReactElement {
  const { preview, isLoading, isError, error } = useFilePreview(projectId, filePath);
  const fileType = detectFileType(filePath);
  const fileName = filePath.split('/').pop() ?? filePath;

  return (
    <Box data-testid="file-preview" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Group justify="space-between" p="xs" style={{ borderBottom: '1px solid var(--mantine-color-dark-4)' }}>
        <Text size="sm" fw={500} truncate style={{ maxWidth: 200 }}>
          {fileName}
        </Text>
        <ActionIcon
          data-testid="close-preview"
          variant="subtle"
          color="gray"
          size="sm"
          onClick={onClose}
        >
          <IconX size={14} />
        </ActionIcon>
      </Group>

      {isLoading && (
        <Center style={{ flex: 1 }}>
          <Loader size="md" />
        </Center>
      )}

      {isError && (
        <Box p="md">
          <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
            Failed to load file: {error?.message ?? 'Unknown error'}
          </Alert>
        </Box>
      )}

      {preview && (
        <Stack style={{ flex: 1, overflow: 'hidden' }} gap={0}>
          {preview.truncated && (
            <Alert
              color="yellow"
              variant="light"
              p="xs"
              style={{ borderRadius: 0 }}
            >
              <Text size="xs">
                Showing first 100 of {preview.totalLines} lines
              </Text>
            </Alert>
          )}

          <Box style={{ flex: 1, overflow: 'auto' }}>
            <PreviewContent
              content={preview.content}
              language={preview.language}
              fileType={fileType}
              filePath={filePath}
            />
          </Box>
        </Stack>
      )}
    </Box>
  );
}

interface PreviewContentProps {
  content: string;
  language: string;
  fileType: 'image' | 'markdown' | 'code';
  filePath: string;
}

function PreviewContent({ content, language, fileType, filePath }: PreviewContentProps): React.ReactElement {
  // Image preview
  if (fileType === 'image') {
    // For images, we would need the actual image URL
    // This is a placeholder - actual implementation would need image endpoint
    return (
      <PhotoProvider>
        <PhotoView src={filePath}>
          <Center p="md">
            <img
              src={filePath}
              alt={filePath}
              style={{ maxWidth: '100%', maxHeight: 400, cursor: 'zoom-in' }}
            />
          </Center>
        </PhotoView>
      </PhotoProvider>
    );
  }

  // Markdown preview
  if (fileType === 'markdown') {
    return (
      <Box data-color-mode="dark" p="md">
        <MDEditor.Markdown
          source={content}
          style={{ background: 'transparent' }}
        />
      </Box>
    );
  }

  // Code preview with Monaco Editor
  return (
    <Editor
      height="100%"
      language={language}
      value={content}
      theme="vs-dark"
      options={{
        readOnly: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        lineNumbers: 'on',
        folding: true,
        wordWrap: 'on',
        fontSize: 13,
        automaticLayout: true,
      }}
    />
  );
}
