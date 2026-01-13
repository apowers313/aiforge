/**
 * Terminal - Real terminal component using xterm.js
 */
import { useRef, useEffect, useCallback } from 'react';
import { Box, Group, Text, Badge, Loader, Center, ActionIcon, Tooltip, Menu } from '@mantine/core';
import { IconTerminal2, IconPlus, IconMinus, IconPalette, IconCheck } from '@tabler/icons-react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { useShell, useStartShell } from '@client/hooks/useShells';
import { useTerminal } from '@client/hooks/useTerminal';
import { useUIStore } from '@client/stores/uiStore';
import { TERMINAL_THEMES, getTerminalThemeColors } from '@shared/terminalThemes';
import '@xterm/xterm/css/xterm.css';

const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 32;
const FONT_SIZE_STEP = 2;

interface TerminalProps {
  shellId: string;
}

export function Terminal({ shellId }: TerminalProps): React.ReactElement {
  const shell = useShell(shellId);
  const startShellMutation = useStartShell();
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const hasStartedRef = useRef(false);

  // Track applied values to skip redundant updates
  const appliedFontSizeRef = useRef<number | null>(null);
  const appliedThemeRef = useRef<string | null>(null);

  // Font size and theme from global store
  const terminalFontSize = useUIStore((s) => s.terminalFontSize);
  const setTerminalFontSize = useUIStore((s) => s.setTerminalFontSize);
  const terminalTheme = useUIStore((s) => s.terminalTheme);
  const setTerminalTheme = useUIStore((s) => s.setTerminalTheme);

  const increaseFontSize = useCallback(() => {
    const newSize = Math.min(terminalFontSize + FONT_SIZE_STEP, MAX_FONT_SIZE);
    setTerminalFontSize(newSize);
  }, [terminalFontSize, setTerminalFontSize]);

  const decreaseFontSize = useCallback(() => {
    const newSize = Math.max(terminalFontSize - FONT_SIZE_STEP, MIN_FONT_SIZE);
    setTerminalFontSize(newSize);
  }, [terminalFontSize, setTerminalFontSize]);

  // Start shell PTY on mount if not already active
  useEffect(() => {
    if (!shell || shell.status === 'active' || hasStartedRef.current || startShellMutation.isPending) {
      return;
    }

    hasStartedRef.current = true;
    startShellMutation.mutate(shellId);
  }, [shell, shellId, startShellMutation]);

  // Handle terminal data
  const handleData = useCallback((data: string) => {
    const xterm = xtermRef.current;
    if (!xterm) return;

    // Check if terminal is scrolled to bottom before writing
    const buffer = xterm.buffer.active;
    const isAtBottom = buffer.viewportY >= buffer.baseY;

    xterm.write(data);

    // Scroll to bottom if we were at the bottom before the write
    if (isAtBottom) {
      xterm.scrollToBottom();
    }
  }, []);

  // Handle shell status changes
  const handleStatus = useCallback((status: string, exitCode?: number) => {
    if (status === 'exited') {
      xtermRef.current?.write(`\r\n\x1b[33m[Process exited with code ${String(exitCode ?? 'unknown')}]\x1b[0m\r\n`);
    }
  }, []);

  // Connect to terminal WebSocket
  const { isConnected, write, resize } = useTerminal(shellId, {
    onData: handleData,
    onStatus: handleStatus,
  });

  // Store write/resize in refs to avoid recreating xterm when they change
  const writeRef = useRef(write);
  const resizeRef = useRef(resize);
  useEffect(() => {
    writeRef.current = write;
    resizeRef.current = resize;
  }, [write, resize]);

  // Initialize xterm - only depends on terminalRef, not on callbacks
  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) {
      return;
    }

    const themeColors = getTerminalThemeColors(terminalTheme);
    const xterm = new XTerm({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: terminalFontSize,
      lineHeight: 1.2,
      theme: themeColors,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    xterm.loadAddon(fitAddon);
    xterm.loadAddon(webLinksAddon);

    xterm.open(terminalRef.current);
    fitAddon.fit();

    // Handle terminal input - use ref to avoid stale closure
    xterm.onData((data) => {
      writeRef.current(data);
    });

    // Handle terminal resize - use ref to avoid stale closure
    xterm.onResize((size) => {
      resizeRef.current(size.cols, size.rows);
    });

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    // Track initial applied values to skip redundant updates
    appliedFontSizeRef.current = terminalFontSize;
    appliedThemeRef.current = terminalTheme;

    // Initial resize notification
    resizeRef.current(xterm.cols, xterm.rows);

    return (): void => {
      xterm.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
      appliedFontSizeRef.current = null;
      appliedThemeRef.current = null;
    };
  }, []);

  // Handle window resize with debouncing
  useEffect(() => {
    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;

    const handleResize = (): void => {
      // Debounce resize handling to prevent rapid consecutive calls
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      resizeTimeout = setTimeout(() => {
        const xterm = xtermRef.current;
        const fitAddon = fitAddonRef.current;
        if (!xterm || !fitAddon) return;

        fitAddon.fit();

        // Scroll to bottom to ensure cursor is visible after resize
        xterm.scrollToBottom();
      }, 50);
    };

    window.addEventListener('resize', handleResize);

    // Also fit when container size might have changed
    const resizeObserver = new ResizeObserver(handleResize);
    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current);
    }

    return (): void => {
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
    };
  }, []);

  // Update font size when it changes in the store
  useEffect(() => {
    const xterm = xtermRef.current;
    const fitAddon = fitAddonRef.current;
    if (!xterm || !fitAddon) return;

    // Skip if font size hasn't actually changed
    if (appliedFontSizeRef.current === terminalFontSize) return;

    appliedFontSizeRef.current = terminalFontSize;
    xterm.options.fontSize = terminalFontSize;
    fitAddon.fit();

    // Scroll to bottom to ensure cursor is visible after font size change
    xterm.scrollToBottom();
  }, [terminalFontSize]);

  // Update theme when it changes in the store
  useEffect(() => {
    const xterm = xtermRef.current;
    if (!xterm) return;

    // Skip if theme hasn't actually changed
    if (appliedThemeRef.current === terminalTheme) return;

    appliedThemeRef.current = terminalTheme;
    const themeColors = getTerminalThemeColors(terminalTheme);
    xterm.options.theme = themeColors;
  }, [terminalTheme]);

  // Focus terminal on click
  const handleClick = useCallback(() => {
    xtermRef.current?.focus();
  }, []);

  if (!shell) {
    return (
      <Box
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text c="dimmed">Shell not found</Text>
      </Box>
    );
  }

  const currentThemeColors = getTerminalThemeColors(terminalTheme);

  if (startShellMutation.isPending) {
    return (
      <Center style={{ height: '100%', backgroundColor: currentThemeColors.background }}>
        <Loader size="lg" color="green" />
        <Text c="dimmed" ml="md">Starting shell...</Text>
      </Center>
    );
  }

  if (startShellMutation.isError) {
    return (
      <Center style={{ height: '100%', backgroundColor: currentThemeColors.background }}>
        <Text c="red">Error: {startShellMutation.error.message}</Text>
      </Center>
    );
  }

  const statusColor = shell.status === 'active' ? 'green' : shell.status === 'error' ? 'red' : 'gray';

  return (
    <Box
      data-testid="terminal-container"
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: currentThemeColors.background,
      }}
    >
      {/* Terminal Header */}
      <Box
        style={{
          borderBottom: '1px solid var(--mantine-color-dark-4)',
          padding: '8px 16px',
          backgroundColor: 'var(--mantine-color-dark-7)',
        }}
      >
        <Group justify="space-between">
          <Group gap="xs">
            <IconTerminal2 size={16} style={{ color: 'var(--mantine-color-green-4)' }} />
            <Text size="sm" fw={500}>
              {shell.name}
            </Text>
          </Group>
          <Group gap="sm">
            {/* Font size controls */}
            <Group gap={4}>
              <Tooltip label="Decrease font size" position="bottom" withArrow>
                <ActionIcon
                  size="xs"
                  variant="subtle"
                  color="gray"
                  onClick={decreaseFontSize}
                  disabled={terminalFontSize <= MIN_FONT_SIZE}
                >
                  <IconMinus size={12} />
                </ActionIcon>
              </Tooltip>
              <Text size="xs" c="dimmed" style={{ minWidth: '24px', textAlign: 'center' }}>
                {terminalFontSize}
              </Text>
              <Tooltip label="Increase font size" position="bottom" withArrow>
                <ActionIcon
                  size="xs"
                  variant="subtle"
                  color="gray"
                  onClick={increaseFontSize}
                  disabled={terminalFontSize >= MAX_FONT_SIZE}
                >
                  <IconPlus size={12} />
                </ActionIcon>
              </Tooltip>
            </Group>
            {/* Theme selector */}
            <Menu shadow="md" width={180} position="bottom-end">
              <Menu.Target>
                <Tooltip label="Terminal theme" position="bottom" withArrow>
                  <ActionIcon size="xs" variant="subtle" color="gray">
                    <IconPalette size={14} />
                  </ActionIcon>
                </Tooltip>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>Terminal Theme</Menu.Label>
                {TERMINAL_THEMES.map((theme) => (
                  <Menu.Item
                    key={theme.id}
                    onClick={() => { setTerminalTheme(theme.id); }}
                    leftSection={
                      <Box
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: 3,
                          backgroundColor: theme.theme.background,
                          border: '1px solid var(--mantine-color-dark-4)',
                        }}
                      />
                    }
                    rightSection={
                      terminalTheme === theme.id ? <IconCheck size={14} /> : null
                    }
                  >
                    {theme.name}
                  </Menu.Item>
                ))}
              </Menu.Dropdown>
            </Menu>
            <Badge size="xs" variant="dot" color={isConnected ? 'green' : 'yellow'}>
              {isConnected ? 'connected' : 'connecting'}
            </Badge>
            <Badge size="xs" variant="dot" color={statusColor}>
              {shell.status}
            </Badge>
            {shell.pid && (
              <Text size="xs" c="dimmed">
                PID: {shell.pid}
              </Text>
            )}
          </Group>
        </Group>
      </Box>

      {/* Terminal Content */}
      <Box
        ref={terminalRef}
        onClick={handleClick}
        style={{
          flex: 1,
          overflow: 'hidden',
        }}
      />
    </Box>
  );
}
