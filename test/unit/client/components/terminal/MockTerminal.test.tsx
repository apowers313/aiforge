import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { MockTerminal } from '@client/components/terminal/MockTerminal.js';
import { renderWithProviders, createTestQueryClient } from '../../../../utils/testQueryClient.js';
import type { QueryClient } from '@tanstack/react-query';
import type { Shell } from '@shared/types/index.js';

const mockShell: Shell = {
  id: 'shell-1',
  projectId: 'p1',
  name: 'test-shell',
  cwd: '/project',
  status: 'active',
  type: 'bash',
  pid: 1234,
  socketPath: null,
  lastActivityAt: null,
  done: false,
  worktreePath: null,
  createdAt: '',
  updatedAt: '',
};

// Mock useShell hook
let mockShellData: Shell | undefined = mockShell;

vi.mock('@client/hooks/useShells', () => ({
  useShell: vi.fn(() => mockShellData),
}));

describe('MockTerminal', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
    mockShellData = mockShell;
  });

  afterEach(() => {
    queryClient.clear();
    vi.clearAllMocks();
  });

  it('renders terminal container', () => {
    renderWithProviders(<MockTerminal shellId="shell-1" />, queryClient);
    expect(screen.getByTestId('terminal-container')).toBeInTheDocument();
  });

  it('displays shell name in header', () => {
    mockShellData = { ...mockShell, name: 'claude-code' };
    renderWithProviders(<MockTerminal shellId="shell-1" />, queryClient);
    expect(screen.getByText('claude-code')).toBeInTheDocument();
  });

  it('shows mock prompt', () => {
    renderWithProviders(<MockTerminal shellId="shell-1" />, queryClient);
    expect(screen.getByTestId('terminal-content')).toHaveTextContent('$');
  });

  it('simulates command input', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MockTerminal shellId="shell-1" />, queryClient);
    const input = screen.getByTestId('terminal-input');
    await user.type(input, 'ls -la{enter}');
    expect(screen.getByTestId('terminal-content')).toHaveTextContent('ls -la');
  });

  it('shows simulated output for known commands', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MockTerminal shellId="shell-1" />, queryClient);
    const input = screen.getByTestId('terminal-input');
    await user.type(input, 'echo hello{enter}');
    expect(screen.getByTestId('terminal-content')).toHaveTextContent('hello');
  });

  it('shows error message for unknown shell', () => {
    mockShellData = undefined;
    renderWithProviders(<MockTerminal shellId="non-existent" />, queryClient);
    expect(screen.getByText(/shell not found/i)).toBeInTheDocument();
  });

  it('shows working directory in prompt', () => {
    mockShellData = { ...mockShell, cwd: '/home/user/project' };
    renderWithProviders(<MockTerminal shellId="shell-1" />, queryClient);
    expect(screen.getByTestId('terminal-content')).toHaveTextContent('/home/user/project');
  });

  it('handles pwd command', async () => {
    const user = userEvent.setup();
    mockShellData = { ...mockShell, cwd: '/home/user/project' };
    renderWithProviders(<MockTerminal shellId="shell-1" />, queryClient);
    const input = screen.getByTestId('terminal-input');
    await user.type(input, 'pwd{enter}');
    // pwd should show the current directory
    const content = screen.getByTestId('terminal-content');
    expect(content.textContent).toContain('/home/user/project');
  });
});
