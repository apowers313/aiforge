/**
 * useTerminal - React hook for terminal WebSocket connections
 */
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useWebSocket } from './useWebSocket.js';
import { useUIStore } from '@client/stores/uiStore';
import { log } from '@client/services/logger';

const termLog = log.terminal;

/**
 * Terminal message from server
 */
interface TerminalMessage {
  type: string;
  shellId?: string;
  data?: string;
  status?: string;
  exitCode?: number;
  /** True if this output is scrollback replay (not live activity) */
  isScrollback?: boolean;
}

/**
 * Options for useTerminal hook
 */
export interface UseTerminalOptions {
  /**
   * Callback when data is received from the terminal
   */
  onData?: (data: string) => void;

  /**
   * Callback when shell status changes
   */
  onStatus?: (status: string, exitCode?: number) => void;

  /**
   * WebSocket URL (defaults to current host)
   */
  wsUrl?: string;
}

/**
 * Connection error information
 */
export interface ConnectionError {
  type: 'websocket' | 'server_unreachable';
  message: string;
}

/**
 * Return type for useTerminal hook
 */
export interface UseTerminalReturn {
  isConnected: boolean;
  connectionError: ConnectionError | null;
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  disconnect: () => void;
  reconnect: () => void;
}

/**
 * React hook for managing terminal connections
 */
export function useTerminal(shellId: string, options: UseTerminalOptions = {}): UseTerminalReturn {
  const {
    onData,
    onStatus,
    wsUrl = `ws://${typeof window !== 'undefined' ? window.location.host : 'localhost:9000'}/ws/terminal`,
  } = options;

  // Track if we're attached
  const attachedRef = useRef(false);

  // Connection error state
  const [connectionError, setConnectionError] = useState<ConnectionError | null>(null);

  // Store callbacks in refs
  const onDataRef = useRef(onData);
  const onStatusRef = useRef(onStatus);

  // Get activity recorder from UI store
  const recordShellActivity = useUIStore((state) => state.recordShellActivity);

  useEffect(() => {
    onDataRef.current = onData;
    onStatusRef.current = onStatus;
  }, [onData, onStatus]);

  // Handle incoming messages
  const handleMessage = useCallback((message: unknown) => {
    const msg = message as TerminalMessage;

    // Only handle messages for our shell
    if (msg.shellId !== shellId) {
      return;
    }

    termLog.debug({ type: msg.type, shellId: msg.shellId, dataLen: msg.data?.length ?? 0, isScrollback: msg.isScrollback ?? false }, 'Terminal message received');

    switch (msg.type) {
      case 'output':
        if (msg.data) {
          termLog.debug({ bytes: msg.data.length }, 'Calling onData callback');
          onDataRef.current?.(msg.data);
          // Record activity for AI shell indicator (only for live output, not scrollback replay)
          if (!msg.isScrollback) {
            recordShellActivity(shellId);
          }
        }
        break;
      case 'status':
        if (msg.status) {
          termLog.info({ shellId, status: msg.status, exitCode: msg.exitCode }, 'Shell status changed');
          onStatusRef.current?.(msg.status, msg.exitCode);
        }
        break;
      case 'error':
        // Handle server-side errors
        termLog.error({ shellId, error: msg.data }, 'Server-side terminal error');
        setConnectionError({
          type: 'websocket',
          message: msg.data ?? 'Unknown error',
        });
        break;
    }
  }, [shellId, recordShellActivity]);

  // Handle WebSocket errors
  const handleError = useCallback(() => {
    setConnectionError({
      type: 'websocket',
      message: 'WebSocket connection failed',
    });
  }, []);

  // Handle WebSocket open - clear error
  const handleOpen = useCallback(() => {
    setConnectionError(null);
  }, []);

  // Handle max retries reached
  const handleMaxRetries = useCallback(() => {
    setConnectionError({
      type: 'server_unreachable',
      message: 'Unable to connect to server after multiple attempts',
    });
  }, []);

  // Memoize reconnect options to prevent unnecessary re-renders
  const reconnectOptions = useMemo(() => ({
    onMaxRetriesReached: handleMaxRetries,
  }), [handleMaxRetries]);

  // WebSocket connection - wait for server health before connecting
  const ws = useWebSocket(wsUrl, {
    onMessage: handleMessage,
    onError: handleError,
    onOpen: handleOpen,
    reconnectOptions,
    waitForHealth: true,
  });

  // Attach to shell when WebSocket is connected
  // Using a separate effect ensures attach is sent on remount (e.g., React StrictMode)
  useEffect(() => {
    termLog.debug({ isConnected: ws.isConnected, shellId }, 'Attach effect triggered');
    // Reset attached state on each effect run (handles StrictMode remount)
    attachedRef.current = false;

    if (ws.isConnected) {
      termLog.info({ shellId }, 'Sending ATTACH message');
      ws.send({
        type: 'attach',
        shellId,
      });
      attachedRef.current = true;
      termLog.debug({ shellId }, 'ATTACH message sent');
    }

    // Cleanup: detach and reset state
    return (): void => {
      if (attachedRef.current) {
        termLog.info({ shellId }, 'Sending DETACH message');
        ws.send({
          type: 'detach',
          shellId,
        });
        attachedRef.current = false;
      }
    };
  }, [ws.isConnected, ws, shellId]);

  // Send input to terminal
  const write = useCallback((data: string) => {
    ws.send({
      type: 'input',
      shellId,
      data,
    });
    // Record activity for AI shell indicator
    recordShellActivity(shellId);
  }, [ws, shellId, recordShellActivity]);

  // Send resize event
  const resize = useCallback((cols: number, rows: number) => {
    ws.send({
      type: 'resize',
      shellId,
      cols,
      rows,
    });
  }, [ws, shellId]);

  // Reconnect function - clears error and reconnects
  const reconnect = useCallback(() => {
    setConnectionError(null);
    ws.connect();
  }, [ws]);

  return {
    isConnected: ws.isConnected,
    connectionError,
    write,
    resize,
    disconnect: ws.disconnect,
    reconnect,
  };
}
