/**
 * ProjectNotesTab - Markdown notes editor for project context sidebar
 */
import { useState, useEffect, useCallback } from 'react';
import { Stack, Text, Loader, Alert, Group } from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import MDEditor, { commands } from '@uiw/react-md-editor';
import { useProjectContext } from '@client/hooks/useProjectContext';

// Curated toolbar commands with logical grouping
const toolbarCommands = [
  // Text formatting
  commands.bold,
  commands.italic,
  commands.strikethrough,
  commands.group([commands.heading1, commands.heading2, commands.heading3], {
    name: 'heading',
    groupName: 'heading',
    buttonProps: { 'aria-label': 'Insert heading' },
  }),
  commands.divider,
  // Content elements
  commands.link,
  commands.quote,
  commands.code,
  commands.divider,
  // Lists
  commands.unorderedListCommand,
  commands.checkedListCommand,
];

// Extra commands (right side of toolbar)
const extraCommands = [commands.help];

interface ProjectNotesTabProps {
  projectId: string;
}

export function ProjectNotesTab({ projectId }: ProjectNotesTabProps): React.ReactElement {
  const { notes, isLoading, isError, error, updateNotes, isUpdatingNotes } = useProjectContext(projectId);
  const [draft, setDraft] = useState(notes);
  const [isSaving, setIsSaving] = useState(false);

  // Sync draft with server notes when they change
  useEffect(() => {
    setDraft(notes);
  }, [notes]);

  // Debounced save to server
  const debouncedSave = useDebouncedCallback(
    useCallback(
      async (content: string): Promise<void> => {
        setIsSaving(true);
        try {
          await updateNotes(content);
        } finally {
          setIsSaving(false);
        }
      },
      [updateNotes],
    ),
    500,
  );

  const handleChange = (value?: string): void => {
    const newValue = value ?? '';
    setDraft(newValue);
    debouncedSave(newValue);
  };

  if (isLoading) {
    return (
      <Stack align="center" justify="center" p="lg" data-testid="notes-loading">
        <Loader size="sm" />
        <Text size="sm" c="dimmed">
          Loading notes...
        </Text>
      </Stack>
    );
  }

  if (isError) {
    return (
      <Alert color="red" title="Error">
        {error?.message ?? 'Failed to load notes'}
      </Alert>
    );
  }

  return (
    <Stack gap="xs" h="100%">
      {(isSaving || isUpdatingNotes) && (
        <Group gap="xs" px="xs" data-testid="notes-saving">
          <Loader size="xs" />
          <Text size="xs" c="dimmed">
            Saving...
          </Text>
        </Group>
      )}
      <div data-testid="notes-editor" data-color-mode="dark" style={{ flex: 1, minHeight: 0 }}>
        <MDEditor
          value={draft}
          onChange={handleChange}
          preview="edit"
          height="100%"
          visibleDragbar={false}
          hideToolbar={false}
          commands={toolbarCommands}
          extraCommands={extraCommands}
          textareaProps={{
            placeholder: 'Add notes here...',
          }}
          style={{
            backgroundColor: 'transparent',
            minHeight: '200px',
          }}
        />
      </div>
    </Stack>
  );
}
