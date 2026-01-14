/**
 * useWebSocket - React hook for WebSocket connections
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { ReconnectingWebSocket, type ReconnectingWebSocketOptions } from '@client/services/websocket.js';
import { waitForServerHealth } from '@client/services/api.js';

// Debug helper to get elapsed time since terminal switch started
function getElapsed(): string {
  const start = (window as unknown as { __terminalSwitchStart?: number }).__terminalSwitchStart;
  if (!start) return '?.??';
  return (performance.now() - start).toFixed(2);
}

/**
 * WebSocket connection status
 */
export type WebSocketStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

/**
 * Options for useWebSocket hook
 */
export interface UseWebSocketOptions {
  /**
   * Auto-connect on mount
   * @default true
   */
  autoConnect?: boolean;

  /**
   * Wait for server health check before connecting
   * This prevents connection attempts while server is starting up
   * @default false
   */
  waitForHealth?: boolean;

  /**
   * Callback when message is received
   */
  onMessage?: (data: unknown) => void;

  /**
   * Callback when connection opens
   */
  onOpen?: () => void;

  /**
   * Callback when connection closes
   */
  onClose?: () => void;

  /**
   * Callback when error occurs
   */
  onError?: (event: Event) => void;

  /**
   * ReconnectingWebSocket options
   */
  reconnectOptions?: Omit<ReconnectingWebSocketOptions, 'onMessage' | 'onOpen' | 'onClose' | 'onError'>;
}

/**
 * Return type for useWebSocket hook
 */
export interface UseWebSocketReturn {
  status: WebSocketStatus;
  isConnected: boolean;
  send: (data: unknown) => void;
  connect: () => void;
  disconnect: () => void;
}

/**
 * React hook for managing WebSocket connections
 */
export function useWebSocket(url: string, options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const {
    autoConnect = true,
    waitForHealth = false,
    onMessage,
    onOpen,
    onClose,
    onError,
    reconnectOptions,
  } = options;

  const [status, setStatus] = useState<WebSocketStatus>('disconnected');
  const wsRef = useRef<ReconnectingWebSocket | null>(null);
  const healthCheckInProgressRef = useRef(false);

  // Store callbacks in refs to avoid reconnection on callback changes
  const onMessageRef = useRef(onMessage);
  const onOpenRef = useRef(onOpen);
  const onCloseRef = useRef(onClose);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onMessageRef.current = onMessage;
    onOpenRef.current = onOpen;
    onCloseRef.current = onClose;
    onErrorRef.current = onError;
  }, [onMessage, onOpen, onClose, onError]);

  const connect = useCallback(() => {
    console.log(`[TERMINAL_SWITCH] +${getElapsed()}ms - useWebSocket.connect() called, wsRef.current=${!!wsRef.current}`);
    if (wsRef.current) {
      console.log(`[TERMINAL_SWITCH] +${getElapsed()}ms - useWebSocket.connect() - already connected, returning`);
      return;
    }

    // If health check is enabled and not already in progress
    if (waitForHealth && !healthCheckInProgressRef.current) {
      healthCheckInProgressRef.current = true;
      setStatus('connecting');
      console.log(`[TERMINAL_SWITCH] +${getElapsed()}ms - useWebSocket: Starting health check (waitForHealth=true)`);

      waitForServerHealth({ maxAttempts: 600, delayMs: 1000 })
        .then(() => {
          console.log(`[TERMINAL_SWITCH] +${getElapsed()}ms - useWebSocket: Health check PASSED`);
          healthCheckInProgressRef.current = false;
          // Now actually connect
          if (!wsRef.current) {
            console.log(`[TERMINAL_SWITCH] +${getElapsed()}ms - useWebSocket: Creating ReconnectingWebSocket`);
            wsRef.current = new ReconnectingWebSocket(url, {
              ...reconnectOptions,
              onMessage: (data): void => {
                onMessageRef.current?.(data);
              },
              onOpen: (): void => {
                console.log(`[TERMINAL_SWITCH] +${getElapsed()}ms - useWebSocket: WebSocket OPEN`);
                setStatus('connected');
                onOpenRef.current?.();
              },
              onClose: (): void => {
                console.log(`[TERMINAL_SWITCH] +${getElapsed()}ms - useWebSocket: WebSocket CLOSED`);
                setStatus('disconnected');
                onCloseRef.current?.();
              },
              onError: (event): void => {
                console.log(`[TERMINAL_SWITCH] +${getElapsed()}ms - useWebSocket: WebSocket ERROR`);
                setStatus('error');
                onErrorRef.current?.(event);
              },
            });
            console.log(`[TERMINAL_SWITCH] +${getElapsed()}ms - useWebSocket: Calling wsRef.current.connect()`);
            wsRef.current.connect();
          }
        })
        .catch(() => {
          console.log(`[TERMINAL_SWITCH] +${getElapsed()}ms - useWebSocket: Health check FAILED`);
          healthCheckInProgressRef.current = false;
          setStatus('error');
          onErrorRef.current?.(new Event('health_check_failed'));
        });
      return;
    }

    console.log(`[TERMINAL_SWITCH] +${getElapsed()}ms - useWebSocket: Connecting without health check`);
    setStatus('connecting');

    wsRef.current = new ReconnectingWebSocket(url, {
      ...reconnectOptions,
      onMessage: (data): void => {
        onMessageRef.current?.(data);
      },
      onOpen: (): void => {
        setStatus('connected');
        onOpenRef.current?.();
      },
      onClose: (): void => {
        setStatus('disconnected');
        onCloseRef.current?.();
      },
      onError: (event): void => {
        setStatus('error');
        onErrorRef.current?.(event);
      },
    });

    wsRef.current.connect();
  }, [url, reconnectOptions, waitForHealth]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
      setStatus('disconnected');
    }
  }, []);

  const send = useCallback((data: unknown) => {
    wsRef.current?.send(data);
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return (): void => {
      // Reset health check flag on cleanup to handle React StrictMode double-mount
      healthCheckInProgressRef.current = false;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [autoConnect, connect]);

  return {
    status,
    isConnected: status === 'connected',
    send,
    connect,
    disconnect,
  };
}
