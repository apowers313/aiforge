/**
 * Terminal - Real terminal component using xterm.js
 *
 * Uses useTerminalSession hook with explicit state machine for session management.
 */
import { useRef, useEffect, useCallback, useState } from 'react';
import { Box, Group, Text, Badge, Loader, Center, ActionIcon, Tooltip, Menu } from '@mantine/core';
import { IconTerminal2, IconPlus, IconMinus, IconPalette, IconCheck } from '@tabler/icons-react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { useTerminalSession } from '@client/hooks/useTerminalSession';
import { useUIStore } from '@client/stores/uiStore';
import { TERMINAL_THEMES, getTerminalThemeColors } from '@shared/terminalThemes';
import { ErrorDisplay } from './ErrorDisplay';
import { ReconnectingOverlay } from './ReconnectingOverlay';
import { log } from '@client/services/logger';
import '@xterm/xterm/css/xterm.css';

const termLog = log.terminal;

const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 32;
const FONT_SIZE_STEP = 2;

/**
 * Grace period in ms to ignore automatic xterm escape sequences after scrollback.
 * These are focus events and cursor key mode responses triggered by scrollback replay.
 */
const XTERM_SCROLLBACK_GRACE_MS = 500;

interface TerminalProps {
  shellId: string;
}

export function Terminal({ shellId }: TerminalProps): React.ReactElement {
  termLog.debug({ shellId }, 'Terminal component render');

  const [terminalElement, setTerminalElement] = useState<HTMLDivElement | null>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  // Track when scrollback was last received to ignore automatic xterm escape sequences
  const lastScrollbackTimeRef = useRef<number | null>(null);

  // Track applied values to skip redundant updates
  const appliedFontSizeRef = useRef<number | null>(null);
  const appliedThemeRef = useRef<string | null>(null);

  // Track the last scrollback that was written to detect changes
  const lastWrittenScrollbackRef = useRef<string | null>(null);

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

  // Handle terminal output data
  const handleOutput = useCallback((data: string) => {
    termLog.debug({ bytes: data.length }, 'handleOutput received');

    const xterm = xtermRef.current;
    if (!xterm) {
      termLog.debug('handleOutput: xterm not ready, dropping output');
      return;
    }

    // Check if terminal is scrolled to bottom before writing
    const buffer = xterm.buffer.active;
    const isAtBottom = buffer.viewportY >= buffer.baseY;

    termLog.debug({ bytes: data.length, isAtBottom }, 'handleOutput: writing to xterm');
    xterm.write(data);

    // Scroll to bottom if we were at the bottom before the write
    if (isAtBottom) {
      xterm.scrollToBottom();
    }
  }, []);

  // Session management via useTerminalSession hook
  const session = useTerminalSession(shellId, {
    autoOpen: true,
    onOutput: handleOutput,
  });

  // Store session actions in refs to avoid recreating xterm when they change
  const writeRef = useRef(session.write);
  const resizeRef = useRef(session.resize);
  useEffect(() => {
    writeRef.current = session.write;
    resizeRef.current = session.resize;
  }, [session.write, session.resize]);

  // Get current theme colors for backgrounds
  const currentThemeColors = getTerminalThemeColors(terminalTheme);

  // Initialize xterm when element is available and session is open
  useEffect(() => {
    if (session.state.status !== 'open') {
      return;
    }

    const elementRect = terminalElement?.getBoundingClientRect();
    termLog.debug({
      hasElement: !!terminalElement,
      hasXterm: !!xtermRef.current,
      elementWidth: elementRect?.width,
      elementHeight: elementRect?.height,
    }, 'xterm init effect running');

    if (!terminalElement) {
      return;
    }

    // Write scrollback helper function
    const writeScrollbackIfChanged = (xterm: XTerm, currentScrollback: string): void => {
      if (currentScrollback !== lastWrittenScrollbackRef.current) {
        termLog.debug({ scrollbackLen: currentScrollback.length }, 'Writing scrollback to xterm');

        // If we had previous scrollback, clear terminal first (reconnect scenario)
        if (lastWrittenScrollbackRef.current !== null) {
          xterm.clear();
        }

        // Write new scrollback
        if (currentScrollback) {
          xterm.write(currentScrollback);
          xterm.scrollToBottom();
        }

        lastScrollbackTimeRef.current = Date.now();
        lastWrittenScrollbackRef.current = currentScrollback;
      }
    };

    const currentScrollback = session.state.scrollback;

    // Initialize xterm if not already done
    if (!xtermRef.current) {
      termLog.info({ shellId, fontSize: terminalFontSize, theme: terminalTheme }, 'Initializing xterm');
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

      termLog.debug('xterm.open() starting');
      xterm.open(terminalElement);
      termLog.debug({ cols: xterm.cols, rows: xterm.rows }, 'xterm.open() complete, calling fitAddon.fit()');
      fitAddon.fit();
      termLog.debug({ cols: xterm.cols, rows: xterm.rows }, 'fitAddon.fit() complete');

      // Initialize scrollback grace period
      lastScrollbackTimeRef.current = Date.now();

      // Handle terminal input - use ref to avoid stale closure
      xterm.onData((data) => {
        const timeSinceScrollback = lastScrollbackTimeRef.current ? Date.now() - lastScrollbackTimeRef.current : Infinity;
        if (timeSinceScrollback < XTERM_SCROLLBACK_GRACE_MS) {
          termLog.debug({ timeSinceScrollback, dataPreview: data.slice(0, 20) }, 'Ignoring input during scrollback grace period');
          return;
        }
        writeRef.current(data);
      });

      // Handle terminal resize - use ref to avoid stale closure
      xterm.onResize((size) => {
        resizeRef.current(size.cols, size.rows);
      });

      xtermRef.current = xterm;
      fitAddonRef.current = fitAddon;

      // Track initial applied values
      appliedFontSizeRef.current = terminalFontSize;
      appliedThemeRef.current = terminalTheme;

      // Initial resize notification
      resizeRef.current(xterm.cols, xterm.rows);

      // Write initial scrollback
      writeScrollbackIfChanged(xterm, currentScrollback);
    } else {
      // xterm already exists, check if scrollback changed
      writeScrollbackIfChanged(xtermRef.current, currentScrollback);
    }

    // Cleanup
    return (): void => {
      // Don't dispose xterm here - only on full unmount
    };
  }, [session.state.status, session.state.status === 'open' ? session.state.scrollback : null, terminalElement, shellId, terminalFontSize, terminalTheme]);

  // Cleanup xterm on unmount
  useEffect(() => {
    return (): void => {
      if (xtermRef.current) {
        xtermRef.current.dispose();
        xtermRef.current = null;
        fitAddonRef.current = null;
        appliedFontSizeRef.current = null;
        appliedThemeRef.current = null;
        lastScrollbackTimeRef.current = null;
        lastWrittenScrollbackRef.current = null;
      }
    };
  }, []);

  // Handle window resize with debouncing
  useEffect(() => {
    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;

    const handleResize = (): void => {
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      resizeTimeout = setTimeout(() => {
        const xterm = xtermRef.current;
        const fitAddon = fitAddonRef.current;
        if (!xterm || !fitAddon) return;

        fitAddon.fit();
        xterm.scrollToBottom();
      }, 50);
    };

    window.addEventListener('resize', handleResize);

    const resizeObserver = new ResizeObserver(handleResize);
    if (terminalElement) {
      resizeObserver.observe(terminalElement);
    }

    return (): void => {
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
    };
  }, [terminalElement]);

  // Update font size when it changes in the store
  useEffect(() => {
    const xterm = xtermRef.current;
    const fitAddon = fitAddonRef.current;
    if (!xterm || !fitAddon) return;

    if (appliedFontSizeRef.current === terminalFontSize) return;

    termLog.debug({ shellId, fontSize: terminalFontSize }, 'Updating terminal font size');
    appliedFontSizeRef.current = terminalFontSize;
    xterm.options.fontSize = terminalFontSize;
    fitAddon.fit();
    xterm.scrollToBottom();
  }, [terminalFontSize, shellId]);

  // Update theme when it changes in the store
  useEffect(() => {
    const xterm = xtermRef.current;
    if (!xterm) return;

    if (appliedThemeRef.current === terminalTheme) return;

    termLog.debug({ shellId, theme: terminalTheme }, 'Updating terminal theme');
    appliedThemeRef.current = terminalTheme;
    const themeColors = getTerminalThemeColors(terminalTheme);
    xterm.options.theme = themeColors;
  }, [terminalTheme, shellId]);

  // Focus terminal on click
  const handleClick = useCallback(() => {
    xtermRef.current?.focus();
  }, []);

  // Render based on session state
  switch (session.state.status) {
    case 'closed':
      // Brief closed state before opening
      return (
        <Center style={{ height: '100%', backgroundColor: currentThemeColors.background }}>
          <Loader size="lg" color="green" />
          <Text c="dimmed" ml="md">Initializing...</Text>
        </Center>
      );

    case 'opening':
      return (
        <Center style={{ height: '100%', backgroundColor: currentThemeColors.background }}>
          <Loader size="lg" color="green" />
          <Text c="dimmed" ml="md">Connecting...</Text>
        </Center>
      );

    case 'error':
      return (
        <ErrorDisplay
          message={session.state.message}
          onRetry={session.state.retryable ? session.retry : undefined}
        />
      );

    case 'reconnecting':
      // Show terminal content with reconnecting overlay
      return (
        <Box
          data-testid="terminal-container"
          style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: currentThemeColors.background,
            position: 'relative',
          }}
        >
          <ReconnectingOverlay
            attempt={session.state.attempt}
            maxAttempts={session.state.maxAttempts}
          />
          <Box
            ref={setTerminalElement}
            onClick={handleClick}
            style={{
              flex: 1,
              overflow: 'hidden',
            }}
          />
        </Box>
      );

    case 'open': {
      const shell = session.state.shell;
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
                        onClick={(): void => { setTerminalTheme(theme.id); }}
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
                <Badge size="xs" variant="dot" color="green">
                  connected
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
            ref={setTerminalElement}
            onClick={handleClick}
            style={{
              flex: 1,
              overflow: 'hidden',
            }}
          />
        </Box>
      );
    }
  }
}
