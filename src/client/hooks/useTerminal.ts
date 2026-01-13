/**
 * useTerminal - React hook for terminal WebSocket connections
 */
import { useCallback, useEffect, useRef } from 'react';
import { useWebSocket } from './useWebSocket.js';

/**
 * Terminal message from server
 */
interface TerminalMessage {
  type: string;
  shellId?: string;
  data?: string;
  status?: string;
  exitCode?: number;
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
 * Return type for useTerminal hook
 */
export interface UseTerminalReturn {
  isConnected: boolean;
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  disconnect: () => void;
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

  // Store callbacks in refs
  const onDataRef = useRef(onData);
  const onStatusRef = useRef(onStatus);

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

    switch (msg.type) {
      case 'output':
        if (msg.data) {
          onDataRef.current?.(msg.data);
        }
        break;
      case 'status':
        if (msg.status) {
          onStatusRef.current?.(msg.status, msg.exitCode);
        }
        break;
    }
  }, [shellId]);

  // WebSocket connection
  const ws = useWebSocket(wsUrl, {
    onMessage: handleMessage,
  });

  // Attach to shell when WebSocket is connected
  // Using a separate effect ensures attach is sent on remount (e.g., React StrictMode)
  useEffect(() => {
    // Reset attached state on each effect run (handles StrictMode remount)
    attachedRef.current = false;

    if (ws.isConnected) {
      ws.send({
        type: 'attach',
        shellId,
      });
      attachedRef.current = true;
    }

    // Cleanup: detach and reset state
    return (): void => {
      if (attachedRef.current) {
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
  }, [ws, shellId]);

  // Send resize event
  const resize = useCallback((cols: number, rows: number) => {
    ws.send({
      type: 'resize',
      shellId,
      cols,
      rows,
    });
  }, [ws, shellId]);

  return {
    isConnected: ws.isConnected,
    write,
    resize,
    disconnect: ws.disconnect,
  };
}
