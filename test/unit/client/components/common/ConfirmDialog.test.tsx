import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { ConfirmDialog } from '@client/components/common/ConfirmDialog.js';

const renderWithProviders = (ui: React.ReactElement): ReturnType<typeof render> => {
  return render(<MantineProvider>{ui}</MantineProvider>);
};

describe('ConfirmDialog', () => {
  it('renders with default title when opened', () => {
    renderWithProviders(
      <ConfirmDialog
        opened={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        message="Are you sure?"
      />,
    );
    expect(screen.getByText('Confirm Action')).toBeInTheDocument();
  });

  it('renders custom title', () => {
    renderWithProviders(
      <ConfirmDialog
        opened={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Delete Item"
        message="Are you sure?"
      />,
    );
    expect(screen.getByText('Delete Item')).toBeInTheDocument();
  });

  it('renders message', () => {
    renderWithProviders(
      <ConfirmDialog
        opened={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        message="This action cannot be undone."
      />,
    );
    expect(screen.getByTestId('confirm-message')).toHaveTextContent('This action cannot be undone.');
  });

  it('renders default button labels', () => {
    renderWithProviders(
      <ConfirmDialog
        opened={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        message="Are you sure?"
      />,
    );
    expect(screen.getByTestId('confirm-cancel')).toHaveTextContent('Cancel');
    expect(screen.getByTestId('confirm-delete')).toHaveTextContent('Confirm');
  });

  it('renders custom button labels', () => {
    renderWithProviders(
      <ConfirmDialog
        opened={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        message="Are you sure?"
        confirmLabel="Yes, Delete"
        cancelLabel="No, Keep It"
      />,
    );
    expect(screen.getByTestId('confirm-cancel')).toHaveTextContent('No, Keep It');
    expect(screen.getByTestId('confirm-delete')).toHaveTextContent('Yes, Delete');
  });

  it('calls onClose when cancel button is clicked', () => {
    const onClose = vi.fn();
    renderWithProviders(
      <ConfirmDialog
        opened={true}
        onClose={onClose}
        onConfirm={vi.fn()}
        message="Are you sure?"
      />,
    );
    fireEvent.click(screen.getByTestId('confirm-cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onConfirm when confirm button is clicked', () => {
    const onConfirm = vi.fn();
    renderWithProviders(
      <ConfirmDialog
        opened={true}
        onClose={vi.fn()}
        onConfirm={onConfirm}
        message="Are you sure?"
      />,
    );
    fireEvent.click(screen.getByTestId('confirm-delete'));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('shows loading state', () => {
    renderWithProviders(
      <ConfirmDialog
        opened={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        message="Are you sure?"
        loading={true}
      />,
    );
    // Cancel button should be disabled when loading
    expect(screen.getByTestId('confirm-cancel')).toBeDisabled();
  });

  it('has closed state when opened is false', () => {
    renderWithProviders(
      <ConfirmDialog
        opened={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        message="Are you sure?"
      />,
    );
    // Mantine Modal renders with data-opened attribute
    const dialog = screen.queryByTestId('confirm-dialog');
    // Dialog may be in DOM but should not be visible/accessible
    if (dialog) {
      // The modal root exists but should not have visible content
      expect(screen.queryByTestId('confirm-message')).not.toBeInTheDocument();
    }
  });
});
