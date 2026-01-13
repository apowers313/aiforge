/**
 * Terminal Component unit tests
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Terminal } from '@client/components/terminal/Terminal';

// Mock xterm
const mockXterm = {
  loadAddon: vi.fn(),
  open: vi.fn(),
  write: vi.fn(),
  dispose: vi.fn(),
  focus: vi.fn(),
  scrollToBottom: vi.fn(),
  resize: vi.fn(),
  onData: vi.fn().mockReturnValue(vi.fn()),
  onResize: vi.fn().mockReturnValue(vi.fn()),
  cols: 80,
  rows: 24,
  options: {
    fontSize: 14,
  },
  buffer: {
    active: {
      viewportY: 0,
      baseY: 0,
    },
  },
};

vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn().mockImplementation(() => mockXterm),
}));

const mockFitAddon = {
  fit: vi.fn(),
};

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn().mockImplementation(() => mockFitAddon),
}));

vi.mock('@xterm/addon-web-links', () => ({
  WebLinksAddon: vi.fn(),
}));

// Mock shell data
const mockShell = {
  id: 'shell-1',
  projectId: 'p1',
  name: 'Test Shell',
  status: 'active' as const,
  pid: 1234,
  cwd: '/home/test',
  createdAt: '',
  updatedAt: '',
};

// Mock hooks
const mockStartShellMutate = vi.fn();
let mockShellData = mockShell;

vi.mock('@client/hooks/useShells', () => ({
  useShell: vi.fn(() => mockShellData),
  useStartShell: vi.fn(() => ({
    mutate: mockStartShellMutate,
    isPending: false,
    isError: false,
    error: null,
  })),
}));

const mockWrite = vi.fn();
const mockResize = vi.fn();
let capturedOnData: ((data: string) => void) | null = null;
let capturedOnStatus: ((status: string, exitCode?: number) => void) | null = null;

interface TerminalOptions {
  onData?: (data: string) => void;
  onStatus?: (status: string, exitCode?: number) => void;
}

vi.mock('@client/hooks/useTerminal', () => ({
  useTerminal: vi.fn((_shellId: string, options?: TerminalOptions) => {
    capturedOnData = options?.onData ?? null;
    capturedOnStatus = options?.onStatus ?? null;
    return {
      isConnected: true,
      write: mockWrite,
      resize: mockResize,
    };
  }),
}));

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderTerminal(shellId = 'shell-1'): ReturnType<typeof render> {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MantineProvider>
        <Terminal shellId={shellId} />
      </MantineProvider>
    </QueryClientProvider>,
  );
}

describe('Terminal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnData = null;
    capturedOnStatus = null;
    mockShellData = mockShell;
  });

  it('renders terminal container', () => {
    renderTerminal();

    expect(screen.getByTestId('terminal-container')).toBeDefined();
  });

  it('displays shell name', () => {
    renderTerminal();

    expect(screen.getByText('Test Shell')).toBeDefined();
  });

  it('shows connected status badge', () => {
    renderTerminal();

    expect(screen.getByText('connected')).toBeDefined();
  });

  it('shows shell status badge', () => {
    renderTerminal();

    expect(screen.getByText('active')).toBeDefined();
  });

  it('shows PID when available', () => {
    renderTerminal();

    expect(screen.getByText('PID: 1234')).toBeDefined();
  });

  it('initializes xterm on mount', async () => {
    renderTerminal();

    // xterm should be initialized
    const { Terminal: XTerminal } = await import('@xterm/xterm');
    expect(XTerminal).toHaveBeenCalled();
    expect(mockXterm.loadAddon).toHaveBeenCalledTimes(2); // fit + weblinks
    expect(mockXterm.open).toHaveBeenCalled();
    expect(mockFitAddon.fit).toHaveBeenCalled();
  });

  it('sends initial resize on mount', () => {
    renderTerminal();

    expect(mockResize).toHaveBeenCalledWith(80, 24);
  });

  it('writes data to xterm when received', () => {
    renderTerminal();

    // Simulate data callback
    if (capturedOnData) {
      capturedOnData('Hello World');
    }

    expect(mockXterm.write).toHaveBeenCalledWith('Hello World');
  });

  it('writes exit message on shell exit', () => {
    renderTerminal();

    // Simulate status callback
    if (capturedOnStatus) {
      capturedOnStatus('exited', 0);
    }

    expect(mockXterm.write).toHaveBeenCalledWith(
      expect.stringContaining('Process exited with code 0'),
    );
  });

  it('forwards terminal input to write function', () => {
    renderTerminal();

    // Get the onData handler passed to xterm
    const onDataHandler = mockXterm.onData.mock.calls[0][0] as (data: string) => void;
    onDataHandler('test input');

    expect(mockWrite).toHaveBeenCalledWith('test input');
  });

  it('forwards resize events', () => {
    renderTerminal();

    // Get the onResize handler passed to xterm
    const onResizeHandler = mockXterm.onResize.mock.calls[0][0] as (size: { cols: number; rows: number }) => void;
    onResizeHandler({ cols: 120, rows: 40 });

    expect(mockResize).toHaveBeenCalledWith(120, 40);
  });

  it('focuses terminal on click', () => {
    renderTerminal();

    const container = screen.getByTestId('terminal-container');
    // Find the clickable area (last Box child)
    const clickableArea = container.querySelector('[style*="overflow: hidden"]');
    if (clickableArea) {
      fireEvent.click(clickableArea);
    }

    expect(mockXterm.focus).toHaveBeenCalled();
  });

  it('shows shell not found when shell is null', async () => {
    // Override the mock to return undefined
    const { useShell } = await import('@client/hooks/useShells');
    vi.mocked(useShell).mockReturnValueOnce(undefined);

    renderTerminal();

    expect(screen.getByText('Shell not found')).toBeDefined();
  });

  it('handles exit without exit code', () => {
    renderTerminal();

    // Simulate status callback with no exit code
    if (capturedOnStatus) {
      capturedOnStatus('exited');
    }

    expect(mockXterm.write).toHaveBeenCalledWith(
      expect.stringContaining('Process exited with code unknown'),
    );
  });
});
