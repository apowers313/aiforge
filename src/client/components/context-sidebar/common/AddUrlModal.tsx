/**
 * AddUrlModal - Modal for adding/editing custom URLs
 */
import { useState, useEffect } from 'react';
import { Modal, TextInput, Button, Stack, Group } from '@mantine/core';

interface AddUrlModalProps {
  opened: boolean;
  onClose: () => void;
  onSubmit: (name: string, url: string) => Promise<void>;
  initialName?: string;
  initialUrl?: string;
  isSubmitting?: boolean;
  /** When true, modal is in edit mode with different title */
  isEditMode?: boolean;
}

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function AddUrlModal({
  opened,
  onClose,
  onSubmit,
  initialName = '',
  initialUrl = '',
  isSubmitting = false,
  isEditMode = false,
}: AddUrlModalProps): React.ReactElement {
  const [name, setName] = useState(initialName);
  const [url, setUrl] = useState(initialUrl);
  const [nameError, setNameError] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);

  // Reset form when modal opens
  useEffect(() => {
    if (opened) {
      setName(initialName);
      setUrl(initialUrl);
      setNameError(null);
      setUrlError(null);
    }
  }, [opened, initialName, initialUrl]);

  const validate = (): boolean => {
    let valid = true;

    if (!name.trim()) {
      setNameError('Name is required');
      valid = false;
    } else {
      setNameError(null);
    }

    if (!url.trim()) {
      setUrlError('URL is required');
      valid = false;
    } else if (!isValidUrl(url)) {
      setUrlError('Invalid URL format');
      valid = false;
    } else {
      setUrlError(null);
    }

    return valid;
  };

  const handleSubmit = async (): Promise<void> => {
    if (!validate()) {
      return;
    }

    await onSubmit(name.trim(), url.trim());
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={isEditMode ? 'Edit URL' : 'Add Custom URL'}
      data-testid="add-url-modal"
    >
      <Stack>
        <TextInput
          label="Name"
          placeholder="Documentation"
          value={name}
          onChange={(e) => { setName(e.currentTarget.value); }}
          error={nameError}
          data-testid="url-name-input"
          required
        />
        <TextInput
          label="URL"
          placeholder="https://docs.example.com"
          value={url}
          onChange={(e) => { setUrl(e.currentTarget.value); }}
          error={urlError}
          data-testid="url-input"
          required
        />
        <Group justify="flex-end" mt="md">
          <Button variant="subtle" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={() => { void handleSubmit(); }}
            loading={isSubmitting}
            data-testid="save-url-button"
          >
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
